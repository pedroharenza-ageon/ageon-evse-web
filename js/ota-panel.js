import { OtaController } from './ota-controller.js';
import { OTA, terminal } from './ota-protocol.js';

const labels = {
    accepted: 'Atualização aceita pelo EVSE', downloading: 'Baixando firmware',
    verifying: 'Verificando firmware', rebooting: 'Reiniciando; aguardando validação do novo firmware',
    success: 'Atualização concluída e validada pelo EVSE', failed: 'Atualização falhou'
};

export function mountOtaPanel(panel, id, controller) {
    const form = panel.querySelector('form');
    const version = form.elements.version;
    const url = form.elements.url;
    const button = panel.querySelector('.ota-start');
    const feedback = panel.querySelector('.ota-feedback');
    const progress = panel.querySelector('progress');
    let sending = false;
    const old = controller.snapshot(id).attempt;
    if (old?.local) { version.value = old.version; url.value = old.url; }

    function render() {
        const view = controller.snapshot(id);
        const a = view.attempt, status = a?.status;
        panel.querySelector('.ota-version').textContent = view.version || 'Aguardando heartbeat';
        panel.querySelector('.ota-profile').textContent = view.developmentMode ?
            'Desenvolvimento: verificações de hardware da OTA dispensadas. Funciona com ou sem a placa de potência; a carga fica bloqueada durante a atualização.' : '';
        panel.querySelector('.ota-reason').textContent = view.reason || 'Pronto para solicitar uma versão superior.';
        button.disabled = sending || Boolean(view.reason);
        version.disabled = url.disabled = sending || view.busy.length > 0;
        panel.querySelector('.ota-request').textContent = a ? `${a.version} · ${a.id}` : 'Nenhuma tentativa acompanhada neste navegador.';
        let text = status ? labels[status.status] : a ? 'Comando enviado; aguardando aceitação do EVSE' : 'Nenhuma atualização iniciada.';
        if (status?.scope === 'command') text = 'Comando recusado pelo EVSE';
        if (view.waiting) text = 'Resultado desconhecido; aguardando resposta ou reconexão do EVSE.';
        if (status?.error_code) text += ` · ${status.error_code}`;
        if (status?.rollback) text += ` · Rollback confirmado: versão ${status.running_version}`;
        panel.querySelector('.ota-status').textContent = text;
        panel.dataset.result = status && terminal(status.status) ? status.status : 'pending';
        progress.hidden = !status || status.scope !== 'operation';
        if (status?.progress_percent == null) progress.removeAttribute('value');
        else progress.value = status.progress_percent;
        panel.querySelector('.ota-bytes').textContent = !status || status.scope !== 'operation' ? '' :
            `${status.bytes_received.toLocaleString('pt-BR')} / ${status.bytes_total?.toLocaleString('pt-BR') ?? '?'} bytes` +
            (status.progress_percent === null ? ' · tamanho total desconhecido' : ` · ${status.progress_percent}% transferido`);
        const other = view.busy.find(item => item.id !== a?.id) || (view.retained?.id !== a?.id ? view.retained : null);
        panel.querySelector('.ota-other').textContent = other ?
            `Outra tentativa observada: ${other.version} · ${other.id} · ${labels[other.status?.status] || 'Aguardando resposta'}.` :
            (view.retained ? 'Status retido recebido do broker; a correlação usa o identificador da tentativa.' : '');
    }

    async function submit(event) {
        event.preventDefault();
        if (sending || button.disabled) return;
        sending = true;
        feedback.textContent = '';
        // Copiar campos antes de await; seleção de outro dispositivo não muda o alvo.
        const targetVersion = version.value.trim(), targetUrl = url.value.trim();
        render();
        try { await controller.start(id, targetVersion, targetUrl); }
        catch (error) { feedback.textContent = error.message; }
        finally { sending = false; render(); }
    }
    form.addEventListener('submit', submit);
    render();
    return { render, destroy: () => form.removeEventListener('submit', submit) };
}

export function createOtaDashboard(dashboard) {
    const panels = new Map();
    const render = id => {
        for (const [key, view] of panels) if (!id || id === key) view.render();
    };
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    const controller = new OtaController({
        storage, locks: navigator.locks,
        uuid: globalThis.crypto?.randomUUID ? () => crypto.randomUUID() : null,
        changed: render,
        publish: command => {
            const ok = window.EVSE_MQTT_MANAGER.publishMessage(dashboard.mqttClient, command.topic,
                command.payload, command.retained, command.qos);
            if (!ok) throw new Error('MQTT desconectado.');
        }
    });
    const storageListener = event => controller.storageChanged(event.key);
    window.addEventListener('storage', storageListener);
    const timer = setInterval(() => render(), Math.min(1000, OTA.responseMs));
    return {
        controller,
        mount(page, id) {
            panels.get(id)?.destroy();
            panels.set(id, mountOtaPanel(page.querySelector('.ota-panel'), id, controller));
        },
        destroy() {
            clearInterval(timer);
            window.removeEventListener('storage', storageListener);
            for (const panel of panels.values()) panel.destroy();
            panels.clear();
        }
    };
}
