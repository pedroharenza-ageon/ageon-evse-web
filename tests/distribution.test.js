import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectFirmware, verifyPublished } from '../tools/verify-firmware.mjs';
import { firmwareFixture } from './firmware-fixture.js';

const image = firmwareFixture();
const url = 'https://pedroharenza-ageon.github.io/ageon-evse-web/firmware/evse-1.1.0.bin';
test('local distribution checks bind descriptor, version, flash size and appended hash', () => {
    const report = inspectFirmware(image, '1.1.0');
    assert.equal(report.size_bytes, image.length);
    assert.equal(report.sha256, createHash('sha256').update(image).digest('hex'));
    assert.equal(report.url, url);
    assert.throws(() => inspectFirmware(image, '1.0.0'), /descritor/);
    assert.throws(() => inspectFirmware(image, '01.1.0'), /Versão/);
});
test('HTML, LFS, bootloader, merged/truncated/oversized and corrupt images are rejected', () => {
    for (const bad of [Buffer.from('<html>404</html>'), Buffer.from('version https://git-lfs.github.com/spec/v1\n'),
        Buffer.alloc(500), image.subarray(0, 200), Buffer.alloc(6 * 1024 * 1024 + 1), Buffer.concat([Buffer.alloc(0x10000), image])]) {
        assert.throws(() => inspectFirmware(bad, '1.1.0'));
    }
    for (const offset of [3, 12, 23, 32, 80, 300, image.length - 1]) {
        const bad = Buffer.from(image); bad[offset] ^= 1;
        // Offset 3 baixa frequência SPI, não tamanho: alterar o nibble de capacidade.
        if (offset === 3) bad[3] = 0x20;
        assert.throws(() => inspectFirmware(bad, '1.1.0'));
    }
});
test('published verification requires HTTPS allowlist, HTTP 200 and exact bytes/hash', async () => {
    const calls = [];
    const fetchImpl = async (target, options) => { calls.push({ target, options }); return new Response(image, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(image.length) } }); };
    const report = await verifyPublished(image, '1.1.0', url, fetchImpl);
    assert.equal(report.verification, 'published'); assert(report.verified_at);
    assert.equal(calls[0].target, url); assert.equal(calls[0].options.redirect, 'error'); assert.equal(calls[0].options.cache, 'no-store');
    assert(calls[0].options.signal instanceof AbortSignal);
    await assert.rejects(verifyPublished(image, '1.1.0', url.replace('https:', 'http:'), fetchImpl), /canônica/);
    await assert.rejects(verifyPublished(image, '1.1.0', 'https://github.com/user/repo/blob/main/file.bin', fetchImpl), /canônica/);
    assert.equal(calls.length, 1);
});
for (const [name, response] of [
    ['404', () => new Response('not found', { status: 404 })],
    ['redirect', () => new Response('', { status: 302, headers: { location: url } })],
    ['HTML with HTTP 200', () => new Response('<html>not firmware</html>', { headers: { 'content-type': 'text/html' } })],
    ['LFS pointer', () => new Response('version https://git-lfs.github.com/spec/v1\n')],
    ['wrong size', () => new Response(image, { headers: { 'content-length': '1' } })],
    ['encoded body', () => new Response(image, { headers: { 'content-encoding': 'gzip' } })],
    ['changed bytes same length', () => new Response(firmwareFixture('1.1.0', 2))],
    ['old version', () => new Response(firmwareFixture('1.0.0'))],
    ['truncated body', () => new Response(image.subarray(0, -1))],
    ['oversized unknown length', () => new Response(Buffer.concat([image, Buffer.alloc(1)]))]
]) test(`published verification rejects ${name}`, async () => {
    await assert.rejects(verifyPublished(image, '1.1.0', url, async () => response()));
});
test('incomplete network streams fail instead of generating a verified report', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(image.subarray(0, 100)); controller.error(new Error('network lost')); } });
    await assert.rejects(verifyPublished(image, '1.1.0', url, async () => new Response(stream)), /network lost/);
});
test('published verification refuses an environment that disables TLS verification', async () => {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
        await assert.rejects(verifyPublished(image, '1.1.0', url, () => { throw new Error('must not fetch'); }), /TLS desativada/);
    } finally {
        if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
});
test('published verification accepts unknown content length with matching streamed bytes', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(image.subarray(0, 100)); controller.enqueue(image.subarray(100)); controller.close(); } });
    assert.equal((await verifyPublished(image, '1.1.0', url, async () => new Response(stream))).verification, 'published');
});
test('HTML and manifest assets resolve within the project Pages prefix after relocation', async () => {
    const base = new URL('https://example.com/ageon-evse-web/');
    const html = await readFile('index.html', 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    for (const ref of refs.filter(ref => !/^(https?:|data:|#)/.test(ref))) {
        const resolved = new URL(ref, base);
        assert(resolved.href.startsWith(base.href));
        await access(resolved.pathname.slice(base.pathname.length));
    }
    const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
    for (const key of ['id', 'scope', 'start_url']) assert(new URL(manifest[key], base).href.startsWith(base.href));
    for (const item of [...manifest.icons, ...manifest.screenshots]) await access(item.src);
    const sw = await readFile('sw.js', 'utf8');
    assert(sw.includes("const VERSION = '1.6.7'")); assert(html.includes('Versão 1.6.7'));
});
