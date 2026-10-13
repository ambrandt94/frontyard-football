import { defineConfig } from '@playwright/test';

const look = { jersey: 0x1e63c9, pants: 0xf2f2f2, helmet: 0xf5f5f5, skin: 'light' };

export default defineConfig({
  testDir: 'e2e',
  timeout: 90000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  use: {
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:5173',
          localStorage: [
            { name: 'tdfb.sandbox.player', value: JSON.stringify({ name: 'Player', look }) },
            { name: 'tdfb.sandbox.netname', value: 'Player' },
            { name: 'tdfb.sandbox.look', value: JSON.stringify(look) },
          ],
        },
      ],
    },
    launchOptions: {
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      args: [
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/frontyard-football/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
