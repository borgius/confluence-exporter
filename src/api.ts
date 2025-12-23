/**
 * Minimal Confluence API client
 */

import type { 
  Page, 
  PageMetadata,
  PaginatedResponse, 
  ConfluenceConfig, 
  User,
  PageResponse,
  RawPage,
  ListPagesResponse,
  ChildPageResponse,
  ChildPagesResponse,
  AttachmentResult,
  AttachmentResponse
} from './types.js';
import { logger } from './logger.js';
import fs from 'fs/promises';
import path from 'path';
import { readFileSync, writeFile } from 'fs';

export class ConfluenceApi {
  private baseUrl: string;
  private authHeader: string;
  private userCache: Map<string, User> = new Map();
  private cacheFile: string;

  // Default network timeout for fetch requests (ms)
  private DEFAULT_TIMEOUT = 15000;

  constructor(config: ConfluenceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    
    // Set up user cache file
    this.cacheFile = path.join(config.outputDir, '_user_cache.json');
    this.loadCache();
  }

  /**
   * Load user cache from filesystem
   */
  private loadCache(): void {
    try {
      const data = readFileSync(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data);
      this.userCache = new Map(Object.entries(parsed));
      logger.debug(`Loaded ${this.userCache.size} users from cache`);
    } catch (err) {
      // Ignore if file doesn't exist or is invalid
      logger.debug('No existing user cache found, starting fresh');
    }
  }

  /**
   * Save user cache to filesystem
   */
  private async saveCache(): Promise<void> {
    try {
      const obj = Object.fromEntries(this.userCache);
      await fs.writeFile(this.cacheFile, JSON.stringify(obj, null, 2));
      logger.debug(`Saved ${this.userCache.size} users to cache`);
    } catch (err) {
      logger.warn('Failed to save user cache:', err);
    }
  }

