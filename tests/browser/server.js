import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fakePaho, fakeChart } from './mocks.js';
import { firmwareFixture } from '../firmware-fixture.js';

const root = process.cwd(), prefix = '/ageon-evse-web/';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
const distributionTests = process.argv.includes('--distribution-tests');
let deployment = 'current';
const base = 'http://127.0.0.1:4173' + prefix;
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith(prefix)) throw new Error();
        let relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
        if (distributionTests) {
            if (req.method === 'POST' && relative === '__test__/deployment') {
                const mode = url.searchParams.get('mode');
                if (!['current', 'legacy', 'broken'].includes(mode)) throw new Error();
                deployment = mode; res.writeHead(204); res.end(); return;
            }
            const stubs = { '__test__/paho.js': fakePaho, '__test__/chart.js': fakeChart, '__test__/icons.css': '' };
            if (Object.hasOwn(stubs, relative)) {
                res.writeHead(200, { 'Content-Type': relative.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' });
                res.end(stubs[relative]); return;
            }
            if (relative === 'firmware/evse-1.1.0.bin' || relative === 'firmware/evse-1.0.0.bin') {
                const body = firmwareFixture(relative.includes('1.0.0') ? '1.0.0' : '1.1.0');
                res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'public, max-age=3600' });
                res.end(body); return;
            }
            if (relative === 'firmware/redirect.bin') { res.writeHead(302, { Location: base + 'firmware/evse-1.1.0.bin' }); res.end(); return; }
            if (relative === 'index.html') {
                let html = await readFile(path.join(root, 'index.html'), 'utf8');
                if (deployment === 'legacy') html = html.replaceAll('src="js/', 'src="').replaceAll('href="css/', 'href="').replaceAll('Versão 1.6.8', 'Versão 1.6.6');
                html = html.replace('https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js', base + '__test__/paho.js')
                    .replace('https://cdn.jsdelivr.net/npm/chart.js', base + '__test__/chart.js')
                    .replace('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', base + '__test__/icons.css');
                res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(html); return;
            }
            if (deployment === 'broken' && relative === 'js/ota-panel.js') throw new Error();
            if (deployment === 'legacy') {
                if (relative === 'sw.js') relative = 'tests/browser/legacy-sw.fixture.js';
                else if (!relative.includes('/') && relative.endsWith('.js')) relative = 'js/' + relative;
                else if (!relative.includes('/') && relative.endsWith('.css')) relative = 'css/' + relative;
            }
        }
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep)) throw new Error();
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch { res.writeHead(404); res.end('Não encontrado'); }
}).listen(4173, '127.0.0.1');
