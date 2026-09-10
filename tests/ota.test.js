import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OtaController } from '../js/ota-controller.js';
import { OTA, buildCommand, higherVersion, validVersion, validUrl, parseStatus, advanceStatus } from '../js/ota-protocol.js';
import { handleMqttMessage } from '../js/mqtt-message-handler.js';
import { publishMessage, setupMQTT, setupVisibilityAPI } from '../js/mqtt-manager.js';

const A = 'AABBCCDDEE01', B = 'AABBCCDDEE02';
const URL = version => `https://${OTA.host}${OTA.path}evse-${version}.bin`;
const status = (id, changes = {}) => ({ request_id: id, scope: 'operation', status: 'downloading',
    requested_version: '1.1.0', running_version: '1.0.0', bytes_received: 50, bytes_total: 100,
    progress_percent: 50, error_code: null, rollback: false, ...changes });
class Storage {
    data = new Map();
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(key, value); }
}
class Locks {
    pending = new Map();
    request(key, action) {
        const result = (this.pending.get(key) || Promise.resolve()).then(action);
        this.pending.set(key, result.catch(() => {}));
        return result;
    }
}
function setup(options = {}) {
    let time = 1000;
    const sent = [];
    const c = new OtaController({ storage: new Storage(), locks: new Locks(), uuid: randomUUID,
        publish: command => sent.push(command), now: () => time, ...options });
    function ready(id = A) {
        c.telemetry(id, 'heartbeat', { status: 'online', running_version: '1.0.0', boot_validation: 'passed' });
        c.telemetry(id, 'state', { state: 0 });
    }
    c.setConnected(true); c.setStatusReady(true); ready();
    return { c, sent, ready, advance: ms => { time += ms; } };
}
const sendStatus = (c, id, changes = {}, device = A, retained = false) => c.receive(device, JSON.stringify(status(id, changes)), retained);

