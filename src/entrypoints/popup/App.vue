<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import browser from 'webextension-polyfill';
import {
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NFlex,
  NGlobalStyle,
  NSelect,
  NTag,
  NText,
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import {
  GET_MAIN_FRAME_IP,
  getMainFrameIpStorageKey,
  type MainFrameIpResponse,
} from '../../lib/background-messages';
import type { CurrentSite } from '../../lib/current-site';
import { getCurrentSite } from '../../lib/current-site';
import { formatChipClass } from '../../lib/format';
import { getResourceDomainsForTab, type ResourceDomainSummary } from '../../lib/resource-domains';
import { getErrorMessage } from '../../lib/router-client';
import { inspectCurrentSite, inspectHostname, inspectHostnames, type SiteInspection } from '../../lib/router-inspector';
import type { RouterConfig } from '../../lib/router-storage';
import { getRouterConfig } from '../../lib/router-storage';
import InspectionPanels from '../../components/InspectionPanels.vue';
import { getStoredLocale, saveStoredLocale, type AppLocale } from '../../lib/i18n';

interface ResourceInspectionState {
  expanded?: boolean;
  error?: string;
  inspection?: SiteInspection;
  loading?: boolean;
}

const { t, locale } = useI18n();

const config = ref<RouterConfig | null>(null);
const site = ref<CurrentSite | null>(null);
const mainRequestIp = ref<string | null>(null);
const inspection = ref<SiteInspection | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const resourceError = ref<string | null>(null);
const resourceDomains = ref<ResourceDomainSummary[]>([]);
const resourceInspectionMap = ref<Record<string, ResourceInspectionState>>({});
const bulkInspecting = ref(false);
const mainExpanded = ref(false);
const currentMainFrameIpKey = ref<string | null>(null);
let ipRetryTimer: ReturnType<typeof setTimeout> | null = null;
const languageOptions = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
];

const naiveLocale = computed(() => (locale.value === 'zh' ? zhCN : enUS));
const naiveDateLocale = computed(() => (locale.value === 'zh' ? dateZhCN : dateEnUS));

function resolveMainRequestIp(value: MainFrameIpResponse, expectedHostname: string): string | null {
  if (!value.ip || !value.url) {
    return null;
  }

  try {
    const url = new URL(value.url);
    return url.hostname === expectedHostname ? value.ip : null;
  } catch {
    return null;
  }
}

async function updateMainRequestIp(tabId: number, expectedHostname: string) {
  const response = (await browser.runtime.sendMessage({
    tabId,
    type: GET_MAIN_FRAME_IP,
  })) as MainFrameIpResponse;

  const ip = resolveMainRequestIp(response, expectedHostname);
  mainRequestIp.value = ip;
  return ip;
}

function clearIpRetryTimer() {
  if (ipRetryTimer) {
    clearTimeout(ipRetryTimer);
    ipRetryTimer = null;
  }
}

function scheduleMainRequestIpRetry(tabId: number, expectedHostname: string, attemptsLeft = 8) {
  clearIpRetryTimer();

  if (attemptsLeft <= 0) {
    return;
  }

  ipRetryTimer = setTimeout(async () => {
    const ip = await updateMainRequestIp(tabId, expectedHostname).catch(() => null);
    if (!ip && site.value?.tabId === tabId) {
      scheduleMainRequestIpRetry(tabId, expectedHostname, attemptsLeft - 1);
    }
  }, 400);
}

const handleStorageChange = (
  changes: Record<string, browser.Storage.StorageChange>,
  areaName: string,
) => {
  if (areaName !== 'local' || !currentMainFrameIpKey.value) {
    return;
  }

  const changed = changes[currentMainFrameIpKey.value];
  if (!changed) {
    return;
  }

  const nextValue = changed.newValue as MainFrameIpResponse | undefined;
  mainRequestIp.value = site.value ? resolveMainRequestIp(nextValue ?? {}, site.value.hostname) : null;
};

