import { test, expect } from '@playwright/test';

const A = 'AABBCCDDEE01', B = 'AABBCCDDEE02';
const firmwareUrl = 'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin';
import { fakePaho, fakeChart } from './mocks.js';

test.beforeEach(async ({ context }) => {
    // Nenhum acesso ao broker, CDN, Pages ou hardware: dependências externas são simuladas.
    await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('http://127.0.0.1:4173/')) return route.continue();
        const body = url.includes('mqttws31') ? fakePaho : url.includes('chart.js') ? fakeChart : '';
        return route.fulfill({ status: 200, contentType: url.endsWith('.css') ? 'text/css' : 'text/javascript', body });
    });
});

async function open(page) {
    await page.goto('./');
    await page.getByRole('button', { name: 'Agora não' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(window.dashboard?.mqttClient?.isConnected()))).toBe(true);
}
async function ready(page, id = A, state = 0) {
    await page.evaluate(({ id, state }) => {
        window.__emit(id, 'connection', { status: 'online' }, true);
        window.__emit(id, 'heartbeat', { status: 'online', running_version: '1.0.0', boot_validation: 'passed' });
        window.__emit(id, 'state', { state });
        window.__emit(id, 'current_state', { state: 1 });
    }, { id, state });
}
async function details(page, id = A) {
    await page.locator(`.device-card-summary[data-device-id="${id}"]`).click();
    const panel = page.locator(`#page-detail-${id} .ota-panel`);
    await expect(panel).toBeVisible(); return panel;
}
async function fill(panel) {
    await panel.getByLabel('Nova versão', { exact: true }).fill('1.1.0');
    await panel.getByLabel('URL HTTPS do firmware').fill(firmwareUrl);
}
const commands = page => page.evaluate(() => window.__mqtt.sent.filter(m => m.payload.command === 'ota_update'));
async function emitStatus(page, requestId, changes = {}, id = A, retained = false) {
    await page.evaluate(({ id, requestId, changes, retained }) => window.__emit(id, 'ota', {
        request_id: requestId, scope: 'operation', status: 'downloading', requested_version: '1.1.0', running_version: '1.0.0',
        bytes_received: 100, bytes_total: 100, progress_percent: 100, error_code: null, rollback: false, ...changes
    }, retained), { id, requestId, changes, retained });
}

test('details send once; full progress still awaits validation; errors cannot replace the operation', async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await open(page); await ready(page); const panel = await details(page);
    await expect(panel.locator('.ota-version')).toHaveText('1.0.0');
    await fill(panel);
    await panel.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await expect.poll(async () => (await commands(page)).length).toBe(1);
    const [command] = await commands(page);
    expect(command.topic).toBe(`evse/${A}/command/ota_update`); expect(command.qos).toBe(1); expect(command.retained).toBe(false);
    await emitStatus(page, command.payload.request_id);
    await expect(panel.locator('progress')).toHaveAttribute('value', '100');
    await expect(panel.locator('.ota-status')).toHaveText('Baixando firmware');
    await emitStatus(page, command.payload.request_id, { scope: 'command', status: 'failed', error_code: 'busy' });
    await expect(panel.locator('.ota-status')).toHaveText('Baixando firmware');
    await emitStatus(page, command.payload.request_id, { status: 'rebooting' });
    await expect(panel.locator('.ota-status')).toContainText('aguardando validação');
    await expect(panel.locator('.ota-start')).toBeDisabled();
    await emitStatus(page, command.payload.request_id, { status: 'success', running_version: '1.1.0' });
    await page.evaluate(id => window.__emit(id, 'heartbeat', { status: 'online', running_version: '1.1.0', boot_validation: 'passed' }), A);
    await expect(panel.locator('.ota-version')).toHaveText('1.1.0');
    await expect(panel.locator('.ota-status')).toContainText('concluída e validada');
    await emitStatus(page, command.payload.request_id, {}, A, true);
    await expect(panel.locator('.ota-status')).toContainText('concluída e validada');
    await panel.screenshot({ path: info.outputPath('ota-panel.png') });
    expect(errors).toEqual([]);
});

