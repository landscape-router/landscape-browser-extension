# Landscape 追踪

Cross-browser WebExtension built with `WXT + Vite + Vue + Naive UI + vue-i18n`.

The popup inspects the current tab and explains how Landscape Router handles it:

- identifies the active site
- asks Landscape Router who the current client is
- resolves the domain through Router DNS with `checkDomain`
- computes the effective flow with `traceFlowMatch`
- computes the final IP verdicts with `traceVerdict`

## Stack

- `wxt`
- `vue`
- `naive-ui`
- `vue-i18n`
- `webextension-polyfill`
- `axios`
- `@landscape-router/types@0.17.5`
- `pnpm`

## Setup

1. Install dependencies:

```bash
pnpm install
```

If `pnpm` is not installed globally yet, you can use `npx pnpm install` once.

2. Run Chrome dev mode:

```bash
pnpm run dev
```

3. Run Firefox dev mode:

```bash
pnpm run dev:firefox
```

## Build

```bash
pnpm run build
pnpm run build:firefox
pnpm run zip
pnpm run zip:firefox
```

Firefox packaging now produces `.output/*-firefox.xpi` for installation and release upload.

## Docker Chromium Preview

You can preview the Chrome build inside a Dockerized Chromium session:

```bash
./scripts/start.sh
```

Then open:

- `https://127.0.0.1:3001/`

The container UI requires a secure context. If the browser shows a certificate warning,
accept the self-signed certificate once and continue to `https://127.0.0.1:3001/`.

The script mounts `.output/chrome-mv3` into the container and starts Chromium with:

- `--disable-extensions-except=/workspace/extension`
- `--load-extension=/workspace/extension`

To stop the container:

```bash
./scripts/stop.sh
```

After code changes, rebuild and sync the unpacked extension into the running Docker browser:

```bash
./scripts/reload.sh
```

This script rebuilds the extension, syncs the unpacked files, and restarts the Docker Chromium preview so you do not need to reload the extension manually.

## Notes

- Router access currently assumes token auth via the `Authorization` header.
- The options page supports either pasting a token directly or logging in with username/password.
- The popup only inspects the address bar hostname in the first version. It does not trace every third-party resource on the page.
- Browsers still need to trust the Router TLS certificate if you use HTTPS with a self-signed cert.
- Firefox stable usually requires a signed `.xpi` for permanent installation. Use Firefox Developer Edition/Nightly for temporary unsigned installs, or distribute the signed release asset.

## License

MIT