async function load() {
  loading.value = true;
  error.value = null;
  resourceError.value = null;
  inspection.value = null;
  mainRequestIp.value = null;
  currentMainFrameIpKey.value = null;
  resourceDomains.value = [];
  resourceInspectionMap.value = {};
  mainExpanded.value = false;
  clearIpRetryTimer();

  try {
    const [savedConfig, currentSite] = await Promise.all([getRouterConfig(), getCurrentSite()]);
    config.value = savedConfig;
    site.value = currentSite;
    currentMainFrameIpKey.value = getMainFrameIpStorageKey(currentSite.tabId);

    const [resourceDomainsResult, inspectionResult, mainIpResult] = await Promise.allSettled([
      getResourceDomainsForTab(currentSite.tabId),
      savedConfig ? inspectCurrentSite(currentSite, savedConfig) : Promise.resolve(null),
      updateMainRequestIp(currentSite.tabId, currentSite.hostname),
    ]);

    if (mainIpResult.status === 'fulfilled') {
      mainRequestIp.value = mainIpResult.value;
      if (!mainIpResult.value) {
        scheduleMainRequestIpRetry(currentSite.tabId, currentSite.hostname);
      }
    }

    if (resourceDomainsResult.status === 'fulfilled') {
      resourceDomains.value = resourceDomainsResult.value;
    } else {
      resourceDomains.value = [];
      resourceError.value = getErrorMessage(resourceDomainsResult.reason);
    }

    if (!savedConfig) {
      return;
    }

    if (inspectionResult.status === 'fulfilled') {
      inspection.value = inspectionResult.value;
    } else {
      error.value = getErrorMessage(inspectionResult.reason);
    }
  } catch (loadError) {
    inspection.value = null;
    resourceDomains.value = [];
    error.value = getErrorMessage(loadError);
  } finally {
    loading.value = false;
  }
}

async function handleLocaleChange(value: string) {
  if (value !== 'zh' && value !== 'en') {
    return;
  }

  locale.value = value as AppLocale;
  await saveStoredLocale(value as AppLocale);
}

async function handleInspectResource(hostname: string) {
  if (!config.value) {
    error.value = t('configureBeforeInspect');
    return;
  }

  resourceInspectionMap.value = {
    ...resourceInspectionMap.value,
    [hostname]: {
      ...resourceInspectionMap.value[hostname],
      error: undefined,
      expanded: true,
      loading: true,
    },
  };

  try {
    const result = await inspectHostname(hostname, config.value);
    resourceInspectionMap.value = {
      ...resourceInspectionMap.value,
      [hostname]: { expanded: true, inspection: result, loading: false },
    };
  } catch (inspectError) {
    resourceInspectionMap.value = {
      ...resourceInspectionMap.value,
      [hostname]: { error: getErrorMessage(inspectError), expanded: true, loading: false },
    };
  }
}

function toggleResource(hostname: string) {
  const current = resourceInspectionMap.value[hostname];
  if (!current?.inspection && !current?.error) {
    return;
  }

  resourceInspectionMap.value = {
    ...resourceInspectionMap.value,
    [hostname]: {
      ...current,
      expanded: !current.expanded,
    },
  };
}

async function handleInspectAllResources() {
  if (!config.value || resourceDomains.value.length === 0) {
    return;
  }

  bulkInspecting.value = true;
  resourceInspectionMap.value = Object.fromEntries(
    resourceDomains.value.map((domain) => [
      domain.hostname,
      {
        ...resourceInspectionMap.value[domain.hostname],
        error: undefined,
        loading: true,
      },
    ]),
  );

  try {
    const results = await inspectHostnames(
      resourceDomains.value.map((domain) => domain.hostname),
      config.value,
    );

    const next = { ...resourceInspectionMap.value };
    for (const result of results) {
      next[result.hostname] = {
        expanded: next[result.hostname]?.expanded ?? false,
        error: result.error,
        inspection: result.inspection,
        loading: false,
      };
    }
    resourceInspectionMap.value = next;
  } catch (inspectError) {
    error.value = getErrorMessage(inspectError);
  } finally {
    bulkInspecting.value = false;
  }
}

onMounted(() => {
  browser.storage.onChanged.addListener(handleStorageChange);

  void getStoredLocale().then((storedLocale) => {
    if (storedLocale) {
      locale.value = storedLocale;
    }
  });
  void load();
});

onBeforeUnmount(() => {
  clearIpRetryTimer();
  browser.storage.onChanged.removeListener(handleStorageChange);
});
</script>

