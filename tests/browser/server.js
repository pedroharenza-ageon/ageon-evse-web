import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(), prefix = '/ageon-evse-web/';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (!url.pathname.startsWith(prefix)) throw new Error();
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
        if (!file.startsWith(root + path.sep)) throw new Error();
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch { res.writeHead(404); res.end('Não encontrado'); }
}).listen(4173, '127.0.0.1');
