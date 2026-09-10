import { OTA, validDeviceId, validRequestId, validVersion, validUrl, buildCommand, parseStatus, advanceStatus, terminal } from './ota-protocol.js';

const PREFIX = 'ageon-evse-ota:v1:';
const emptyState = () => ({ schema: 1, focus: null, retainedId: null, attempts: [] });
const unresolved = attempt => !attempt.status || !terminal(attempt.status.status);

// Todas as mutações por dispositivo usam o mesmo Web Lock entre abas.
// Telemetria não é persistida: reconectar exige heartbeat e State A novos.
export class OtaController {
    constructor({ storage, locks, publish, uuid, now = Date.now, changed = () => {} }) {
        Object.assign(this, { storage, locks, publish, uuid, now, changed });
        this.connected = false;
        this.statusReady = false;
        this.storageFaults = new Set();
        this.devices = new Map();
        this.states = new Map();
        this.errors = new Map();
        this.submitting = new Set();
    }

    read(id) {
        try {
            const raw = this.storage.getItem(PREFIX + id);
            const state = raw ? JSON.parse(raw) : emptyState();
            if (state.schema !== 1 || !Array.isArray(state.attempts) || state.attempts.length > 32 ||
                ![null, ...state.attempts.map(a => a.id)].includes(state.focus) ||
                !(state.retainedId === null || validRequestId(state.retainedId))) throw new Error();
            const ids = new Set();
            for (const a of state.attempts) {
                if (!validRequestId(a.id) || ids.has(a.id) || !Number.isFinite(a.createdAt) || !Number.isFinite(a.updatedAt) ||
                    typeof a.local !== 'boolean' || !validVersion(a.version) ||
                    (a.local && !validUrl(a.url, a.version)) ||
                    (a.status !== null && (!parseStatus(JSON.stringify(a.status)) || a.status.request_id !== a.id ||
                        (a.status.requested_version !== null && a.status.requested_version !== a.version)))) throw new Error();
                ids.add(a.id);
            }
            this.states.set(id, state);
            this.errors.delete(id);
            return state;
        } catch {
            this.errors.set(id, 'Histórico OTA indisponível ou inválido. Novos envios estão bloqueados para preservar a correlação.');
            return this.states.get(id) || emptyState();
        }
    }

    save(id, state) {
        // Limitar histórico terminal, conservando sempre todas as tentativas pendentes.
        while (state.attempts.length > 24) {
            const index = state.attempts.findIndex(a => !unresolved(a) && a.id !== state.focus && a.id !== state.retainedId);
            if (index < 0) break;
            state.attempts.splice(index, 1);
        }
        if (state.attempts.length > 32) throw new Error('Histórico OTA cheio. Aguardando resultados pendentes.');
        try { this.storage.setItem(PREFIX + id, JSON.stringify(state)); }
        catch { this.storageFaults.add(id); throw new Error('Não foi possível persistir a tentativa OTA.'); }
        this.states.set(id, state);
    }

    async exclusive(id, action) {
        if (!this.locks?.request) throw new Error('OTA exige HTTPS e um navegador com Web Locks para coordenar as abas.');
        return this.locks.request(PREFIX + id, action);
    }

    setConnected(connected) {
        this.connected = connected;
        this.statusReady = false;
        this.devices.clear();
        this.changed();
    }

    setStatusReady(ready) { this.statusReady = ready; this.changed(); }

    telemetry(id, type, data, retained = false) {
        if (!validDeviceId(id) || !data || typeof data !== 'object' || Array.isArray(data)) return;
        const device = this.devices.get(id) || {};
        if (type === 'heartbeat' && !retained) {
            device.online = data.status === 'online';
            device.lastSeen = this.now();
            device.version = validVersion(data.running_version) ? data.running_version : null;
            device.boot = data.boot_validation;
            device.profile = data.ota_profile ?? 'normal';
            device.developmentMode = device.profile === 'development' &&
                data.app_project === 'EVSE' && data.ota_hardware_checks === false;
            device.profileValid = device.developmentMode || (device.profile === 'normal' &&
                (data.ota_hardware_checks === undefined || data.ota_hardware_checks === true) &&
                (data.app_project === undefined || data.app_project === 'EVSE'));
        } else if (type === 'connection' && data.status === 'offline') {
            device.online = false;
        } else if (type === 'state' && !retained) {
            device.state = Number.isInteger(data.state) && data.state >= 0 && data.state <= 5 ? data.state : null;
        }
        this.devices.set(id, device);
        this.changed(id);
    }

