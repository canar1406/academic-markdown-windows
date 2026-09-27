import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserName = process.env.PLAYWRIGHT_BROWSER_NAME === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.e2e.ts',
  outputDir: '../../output/playwright/editor-regression',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4189',
    browserName,
    headless: true,
    launchOptions: browserName === 'chromium' && executablePath ? { executablePath } : undefined,
    permissions: browserName === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [],
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4189 --strictPort',
    url: 'http://127.0.0.1:4189',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
