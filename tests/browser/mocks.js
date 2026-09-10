export const fakePaho = `
window.__mqtt = { clients: [], sent: [], subscriptions: [], available: true };
window.Paho = { MQTT: {
 Message: class { constructor(text) { this.payloadString = text; this.qos = 0; this.retained = false; } },
 Client: class {
  constructor() { this.connected = false; window.__mqtt.clients.push(this); }
  isConnected() { return this.connected; }
  connect(options) { this.options = options; queueMicrotask(() => {
    if (!window.__mqtt.available) { options.onFailure({ errorCode: 1 }); return; }
    this.connected = true; options.onSuccess();
  }); }
  subscribe(topic, options = {}) { window.__mqtt.subscriptions.push({ topic, qos: options.qos }); queueMicrotask(() => options.onSuccess?.()); }
  send(message) { if (!this.connected) throw new Error('offline'); window.__mqtt.sent.push({ topic: message.destinationName, payload: JSON.parse(message.payloadString), qos: message.qos, retained: message.retained }); }
  disconnect() { this.connected = false; this.onConnectionLost?.({ errorCode: 0 }); }
 }
} };
window.__emit = (id, type, data, retained = false) => window.__mqtt.clients[0].onMessageArrived({ destinationName: 'evse/' + id + '/status/' + type, payloadString: typeof data === 'string' ? data : JSON.stringify(data), retained });
`;
export const fakeChart = 'window.Chart = class { constructor(ctx, config) { this.data = config.data; this.options = config.options; } update() {} destroy() {} };';
