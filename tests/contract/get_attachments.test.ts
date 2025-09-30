import { ConfluenceApi, type ConfluenceApiConfig, type PaginatedResponse } from '../../src/confluence/api';
import { HttpClient } from '../../src/confluence/httpClient';
import type { Attachment } from '../../src/models/entities';

// Mock the HttpClient
jest.mock('../../src/confluence/httpClient');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('List attachments pagination contract', () => {
  let api: ConfluenceApi;
  let mockHttpGet: jest.Mock;

  beforeEach(() => {
    mockHttpGet = jest.fn();
    MockedHttpClient.mockImplementation(() => ({
      get: mockHttpGet
    }) as Partial<HttpClient> as HttpClient);

    const config: ConfluenceApiConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1
      }
    };

    api = new ConfluenceApi(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retrieves attachments across pages', async () => {
    const mockAttachmentsResponse: PaginatedResponse<Attachment> = {
      results: [
        {
          id: 'attachment-1',
          pageId: 'page-123',
          fileName: 'document.pdf',
          mediaType: 'application/pdf',
          downloadUrl: '/rest/api/content/attachment/attachment-1/download',
          size: 1024000
        },
        {
          id: 'attachment-2',
          pageId: 'page-123',
          fileName: 'image.png',
          mediaType: 'image/png',
          downloadUrl: '/rest/api/content/attachment/attachment-2/download',
          size: 512000
        }
      ],
      start: 0,
      limit: 50,
      size: 2,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockAttachmentsResponse);

    const result = await api.listAttachments('page-123');

    // Verify the HTTP request was made correctly
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-123/child/attachment', {
      params: {
        expand: 'metadata',
        start: 0,
        limit: 50
      }
    });

    // Verify the response structure
    expect(result.results).toHaveLength(2);
    expect(result.start).toBe(0);
    expect(result.limit).toBe(50);
    expect(result.size).toBe(2);

    // Verify attachment structure
    expect(result.results[0]).toMatchObject({
      id: 'attachment-1',
      pageId: 'page-123',
      fileName: 'document.pdf',
      mediaType: 'application/pdf',
      downloadUrl: '/rest/api/content/attachment/attachment-1/download',
      size: 1024000
    });

    expect(result.results[1]).toMatchObject({
      id: 'attachment-2',
      pageId: 'page-123',
      fileName: 'image.png',
      mediaType: 'image/png',
      downloadUrl: '/rest/api/content/attachment/attachment-2/download',
      size: 512000
    });
  });

  it('handles pagination with custom parameters', async () => {
    const mockResponse: PaginatedResponse<Attachment> = {
      results: [
        {
          id: 'attachment-3',
          pageId: 'page-456',
          fileName: 'filtered.jpg',
          mediaType: 'image/jpeg',
          downloadUrl: '/rest/api/content/attachment/attachment-3/download',
          size: 256000
        }
      ],
      start: 25,
      limit: 10,
      size: 1,
      _links: {
        next: '/rest/api/content/page-456/child/attachment?start=35&limit=10',
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listAttachments('page-456', {
      start: 25,
      limit: 10,
      filename: 'filtered.jpg',
      mediaType: 'image/jpeg'
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-456/child/attachment', {
      params: {
        expand: 'metadata',
        start: 25,
        limit: 10,
        filename: 'filtered.jpg',
        mediaType: 'image/jpeg'
      }
    });
  });

  it('handles empty attachments list', async () => {
    const mockEmptyResponse: PaginatedResponse<Attachment> = {
      results: [],
      start: 0,
      limit: 50,
      size: 0,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockEmptyResponse);

    const result = await api.listAttachments('page-no-attachments');

    expect(result.results).toHaveLength(0);
    expect(result.size).toBe(0);
    expect(result._links?.next).toBeUndefined();
  });

  it('handles attachment filtering by filename', async () => {
    const mockResponse: PaginatedResponse<Attachment> = {
      results: [
        {
          id: 'specific-attachment',
          pageId: 'page-789',
          fileName: 'specific-file.xlsx',
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          downloadUrl: '/rest/api/content/attachment/specific-attachment/download',
          size: 2048000
        }
      ],
      start: 0,
      limit: 50,
      size: 1,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listAttachments('page-789', {
      filename: 'specific-file.xlsx'
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-789/child/attachment', {
      params: {
        expand: 'metadata',
        start: 0,
        limit: 50,
        filename: 'specific-file.xlsx'
      }
    });
  });

  it('handles attachment filtering by media type', async () => {
    const mockResponse: PaginatedResponse<Attachment> = {
      results: [
        {
          id: 'image-attachment',
          pageId: 'page-images',
          fileName: 'photo.jpg',
          mediaType: 'image/jpeg',
          downloadUrl: '/rest/api/content/attachment/image-attachment/download',
          size: 800000
        }
      ],
      start: 0,
      limit: 50,
      size: 1,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listAttachments('page-images', {
      mediaType: 'image/jpeg'
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-images/child/attachment', {
      params: {
        expand: 'metadata',
        start: 0,
        limit: 50,
        mediaType: 'image/jpeg'
      }
    });
  });

  it('handles API errors gracefully', async () => {
    const httpError = new Error('HTTP 404: Page not found');
    mockHttpGet.mockRejectedValue(httpError);

    await expect(api.listAttachments('nonexistent-page')).rejects.toThrow('HTTP 404: Page not found');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/nonexistent-page/child/attachment', {
      params: {
        expand: 'metadata',
        start: 0,
        limit: 50
      }
    });
  });

  it('uses default parameters when none provided', async () => {
    const mockResponse: PaginatedResponse<Attachment> = {
      results: [],
      start: 0,
      limit: 50,
      size: 0,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listAttachments('page-default');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-default/child/attachment', {
      params: {
        expand: 'metadata',
        start: 0,
        limit: 50
      }
    });
  });
});
