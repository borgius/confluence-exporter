import { ConfluenceApi, type ConfluenceApiConfig, type PaginatedResponse } from '../../src/confluence/api';
import { HttpClient } from '../../src/confluence/httpClient';
import type { Page } from '../../src/models/entities';

// Mock the HttpClient
jest.mock('../../src/confluence/httpClient');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('List pages pagination contract', () => {
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

  it('paginates through space content', async () => {
    const mockFirstPageResponse: PaginatedResponse<Page> = {
      results: [
        {
          id: 'page-1',
          title: 'First Page',
          type: 'page',
          version: 1,
          ancestors: [],
          bodyStorage: ''
        },
        {
          id: 'page-2',
          title: 'Second Page',
          type: 'page',
          version: 1,
          ancestors: [],
          bodyStorage: ''
        }
      ],
      start: 0,
      limit: 25,
      size: 2,
      _links: {
        next: '/rest/api/content?spaceKey=TEST&start=25&limit=25',
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockFirstPageResponse);

    const result = await api.listPages('TEST', {
      start: 0,
      limit: 25
    });

    // Verify the HTTP request was made correctly
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content', {
      params: {
        spaceKey: 'TEST',
        expand: 'version,ancestors',
        start: 0,
        limit: 25,
        type: 'page'
      }
    });

    // Verify the paginated response structure
    expect(result.results).toHaveLength(2);
    expect(result.start).toBe(0);
    expect(result.limit).toBe(25);
    expect(result.size).toBe(2);
    expect(result._links?.next).toBe('/rest/api/content?spaceKey=TEST&start=25&limit=25');

    // Verify page structure
    expect(result.results[0]).toMatchObject({
      id: 'page-1',
      title: 'First Page',
      type: 'page'
    });
  });

  it('handles pagination with custom parameters', async () => {
    const mockResponse: PaginatedResponse<Page> = {
      results: [
        {
          id: 'page-3',
          title: 'Third Page',
          type: 'page',
          version: 1,
          ancestors: [],
          bodyStorage: ''
        }
      ],
      start: 50,
      limit: 10,
      size: 1,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listPages('TEST', {
      start: 50,
      limit: 10,
      expand: ['version', 'children', 'body.storage'],
      type: 'blogpost'
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content', {
      params: {
        spaceKey: 'TEST',
        expand: 'version,children,body.storage',
        start: 50,
        limit: 10,
        type: 'blogpost'
      }
    });
  });

  it('handles empty result set', async () => {
    const mockEmptyResponse: PaginatedResponse<Page> = {
      results: [],
      start: 0,
      limit: 25,
      size: 0,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockEmptyResponse);

    const result = await api.listPages('EMPTY');

    expect(result.results).toHaveLength(0);
    expect(result.size).toBe(0);
    expect(result._links?.next).toBeUndefined();
  });

  it('handles last page of results', async () => {
    const mockLastPageResponse: PaginatedResponse<Page> = {
      results: [
        {
          id: 'last-page',
          title: 'Last Page',
          type: 'page',
          version: 1,
          ancestors: [],
          bodyStorage: ''
        }
      ],
      start: 100,
      limit: 25,
      size: 1,
      _links: {
        base: 'https://test.atlassian.net/wiki'
        // No next link - indicates last page
      }
    };

    mockHttpGet.mockResolvedValue(mockLastPageResponse);

    const result = await api.listPages('TEST', { start: 100 });

    expect(result.results).toHaveLength(1);
    expect(result._links?.next).toBeUndefined();
  });

  it('uses default parameters when none provided', async () => {
    const mockResponse: PaginatedResponse<Page> = {
      results: [],
      start: 0,
      limit: 25,
      size: 0,
      _links: {
        base: 'https://test.atlassian.net/wiki'
      }
    };

    mockHttpGet.mockResolvedValue(mockResponse);

    await api.listPages('TEST');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content', {
      params: {
        spaceKey: 'TEST',
        expand: 'version,ancestors',
        start: 0,
        limit: 25,
        type: 'page'
      }
    });
  });

  it('handles API errors gracefully', async () => {
    const httpError = new Error('HTTP 403: Forbidden');
    mockHttpGet.mockRejectedValue(httpError);

    await expect(api.listPages('FORBIDDEN')).rejects.toThrow('HTTP 403: Forbidden');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content', {
      params: {
        spaceKey: 'FORBIDDEN',
        expand: 'version,ancestors',
        start: 0,
        limit: 25,
        type: 'page'
      }
    });
  });
});
