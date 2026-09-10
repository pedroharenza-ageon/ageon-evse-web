import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { firmwareFixture } from '../firmware-fixture.js';

const A = 'AABBCCDDEE01';
const base = 'http://127.0.0.1:4173/ageon-evse-web/';
const cacheName = 'ageon-evse-web:/ageon-evse-web/:shell:1.6.8';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function deployment(request, mode) {
    expect((await request.post(base + '__test__/deployment?mode=' + mode)).status()).toBe(204);
}
async function controlled(page) {
    await page.goto('./?mode=pwa');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.dashboard?.mqttClient?.isConnected()))).toBe(true);
}
async function ready(page) {
    await expect.poll(() => page.evaluate(() => Boolean(window.dashboard?.mqttClient?.isConnected()))).toBe(true);
    await page.evaluate(id => {
        window.__emit(id, 'connection', { status: 'online' }, true);
        window.__emit(id, 'heartbeat', { status: 'online', running_version: '1.0.0', boot_validation: 'passed' });
        window.__emit(id, 'state', { state: 0 });
    }, A);
}

test.beforeEach(async ({ request, context }) => {
    await deployment(request, 'current');
    // O servidor substitui CDNs por mocks locais, inclusive em páginas controladas pelo worker.
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(() => {
        window.WebSocket = class { constructor() { throw new Error('WebSocket externo proibido no teste de distribuição'); } };
    });
});

test('real worker installs the relocated asset graph and uses the project manifest scope', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await controlled(page); await page.reload(); await ready(page);
    await page.locator(`.device-card-summary[data-device-id="${A}"]`).click();
    await expect(page.locator('.ota-panel')).toBeVisible();
    await expect(page.locator('.ota-start')).toBeEnabled();
    const evidence = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const keys = await caches.keys();
        const cache = await caches.open(keys.find(key => key.endsWith(':shell:1.6.8')));
        const files = (await cache.keys()).map(request => new URL(request.url).pathname);
        return { scope: registration.scope, script: registration.active.scriptURL, files, manifest: await (await fetch('manifest.json')).json() };
    });
    expect(evidence.scope).toBe(base); expect(evidence.script).toBe(base + 'sw.js');
    expect(evidence.files).toContain('/ageon-evse-web/js/ota-controller.js');
    expect(evidence.files).toContain('/ageon-evse-web/css/ota.css');
    expect(evidence.files.every(file => file.startsWith('/ageon-evse-web/'))).toBe(true);
    expect(evidence.manifest.scope).toBe('./'); expect(evidence.manifest.id).toBe('./');
    expect(errors).toEqual([]);
});

test('firmware ignores all caches, preserves old releases and never falls back to HTML', async ({ page }) => {
    await controlled(page);
    const results = await page.evaluate(async ({ cacheName, base }) => {
        const cache = await caches.open(cacheName);
        const unrelated = await caches.open('another-app');
        for (const name of ['evse-1.1.0.bin', 'missing.bin']) {
            await cache.put(base + 'firmware/' + name, new Response('<html>stale app</html>'));
            await unrelated.put(base + 'firmware/' + name, new Response('stale firmware'));
        }
        const get = async name => {
            const response = await fetch('firmware/' + name);
            const bytes = await response.arrayBuffer();
            const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
            return { status: response.status, size: bytes.byteLength, hash: digest, type: response.headers.get('content-type') };
        };
        return { current: await get('evse-1.1.0.bin'), old: await get('evse-1.0.0.bin'), missing: await get('missing.bin'), redirect: await get('redirect.bin') };
    }, { cacheName, base });
    expect(results.current.status).toBe(200); expect(results.current.size).toBe(firmwareFixture().length); expect(results.current.hash).toBe(hash(firmwareFixture()));
    expect(results.old.hash).toBe(hash(firmwareFixture('1.0.0'))); expect(results.old.hash).not.toBe(results.current.hash);
    expect(results.missing.status).toBe(404);
    expect(results.redirect.status).toBe(503);
    const missingPage = await page.goto('firmware/missing.bin');
    expect(missingPage.status()).toBe(404); await expect(page.locator('.ota-panel')).toHaveCount(0);
});

