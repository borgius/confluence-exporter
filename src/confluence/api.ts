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
    const response = await this.http.get<Space>(`/rest/api/space/${spaceKey}`, {
      params: {
        expand: 'description.plain,homepage'
      }
    });
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

    return this.http.get<PaginatedResponse<Page>>(`/rest/api/space/${spaceKey}/content`, {
      params: {
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

    return this.http.get<Page>(`/rest/api/content/${pageId}`, {
      params
    });
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
