import { HttpClient, type HttpClientConfig } from '../../src/confluence/httpClient';
import axios, { type AxiosInstance } from 'axios';

// Mock axios to capture requests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Basic Auth header contract', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends Authorization header with basic credentials', async () => {
    // Mock axios.create to return a mock instance
    const mockInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    } as unknown as AxiosInstance;
    
    mockedAxios.create.mockReturnValue(mockInstance);

    // Mock successful response
    (mockInstance.request as jest.Mock).mockResolvedValue({
      data: { success: true },
      status: 200,
      config: { method: 'GET', url: '/rest/api/content' }
    });

    const config: HttpClientConfig = {
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

    const client = new HttpClient(config);

    // Make a request
    await client.get('/rest/api/content');

    // Verify axios.create was called with correct config
    expect(mockedAxios.create).toHaveBeenCalledTimes(1);
    const createCallArgs = mockedAxios.create.mock.calls[0][0];

    // Verify basic auth header
    expect(createCallArgs?.headers).toHaveProperty('Authorization');
    const authHeaderValue = (createCallArgs?.headers as Record<string, string>)?.['Authorization'];
    expect(authHeaderValue).toMatch(/^Basic /);

    // Decode and verify the base64 encoded credentials
    const base64Credentials = authHeaderValue?.replace('Basic ', '') || '';
    const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    expect(decodedCredentials).toBe('testuser:testpass');

    // Verify other headers
    expect(createCallArgs?.headers).toHaveProperty('Accept', 'application/json');
    expect(createCallArgs?.headers).toHaveProperty('User-Agent', 'curl/7.68.0');

    // Verify base URL
    expect(createCallArgs?.baseURL).toBe('https://test.atlassian.net/wiki');

    // Verify timeout
    expect(createCallArgs?.timeout).toBe(30000);
  });

  it('handles special characters in credentials correctly', async () => {
    const mockInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    } as unknown as AxiosInstance;
    
    mockedAxios.create.mockReturnValue(mockInstance);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'user@domain.com',
      password: 'p@ssw0rd!',
      retry: {
        maxAttempts: 1,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1
      }
    };

    new HttpClient(config);

    const createCallArgs = mockedAxios.create.mock.calls[0][0];
    const authHeaderValue = (createCallArgs?.headers as Record<string, string>)?.['Authorization'];
    const base64Credentials = authHeaderValue?.replace('Basic ', '') || '';
    const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    
    expect(decodedCredentials).toBe('user@domain.com:p@ssw0rd!');
  });

  it('handles empty password correctly', async () => {
    const mockInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    } as unknown as AxiosInstance;
    
    mockedAxios.create.mockReturnValue(mockInstance);

    const config: HttpClientConfig = {
      baseUrl: 'https://test.atlassian.net/wiki',
      username: 'testuser',
      password: '',
      retry: {
        maxAttempts: 1,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0.1
      }
    };

    new HttpClient(config);

    const createCallArgs = mockedAxios.create.mock.calls[0][0];
    const authHeaderValue = (createCallArgs?.headers as Record<string, string>)?.['Authorization'];
    const base64Credentials = authHeaderValue?.replace('Basic ', '') || '';
    const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    
    expect(decodedCredentials).toBe('testuser:');
  });
});
