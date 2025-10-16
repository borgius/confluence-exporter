/**
 * Minimal Confluence API client
 */

import type { Page, PaginatedResponse, ConfluenceConfig } from './types.js';

export class ConfluenceApi {
  private baseUrl: string;
  private authHeader: string;

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
}
