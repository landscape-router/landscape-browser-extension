import browser from 'webextension-polyfill';
import { currentSiteFromTab } from '../lib/current-site';
import {
  GET_MAIN_FRAME_IP,
  getMainFrameIpStorageKey,
  type GetMainFrameIpRequest,
  type MainFrameIpResponse,
} from '../lib/background-messages';
import { getErrorMessage } from '../lib/router-client';
import { getCacheInconsistencySummary, inspectCurrentSite } from '../lib/router-inspector';
import { getRouterConfig, ROUTER_CONFIG_KEY } from '../lib/router-storage';

const extensionAction = browser.action ?? browser.browserAction;

const BADGE_COLORS = {
  error: '#ef4444',
  loggedIn: '#16a34a',
  loggedOut: '#64748b',
  warning: '#f59e0b',
} as const;

const INSPECTION_DEBOUNCE_MS = 900;

const pendingChecks = new Map<number, ReturnType<typeof setTimeout>>();

function clearPendingCheck(tabId: number) {
  const timeout = pendingChecks.get(tabId);
  if (timeout) {
    clearTimeout(timeout);
    pendingChecks.delete(tabId);
  }
}

async function setBadge(
  tabId: number,
  text: string,
  color: string,
  title: string,
) {
  await Promise.all([
    extensionAction.setBadgeText({ tabId, text }),
    extensionAction.setBadgeBackgroundColor({ color, tabId }),
    extensionAction.setTitle({ tabId, title }),
  ]);
}

async function setLoggedOutBadge(tabId: number) {
  await setBadge(tabId, 'OFF', BADGE_COLORS.loggedOut, 'Landscape 追踪: Router 未登录');
}

async function setLoggedInBadge(tabId: number, title: string) {
  await setBadge(tabId, 'ON', BADGE_COLORS.loggedIn, title);
}

async function setWarningBadge(tabId: number, title: string) {
  await setBadge(tabId, '!', BADGE_COLORS.warning, title);
}

async function setErrorBadge(tabId: number, title: string) {
  await setBadge(tabId, 'ERR', BADGE_COLORS.error, title);
}

async function inspectTab(tabId: number) {
  clearPendingCheck(tabId);

  const config = await getRouterConfig();
  if (!config?.token.trim()) {
    await setLoggedOutBadge(tabId);
    return;
  }

  let tab: browser.Tabs.Tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    return;
  }

  let site;
  try {
    site = currentSiteFromTab(tab);
  } catch {
    await setLoggedInBadge(tabId, 'Landscape 追踪: 已登录');
    return;
  }

  try {
    const inspection = await inspectCurrentSite(site, config);
    const inconsistency = getCacheInconsistencySummary(inspection);

    if (inconsistency) {
      await setWarningBadge(
        tabId,
        `Landscape 追踪: ${site.hostname} 缓存不一致 (${inconsistency.inconsistentVerdictCount}/${inconsistency.cachedVerdictCount})`,
      );
      return;
    }

    await setLoggedInBadge(tabId, `Landscape 追踪: ${site.hostname} 缓存一致`);
  } catch (error) {
    await setErrorBadge(tabId, `Landscape 追踪: ${getErrorMessage(error)}`);
  }
}

function scheduleInspection(tabId: number) {
  clearPendingCheck(tabId);
  pendingChecks.set(
    tabId,
    setTimeout(() => {
      void inspectTab(tabId);
    }, INSPECTION_DEBOUNCE_MS),
  );
}

async function refreshActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    scheduleInspection(tab.id);
  }
}

async function refreshAllOpenTabs() {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) {
      scheduleInspection(tab.id);
    }
  }
}

async function storeMainFrameIp(tabId: number, value: MainFrameIpResponse) {
  console.log('[Landscape Trace] storeMainFrameIp', {
    ip: value.ip,
    tabId,
    url: value.url,
  });

  await browser.storage.local.set({
    [getMainFrameIpStorageKey(tabId)]: value,
  });
}

async function getStoredMainFrameIp(tabId: number): Promise<MainFrameIpResponse> {
  const key = getMainFrameIpStorageKey(tabId);
  const stored = await browser.storage.local.get(key);
  const result = (stored[key] as MainFrameIpResponse | undefined) ?? {};

  console.log('[Landscape Trace] getStoredMainFrameIp', {
    ip: result.ip,
    tabId,
    url: result.url,
  });

  return result;
}

async function clearStoredMainFrameIp(tabId: number) {
  console.log('[Landscape Trace] clearStoredMainFrameIp', { tabId });
  await browser.storage.local.remove(getMainFrameIpStorageKey(tabId));
}

function registerMainFrameIp(details: browser.WebRequest.OnResponseStartedDetailsType) {
  if (details.tabId < 0 || details.type !== 'main_frame' || !details.ip) {
    if (details.type === 'main_frame') {
      console.warn('[Landscape Trace] skipMainFrameIp', {
        ip: details.ip,
        tabId: details.tabId,
        url: details.url,
      });
    }

    return;
  }

  void storeMainFrameIp(details.tabId, {
    ip: details.ip,
    url: details.url,
  });
}

export default defineBackground(() => {
  console.log('[Landscape Trace] background started');

  browser.webRequest.onResponseStarted.addListener(registerMainFrameIp, {
    urls: ['http://*/*', 'https://*/*'],
  });

  browser.webRequest.onCompleted.addListener(registerMainFrameIp, {
    urls: ['http://*/*', 'https://*/*'],
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    scheduleInspection(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.active) {
      return;
    }

    if (changeInfo.status === 'complete' || changeInfo.url) {
      scheduleInspection(tabId);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    clearPendingCheck(tabId);
    void clearStoredMainFrameIp(tabId);
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && ROUTER_CONFIG_KEY in changes) {
      void refreshAllOpenTabs();
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    const request = message as GetMainFrameIpRequest;
    if (request?.type !== GET_MAIN_FRAME_IP) {
      return undefined;
    }

    return getStoredMainFrameIp(request.tabId);
  });

  void refreshActiveTab();
});
