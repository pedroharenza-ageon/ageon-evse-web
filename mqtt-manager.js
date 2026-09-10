import { handleMqttMessage } from './mqtt-message-handler.js';
import { navigateToPage } from './ui-manager.js';

// Manter cliente, páginas e tentativas OTA durante reconexões.
export function setupMQTT(config, dashboard) {
    if (dashboard.reconnectMqtt) {
        dashboard.reconnectMqtt();
        return dashboard.mqttClient;
    }
    const client = new Paho.MQTT.Client(config.broker, config.port, config.clientId);
    dashboard.mqttClient = client;
    let timer = null, connecting = false, stopped = false;
    const shell = document.getElementById('page-container');
    if (shell && !document.getElementById('page-home')) {
        shell.appendChild(document.getElementById('page-home-template').content.cloneNode(true));
        navigateToPage(dashboard, 'page-home');
    }

    function disconnected(text) {
        dashboard.updateConnectionStatus?.(false, text);
        dashboard.updateConsoleConnectionStatus?.();
        for (const id of Object.keys(dashboard.devices)) dashboard.updateDeviceConnectionStatus?.(id, false);
        window.EVSE_showLoading?.(false);
    }
    function retry() {
        if (!stopped && timer === null) timer = setTimeout(() => { timer = null; connect(); }, 5000);
    }
    function connect() {
        if (stopped || connecting || client.isConnected()) return;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        connecting = true;
        const failed = () => { connecting = false; disconnected('Falha na conexão'); retry(); };
        try {
            client.connect({
                useSSL: true, mqttVersion: 4, cleanSession: true, timeout: 15,
                onSuccess: () => {
                    if (stopped) return;
                    connecting = false;
                    dashboard.updateConnectionStatus?.(true, 'Conectado');
                    dashboard.updateConsoleConnectionStatus?.();
                    client.subscribe('evse/+/status/ota', {
                        qos: 1, timeout: 15,
                        onSuccess: () => { if (!stopped && client.isConnected()) dashboard.ota.controller.setStatusReady(true); },
                        onFailure: () => dashboard.ota.controller.setStatusReady(false)
                    });
                    client.subscribe(config.topics.connectionDiscovery, { qos: 1 });
                    for (const id of Object.keys(dashboard.devices)) {
                        client.subscribe(config.topics.statusTemplate.replace('{deviceId}', id), { qos: 1 });
                        publishMessage(client, config.topics.commandTemplate.replace('{deviceId}', id)
                            .replace('{commandName}', 'get_initial_data'), { request: true });
                    }
                    window.EVSE_showLoading?.(false);
                },
                onFailure: failed
            });
        } catch { failed(); }
    }
    client.onMessageArrived = message => { if (!stopped) handleMqttMessage(message, dashboard); };
    client.onConnectionLost = response => {
        if (stopped) return;
        connecting = false;
        disconnected('Desconectado');
        if (response.errorCode !== 0) retry();
    };
    dashboard.reconnectMqtt = connect;
    dashboard.stopMqtt = () => {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        dashboard.removeMqttVisibilityListener?.();
        if (client.isConnected()) client.disconnect();
    };
    connect();
    return client;
}

export function publishMessage(client, topic, payload, retained = false, qos = 0) {
    if (!client?.isConnected()) return false;
    const message = new Paho.MQTT.Message(JSON.stringify(payload));
    message.destinationName = topic;
    message.retained = retained;
    message.qos = qos;
    client.send(message);
    return true;
}

export function setupVisibilityAPI(dashboard) {
    dashboard.removeMqttVisibilityListener?.();
    const visible = () => {
        if (document.visibilityState === 'visible') dashboard.reconnectMqtt?.();
    };
    document.addEventListener('visibilitychange', visible);
    dashboard.removeMqttVisibilityListener = () => document.removeEventListener('visibilitychange', visible);
}
