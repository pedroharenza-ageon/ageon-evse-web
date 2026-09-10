// config.js
const CONFIG = {
    CHART: {
        MAX_DATA_POINTS: 20,
        ANIMATION_DURATION: 500
    },
};

const MQTT_CONFIG = {
    broker: 'broker.hivemq.com',
    port: 8884,
    clientId: `EVSE_DASHBOARD_${Math.random().toString(16).substr(2, 8)}`,
    topics: {
        connectionDiscovery:    'evse/+/status/connection', 
        statusTemplate:         'evse/{deviceId}/status/#',
        commandTemplate:        'evse/{deviceId}/command/{commandName}'
    }
};

const ESTADOS = [
    { valor: 3147, nome: 'ESTADO A', cor: '#f63bdaff' },
    { valor: 2772, nome: 'ESTADO B', cor: '#2f7ddbff' },
    { valor: 2398, nome: 'ESTADO C', cor: '#25eb71ff' },
    { valor: 2024, nome: 'ESTADO D', cor: '#c4e61cff' },
    { valor: 1650, nome: 'ESTADO E', cor: '#f6b15cff' },
    { valor:  153, nome: 'ESTADO F', cor: '#ef4444' }
];

const ESTADOS_NOMES = ['ESTADO A', 'ESTADO B', 'ESTADO C', 'ESTADO D', 'ESTADO E', 'ESTADO F'];

const CURRENT_STATES = {
    1: '32A',
    2: '16A'
};

// EXPORTE tudo
export {
    CONFIG,
    MQTT_CONFIG,
    ESTADOS,
    ESTADOS_NOMES,
    CURRENT_STATES
};