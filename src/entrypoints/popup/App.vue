<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
  error?: string;
  inspection?: SiteInspection;
  loading?: boolean;
}

const { t, locale } = useI18n();

const config = ref<RouterConfig | null>(null);
const site = ref<CurrentSite | null>(null);
const inspection = ref<SiteInspection | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const resourceError = ref<string | null>(null);
const resourceDomains = ref<ResourceDomainSummary[]>([]);
const resourceInspectionMap = ref<Record<string, ResourceInspectionState>>({});
const selectedResourceHostname = ref<string | null>(null);
const bulkInspecting = ref(false);
const languageOptions = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
];

const naiveLocale = computed(() => (locale.value === 'zh' ? zhCN : enUS));
const naiveDateLocale = computed(() => (locale.value === 'zh' ? dateZhCN : dateEnUS));

const selectedResourceInspection = computed(() => {
  return selectedResourceHostname.value
    ? resourceInspectionMap.value[selectedResourceHostname.value]?.inspection ?? null
    : null;
});

async function load() {
  loading.value = true;
  error.value = null;
  resourceError.value = null;
  inspection.value = null;
  resourceDomains.value = [];
  resourceInspectionMap.value = {};
  selectedResourceHostname.value = null;

  try {
    const [savedConfig, currentSite] = await Promise.all([getRouterConfig(), getCurrentSite()]);
    config.value = savedConfig;
    site.value = currentSite;

    const [resourceDomainsResult, inspectionResult] = await Promise.allSettled([
      getResourceDomainsForTab(currentSite.tabId),
      savedConfig ? inspectCurrentSite(currentSite, savedConfig) : Promise.resolve(null),
    ]);

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

  selectedResourceHostname.value = hostname;
  resourceInspectionMap.value = {
    ...resourceInspectionMap.value,
    [hostname]: {
      ...resourceInspectionMap.value[hostname],
      error: undefined,
      loading: true,
    },
  };

  try {
    const result = await inspectHostname(hostname, config.value);
    resourceInspectionMap.value = {
      ...resourceInspectionMap.value,
      [hostname]: { inspection: result, loading: false },
    };
  } catch (inspectError) {
    resourceInspectionMap.value = {
      ...resourceInspectionMap.value,
      [hostname]: { error: getErrorMessage(inspectError), loading: false },
    };
  }
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
        error: result.error,
        inspection: result.inspection,
        loading: false,
      };
    }
    resourceInspectionMap.value = next;

    const firstInspectable = results.find((result) => result.inspection)?.hostname;
    if (firstInspectable && !selectedResourceHostname.value) {
      selectedResourceHostname.value = firstInspectable;
    }
  } catch (inspectError) {
    error.value = getErrorMessage(inspectError);
  } finally {
    bulkInspecting.value = false;
  }
}

onMounted(() => {
  void getStoredLocale().then((storedLocale) => {
    if (storedLocale) {
      locale.value = storedLocale;
    }
  });
  void load();
});
</script>

<template>
  <NConfigProvider :theme="darkTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <NGlobalStyle />
    <main class="app-shell popup-shell">
      <header class="page-title">
        <div>
          <h1>{{ t('appTitle') }}</h1>
        </div>
        <NFlex :size="8">
          <NSelect
            :value="locale"
            :consistent-menu-width="false"
            size="small"
            style="min-width: 88px;"
            :options="languageOptions"
            @update:value="handleLocaleChange"
          />
          <NButton secondary size="small" @click="load">{{ t('refresh') }}</NButton>
          <NButton secondary size="small" @click="browser.runtime.openOptionsPage()">{{ t('settings') }}</NButton>
        </NFlex>
      </header>

      <NCard v-if="site" size="small" :title="t('site')">
        <template #header-extra>
          <span v-if="config" class="panel-meta">{{ config.baseUrl }}</span>
        </template>
        <div class="domain-focus-row">
          <div class="domain-focus-label">{{ t('fields.hostname') }}</div>
          <code class="domain-focus-value">{{ site.hostname }}</code>
        </div>
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

      <InspectionPanels
        v-if="inspection && !loading"
        :heading="''"
        :inspection="inspection"
      />

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
                  @click="selectedResourceHostname = domain.hostname"
                >
                  {{ t('view') }}
                </NButton>
              </NFlex>
            </NFlex>
          </NCard>
        </NFlex>
      </NCard>

      <NAlert v-if="error && inspection" type="error" :show-icon="false">
        {{ error }}
      </NAlert>

      <InspectionPanels
        v-if="selectedResourceInspection && !loading"
        :heading="t('selectedResourceDomain')"
        :inspection="selectedResourceInspection"
      />
    </main>
  </NConfigProvider>
</template>
