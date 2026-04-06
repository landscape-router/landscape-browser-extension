import browser from 'webextension-polyfill';
import {
  COLLECT_RESOURCE_DOMAINS_MESSAGE,
  type CollectResourceDomainsRequest,
  type CollectResourceDomainsResponse,
  type ResourceDomainSummary,
} from '../lib/resource-domains';

interface MutableDomainSummary {
  count: number;
  hostname: string;
  initiators: Set<string>;
  sampleUrls: string[];
}

function toHttpUrl(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function pushUrl(store: Map<string, MutableDomainSummary>, url: URL, initiator: string) {
  if (url.hostname === window.location.hostname) {
    return;
  }

  const existing = store.get(url.hostname) ?? {
    count: 0,
    hostname: url.hostname,
    initiators: new Set<string>(),
    sampleUrls: [],
  };

  existing.count += 1;
  existing.initiators.add(initiator);

  if (existing.sampleUrls.length < 3 && !existing.sampleUrls.includes(url.href)) {
    existing.sampleUrls.push(url.href);
  }

  store.set(url.hostname, existing);
}

function collectFromPerformance(store: Map<string, MutableDomainSummary>) {
  for (const entry of performance.getEntriesByType('resource')) {
    if (!('name' in entry)) {
      continue;
    }

    const url = toHttpUrl(entry.name);
    if (!url) {
      continue;
    }

    const initiator = 'initiatorType' in entry && entry.initiatorType
      ? entry.initiatorType
      : 'resource';
    pushUrl(store, url, initiator);
  }
}

function collectFromDom(store: Map<string, MutableDomainSummary>) {
  const attributeSources: Array<{ selector: string; read: (element: Element) => string | null | undefined; type: string }> = [
    { selector: 'script[src]', read: (element) => (element as HTMLScriptElement).src, type: 'script' },
    { selector: 'img', read: (element) => (element as HTMLImageElement).currentSrc || (element as HTMLImageElement).src, type: 'image' },
    { selector: 'link[href]', read: (element) => (element as HTMLLinkElement).href, type: 'link' },
    { selector: 'iframe[src]', read: (element) => (element as HTMLIFrameElement).src, type: 'iframe' },
    { selector: 'audio[src],video[src]', read: (element) => (element as HTMLMediaElement).currentSrc || (element as HTMLMediaElement).src, type: 'media' },
    { selector: 'source[src]', read: (element) => (element as HTMLSourceElement).src, type: 'source' },
  ];

  for (const source of attributeSources) {
    for (const element of document.querySelectorAll(source.selector)) {
      const url = toHttpUrl(source.read(element));
      if (!url) {
        continue;
      }

      pushUrl(store, url, source.type);
    }
  }
}

function collectResourceDomains(): ResourceDomainSummary[] {
  const store = new Map<string, MutableDomainSummary>();

  collectFromPerformance(store);
  collectFromDom(store);

  return [...store.values()]
    .map((value) => ({
      count: value.count,
      hostname: value.hostname,
      initiators: [...value.initiators].sort(),
      sampleUrls: value.sampleUrls,
    }))
    .sort((left, right) => right.count - left.count || left.hostname.localeCompare(right.hostname));
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message) => {
      const request = message as CollectResourceDomainsRequest;
      if (request?.type !== COLLECT_RESOURCE_DOMAINS_MESSAGE) {
        return undefined;
      }

      return Promise.resolve({
        domains: collectResourceDomains(),
      } satisfies CollectResourceDomainsResponse);
    });
  },
});
