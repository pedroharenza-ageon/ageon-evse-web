import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { OTA, validVersion, validUrl } from '../js/ota-protocol.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function inspectFirmware(image, version) {
    if (!validVersion(version)) throw new Error('Versão inválida: use MAJOR.MINOR.PATCH.');
    if (image.length < 320 || image.length > OTA.slotBytes) throw new Error('Tamanho incompatível com a aplicação e o slot de 6 MiB.');
    if (image[0] !== 0xe9 || image.readUInt32LE(32) !== 0xabcd5432) throw new Error('Esperado binário de aplicação ESP-IDF; HTML, ponteiro LFS, bootloader e imagem mesclada não são aceitos.');
    if (image.readUInt16LE(12) !== 0 || (image[3] >> 4) !== 4) throw new Error('A imagem deve identificar ESP32 e flash de 16 MiB.');
    const field = offset => {
        const bytes = image.subarray(offset, offset + 32), end = bytes.indexOf(0);
        if (end < 0 || bytes.subarray(0, end).some(byte => byte < 32 || byte > 126)) throw new Error('Descritor de aplicação inválido.');
        return bytes.subarray(0, end).toString('ascii');
    };
    if (field(48) !== version || field(80) !== 'EVSE') throw new Error('Versão ou projeto no descritor não corresponde ao lançamento EVSE solicitado.');
    if (image[23] !== 1 || sha256(image.subarray(0, -32)) !== image.subarray(-32).toString('hex')) throw new Error('Hash SHA-256 anexado à imagem ausente ou inválido.');
    return { file: `evse-${version}.bin`, version, project: 'EVSE', size_bytes: image.length, sha256: sha256(image),
        url: `https://${OTA.host}${OTA.path}evse-${version}.bin` };
}

export async function verifyPublished(local, version, url, fetchImpl = fetch) {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Verificação TLS desativada no ambiente; remova NODE_TLS_REJECT_UNAUTHORIZED=0.');
    const expected = inspectFirmware(local, version);
    if (!validUrl(url, version)) throw new Error('Use a URL HTTPS canônica do GitHub Pages para esta versão.');
    // Node mantém a validação TLS padrão. Não seguir redirects nem aceitar HTML como firmware.
    const response = await fetchImpl(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    try {
        if (response.status !== 200) throw new Error(`Resposta HTTP ${response.status}; esperado 200.`);
        const type = response.headers.get('content-type')?.toLowerCase() || '';
        if (type.startsWith('text/') || type.includes('json') || type.includes('html')) throw new Error('O endereço retornou conteúdo textual, não um binário.');
        const encoding = response.headers.get('content-encoding');
        if (encoding && encoding.toLowerCase() !== 'identity') throw new Error('Conteúdo comprimido não é aceito pelo downloader da POC.');
        const length = response.headers.get('content-length');
        if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== expected.size_bytes)) throw new Error('Content-Length difere do arquivo local.');
        if (!response.body) throw new Error('Resposta sem corpo.');
        let bytes = 0;
        const hash = createHash('sha256');
        for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > expected.size_bytes) throw new Error('Download maior que o arquivo local.');
            hash.update(chunk);
        }
        if (bytes !== expected.size_bytes || hash.digest('hex') !== expected.sha256) throw new Error('Bytes ou SHA-256 publicados diferem do arquivo local.');
        return { ...expected, url, verification: 'published', verified_at: new Date().toISOString() };
    } finally {
        if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
}

export async function main(args = process.argv.slice(2)) {
    const options = new Map();
    for (let i = 0; i < args.length; i += 2) {
        if (!['--file', '--version', '--url'].includes(args[i]) || !args[i + 1] || options.has(args[i])) throw new Error('Uso: npm run firmware:verify -- --file CAMINHO --version X.Y.Z [--url URL_HTTPS_PUBLICADA]');
        options.set(args[i], args[i + 1]);
    }
    const file = options.get('--file'), version = options.get('--version');
    if (!file || !validVersion(version) || path.basename(file) !== `evse-${version}.bin`) throw new Error('Informe --file evse-X.Y.Z.bin e --version X.Y.Z correspondentes.');
    if ((await stat(file)).size > OTA.slotBytes) throw new Error('Arquivo excede o slot de 6 MiB.');
    const image = await readFile(file), url = options.get('--url');
    const report = url ? await verifyPublished(image, version, url) : { ...inspectFirmware(image, version), verification: 'local' };
    console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error('Verificação do firmware:', error.message); process.exitCode = 1; });
}