test('stable versions compare decimal components without precision loss', () => {
    assert(higherVersion('1.10.0', '1.9.0'));
    assert(higherVersion('9007199254740993.0.0', '9007199254740992.0.0'));
    for (const v of ['1.0.0', '0.9.9', 'v1.2.0', '01.1.0', '1.2.0-rc1']) assert(!higherVersion(v, '1.0.0'));
    for (const v of ['1.0.0\n', '1.0.0 ', '1.0', '1.2.3.4', '1.2.+3', '9'.repeat(28) + '.0.0']) assert(!validVersion(v));
});
test('URL policy matches literal firmware policy including explicit port 443', () => {
    assert(validUrl(URL('1.1.0'), '1.1.0'));
    assert(validUrl(URL('1.1.0').replace('.io/', '.io:443/'), '1.1.0'));
    for (const u of [URL('1.0.0'), URL('1.1.0') + '?x=1', URL('1.1.0') + '#x', URL('1.1.0') + '\n',
        URL('1.1.0').replace('https:', 'http:'), URL('1.1.0').replace('firmware/', 'x/../firmware/'),
        URL('1.1.0').replace('firmware/', '%66irmware/'), URL('1.1.0').replace('https://', 'https://user@'),
        URL('1.1.0').replace('.io/', '.io:444/'), URL('1.1.0').replace('.io/', '.io.evil/'),
        URL('1.1.0').replace('ageon-evse-web/', 'other/'), 'https://github.com/a/b/blob/main/evse-1.1.0.bin']) assert(!validUrl(u, '1.1.0'), u);
});
test('one selected device gets exactly the four fields at QoS 1, never retained', async () => {
    const { c, sent, ready } = setup(); ready(B);
    const id = await c.start(B, '1.1.0', URL('1.1.0'));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { topic: `evse/${B}/command/ota_update`, payload: {
        command: 'ota_update', version: '1.1.0', url: URL('1.1.0'), request_id: id }, qos: 1, retained: false });
    assert.equal(c.snapshot(A).attempt, null);
});
test('double submit produces one publication', async () => {
    const { c, sent } = setup();
    const results = await Promise.allSettled([c.start(A, '1.1.0', URL('1.1.0')), c.start(A, '1.1.0', URL('1.1.0'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(sent.length, 1);
});
test('two tabs share an atomic reservation, including simultaneous clicks', async () => {
    const storage = new Storage(), locks = new Locks();
    const a = setup({ storage, locks }), b = setup({ storage, locks });
    const results = await Promise.allSettled([a.c.start(A, '1.1.0', URL('1.1.0')), b.c.start(A, '1.1.0', URL('1.1.0'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(a.sent.length + b.sent.length, 1);
    assert.equal(a.c.snapshot(A).attempt.id, b.c.snapshot(A).attempt.id);
});
for (const [name, mutate] of [
    ['MQTT offline', c => c.setConnected(false)], ['SUBACK missing', c => c.setStatusReady(false)],
    ['EVSE offline', c => c.telemetry(A, 'connection', { status: 'offline' })],
    ['State B', c => c.telemetry(A, 'state', { state: 1 })], ['State C', c => c.telemetry(A, 'state', { state: 2 })],
    ['invalid state', c => c.telemetry(A, 'state', { state: '0' })],
    ['missing version', c => c.telemetry(A, 'heartbeat', { status: 'online', boot_validation: 'passed' })],
    ['failed self-test', c => c.telemetry(A, 'heartbeat', { status: 'online', running_version: '1.0.0', boot_validation: 'recovery_required' })]
]) test(`no publication with ${name}`, async () => {
    const { c, sent } = setup(); mutate(c);
    await assert.rejects(c.start(A, '1.1.0', URL('1.1.0'))); assert.equal(sent.length, 0);
});
test('stale heartbeat and retained online/state cannot enable OTA', async () => {
    const { c, sent, advance } = setup(); advance(OTA.freshnessMs);
    await assert.rejects(c.start(A, '1.1.0', URL('1.1.0')));
    c.setConnected(true); c.setStatusReady(true);
    c.telemetry(A, 'heartbeat', { status: 'online', running_version: '1.0.0', boot_validation: 'passed' }, true);
    c.telemetry(A, 'state', { state: 0 }, true);
    await assert.rejects(c.start(A, '1.1.0', URL('1.1.0'))); assert.equal(sent.length, 0);
});
test('reload and reconnect preserve UUID without republishing', async () => {
    const storage = new Storage(); const first = setup({ storage });
    const id = await first.c.start(A, '1.1.0', URL('1.1.0'));
    const reloaded = setup({ storage });
    assert.equal(reloaded.c.snapshot(A).attempt.id, id);
    await assert.rejects(reloaded.c.start(A, '1.1.0', URL('1.1.0')));
    reloaded.c.setConnected(false); reloaded.c.setConnected(true); reloaded.c.setStatusReady(true);
    await sendStatus(reloaded.c, id, { status: 'success', running_version: '1.1.0', bytes_received: 100, progress_percent: 100 }, A, true);
    assert.equal(reloaded.c.snapshot(A).attempt.status.status, 'success'); assert.equal(reloaded.sent.length, 0);
});
test('silence or disconnect stays unknown and does not create a terminal result', async () => {
    const { c, advance } = setup(); await c.start(A, '1.1.0', URL('1.1.0'));
    advance(OTA.responseMs); assert(c.snapshot(A).waiting); assert.equal(c.snapshot(A).attempt.status, null);
    c.setConnected(false); assert(c.snapshot(A).waiting);
});
test('100% and rebooting remain active; only success confirms installation', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id, { bytes_received: 100, progress_percent: 100 });
    assert.equal(c.snapshot(A).busy.length, 1);
    await sendStatus(c, id, { status: 'rebooting', bytes_received: 100, progress_percent: 100 });
    assert.equal(c.snapshot(A).busy.length, 1);
    assert.equal(await sendStatus(c, id, { status: 'success' }), false);
    await sendStatus(c, id, { status: 'success', running_version: '1.1.0' }); assert.equal(c.snapshot(A).busy.length, 0);
});
test('foreign IDs, devices and old retained statuses cannot complete a new request', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, randomUUID(), { status: 'success', running_version: '1.1.0' }, A, true);
    await sendStatus(c, id, { status: 'success', running_version: '1.1.0' }, B, true);
    assert.equal(c.snapshot(A).attempt.status, null);
    assert.equal(c.snapshot(A).attempt.id, id);
});
test('command rejection is separate from accepted operations, including same ID duplicates', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id);
    for (const requestId of [id, randomUUID()]) await sendStatus(c, requestId, { scope: 'command', status: 'failed', error_code: 'busy' });
    assert.equal(c.snapshot(A).attempt.status.status, 'downloading'); assert.equal(c.snapshot(A).busy.length, 1);
});
test('initial correlated rejection releases reservation; late acceptance still becomes active', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id, { scope: 'command', status: 'failed', error_code: 'invalid_state' });
    assert.equal(c.snapshot(A).busy.length, 0);
    await sendStatus(c, id); assert.equal(c.snapshot(A).busy.length, 1);
});
test('terminal results and progress cannot regress across duplicates and reloads', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id);
    await sendStatus(c, id, { bytes_received: 10, progress_percent: 10 });
    assert.equal(c.snapshot(A).attempt.status.bytes_received, 50);
    await sendStatus(c, id, { status: 'verifying' });
    await sendStatus(c, id); assert.equal(c.snapshot(A).attempt.status.status, 'verifying');
    await sendStatus(c, id, { status: 'success', running_version: '1.1.0' });
    await sendStatus(c, id, { status: 'failed', error_code: 'timeout' });
    await sendStatus(c, id, {}, A, true); assert.equal(c.snapshot(A).attempt.status.status, 'success');
});
test('rollback can refine a reported self-test failure without becoming success', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id, { status: 'failed', error_code: 'self_test_failed', running_version: '1.1.0' });
    await sendStatus(c, id, { status: 'failed', error_code: 'boot_rollback', rollback: true });
    assert(c.snapshot(A).attempt.status.rollback); assert.equal(c.snapshot(A).attempt.status.running_version, '1.0.0');
});
test('empty retained cleanup clears only retained display, not local active work', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id, {}, A, true); assert(c.snapshot(A).retained);
    await c.receive(A, '', false); assert.equal(c.snapshot(A).retained, null); assert.equal(c.snapshot(A).busy.length, 1);
});
test('cleanup hides a terminal result learned only through retention without losing its history', async () => {
    const { c } = setup(); const id = randomUUID();
    await sendStatus(c, id, { status: 'success', running_version: '1.1.0' }, A, true);
    assert.equal(c.snapshot(A).attempt.id, id);
    await c.receive(A, '', false); assert.equal(c.snapshot(A).attempt, null);
    await sendStatus(c, id); assert.equal(c.snapshot(A).busy.length, 0);
});
test('invalid payloads, identity mismatch and malformed topics do not change tracked status', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    for (const payload of ['{', 'null', '[]', '"text"', ' '.repeat(1025), JSON.stringify(status(id, { requested_version: '2.0.0' })),
        JSON.stringify(status(id, { bytes_received: -1 })), JSON.stringify(status(id, { bytes_total: 1 })),
        JSON.stringify(status(id, { progress_percent: '100' })), JSON.stringify(status(id, { error_code: '<img>' }))]) {
        assert.equal(await c.receive(A, payload), false);
    }
    for (const topic of [`other/${A}/status/ota`, `evse/${A}/status/ota/extra`, 'evse/__proto__/status/ota', `evse/${A}\n/status/ota`]) {
        assert.equal(await handleMqttMessage({ destinationName: topic, payloadString: JSON.stringify(status(id)) }, { ota: { controller: c } }), false);
    }
    assert.equal(c.snapshot(A).attempt.status, null);
});
test('unknown total and command rejection with null requested version follow the contract', async () => {
    assert(parseStatus(JSON.stringify(status(randomUUID(), { bytes_total: null, progress_percent: null }))));
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    await sendStatus(c, id, { scope: 'command', status: 'failed', requested_version: null, error_code: 'invalid_command' });
    assert.equal(c.snapshot(A).busy.length, 0);
    await sendStatus(c, id); assert.equal(c.snapshot(A).busy.length, 1);
});
test('persist before publish; storage failure and unavailable Web Locks prevent sends', async () => {
    const storage = new Storage();
    const first = setup({ storage, publish: () => { assert([...storage.data.values()].some(v => JSON.parse(v).attempts.length === 1)); } });
    await first.c.start(A, '1.1.0', URL('1.1.0'));
    for (const options of [{ storage: null }, { storage: { getItem: () => null, setItem: () => { throw new Error(); } } }, { locks: null }]) {
        const { c, sent } = setup(options);
        await assert.rejects(c.start(A, '1.1.0', URL('1.1.0'))); assert.equal(sent.length, 0);
    }
});
test('corrupt persisted state blocks submissions instead of silently discarding correlation', async () => {
    const { c, sent } = setup(); c.storage.setItem('ageon-evse-ota:v1:' + A, '{');
    await assert.rejects(c.start(A, '1.1.0', URL('1.1.0'))); assert.equal(sent.length, 0);
});
test('transport exception conserves a pending record instead of retrying', async () => {
    const { c } = setup({ publish: () => { throw new Error('socket'); } });
    const id = await c.start(A, '1.1.0', URL('1.1.0'));
    assert.equal(c.snapshot(A).attempt.id, id); assert.equal(c.snapshot(A).busy.length, 1);
    await assert.rejects(c.start(A, '1.1.0', URL('1.1.0')));
});
test('MQTT message handler routes OTA and empty status directly, preserving retain metadata', async () => {
    const { c } = setup(); const id = await c.start(A, '1.1.0', URL('1.1.0'));
    const dashboard = { ota: { controller: c } };
    assert(await handleMqttMessage({ destinationName: `evse/${A}/status/ota`, payloadString: JSON.stringify(status(id)), retained: true }, dashboard));
    assert.equal(c.snapshot(A).retained.id, id);
    await handleMqttMessage({ destinationName: `evse/${A}/status/ota`, payloadString: '', retained: true }, dashboard);
    assert.equal(c.snapshot(A).retained, null);
});
test('Paho publication uses QoS 1, no retain, and never reports disconnected publication', () => {
    globalThis.Paho = { MQTT: { Message: class { constructor(text) { this.payloadString = text; } } } };
    const sent = []; const client = { isConnected: () => true, send: m => sent.push(m) };
    const command = buildCommand(A, '1.1.0', URL('1.1.0'), randomUUID(), '1.0.0');
    assert(publishMessage(client, command.topic, command.payload, false, 1));
    assert.equal(sent[0].qos, 1); assert.equal(sent[0].retained, false);
    assert.equal(publishMessage(null, command.topic, command.payload, false, 1), false);
});
test('connection retry reuses client and page, resubscribes at QoS 1 without replaying OTA', () => {
    const { c } = setup(); const subscriptions = [], sent = [], connections = [];
    let clients = 0, connected = false;
    globalThis.window = { EVSE_showLoading: () => {} };
    globalThis.document = { getElementById: () => null, addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
    globalThis.Paho.MQTT.Client = class {
        constructor() { clients++; }
        isConnected() { return connected; }
        connect(options) { connections.push(options); }
        subscribe(topic, options) { subscriptions.push({ topic, options }); options.onSuccess?.(); }
        send(message) { sent.push(message); }
        disconnect() { connected = false; }
    };
    const dashboard = { devices: { [A]: {} }, ota: { controller: c }, updateConnectionStatus: value => c.setConnected(value) };
    const config = { broker: 'mock', port: 8884, clientId: 'test', topics: {
        connectionDiscovery: 'evse/+/status/connection', statusTemplate: 'evse/{deviceId}/status/#', commandTemplate: 'evse/{deviceId}/command/{commandName}' } };
    const client = setupMQTT(config, dashboard); setupVisibilityAPI(dashboard);
    for (let i = 0; i < 3; i++) {
        connected = true; connections.at(-1).onSuccess(); assert(c.statusReady);
        connected = false; client.onConnectionLost({ errorCode: 1 });
        assert(!c.connected); assert.equal(setupMQTT(config, dashboard), client);
    }
    dashboard.stopMqtt();
    assert.equal(clients, 1); assert.equal(connections.length, 4);
    assert(connections.every(options => options.mqttVersion === 4 && options.cleanSession));
    assert(subscriptions.every(s => s.options.qos === 1));
    assert(sent.every(m => m.destinationName.endsWith('/get_initial_data')));
});
