import { ConfluenceApi, type ConfluenceApiConfig } from '../../src/confluence/api';
import { HttpClient } from '../../src/confluence/httpClient';

// Mock the HttpClient
jest.mock('../../src/confluence/httpClient');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('Get page with body contract', () => {
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

  it('retrieves page including storage body and ancestors', async () => {
    const mockApiResponse = {
      id: 'page-123',
      title: 'Getting Started',
      type: 'page',
      version: {
        number: 5
      },
      ancestors: [
        { id: 'root-page', title: 'Documentation' },
        { id: 'parent-page', title: 'User Guide' }
      ],
      body: {
        storage: {
          value: '<h1>Getting Started</h1><p>Welcome to our guide...</p>'
        }
      }
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    const result = await api.getPageWithBody('page-123');

    // Verify the HTTP request was made correctly
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/page-123', {
      params: {
        expand: 'body.storage,version,ancestors,children.attachment.metadata'
      }
    });

    // Verify the response transformation
    expect(result).toMatchObject({
      id: 'page-123',
      title: 'Getting Started',
      type: 'page',
      version: 5,
      parentId: 'parent-page', // Should be the last ancestor
      bodyStorage: '<h1>Getting Started</h1><p>Welcome to our guide...</p>'
    });

    // Verify ancestors are preserved
    expect(result.ancestors).toEqual([
      { id: 'root-page', title: 'Documentation' },
      { id: 'parent-page', title: 'User Guide' }
    ]);
  });

  it('handles page without ancestors (root page)', async () => {
    const mockApiResponse = {
      id: 'root-page',
      title: 'Home',
      type: 'page',
      version: {
        number: 1
      },
      ancestors: [],
      body: {
        storage: {
          value: '<h1>Welcome</h1>'
        }
      }
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    const result = await api.getPageWithBody('root-page');

    expect(result.id).toBe('root-page');
    expect(result.title).toBe('Home');
    expect(result.parentId).toBeUndefined();
    expect(result.ancestors).toEqual([]);
    expect(result.bodyStorage).toBe('<h1>Welcome</h1>');
  });

  it('handles page without body content', async () => {
    const mockApiResponse = {
      id: 'empty-page',
      title: 'Empty Page',
      type: 'page',
      version: {
        number: 1
      },
      ancestors: [],
      body: {
        storage: {
          value: ''
        }
      }
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    const result = await api.getPageWithBody('empty-page');

    expect(result.bodyStorage).toBe('');
  });

  it('handles page with missing body entirely', async () => {
    const mockApiResponse = {
      id: 'no-body-page',
      title: 'Page Without Body',
      type: 'page',
      version: {
        number: 1
      },
      ancestors: []
      // No body property
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    const result = await api.getPageWithBody('no-body-page');

    expect(result.bodyStorage).toBe(''); // Should default to empty string
  });

  it('handles custom expand options', async () => {
    const mockApiResponse = {
      id: 'custom-page',
      title: 'Custom Page',
      type: 'page',
      version: {
        number: 2
      }
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    await api.getPageWithBody('custom-page', {
      expand: ['body.storage', 'version']
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/custom-page', {
      params: {
        expand: 'body.storage,version'
      }
    });
  });

  it('handles version parameter', async () => {
    const mockApiResponse = {
      id: 'versioned-page',
      title: 'Versioned Page',
      type: 'page',
      version: {
        number: 3
      },
      body: {
        storage: {
          value: '<p>Version 3 content</p>'
        }
      }
    };

    mockHttpGet.mockResolvedValue(mockApiResponse);

    await api.getPageWithBody('versioned-page', {
      version: 3
    });

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/versioned-page', {
      params: {
        expand: 'body.storage,version,ancestors,children.attachment.metadata',
        version: 3
      }
    });
  });

  it('propagates HTTP client errors', async () => {
    const httpError = new Error('HTTP 404: Page not found');
    mockHttpGet.mockRejectedValue(httpError);

    await expect(api.getPageWithBody('nonexistent-page')).rejects.toThrow('HTTP 404: Page not found');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/content/nonexistent-page', {
      params: {
        expand: 'body.storage,version,ancestors,children.attachment.metadata'
      }
    });
  });
});
