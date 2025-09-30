import { ConfluenceApi, type ConfluenceApiConfig } from '../../src/confluence/api';
import { HttpClient } from '../../src/confluence/httpClient';
import type { Space } from '../../src/models/entities';

// Mock the HttpClient
jest.mock('../../src/confluence/httpClient');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('GET space contract', () => {
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

  it('retrieves space metadata', async () => {
    const mockSpaceResponse: Space = {
      id: 'space-123',
      key: 'TEST',
      name: 'Test Space',
      homepageId: 'page-456'
    };

    mockHttpGet.mockResolvedValue(mockSpaceResponse);

    const result = await api.getSpace('TEST');

    // Verify the HTTP request was made correctly
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/space/TEST?expand=description.plain,homepage');

    // Verify the response structure
    expect(result).toEqual(mockSpaceResponse);
    expect(result.id).toBe('space-123');
    expect(result.key).toBe('TEST');
    expect(result.name).toBe('Test Space');
    expect(result.homepageId).toBe('page-456');
  });

  it('handles space with minimal metadata', async () => {
    const mockSpaceResponse: Space = {
      id: 'space-789',
      key: 'MIN',
      name: 'Minimal Space'
      // No homepageId
    };

    mockHttpGet.mockResolvedValue(mockSpaceResponse);

    const result = await api.getSpace('MIN');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/space/MIN?expand=description.plain,homepage');
    expect(result.id).toBe('space-789');
    expect(result.key).toBe('MIN');
    expect(result.name).toBe('Minimal Space');
    expect(result.homepageId).toBeUndefined();
  });

  it('handles special characters in space key', async () => {
    const mockSpaceResponse: Space = {
      id: 'space-special',
      key: 'TEST-123',
      name: 'Test Space with Special Characters & Numbers'
    };

    mockHttpGet.mockResolvedValue(mockSpaceResponse);

    const result = await api.getSpace('TEST-123');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/space/TEST-123?expand=description.plain,homepage');
    expect(result.key).toBe('TEST-123');
    expect(result.name).toBe('Test Space with Special Characters & Numbers');
  });

  it('propagates HTTP client errors', async () => {
    const httpError = new Error('HTTP 404: Space not found');
    mockHttpGet.mockRejectedValue(httpError);

    await expect(api.getSpace('NONEXISTENT')).rejects.toThrow('HTTP 404: Space not found');

    expect(mockHttpGet).toHaveBeenCalledWith('/rest/api/space/NONEXISTENT?expand=description.plain,homepage');
  });

  it('includes proper expand parameters for metadata', async () => {
    const mockSpaceResponse: Space = {
      id: 'space-detailed',
      key: 'DETAILED',
      name: 'Detailed Space',
      homepageId: 'homepage-123'
    };

    mockHttpGet.mockResolvedValue(mockSpaceResponse);

    await api.getSpace('DETAILED');

    // Verify that expand parameters are included for getting description and homepage
    const expectedUrl = '/rest/api/space/DETAILED?expand=description.plain,homepage';
    expect(mockHttpGet).toHaveBeenCalledWith(expectedUrl);
  });
});
