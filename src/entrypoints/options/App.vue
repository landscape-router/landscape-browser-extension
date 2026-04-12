<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import browser from 'webextension-polyfill';
import {
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NFlex,
  NForm,
  NFormItem,
  NGlobalStyle,
  NInput,
  NSelect,
  NText,
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import type { CallerIdentityResponse } from '@landscape-router/types/api/schemas';
import { getErrorMessage, loginWithPassword, validateRouterConfig } from '../../lib/router-client';
import { clearRouterConfig, DEFAULT_ROUTER_BASE_URL, getRouterConfig, normalizeBaseUrl, saveRouterConfig } from '../../lib/router-storage';
import FieldGrid from '../../components/FieldGrid.vue';
import { getStoredLocale, saveStoredLocale, type AppLocale } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/app-meta';

const { t, locale } = useI18n();

const baseUrl = ref('');
const token = ref('');
const username = ref('');
const password = ref('');
const status = ref<string | null>(null);
const error = ref<string | null>(null);
const testingResult = ref<CallerIdentityResponse | null>(null);
const busy = ref<'save' | 'login' | 'test' | 'clear' | null>(null);
const languageOptions = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
];

const naiveLocale = computed(() => (locale.value === 'zh' ? zhCN : enUS));
const naiveDateLocale = computed(() => (locale.value === 'zh' ? dateZhCN : dateEnUS));

function failWithMessage(message: string) {
  status.value = null;
  error.value = message;
}

async function handleSave() {
  busy.value = 'save';
  status.value = null;
  error.value = null;

  try {
    await saveRouterConfig({ baseUrl: normalizeBaseUrl(baseUrl.value), token: token.value });
    status.value = t('savedOk');
  } catch (saveError) {
    error.value = getErrorMessage(saveError);
  } finally {
    busy.value = null;
  }
}

async function handleLogin() {
  if (!baseUrl.value.trim()) return failWithMessage(t('requiredBaseUrlLogin'));
  if (!username.value.trim()) return failWithMessage(t('requiredUsername'));
  if (!password.value) return failWithMessage(t('requiredPassword'));

  busy.value = 'login';
  status.value = null;
  error.value = null;

  try {
    const login = await loginWithPassword(normalizeBaseUrl(baseUrl.value), username.value.trim(), password.value);
    token.value = login.token;
    await saveRouterConfig({ baseUrl: normalizeBaseUrl(baseUrl.value), token: login.token });
    password.value = '';
    status.value = t('loginSavedOk');
  } catch (loginError) {
    error.value = getErrorMessage(loginError);
  } finally {
    busy.value = null;
  }
}

async function handleTest() {
  if (!baseUrl.value.trim()) return failWithMessage(t('requiredBaseUrlTest'));
  if (!token.value.trim()) return failWithMessage(t('requiredTokenTest'));

  busy.value = 'test';
  status.value = null;
  error.value = null;

  try {
    testingResult.value = await validateRouterConfig({
      baseUrl: normalizeBaseUrl(baseUrl.value),
      token: token.value,
    });
    status.value = t('testOk');
  } catch (testError) {
    testingResult.value = null;
    error.value = getErrorMessage(testError);
  } finally {
    busy.value = null;
  }
}

async function handleClear() {
  busy.value = 'clear';
  status.value = null;
  error.value = null;

  try {
    await clearRouterConfig();
    baseUrl.value = DEFAULT_ROUTER_BASE_URL;
    token.value = '';
    testingResult.value = null;
    status.value = t('clearOk');
  } catch (clearError) {
    error.value = getErrorMessage(clearError);
  } finally {
    busy.value = null;
  }
}

async function handleLocaleChange(value: string) {
  if (value !== 'zh' && value !== 'en') {
    return;
  }

  locale.value = value as AppLocale;
  await saveStoredLocale(value as AppLocale);
}