  /**
   * Helper to perform fetch with a timeout using AbortController
   */
  private async fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : this.DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      logger.debug('fetchWithTimeout ->', input, 'timeoutMs=', timeout);
      const res = await fetch(input, { ...(init || {}), signal: controller.signal } as RequestInit);
      logger.debug('fetchWithTimeout <-', input, 'status=', res.status);
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Fetch a page with its content
   */
  async getPage(pageId: string): Promise<Page> {
    const url = `${this.baseUrl}/rest/api/content/${pageId}?expand=body.storage,version,history.lastUpdated`;
    
    const response = await this.fetchWithTimeout(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page ${pageId}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as PageResponse;
    
    return {
      id: data.id,
      title: data.title,
      body: data.body?.storage?.value || '',
      version: data.version?.number,
      parentId: data.ancestors?.[data.ancestors.length - 1]?.id,
      modifiedDate: data.version?.when || data.history?.lastUpdated?.when
    };
  }

  /**
   * List all pages in a space
   */
  async listPages(spaceKey: string, start: number = 0, limit: number = 100): Promise<PaginatedResponse<Page>> {
    const url = `${this.baseUrl}/rest/api/content?spaceKey=${spaceKey}&type=page&expand=body.storage,version,history.lastUpdated,ancestors&start=${start}&limit=${limit}`;
    
    const response = await this.fetchWithTimeout(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list pages (${url}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ListPagesResponse;
    
    return {
      results: data.results.map((item: RawPage) => ({
        id: item.id,
        title: item.title,
        body: item.body?.storage?.value || '',
        version: item.version?.number,
        parentId: item.ancestors?.[item.ancestors.length - 1]?.id,
        modifiedDate: item.version?.when || item.history?.lastUpdated?.when
      })),
      start: data.start,
      limit: data.limit,
      size: data.size,
      _links: data._links
    };
  }

  /**
   * Search pages using CQL query (metadata only, no body content)
   * Useful for finding pages modified after a specific date
   */
  async searchPages(cql: string, pageSize: number = 100): Promise<PageMetadata[]> {
    const results: PageMetadata[] = [];
    let start = 0;
    
    while (true) {
      const url = `${this.baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&expand=version,history.lastUpdated,ancestors&start=${start}&limit=${pageSize}`;
      
      logger.debug('downloadAttachment: metadata URL ->', url);
      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to search pages (${url}): ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ListPagesResponse;
      
      for (const item of data.results) {
        results.push({
          id: item.id,
          title: item.title,
          version: item.version?.number,
          parentId: item.ancestors?.[item.ancestors.length - 1]?.id,
          modifiedDate: item.version?.when || item.history?.lastUpdated?.when
        });
      }
      
      // Check if there are more pages
      if (data.results.length < pageSize || !data._links?.next) {
        break;
      }
      
      start += pageSize;
    }
    
    return results;
  }

  /**
   * List pages metadata only (no body content) - more efficient for checking updates
   */
  async listPagesMetadata(spaceKey: string, start: number = 0, limit: number = 100): Promise<PaginatedResponse<PageMetadata>> {
    const url = `${this.baseUrl}/rest/api/content?spaceKey=${spaceKey}&type=page&expand=version,history.lastUpdated,ancestors&start=${start}&limit=${limit}`;
    
    const response = await this.fetchWithTimeout(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list pages metadata (${url}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ListPagesResponse;
    
    return {
      results: data.results.map((item: RawPage) => ({
        id: item.id,
        title: item.title,
        version: item.version?.number,
        parentId: item.ancestors?.[item.ancestors.length - 1]?.id,
        modifiedDate: item.version?.when || item.history?.lastUpdated?.when
      })),
      start: data.start,
      limit: data.limit,
      size: data.size,
      _links: data._links
    };
  }

  /**
   * Fetch all pages metadata from a space (handles pagination) - no body content
   */
  async *getAllPagesMetadata(spaceKey: string, pageSize: number = 100): AsyncGenerator<PageMetadata & { apiPageNumber: number }> {
    let start = 0;
    const limit = pageSize;
    let apiPageNumber = 1;
    
    while (true) {
      const response = await this.listPagesMetadata(spaceKey, start, limit);
      
      for (const page of response.results) {
        yield { ...page, apiPageNumber };
      }
      
      // Check if there are more pages
      if (response.results.length < limit || !response._links?.next) {
        break;
      }
      
      start += limit;
      apiPageNumber++;
    }
  }

  /**
   * Fetch all pages from a space (handles pagination)
   */
  async *getAllPages(spaceKey: string, pageSize: number = 25, startFrom: number = 0): AsyncGenerator<Page & { apiPageNumber: number }> {
    let start = startFrom;
    const limit = pageSize;
    let apiPageNumber = Math.floor(startFrom / pageSize) + 1;
    
    while (true) {
      const response = await this.listPages(spaceKey, start, limit);
      
      for (const page of response.results) {
        yield { ...page, apiPageNumber };
      }
      
      // Check if there are more pages
      if (response.results.length < limit || !response._links?.next) {
        break;
      }
      
      start += limit;
      apiPageNumber++;
    }
  }

  /**
   * Get a page by its title in a space
   */
  async getPageByTitle(spaceKey: string, title: string): Promise<Page | null> {
    const url = `${this.baseUrl}/rest/api/content?spaceKey=${spaceKey}&title=${encodeURIComponent(title)}&expand=body.storage,version`;
    
    const response = await this.fetchWithTimeout(url, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.warn(`Failed to fetch page by title "${title}": ${response.status}`);
      return null;
    }

    const data = await response.json() as ListPagesResponse;
    
    if (data.results.length === 0) {
      return null;
    }

    const page = data.results[0];
    return {
      id: page.id,
      title: page.title,
      body: page.body?.storage?.value || '',
      version: page.version?.number,
    };
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
      logger.warn(`Failed to fetch child pages for ${pageId}: ${response.status}`);
      return [];
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
      
      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch attachment metadata for ${filename}: ${response.status}`);
        return null;
      }

      const data = await response.json() as AttachmentResponse;
      logger.debug('downloadAttachment: metadata results length ->', data.results.length);
      
      if (data.results.length === 0) {
        logger.warn(`Attachment not found: ${filename}`);
        return null;
      }

      // Download the actual file
      const downloadUrl = `${this.baseUrl}${data.results[0]._links.download}`;
      logger.debug('downloadAttachment: download URL ->', downloadUrl);
      const downloadResponse = await this.fetchWithTimeout(downloadUrl, {
        headers: {
          'Authorization': this.authHeader
        }
      });

      if (!downloadResponse.ok) {
        logger.warn(`Failed to download attachment ${filename}: ${downloadResponse.status}`);
        return null;
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.warn(`Error downloading attachment ${filename}:`, error);
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
      
      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch user ${username}: ${response.status}`);
        return null;
      }

      const data = await response.json() as User;
      
      // Cache the result
      this.userCache.set(username, data);
      await this.saveCache();
      
      return data;
    } catch (error) {
      logger.warn(`Error fetching user ${username}:`, error);
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
      
      const response = await this.fetchWithTimeout(url, {
        headers: {
          'Authorization': this.authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        logger.warn(`Failed to fetch user by key ${userKey}: ${response.status}`);
        return null;
      }

      const data = await response.json() as User;
      
      // Cache the result
      this.userCache.set(cacheKey, data);
      await this.saveCache();
      
      return data;
    } catch (error) {
      logger.warn(`Error fetching user by key ${userKey}:`, error);
      return null;
    }
  }
}
