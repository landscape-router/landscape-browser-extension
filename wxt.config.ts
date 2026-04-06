import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser }) => ({
    name: 'Landscape 追踪',
    description:
      'Trace how Landscape handles the current website and resource domains.',
    permissions: ['storage', 'tabs', 'webRequest'],
    host_permissions: ['http://*/*', 'https://*/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'landscape-trace@landscape.local',
              strict_min_version: '109.0',
            },
          },
        }
      : {}),
  }),
});