async function handleOpenRouter() {
  try {
    const targetUrl = normalizeBaseUrl(baseUrl.value || DEFAULT_ROUTER_BASE_URL);
    try {
      await browser.tabs.create({ url: targetUrl });
    } catch {
      globalThis.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  } catch (openError) {
    error.value = getErrorMessage(openError);
  }
}

onMounted(async () => {
  const storedLocale = await getStoredLocale();
  if (storedLocale) {
    locale.value = storedLocale;
  }

  const config = await getRouterConfig();
  if (!config) {
    baseUrl.value = DEFAULT_ROUTER_BASE_URL;
    return;
  }

  baseUrl.value = config.baseUrl;
  token.value = config.token;
});
</script>

<template>
  <NConfigProvider :theme="darkTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <NGlobalStyle />
    <main class="app-shell options-shell">
      <header class="page-title">
        <div>
          <h1>{{ t('appTitle') }}</h1>
          <div class="version-line mono">v{{ APP_VERSION }}</div>
          <p class="subtitle">{{ t('routerHint') }}</p>
        </div>
        <NSelect
          :value="locale"
          :consistent-menu-width="false"
          size="small"
          style="min-width: 100px;"
          :options="languageOptions"
          @update:value="handleLocaleChange"
        />
      </header>

      <NCard :title="t('routerAccess')">
        <NAlert type="info" :show-icon="false" style="margin-bottom: 16px;">
          <NFlex justify="space-between" align="center">
            <span>{{ t('trustCertHint') }}</span>
            <NButton secondary size="small" @click="handleOpenRouter">
              {{ t('openRouter') }}
            </NButton>
          </NFlex>
        </NAlert>
        <NForm label-placement="top">
          <NFormItem :label="t('routerBaseUrl')">
            <NInput v-model:value="baseUrl" :placeholder="DEFAULT_ROUTER_BASE_URL" />
          </NFormItem>
          <NFormItem :label="t('accessToken')">
            <NInput v-model:value="token" type="textarea" placeholder="Paste token or Bearer token" />
          </NFormItem>
          <NFlex>
            <NButton type="primary" :loading="busy === 'save'" :disabled="busy !== null" @click="handleSave">
              {{ busy === 'save' ? t('saving') : t('saveConfig') }}
            </NButton>
            <NButton :loading="busy === 'test'" :disabled="busy !== null" @click="handleTest">
              {{ busy === 'test' ? t('testing') : t('testConnection') }}
            </NButton>
            <NButton secondary type="error" :loading="busy === 'clear'" :disabled="busy !== null" @click="handleClear">
              {{ busy === 'clear' ? t('clearing') : t('clearSavedConfig') }}
            </NButton>
          </NFlex>
        </NForm>
      </NCard>

      <NCard :title="t('loginForToken')">
        <NText depth="3">{{ t('loginHint') }}</NText>
        <NForm label-placement="top" style="margin-top: 16px;">
          <NFormItem :label="t('username')">
            <NInput v-model:value="username" />
          </NFormItem>
          <NFormItem :label="t('password')">
            <NInput v-model:value="password" type="password" show-password-on="click" />
          </NFormItem>
          <NButton type="primary" :loading="busy === 'login'" :disabled="busy !== null" @click="handleLogin">
            {{ busy === 'login' ? t('loggingIn') : t('loginAndSaveToken') }}
          </NButton>
        </NForm>
      </NCard>

      <NAlert v-if="status" type="success" :show-icon="false">{{ status }}</NAlert>
      <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>

      <NCard v-if="testingResult" :title="t('connectionTest')">
        <FieldGrid
          :rows="[
            [t('fields.clientIp'), testingResult.ip],
            [t('fields.ipVersion'), testingResult.ip_version],
            [t('fields.mac'), testingResult.mac],
            [t('fields.hostname'), testingResult.hostname],
            [t('fields.interface'), testingResult.iface_name],
            [t('fields.source'), testingResult.source],
          ]"
        />
      </NCard>

    </main>
  </NConfigProvider>
</template>
