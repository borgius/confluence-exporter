import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { retry, type RetryError } from '../util/retry.js';
import type { RetryPolicyConfig } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface HttpClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  retry: RetryPolicyConfig;
}

export class HttpClient {
  private client: AxiosInstance;
  private retryConfig: RetryPolicyConfig;

  constructor(config: HttpClientConfig) {
    this.retryConfig = config.retry;
    
    // Create basic auth header
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('HTTP response', {
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          size: JSON.stringify(response.data).length
        });
        return response;
      },
      (error) => {
        logger.warn('HTTP error', {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('GET', url, undefined, config);
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('POST', url, data, config);
  }

  private async request<T>(
    method: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return retry(
      async () => {
        const response: AxiosResponse<T> = await this.client.request({
          method,
          url,
          data,
          ...config
        });
        return response.data;
      },
      {
        maxAttempts: this.retryConfig.maxAttempts,
        baseDelayMs: this.retryConfig.baseDelayMs,
        maxDelayMs: this.retryConfig.maxDelayMs,
        jitterRatio: this.retryConfig.jitterRatio,
        shouldRetry: this.shouldRetry.bind(this),
        getRetryAfter: this.getRetryAfter.bind(this),
        onAttempt: (attempt, delayMs, error) => {
          logger.info('Retrying request', {
            method,
            url,
            attempt,
            delayMs,
            error: error.message
          });
        }
      }
    );
  }

  private shouldRetry(error: RetryError, _attempt: number): boolean {
    // Don't retry on auth errors or client errors (except 429)
    if (error.response?.status === 401 || error.response?.status === 403) {
      return false;
    }
    
    // Retry on rate limiting
    if (error.response?.status === 429) {
      return true;
    }
    
    // Retry on server errors and network errors
    const status = error.response?.status;
    return !status || status >= 500;
  }

  private getRetryAfter(error: RetryError): number | undefined {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      return Number.isNaN(seconds) ? undefined : seconds * 1000; // Convert to milliseconds
    }
    return undefined;
  }
}
