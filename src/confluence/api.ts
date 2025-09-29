import { HttpClient, type HttpClientConfig } from './httpClient.js';
import type { Space, Page, Attachment } from '../models/entities.js';

export type ConfluenceApiConfig = HttpClientConfig;

export interface PaginatedResponse<T> {
  results: T[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
    base?: string;
    context?: string;
  };
}

export interface GetPageOptions {
  expand?: string[];
  version?: number;
}

interface ConfluencePageResponse {
  id: string;
  title: string;
  type: string;
  version?: {
    number: number;
  };
  ancestors?: Array<{
    id: string;
    title: string;
  }>;
  body?: {
    storage?: {
      value: string;
    };
  };
}

export interface ListPagesOptions {
  expand?: string[];
  start?: number;
  limit?: number;
  type?: 'page' | 'blogpost';
}

export interface ListAttachmentsOptions {
  start?: number;
  limit?: number;
  filename?: string;
  mediaType?: string;
}

export class ConfluenceApi {
  private http: HttpClient;

  constructor(config: ConfluenceApiConfig) {
    this.http = new HttpClient(config);
  }

  /**
   * Get space information by key
   */
  async getSpace(spaceKey: string): Promise<Space> {
    const response = await this.http.get<Space>(`/rest/api/space/${spaceKey}?expand=description.plain,homepage`);
    return response;
  }

  /**
   * List pages in a space with pagination
   */
  async listPages(
    spaceKey: string,
    options: ListPagesOptions = {}
  ): Promise<PaginatedResponse<Page>> {
    const {
      expand = ['version', 'ancestors'],
      start = 0,
      limit = 25,
      type = 'page'
    } = options;

    return this.http.get<PaginatedResponse<Page>>(`/rest/api/content`, {
      params: {
        spaceKey,
        expand: expand.join(','),
        start,
        limit,
        type
      }
    });
  }

  /**
   * Get a specific page with its content
   */
  async getPageWithBody(
    pageId: string,
    options: GetPageOptions = {}
  ): Promise<Page> {
    const {
      expand = ['body.storage', 'version', 'ancestors', 'children.attachment.metadata'],
      version
    } = options;

    const params: Record<string, unknown> = {
      expand: expand.join(',')
    };

    if (version) {
      params.version = version;
    }

    const response = await this.http.get<ConfluencePageResponse>(`/rest/api/content/${pageId}`, {
      params
    });

    return this.transformPageResponse(response);
  }

  /**
   * Transform Confluence API response to our Page interface
   */
  private transformPageResponse(response: ConfluencePageResponse): Page {
    return {
      id: response.id,
      title: response.title,
      type: response.type,
      version: response.version?.number,
      parentId: response.ancestors?.[response.ancestors.length - 1]?.id,
      ancestors: response.ancestors?.map((a) => ({ id: a.id, title: a.title })),
      bodyStorage: response.body?.storage?.value || ''
    };
  }

  /**
   * List attachments for a page
   */
  async listAttachments(
    pageId: string,
    options: ListAttachmentsOptions = {}
  ): Promise<PaginatedResponse<Attachment>> {
    const {
      start = 0,
      limit = 50,
      filename,
      mediaType
    } = options;

    const params: Record<string, unknown> = {
      expand: 'metadata',
      start,
      limit
    };

    if (filename) {
      params.filename = filename;
    }

    if (mediaType) {
      params.mediaType = mediaType;
    }

    return this.http.get<PaginatedResponse<Attachment>>(
      `/rest/api/content/${pageId}/child/attachment`,
      { params }
    );
  }

  /**
   * Download attachment content as buffer
   */
  async downloadAttachment(attachment: Attachment): Promise<Buffer> {
    const downloadUrl = attachment.downloadUrl;
    if (!downloadUrl) {
      throw new Error(`No download URL available for attachment ${attachment.id}`);
    }

    // The download URL is relative, so we need to make the request directly
    const response = await this.http.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer'
    });

    return Buffer.from(response);
  }

  /**
   * Helper to iterate through all pages in a space
   */
  async *iteratePages(
    spaceKey: string,
    options: Omit<ListPagesOptions, 'start'> = {}
  ): AsyncGenerator<Page, void, unknown> {
    let start = 0;
    const limit = options.limit || 25;
    
    while (true) {
      const response = await this.listPages(spaceKey, {
        ...options,
        start,
        limit
      });

      if (!response.results || !Array.isArray(response.results)) {
        throw new Error('Invalid API response: results is not an array');
      }

      for (const page of response.results) {
        yield page;
      }

      // Check if there are more results
      if (response.results.length < limit || !response._links?.next) {
        break;
      }

      start += limit;
    }
  }

  /**
   * Helper to iterate through all attachments for a page
   */
  async *iterateAttachments(
    pageId: string,
    options: Omit<ListAttachmentsOptions, 'start'> = {}
  ): AsyncGenerator<Attachment, void, unknown> {
    let start = 0;
    const limit = options.limit || 50;
    
    while (true) {
      const response = await this.listAttachments(pageId, {
        ...options,
        start,
        limit
      });

      for (const attachment of response.results) {
        yield attachment;
      }

      // Check if there are more results
      if (response.results.length < limit || !response._links?.next) {
        break;
      }

      start += limit;
    }
  }
}