test('offline navigation explains the unknown result and firmware returns 503 even when cached', async ({ page, context }) => {
    await controlled(page); await ready(page);
    const id = await page.evaluate(id => window.dashboard.ota.controller.start(id, '1.1.0',
        'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin'), A);
    await page.evaluate(async ({ cacheName, base }) => (await caches.open(cacheName)).put(base + 'firmware/evse-1.1.0.bin', new Response('stale')), { cacheName, base });
    await context.setOffline(true);
    const response = await page.evaluate(async () => {
        const response = await fetch('firmware/evse-1.1.0.bin'); return { status: response.status, text: await response.text() };
    });
    expect(response.status).toBe(503); expect(response.text).not.toBe('stale');
    await page.reload(); await expect(page.getByRole('heading', { name: 'Painel sem conexão' })).toBeVisible();
    await expect(page.getByText(/não confirma sucesso nem falha/)).toBeVisible();
    await context.setOffline(false); await page.getByRole('link', { name: 'Tentar novamente' }).click();
    await ready(page);
    expect(await page.evaluate(id => window.dashboard.ota.controller.snapshot(id).attempt.id, A)).toBe(id);
    expect(await page.evaluate(() => window.__mqtt.sent.filter(m => m.payload.command === 'ota_update').length)).toBe(0);
});

test('upgrade from the legacy worker preserves request IDs and other projects caches', async ({ page, request }) => {
    await deployment(request, 'legacy'); await controlled(page); await ready(page);
    const id = await page.evaluate(id => window.dashboard.ota.controller.start(id, '1.1.0',
        'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin'), A);
    await page.evaluate(async base => {
        const old = await caches.open('dashboard-v1.6.6');
        await old.put(base + 'firmware/evse-1.1.0.bin', new Response('legacy stale firmware'));
        await old.put(new URL('/another-project/index.html', base), new Response('other project in shared legacy cache'));
        await (await caches.open('unrelated-cache')).put(base + 'sentinel', new Response('preserve me'));
    }, base);
    await deployment(request, 'current');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => page.evaluate(async cacheName => (await caches.keys()).includes(cacheName), cacheName)).toBe(true);
    await expect.poll(() => page.evaluate(async base => (await (await caches.open('dashboard-v1.6.6')).keys()).some(r => r.url.startsWith(base)), base)).toBe(false);
    const sent = await page.evaluate(() => window.__mqtt.sent.filter(m => m.payload.command === 'ota_update').length); expect(sent).toBe(1);
    await page.reload(); await ready(page);
    await expect(page.getByText('Versão 1.6.8', { exact: true })).toBeVisible();
    expect(await page.evaluate(id => window.dashboard.ota.controller.snapshot(id).attempt.id, A)).toBe(id);
    expect(await page.evaluate(async () => (await (await caches.open('dashboard-v1.6.6')).keys()).length)).toBe(1);
    expect(await page.evaluate(async () => (await caches.keys()).includes('unrelated-cache'))).toBe(true);
    expect(await page.evaluate(() => window.__mqtt.sent.filter(m => m.payload.command === 'ota_update').length)).toBe(0);
});

test('failed asset installation keeps the previous worker active until the complete release is available', async ({ page, request }) => {
    await deployment(request, 'legacy'); await controlled(page);
    await page.evaluate(() => { window.previousWorker = navigator.serviceWorker.controller; });
    await deployment(request, 'broken');
    await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await new Promise((resolve, reject) => {
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'redundant') resolve();
                    if (worker.state === 'activated') reject(new Error('Incomplete release activated'));
                });
            }, { once: true });
            registration.update().catch(reject);
        });
    });
    expect(await page.evaluate(() => navigator.serviceWorker.controller === window.previousWorker)).toBe(true);
    expect(await page.evaluate(async () => (await caches.keys()).includes('dashboard-v1.6.6'))).toBe(true);
    await deployment(request, 'current');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== window.previousWorker)).toBe(true);
    await page.reload(); await expect(page.getByText('Versão 1.6.8', { exact: true })).toBeVisible();
});
