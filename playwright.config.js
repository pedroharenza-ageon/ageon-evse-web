import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
    timeout: 20000,
    use: {
        baseURL: 'http://127.0.0.1:4173/ageon-evse-web/',
        channel: process.env.OTA_TEST_BROWSER || 'msedge',
        serviceWorkers: 'block',
        headless: true,
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'desktop', testMatch: 'ota.spec.js', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'mobile', testMatch: 'ota.spec.js', use: { viewport: { width: 360, height: 800 } } },
        { name: 'distribution', testMatch: 'distribution.spec.js', use: { serviceWorkers: 'allow', viewport: { width: 1280, height: 900 } } }
    ],
    webServer: { command: 'node tests/browser/server.js --distribution-tests', url: 'http://127.0.0.1:4173/ageon-evse-web/', reuseExistingServer: false }
});
