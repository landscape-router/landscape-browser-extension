import browser from 'webextension-polyfill';

export interface CurrentSite {
  hostname: string;
  protocol: string;
  tabId: number;
  title?: string;
  url: string;
}

export async function getCurrentSite(): Promise<CurrentSite> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    throw new Error('No active tab URL is available.');
  }

  if (tab.id == null) {
    throw new Error('No active tab id is available.');
  }

  const url = new URL(tab.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only regular http/https pages can be inspected.');
  }

  return {
    hostname: url.hostname,
    protocol: url.protocol,
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
  };
}
