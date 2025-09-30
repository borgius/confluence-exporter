import { HttpClient, type HttpClientConfig } from '../../src/confluence/httpClient';
import axios, { type AxiosInstance } from 'axios';

// Mock axios to capture requests and test retry behavior
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Rate limit + retry contract', () => {
  let mockInstance: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    // Create mock axios instance with interceptor
    mockInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn().mockImplementation((_onFulfilled, _onRejected) => {
            // Store interceptor handlers for potential use
            return 1; // interceptor id
          })
        }
      }
    } as unknown as jest.Mocked<AxiosInstance>;
    
    mockedAxios.create.mockReturnValue(mockInstance);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retries on 429 rate limit errors', async () => {
    // Mock error that would be thrown by axios
    const rateLimitError = Object.assign(new Error('Request failed with status code 429'), {
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '1' },
        data: { message: 'Rate limit exceeded' }
      }
    });

    const successResponse = {
      data: { id: 'space-123', key: 'TEST', name: 'Test Space' },
      status: 200
    };

    // First call fails with 429, second succeeds
    mockInstance.request
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(successResponse);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 10, // Very short for testing
        maxDelayMs: 100,
        jitterRatio: 0.1
      }
    };

    const client = new HttpClient(config);
    const result = await client.get('/rest/api/space/TEST');

    expect(result).toEqual({ id: 'space-123', key: 'TEST', name: 'Test Space' });
    expect(mockInstance.request).toHaveBeenCalledTimes(2);
  });

  it('retries on server errors (5xx)', async () => {
    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        data: { message: 'Internal Server Error' }
      }
    });

    const successResponse = {
      data: { success: true },
      status: 200
    };

    mockInstance.request
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(successResponse);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0.1
      }
    };

    const client = new HttpClient(config);
    const result = await client.get('/rest/api/content');

    expect(result).toEqual({ success: true });
    expect(mockInstance.request).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401 authentication errors', async () => {
    const authError = Object.assign(new Error('Request failed with status code 401'), {
      response: {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        data: { message: 'Unauthorized' }
      }
    });

    mockInstance.request.mockRejectedValue(authError);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0.1
      }
    };

    const client = new HttpClient(config);

    await expect(client.get('/rest/api/content')).rejects.toThrow('Request failed with status code 401');
    expect(mockInstance.request).toHaveBeenCalledTimes(1); // No retry
  });

  it('respects max retry attempts', async () => {
    const persistentError = Object.assign(new Error('Request failed with status code 503'), {
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        data: { message: 'Service Unavailable' }
      }
    });

    mockInstance.request.mockRejectedValue(persistentError);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 2, // Only 2 attempts for this test
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0.1
      }
    };

    const client = new HttpClient(config);

    await expect(client.get('/rest/api/content')).rejects.toThrow('Request failed with status code 503');
    expect(mockInstance.request).toHaveBeenCalledTimes(2); // Exactly maxAttempts
  });

  it('retries on network errors (no response)', async () => {
    const networkError = new Error('Network Error');
    // Network errors don't have response property

    const successResponse = {
      data: { success: true },
      status: 200
    };

    mockInstance.request
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(successResponse);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0.1
      }
    };

    const client = new HttpClient(config);
    const result = await client.get('/rest/api/content');

    expect(result).toEqual({ success: true });
    expect(mockInstance.request).toHaveBeenCalledTimes(2);
  });
});
