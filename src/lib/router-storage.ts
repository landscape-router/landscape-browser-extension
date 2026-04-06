import browser from 'webextension-polyfill';

export const ROUTER_CONFIG_KEY = 'router-config';
export const DEFAULT_ROUTER_BASE_URL = 'https://landscape.local:6443';

export interface RouterConfig {
  baseUrl: string;
  token: string;
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Router address is required.');
  }

  const url = new URL(trimmed);
  const pathname = url.pathname.replace(/\/+$/, '');
  const suffix = pathname === '/' ? '' : pathname;
  return `${url.protocol}//${url.host}${suffix}`;
}

export async function getRouterConfig(): Promise<RouterConfig | null> {
  const stored = await browser.storage.local.get(ROUTER_CONFIG_KEY);
  return (stored[ROUTER_CONFIG_KEY] as RouterConfig | undefined) ?? null;
}

export async function saveRouterConfig(config: RouterConfig): Promise<void> {
  await browser.storage.local.set({
    [ROUTER_CONFIG_KEY]: {
      baseUrl: normalizeBaseUrl(config.baseUrl),
      token: config.token.trim(),
    },
  });
}

export async function clearRouterConfig(): Promise<void> {
  await browser.storage.local.remove(ROUTER_CONFIG_KEY);
}
