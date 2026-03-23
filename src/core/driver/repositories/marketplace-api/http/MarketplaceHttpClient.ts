import { Injectable } from '@nestjs/common';
import { MarketplaceHttpError } from './errors/MarketplaceHttpError';

type QueryParams = Record<string, string | number | boolean | undefined>;

@Injectable()
export class MarketplaceHttpClient {
  private readonly baseUrl: string;

  constructor() {
    const baseUrl = process.env.MARKETPLACE_API_BASE_URL;

    if (!baseUrl) {
      throw new Error('MARKETPLACE_API_BASE_URL is not defined');
    }

    this.baseUrl = baseUrl;
  }

  async get<T>(url: string, params?: QueryParams): Promise<T> {
    try {
      return await this.request<T>('GET', url, { params });
    } catch (error) {
      throw this.handleError('GET', url, error);
    }
  }

  async post<T>(url: string, body: unknown): Promise<T> {
    try {
      return await this.request<T>('POST', url, { body });
    } catch (error) {
      throw this.handleError('POST', url, error);
    }
  }

  async put<T>(url: string, body: unknown): Promise<T> {
    try {
      return await this.request<T>('PUT', url, { body });
    } catch (error) {
      throw this.handleError('PUT', url, error);
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: {
      body?: unknown;
      params?: QueryParams;
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);
    const response = await fetch(url, {
      method,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(90000),
    });

    const responseBody = await this.parseResponse(response);

    if (!response.ok) {
      throw new MarketplaceHttpError(
        response.status,
        responseBody,
        `[MARKETPLACE ${method}] ${path}`,
      );
    }

    return responseBody as T;
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.baseUrl);

    if (!params) {
      return url.toString();
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private handleError(
    method: string,
    url: string,
    error: unknown,
  ): MarketplaceHttpError {
    if (error instanceof MarketplaceHttpError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : 'Unexpected marketplace error';

    return new MarketplaceHttpError(
      500,
      message,
      `[MARKETPLACE ${method}] ${url}`,
    );
  }
}
