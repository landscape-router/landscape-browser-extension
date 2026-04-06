import browser from 'webextension-polyfill';

export const COLLECT_RESOURCE_DOMAINS_MESSAGE = 'collect-resource-domains';

export interface ResourceDomainSummary {
  count: number;
  hostname: string;
  initiators: string[];
  sampleUrls: string[];
}

export interface CollectResourceDomainsRequest {
  type: typeof COLLECT_RESOURCE_DOMAINS_MESSAGE;
}

export interface CollectResourceDomainsResponse {
  domains: ResourceDomainSummary[];
}

export async function getResourceDomainsForTab(tabId: number): Promise<ResourceDomainSummary[]> {
  try {
    const response = (await browser.tabs.sendMessage(tabId, {
      type: COLLECT_RESOURCE_DOMAINS_MESSAGE,
    } satisfies CollectResourceDomainsRequest)) as CollectResourceDomainsResponse | undefined;

    return response?.domains ?? [];
  } catch (error) {
    if (
      error instanceof Error &&
      /Receiving end does not exist|Could not establish connection/i.test(error.message)
    ) {
      return [];
    }

    throw error;
  }
}