test('offline/state gates and URL/version validation prevent publications', async ({ page }) => {
    await open(page); await ready(page, A, 1); const panel = await details(page);
    await expect(panel.locator('.ota-start')).toBeDisabled();
    await ready(page); await fill(panel);
    await panel.getByLabel('Nova versão', { exact: true }).fill('1.0.0'); await panel.locator('.ota-start').click();
    await expect(panel.locator('.ota-feedback')).toContainText('superior');
    await fill(panel); await panel.getByLabel('URL HTTPS do firmware').fill('https://example.com/firmware.bin');
    await panel.locator('.ota-start').click(); await expect(panel.locator('.ota-feedback')).toContainText('URL HTTPS permitida');
    await page.evaluate(id => window.__emit(id, 'connection', { status: 'offline' }), A);
    await expect(panel.locator('.ota-start')).toBeDisabled(); expect(await commands(page)).toHaveLength(0);
});

test('reload retains request and ignores old retained results and other devices', async ({ page }) => {
    await open(page); await ready(page); let panel = await details(page); await fill(panel); await panel.locator('.ota-start').click();
    await expect.poll(async () => (await commands(page)).length).toBe(1);
    const [command] = await commands(page);
    await page.reload(); await expect.poll(() => page.evaluate(() => window.dashboard.mqttClient.isConnected())).toBe(true);
    await ready(page); panel = await details(page);
    await expect(panel.locator('.ota-request')).toContainText(command.payload.request_id);
    await expect(panel.locator('.ota-start')).toBeDisabled(); expect(await commands(page)).toHaveLength(0);
    await emitStatus(page, '11111111-1111-4111-8111-111111111111', { status: 'success', running_version: '1.1.0' }, A, true);
    await emitStatus(page, command.payload.request_id, { status: 'success', running_version: '1.1.0' }, B, true);
    await expect(panel.locator('.ota-status')).toContainText('aguardando aceitação');
    await emitStatus(page, command.payload.request_id, { status: 'failed', error_code: 'boot_rollback', rollback: true }, A, true);
    await expect(panel.locator('.ota-status')).toContainText('Rollback confirmado: versão 1.0.0');
});

test('two real tabs coordinate native Web Locks and storage without duplicate commands', async ({ page, context }) => {
    const second = await context.newPage(); await open(page); await open(second);
    await ready(page); await ready(second);
    const firstPanel = await details(page), secondPanel = await details(second);
    await fill(firstPanel); await fill(secondPanel);
    await Promise.all([firstPanel.locator('form').evaluate(f => f.requestSubmit()), secondPanel.locator('form').evaluate(f => f.requestSubmit())]);
    await expect.poll(async () => (await commands(page)).length + (await commands(second)).length).toBe(1);
    await expect(firstPanel.locator('.ota-start')).toBeDisabled(); await expect(secondPanel.locator('.ota-start')).toBeDisabled();
    expect(await firstPanel.locator('.ota-request').textContent()).toBe(await secondPanel.locator('.ota-request').textContent());
});

test('reconnection keeps detail page, client and UUID; silence is unknown', async ({ page }) => {
    await open(page); await ready(page); const panel = await details(page); await fill(panel); await panel.locator('.ota-start').click();
    await expect.poll(async () => (await commands(page)).length).toBe(1);
    const [command] = await commands(page);
    await page.evaluate(() => { const client = window.__mqtt.clients[0]; client.connected = false; client.onConnectionLost({ errorCode: 1 }); });
    await expect(panel).toBeVisible(); await expect(panel.locator('.ota-status')).toContainText('Resultado desconhecido');
    await page.evaluate(() => window.dashboard.reconnectMqtt()); await ready(page);
    await expect(panel).toBeVisible(); await expect(panel.locator('.ota-request')).toContainText(command.payload.request_id);
    expect(await page.evaluate(() => window.__mqtt.clients.length)).toBe(1); expect(await commands(page)).toHaveLength(1);
    await page.evaluate(() => { window.dashboard.ota.controller.now = () => Date.now() + 31000; });
    await expect(panel.locator('.ota-status')).toContainText('Resultado desconhecido');
    await expect(panel.locator('.ota-start')).toBeDisabled();
});

test('two devices stay isolated and OTA panel fits 320px with keyboard submission', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 }); await open(page); await ready(page); await ready(page, B);
    const panel = await details(page, B); await fill(panel);
    await panel.getByLabel('URL HTTPS do firmware').press('Enter');
    await expect.poll(async () => (await commands(page)).length).toBe(1);
    expect((await commands(page))[0].topic).toBe(`evse/${B}/command/ota_update`);
    const box = await panel.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
