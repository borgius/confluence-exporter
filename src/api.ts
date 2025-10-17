/**
 * Minimal Confluence API client
 */

import type { Page, PaginatedResponse, ConfluenceConfig, User } from './types.js';

export class ConfluenceApi {
  private baseUrl: string;
  private authHeader: string;
  private userCache: Map<string, User> = new Map();

  constructor(config: ConfluenceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Fetch a page with its content
   */
  async getPage(pageId: string): Promise<Page> {
    const url = `${this.baseUrl}/rest/api/content/${pageId}?expand=body.storage,version`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page ${pageId}: ${response.status} ${response.statusText}`);
    }

    interface PageResponse {
      id: string;
      title: string;
      body?: { storage?: { value: string } };
      version?: { number: number };
      ancestors?: Array<{ id: string }>;
    }

    const data = await response.json() as PageResponse;
    
    return {
      id: data.id,
      title: data.title,
      body: data.body?.storage?.value || '',
      version: data.version?.number,
      parentId: data.ancestors?.[data.ancestors.length - 1]?.id
    };
  }

  /**
   * List all pages in a space
   */
  async listPages(spaceKey: string, start: number = 0, limit: number = 25): Promise<PaginatedResponse<Page>> {
    const url = `${this.baseUrl}/rest/api/content?spaceKey=${spaceKey}&type=page&expand=body.storage,version&start=${start}&limit=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list pages: ${response.status} ${response.statusText}`);
    }

    interface RawPage {
      id: string;
      title: string;
      body?: { storage?: { value: string } };
      version?: { number: number };
      ancestors?: Array<{ id: string }>;
    }

    interface ListPagesResponse {
      results: RawPage[];
      start: number;
      limit: number;
      size: number;
      _links?: {
        next?: string;
      };
    }
    
    const data = await response.json() as ListPagesResponse;
    
    return {
      results: data.results.map((item: RawPage) => ({
        id: item.id,
        title: item.title,
        body: item.body?.storage?.value || '',
        version: item.version?.number,
        parentId: item.ancestors?.[item.ancestors.length - 1]?.id
      })),
      start: data.start,
      limit: data.limit,
      size: data.size,
      _links: data._links
    };
  }

  /**
   * Fetch all pages from a space (handles pagination)
   */
  async *getAllPages(spaceKey: string): AsyncGenerator<Page> {
    let start = 0;
    const limit = 25;
    
    while (true) {
      const response = await this.listPages(spaceKey, start, limit);
      
      for (const page of response.results) {
        yield page;
      }
      
      // Check if there are more pages
      if (response.results.length < limit || !response._links?.next) {
        break;
      }
      
      start += limit;
    }
  }

  /**
   * Get child pages of a parent page
   */
  async getChildPages(pageId: string): Promise<Page[]> {
    const url = `${this.baseUrl}/rest/api/content/${pageId}/child/page?expand=version`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch child pages for ${pageId}: ${response.status}`);
      return [];
    }

    interface ChildPageResponse {
      id: string;
      title: string;
      version?: { number: number };
    }

    interface ChildPagesResponse {
      results: ChildPageResponse[];
    }

    const data = await response.json() as ChildPagesResponse;
    
    return data.results.map(child => ({
      id: child.id,
      title: child.title,
      body: '', // Don't fetch body for child page lists
      version: child.version?.number,
    }));
  }

  /**
   * Download an attachment from a page
   */
  async downloadAttachment(pageId: string, filename: string): Promise<Buffer | null> {
    try {
      // First, get the attachment metadata to get the download URL
      const url = `${this.baseUrl}/rest/api/content/${pageId}/child/attachment?filename=${encodeURIComponent(filename)}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch attachment metadata for ${filename}: ${response.status}`);
        return null;
      }

      interface AttachmentResult {
        id: string;
        title: string;
        _links: {
          download: string;
        };
      }

      interface AttachmentResponse {
        results: AttachmentResult[];
      }

      const data = await response.json() as AttachmentResponse;
      
      if (data.results.length === 0) {
        console.warn(`Attachment not found: ${filename}`);
        return null;
      }

      // Download the actual file
      const downloadUrl = `${this.baseUrl}${data.results[0]._links.download}`;
      const downloadResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': this.authHeader
        }
      });

      if (!downloadResponse.ok) {
        console.warn(`Failed to download attachment ${filename}: ${downloadResponse.status}`);
        return null;
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.warn(`Error downloading attachment ${filename}:`, error);
      return null;
    }
  }

  /**
   * Get user information by username (with caching)
   */
  async getUserByUsername(username: string): Promise<User | null> {
    // Check cache first
    const cached = this.userCache.get(username);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.baseUrl}/rest/api/user?username=${encodeURIComponent(username)}&expand=details.personal`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch user ${username}: ${response.status}`);
        return null;
      }

      const data = await response.json() as User;
      
      // Cache the result
      this.userCache.set(username, data);
      
      return data;
    } catch (error) {
      console.warn(`Error fetching user ${username}:`, error);
      return null;
    }
  }

  /**
   * Get user information by user key (with caching)
   */
  async getUserByKey(userKey: string): Promise<User | null> {
    // Check cache first
    const cacheKey = `key:${userKey}`;
    const cached = this.userCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.baseUrl}/rest/api/user?key=${encodeURIComponent(userKey)}&expand=details.personal`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch user by key ${userKey}: ${response.status}`);
        return null;
      }

      const data = await response.json() as User;
      
      // Cache the result
      this.userCache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      console.warn(`Error fetching user by key ${userKey}:`, error);
      return null;
    }
  }
}