<template>
  <NConfigProvider :theme="darkTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <NGlobalStyle />
    <main class="app-shell popup-shell">
      <header class="header-stack">
        <div class="page-title">
          <div>
            <h1>{{ t('appTitle') }}</h1>
            <div v-if="config" class="router-endpoint mono">{{ config.baseUrl }}</div>
          </div>
        </div>
        <NFlex class="toolbar-row" :size="8" :wrap="false">
          <NSelect
            :value="locale"
            :consistent-menu-width="false"
            size="small"
            style="width: 84px;"
            :options="languageOptions"
            @update:value="handleLocaleChange"
          />
          <NButton secondary size="small" @click="load">{{ t('refresh') }}</NButton>
          <NButton secondary size="small" @click="browser.runtime.openOptionsPage()">{{ t('settings') }}</NButton>
        </NFlex>
      </header>

      <NCard v-if="site" size="small" :title="t('site')">
        <template #header-extra>
          <NFlex :size="8" align="center">
            <NTag v-if="inspection" round :class="formatChipClass(inspection.summary.action)">
              {{ inspection.summary.label }}
            </NTag>
            <NButton
              v-if="inspection"
              tertiary
              size="small"
              @click="mainExpanded = !mainExpanded"
            >
              {{ mainExpanded ? t('collapse') : t('expand') }}
            </NButton>
          </NFlex>
        </template>
        <div class="domain-focus-row">
          <div class="domain-focus-label">{{ t('fields.hostname') }}</div>
          <code class="domain-focus-value">{{ site.hostname }}</code>
          <div class="panel-meta">
            {{ t('fields.actualIp') }}: <code class="mono">{{ mainRequestIp || t('capturing') }}</code>
          </div>
        </div>

        <InspectionPanels
          v-if="inspection && !loading && mainExpanded"
          class="domain-panel"
          :heading="''"
          :highlight-ip="mainRequestIp || undefined"
          :inspection="inspection"
        />
      </NCard>

      <NAlert v-if="!config && !loading" type="info" :show-icon="false">
        {{ t('configureFirst') }}
      </NAlert>

      <NText v-else-if="loading" depth="3" style="display: block;">
        {{ t('inspectingActiveHostname') }}
      </NText>

      <NAlert v-else-if="error && !inspection" type="error" :show-icon="false">
        {{ error }}
      </NAlert>

      <NText v-else-if="config && !inspection" depth="3" style="display: block;">
        {{ t('noResultYet') }}
      </NText>

      <NCard size="small" :title="t('externalResourceDomains')">
        <template #header-extra>
          <NButton
            secondary
            size="small"
            :disabled="!config || resourceDomains.length === 0 || bulkInspecting"
            @click="handleInspectAllResources"
          >
            {{ bulkInspecting ? t('inspectingAll') : t('inspectAll') }}
          </NButton>
        </template>

        <NAlert v-if="resourceError" type="error" :show-icon="false" style="margin-top: 12px;">
          {{ resourceError }}
        </NAlert>

        <NText v-if="resourceDomains.length === 0" depth="3" style="display: block; margin-top: 12px;">
          {{ t('noExternalDomains') }}
        </NText>

        <NFlex v-else vertical :size="12" style="margin-top: 12px;">
          <NCard v-for="domain in resourceDomains" :key="domain.hostname" embedded size="small">
            <NFlex justify="space-between" align="start">
              <div class="stack-small grow">
                <div class="row wrap gap-8">
                  <code>{{ domain.hostname }}</code>
                  <NTag
                    v-if="resourceInspectionMap[domain.hostname]?.inspection"
                    round
                    :class="formatChipClass(resourceInspectionMap[domain.hostname].inspection!.summary.action)"
                  >
                    {{ resourceInspectionMap[domain.hostname].inspection!.summary.label }}
                  </NTag>
                  <NTag v-if="resourceInspectionMap[domain.hostname]?.loading" type="warning" round>
                    {{ t('inspectingAll') }}
                  </NTag>
                </div>
                <div class="panel-meta">
                  {{ t('resourceHits', { count: domain.count, initiators: domain.initiators.join(', ') || t('unknown') }) }}
                </div>
                <NText v-if="resourceInspectionMap[domain.hostname]?.error" type="error">
                  {{ resourceInspectionMap[domain.hostname].error }}
                </NText>
              </div>
              <NFlex>
                <NButton
                  secondary
                  size="small"
                  :disabled="!config || !!resourceInspectionMap[domain.hostname]?.loading"
                  @click="handleInspectResource(domain.hostname)"
                >
                  {{ resourceInspectionMap[domain.hostname]?.inspection ? t('inspectAgain') : t('inspect') }}
                </NButton>
                <NButton
                  v-if="resourceInspectionMap[domain.hostname]?.inspection"
                  secondary
                  size="small"
                  @click="toggleResource(domain.hostname)"
                >
                  {{ resourceInspectionMap[domain.hostname]?.expanded ? t('collapse') : t('expand') }}
                </NButton>
              </NFlex>
            </NFlex>

            <InspectionPanels
              v-if="resourceInspectionMap[domain.hostname]?.inspection && resourceInspectionMap[domain.hostname]?.expanded"
              class="domain-panel"
              :heading="''"
              :inspection="resourceInspectionMap[domain.hostname].inspection!"
            />

            <NAlert
              v-if="resourceInspectionMap[domain.hostname]?.error && resourceInspectionMap[domain.hostname]?.expanded"
              type="error"
              :show-icon="false"
              style="margin-top: 10px;"
            >
              {{ resourceInspectionMap[domain.hostname].error }}
            </NAlert>
          </NCard>
        </NFlex>
      </NCard>

      <NAlert v-if="error && inspection" type="error" :show-icon="false">
        {{ error }}
      </NAlert>

    </main>
  </NConfigProvider>
</template>
