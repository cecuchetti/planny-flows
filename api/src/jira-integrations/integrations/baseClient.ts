import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';

import { logExternalRequest, logExternalResponse, logExternalError } from 'utils/logger';

interface RequestMetadata {
  startTime: number;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: RequestMetadata;
  }
}

export interface HttpClientConfig {
  baseURL: string;
  authType: 'basic' | 'bearer';
  email?: string;
  apiToken?: string;
  timeoutMs: number;
  systemName?: string;
  requestId?: string;
}

export class HttpClient {
  private client: AxiosInstance;
  private systemName: string;
  private requestId?: string;

  constructor(private httpConfig: HttpClientConfig) {
    this.systemName = httpConfig.systemName || 'external';
    this.requestId = httpConfig.requestId;
    this.client = axios.create({
      baseURL: httpConfig.baseURL,
      timeout: httpConfig.timeoutMs,
    });

    this.client.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      requestConfig.headers = requestConfig.headers || {};
      if (this.httpConfig.authType === 'bearer' && this.httpConfig.apiToken) {
        requestConfig.headers.Authorization = `Bearer ${this.httpConfig.apiToken}`;
      } else if (
        this.httpConfig.authType === 'basic' &&
        this.httpConfig.email &&
        this.httpConfig.apiToken
      ) {
        const credentials = `${this.httpConfig.email}:${this.httpConfig.apiToken}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        requestConfig.headers.Authorization = `Basic ${encodedCredentials}`;
      }

      requestConfig.metadata = { startTime: Date.now() };

      logExternalRequest(
        this.requestId,
        this.systemName,
        requestConfig.method?.toUpperCase() || 'GET',
        requestConfig.url || '',
        { baseURL: this.httpConfig.baseURL }
      );

      return requestConfig;
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const startTime = response.config.metadata?.startTime;
        const durationMs = startTime ? Date.now() - startTime : 0;

        logExternalResponse(
          this.requestId,
          this.systemName,
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          durationMs
        );
        return response;
      },
      (error: AxiosError) => {
        logExternalError(
          this.requestId,
          this.systemName,
          error.config?.method?.toUpperCase() || 'GET',
          error.config?.url || '',
          error
        );
        return Promise.reject(error);
      }
    );
  }

  setRequestId(requestId: string | undefined): void {
    this.requestId = requestId;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }
}
