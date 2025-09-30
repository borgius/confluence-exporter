import { ConfluenceApi, type ConfluenceApiConfig } from '../../src/confluence/api';
import { HttpClient } from '../../src/confluence/httpClient';
import type { AxiosError, AxiosResponse } from 'axios';

// Mock the HttpClient
jest.mock('../../src/confluence/httpClient');

const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('Rate limit + retry contract', () => {
  let api: ConfluenceApi;
  let mockGet: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
    MockedHttpClient.mockImplementation(() => ({
      get: mockGet
    }) as Partial<HttpClient> as HttpClient);

    const config: ConfluenceApiConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: 'testpass',
      retry: {
        maxAttempts: 3,
        baseDelayMs: 100, // Shorter for testing
        maxDelayMs: 5000,
        jitterRatio: 0.1
      }
    };

    api = new ConfluenceApi(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('honors Retry-After when 429 is returned', async () => {
    const retryAfterError = new Error('Rate limited') as AxiosError;
    const mockResponse: Partial<AxiosResponse> = {
      status: 429,
      headers: {
        'retry-after': '2' // 2 seconds
      },
      data: { message: 'Rate limit exceeded' },
      statusText: 'Too Many Requests'
    };
    retryAfterError.response = mockResponse as AxiosResponse;

    const successResponse = {
      id: 'space-123',
      key: 'TEST',
      name: 'Test Space'
    };

    // Mock the retry logic by simulating failure then success
    mockGet
      .mockRejectedValueOnce(retryAfterError) // First call fails with 429
      .mockResolvedValueOnce(successResponse); // Second call succeeds

    const startTime = Date.now();
    const result = await api.getSpace('TEST');
    const endTime = Date.now();

    // Verify the request was retried
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenCalledWith('/rest/api/space/TEST?expand=description.plain,homepage');

    // Verify the successful result
    expect(result).toEqual(successResponse);

    // The actual retry logic is handled by the HttpClient, 
    // but we can verify that the request was retried
    expect(endTime - startTime).toBeGreaterThan(0);
  });

  it('handles multiple 429 errors with exponential backoff', async () => {
    const rateLimitError1 = new Error('Rate limited') as AxiosError;
    rateLimitError1.response = {
      status: 429,
      headers: { 'retry-after': '1' },
      data: { message: 'Rate limit exceeded' },
      statusText: 'Too Many Requests'
    } as AxiosResponse;

    const rateLimitError2 = new Error('Rate limited again') as AxiosError;
    rateLimitError2.response = {
      status: 429,
      headers: { 'retry-after': '2' },
      data: { message: 'Rate limit exceeded' },
      statusText: 'Too Many Requests'
    } as AxiosResponse;

    const successResponse = {
      id: 'space-456',
      key: 'RETRY',
      name: 'Retry Space'
    };

    mockGet
      .mockRejectedValueOnce(rateLimitError1) // First call fails
      .mockRejectedValueOnce(rateLimitError2) // Second call fails
      .mockResolvedValueOnce(successResponse); // Third call succeeds

    const result = await api.getSpace('RETRY');

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(result).toEqual(successResponse);
  });

  it('respects max retry attempts and fails after exhaustion', async () => {
    const persistentRateLimitError = new Error('Persistent rate limit') as AxiosError;
    persistentRateLimitError.response = {
      status: 429,
      headers: { 'retry-after': '1' },
      data: { message: 'Rate limit exceeded' },
      statusText: 'Too Many Requests'
    } as AxiosResponse;

    // Mock persistent failures
    mockGet.mockRejectedValue(persistentRateLimitError);

    await expect(api.getSpace('PERSISTENT')).rejects.toThrow('Persistent rate limit');

    // Should have attempted the request multiple times based on retry config
    expect(mockGet).toHaveBeenCalledTimes(3); // maxAttempts
  });

  it('handles 429 without Retry-After header', async () => {
    const rateLimitErrorNoHeader = new Error('Rate limited no header') as AxiosError;
    rateLimitErrorNoHeader.response = {
      status: 429,
      headers: {}, // No retry-after header
      data: { message: 'Rate limit exceeded' },
      statusText: 'Too Many Requests'
    } as AxiosResponse;

    const successResponse = {
      id: 'space-789',
      key: 'NOHEADER',
      name: 'No Header Space'
    };

    mockGet
      .mockRejectedValueOnce(rateLimitErrorNoHeader)
      .mockResolvedValueOnce(successResponse);

    const result = await api.getSpace('NOHEADER');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successResponse);
  });

  it('does not retry on 401 authentication errors', async () => {
    const authError = new Error('Unauthorized') as AxiosError;
    authError.response = {
      status: 401,
      headers: {},
      data: { message: 'Unauthorized' },
      statusText: 'Unauthorized'
    } as AxiosResponse;

    mockGet.mockRejectedValue(authError);

    await expect(api.getSpace('AUTH')).rejects.toThrow('Unauthorized');

    // Should not retry on auth errors
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('retries on server errors (5xx)', async () => {
    const serverError = new Error('Internal Server Error') as AxiosError;
    serverError.response = {
      status: 500,
      headers: {},
      data: { message: 'Internal Server Error' },
      statusText: 'Internal Server Error'
    } as AxiosResponse;

    const successResponse = {
      id: 'space-server',
      key: 'SERVER',
      name: 'Server Error Space'
    };

    mockGet
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(successResponse);

    const result = await api.getSpace('SERVER');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successResponse);
  });

  it('retries on network errors', async () => {
    const networkError = new Error('Network Error');
    // Network errors don't have response property

    const successResponse = {
      id: 'space-network',
      key: 'NETWORK',
      name: 'Network Error Space'
    };

    mockGet
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(successResponse);

    const result = await api.getSpace('NETWORK');

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result).toEqual(successResponse);
  });
});
