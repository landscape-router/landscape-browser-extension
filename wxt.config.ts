import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Landscape 追踪',
    description:
      'Trace how Landscape handles the current website and resource domains.',
    permissions: ['storage', 'tabs'],
    host_permissions: ['http://*/*', 'https://*/*'],
  },
});