    reason(id, state = this.read(id)) {
        if (!validDeviceId(id)) return 'Identificador do EVSE inválido.';
        if (this.storageFaults.has(id)) return 'Falha ao persistir o histórico OTA. Novos envios estão bloqueados.';
        if (this.errors.has(id)) return this.errors.get(id);
        if (!this.locks?.request || !this.uuid) return 'OTA exige HTTPS, Web Locks e geração segura de UUID.';
        if (!this.connected) return 'MQTT desconectado. Aguardando reconexão.';
        if (!this.statusReady) return 'Aguardando confirmação da assinatura dos resultados OTA.';
        const device = this.devices.get(id);
        if (!device?.online || this.now() - device.lastSeen >= OTA.freshnessMs) return 'EVSE offline ou sem heartbeat recente.';
        if (!device.version) return 'Aguardando uma versão válida no heartbeat do EVSE.';
        if (device.boot !== 'passed') return 'Diagnóstico local do EVSE ainda não aprovado.';
        if (!device.profileValid) return 'Perfil OTA desconhecido ou configuração de desenvolvimento inconsistente.';
        if (!device.developmentMode && device.state !== 0) return 'OTA disponível somente no Estado A, com veículo desconectado.';
        if (this.submitting.has(id) || state.attempts.some(unresolved)) return 'Existe uma tentativa em andamento ou com resultado desconhecido.';
        return '';
    }

    async start(id, version, url) {
        if (this.submitting.has(id)) throw new Error('Envio já em andamento.');
        this.submitting.add(id);
        this.changed(id);
        try {
            return await this.exclusive(id, () => {
                const state = this.read(id);
                this.submitting.delete(id); // Guarda persistida também é conferida dentro do lock.
                const reason = this.reason(id, state);
                this.submitting.add(id);
                if (reason) throw new Error(reason);
                const command = buildCommand(id, version, url, this.uuid(), this.devices.get(id).version);
                if (state.attempts.some(a => a.id === command.payload.request_id)) throw new Error('UUID já utilizado.');
                const attempt = { id: command.payload.request_id, version, url, local: true,
                    createdAt: this.now(), updatedAt: this.now(), status: null };
                state.attempts.push(attempt);
                state.focus = attempt.id;
                // Gravar ANTES de publicar: reload, exceção no transporte ou outra aba não reenviam.
                this.save(id, state);
                try { this.publish(command); } catch {
                    // send() pode falhar depois de colocar bytes na rede. Não inferir rejeição.
                    this.errors.set(id, 'Envio sem confirmação. Resultado desconhecido; aguardando resposta do EVSE.');
                }
                return attempt.id;
            });
        } finally {
            this.submitting.delete(id);
            this.changed(id);
        }
    }

    async receive(id, payload, retained = false) {
        if (!validDeviceId(id)) return false;
        const status = payload === '' ? null : parseStatus(payload);
        if (payload !== '' && !status) return false;
        try {
            return await this.exclusive(id, () => {
                const state = this.read(id);
                if (this.errors.has(id)) return false;
                if (payload === '') {
                    const old = state.attempts.find(a => a.id === state.retainedId);
                    if (old && !old.local && !unresolved(old) && state.focus === old.id) state.focus = null;
                    state.retainedId = null; // Limpeza não conclui nem apaga tentativa local.
                } else {
                    let attempt = state.attempts.find(a => a.id === status.request_id);
                    if (status.scope === 'command' && (!attempt || !attempt.local)) return false;
                    if (!attempt) {
                        attempt = { id: status.request_id, version: status.requested_version, url: null, local: false,
                            createdAt: this.now(), updatedAt: this.now(), status: null };
                        state.attempts.push(attempt);
                        if (!state.focus) state.focus = attempt.id;
                    }
                    if (status.requested_version !== null && status.requested_version !== attempt.version) return false;
                    const next = advanceStatus(attempt.status, status);
                    if (next !== attempt.status) { attempt.status = next; attempt.updatedAt = this.now(); }
                    if (status.scope === 'operation' && retained) state.retainedId = attempt.id;
                }
                this.save(id, state);
                this.changed(id);
                return true;
            });
        } catch {
            this.errors.set(id, 'Não foi possível guardar o status OTA. Novos envios estão bloqueados.');
            this.changed(id);
            return false;
        }
    }

    storageChanged(key) {
        if (key === null) { this.changed(); return; }
        if (!key.startsWith(PREFIX)) return;
        const id = key.slice(PREFIX.length);
        if (validDeviceId(id)) { this.read(id); this.changed(id); }
    }

    snapshot(id) {
        const state = this.read(id);
        const attempt = state.attempts.find(a => a.id === state.focus) || null;
        const busy = state.attempts.filter(unresolved);
        const device = this.devices.get(id);
        const waiting = attempt && unresolved(attempt) && (!this.connected || !device?.online ||
            this.now() - device.lastSeen >= OTA.freshnessMs || this.now() - attempt.updatedAt >= OTA.responseMs);
        return { attempt, busy, retained: state.attempts.find(a => a.id === state.retainedId) || null,
            version: device?.version || null, developmentMode: device?.developmentMode === true,
            reason: this.reason(id, state), waiting };
    }
}
