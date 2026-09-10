// Contrato compartilhável com outro cliente; sem DOM, armazenamento ou MQTT.
export const OTA = Object.freeze({
    host: 'pedroharenza-ageon.github.io',
    path: '/ageon-evse-web/firmware/',
    maxVersion: 31, maxUrl: 128, maxCommand: 512, maxStatus: 1024,
    slotBytes: 6 * 1024 * 1024,
    freshnessMs: 30000, responseMs: 30000
});
export const PHASES = ['accepted', 'downloading', 'verifying', 'rebooting', 'success', 'failed'];
export const terminal = status => status === 'success' || status === 'failed';
export const validDeviceId = id => typeof id === 'string' && /^[0-9A-F]{12}(?![\s\S])/.test(id);
export const validRequestId = id => typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(?![\s\S])/i.test(id);
export const validVersion = version => typeof version === 'string' && version.length <= OTA.maxVersion && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![\s\S])/.test(version);
export const byteLength = value => new TextEncoder().encode(value).length;

export function higherVersion(candidate, running) {
    if (!validVersion(candidate) || !validVersion(running)) return false;
    const a = candidate.split('.'), b = running.split('.');
    for (let i = 0; i < 3; i++) {
        if (a[i].length !== b[i].length) return a[i].length > b[i].length;
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

export function validUrl(url, version) {
    if (!validVersion(version) || typeof url !== 'string' || byteLength(url) > OTA.maxUrl) return false;
    // Comparação literal: URL() normalizaria caminhos com travessia antes da validação.
    return ['', ':443'].some(port => url === `https://${OTA.host}${port}${OTA.path}evse-${version}.bin`);
}

export function buildCommand(deviceId, version, url, requestId, runningVersion) {
    if (!validDeviceId(deviceId)) throw new Error('Identificador do EVSE inválido.');
    if (!validVersion(version)) throw new Error('Use MAJOR.MINOR.PATCH, sem prefixos, sufixos ou zeros iniciais (até 31 caracteres).');
    if (!higherVersion(version, runningVersion)) throw new Error('A versão deve ser superior à versão atual informada pelo EVSE.');
    if (!validUrl(url, version)) throw new Error('Informe a URL HTTPS permitida, com o arquivo evse-{versão}.bin correspondente.');
    if (!validRequestId(requestId)) throw new Error('Não foi possível gerar um identificador seguro para a tentativa.');
    const payload = { command: 'ota_update', version, url, request_id: requestId };
    if (byteLength(JSON.stringify(payload)) > OTA.maxCommand) throw new Error('Comando excede 512 bytes.');
    return { topic: `evse/${deviceId}/command/ota_update`, payload, qos: 1, retained: false };
}

export function parseStatus(payload) {
    if (typeof payload !== 'string' || byteLength(payload) > OTA.maxStatus) return null;
    let s;
    try { s = JSON.parse(payload); } catch { return null; }
    if (!s || Array.isArray(s) || typeof s !== 'object' || !validRequestId(s.request_id) ||
        !['command', 'operation'].includes(s.scope) || !PHASES.includes(s.status) ||
        !validVersion(s.running_version) || typeof s.rollback !== 'boolean') return null;
    if (s.scope === 'operation' ? !validVersion(s.requested_version) :
        (s.status !== 'failed' || s.rollback || (s.requested_version !== null && !validVersion(s.requested_version)))) return null;
    const bytes = v => Number.isSafeInteger(v) && v >= 0 && v <= OTA.slotBytes;
    if (!bytes(s.bytes_received) || (s.bytes_total !== null && (!bytes(s.bytes_total) || s.bytes_total === 0 || s.bytes_received > s.bytes_total))) return null;
    if (s.bytes_total === null ? s.progress_percent !== null :
        (!Number.isInteger(s.progress_percent) || s.progress_percent < 0 || s.progress_percent > 100)) return null;
    if (s.status === 'failed' ? (typeof s.error_code !== 'string' || !/^[a-z_]{1,48}(?![\s\S])/.test(s.error_code)) : s.error_code !== null) return null;
    if (s.rollback && s.status !== 'failed') return null;
    if (s.status === 'success' && s.running_version !== s.requested_version) return null;
    // Só persistir campos do contrato; conteúdo do broker nunca vira HTML.
    return Object.fromEntries(['request_id', 'scope', 'status', 'requested_version', 'running_version',
        'bytes_received', 'bytes_total', 'progress_percent', 'error_code', 'rollback'].map(key => [key, s[key]]));
}

export function advanceStatus(previous, next) {
    if (!previous) return next;
    if (previous.request_id !== next.request_id) return previous;
    if (previous.scope === 'operation' && next.scope === 'command') return previous;
    if (previous.scope === 'command' && next.scope === 'operation') return next;
    if (previous.requested_version !== next.requested_version) return previous;
    if (terminal(previous.status)) {
        // A imagem anterior pode detalhar o rollback depois da reprovação local.
        return previous.status === 'failed' && next.status === 'failed' && next.rollback && !previous.rollback ? next : previous;
    }
    if (PHASES.indexOf(next.status) < PHASES.indexOf(previous.status)) return previous;
    if (!terminal(next.status) && next.bytes_received < previous.bytes_received) return previous;
    return next;
}
