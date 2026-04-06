import axios, { AxiosError, type AxiosInstance } from 'axios';
import { loginHandler } from '@landscape-router/types/api/auth/auth';
import { getClientCaller } from '@landscape-router/types/api/client/client';
import { setAxiosInstance } from '@landscape-router/types/mutator';
import type { CallerIdentityResponse, LoginResult } from '@landscape-router/types/api/schemas';
import type { RouterConfig } from './router-storage';
import { saveRouterConfig } from './router-storage';

type RouterErrorLike = {
  error_id?: string;
  message?: string;
};

function formatAuthToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^bearer\s/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

function extractRefreshToken(headers: Record<string, unknown> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  const token = headers['x-refresh-token'];
  return typeof token === 'string' && token.trim() ? token.trim() : undefined;
}

function createAxiosInstance(config: { baseUrl: string; token?: string }): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseUrl,
    timeout: 20_000,
  });

  instance.interceptors.request.use((request) => {
    if (config.token?.trim()) {
      request.headers = request.headers ?? {};
      request.headers.Authorization = formatAuthToken(config.token);
    }

    return request;
  });

  instance.interceptors.response.use(async (response) => {
    const refreshToken = extractRefreshToken(response.headers as Record<string, unknown> | undefined);
    if (refreshToken && refreshToken !== config.token) {
      config.token = refreshToken;
      await saveRouterConfig({
        baseUrl: config.baseUrl,
        token: refreshToken,
      });
    }

    return response.data;
  }, (error: AxiosError<RouterErrorLike>) => Promise.reject(error.response?.data ?? error));

  return instance;
}

export async function withRouterClient<T>(
  config: RouterConfig,
  task: () => Promise<T>,
): Promise<T> {
  setAxiosInstance(createAxiosInstance(config));
  return task();
}

export async function loginWithPassword(
  baseUrl: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  setAxiosInstance(createAxiosInstance({ baseUrl }));
  const result = await loginHandler({ username, password });
  if (!result.success || !result.token) {
    throw new Error('Router login succeeded without returning a usable token.');
  }

  return result;
}

export async function validateRouterConfig(
  config: RouterConfig,
): Promise<CallerIdentityResponse> {
  return withRouterClient(config, () => getClientCaller());
}

export function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    const value = error as RouterErrorLike;
    const message = error.message;
    return value.error_id ? `${message} (${value.error_id})` : message;
  }

  if (axios.isAxiosError(error)) {
    return error.message;
  }

  return 'Unexpected Router API error.';
}
