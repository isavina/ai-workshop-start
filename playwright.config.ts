// The browser tests: the web view in a real browser, every test recorded as a video, and the page
// compared with the baseline screenshots in tests/browser/screenshots/.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Baselines live next to the tests, one per platform: fonts render differently elsewhere.
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{platform}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Every test is recorded, passed or failed: test-results/<test>/video.webm.
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // PLAYWRIGHT_CHANNEL=chrome uses an installed Google Chrome instead of Playwright's Chromium.
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: {
    command: `node tests/browser/server.ts ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
