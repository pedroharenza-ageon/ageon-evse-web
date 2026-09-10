// main.js - VERSÃO COMPLETA COM MQTT MANAGER

// ============================================================
// 1. IMPORTAÇÕES
// ============================================================

// Constantes
import { createOtaDashboard } from './ota-panel.js';
import { 
    CONFIG, 
    MQTT_CONFIG, 
    ESTADOS, 
    ESTADOS_NOMES, 
    CURRENT_STATES 
} from './config.js';

// Utilitários
import { 
    showLoading, 
    showError,
    updateElement,
    showMessage,
    clearMessage,
    isTouchDevice,
    isDesktop,
    isMobile,
    escapeHtml,
    getTagClass,
    validateCardId,
    showRfidMessage,
    formatElapsedTime
} from './utils.js';

// Gerenciador MQTT (NOVO)
import { 
    setupMQTT, 
    publishMessage,
    setupVisibilityAPI 
} from './mqtt-manager.js';

import { 
    setupNavigation,
    hideAllPages,
    showPage,
    navigateToPage,
    updateSummaryCardUI,
    chargingSessionUIUpdate,
    createDeviceCard,
    addDetailEventListeners,
    setupDetailChart,
    addDetailChartData,
    addHomeChartData,
    updateDetailPageUI,
    updateRfidUidInModal,
    renderCardsList,
    pageRegistry
} from './ui-manager.js';

//console.log("🚀 main.js: Iniciando carregamento de módulos...");

// ============================================================
// 2. EXPORTAÇÃO PARA WINDOW (para script.js usar)
// ============================================================

// Constantes
window.EVSE_CONFIG = CONFIG;
window.EVSE_createOtaDashboard = createOtaDashboard;
window.EVSE_MQTT_CONFIG = MQTT_CONFIG;
window.EVSE_ESTADOS = ESTADOS;
window.EVSE_ESTADOS_NOMES = ESTADOS_NOMES;
window.EVSE_CURRENT_STATES = CURRENT_STATES;

// Utilitários
window.EVSE_showLoading = showLoading;
window.EVSE_showError = showError;
window.EVSE_updateElement = updateElement;
window.EVSE_isTouchDevice = isTouchDevice;
window.EVSE_isDesktop = isDesktop;
window.EVSE_isMobile = isMobile;
window.EVSE_escapeHtml = escapeHtml;
window.EVSE_getTagClass = getTagClass;
window.EVSE_validateCardId = validateCardId;
window.EVSE_showRfidMessage = showRfidMessage;
window.EVSE_formatElapsedTime = formatElapsedTime;
window.EVSE_clearMessage = clearMessage;
window.EVSE_showMessage = showMessage;

// Gerenciador MQTT (NOVO)
window.EVSE_MQTT_MANAGER = {
    setupMQTT,
    publishMessage,
    setupVisibilityAPI
};

// ============================================================
// 3. EXPORTAÇÃO ORGANIZADA (OPCIONAL - para facilitar)
// ============================================================

// Cria um namespace organizado (opcional, mas recomendado)
window.EVSE = {
    // Constantes
    config: CONFIG,
    mqttConfig: MQTT_CONFIG,
    estados: ESTADOS,
    estadosNomes: ESTADOS_NOMES,
    currentStates: CURRENT_STATES,
    
    // Utilitários
    utils: {
        showLoading,
        showError,
        showMessage,
        clearMessage,
        updateElement,
        isTouchDevice,
        isDesktop,
        isMobile,
        escapeHtml,
        getTagClass,
        validateCardId,
        showRfidMessage,
        formatElapsedTime
    },
    
    // Gerenciadores
    mqtt: {
        setupMQTT,
        publishMessage,
        setupVisibilityAPI
    },

    ui: {
        setupNavigation,
        hideAllPages,
        showPage,
        navigateToPage,
        createDeviceCard,
        addDetailEventListeners,
        updateSummaryCardUI,
        chargingSessionUIUpdate,
        setupDetailChart,
        addDetailChartData,
        addHomeChartData,
        updateDetailPageUI,
        updateRfidUidInModal,
        renderCardsList,
        pageRegistry
    },
    
    devices: null,   
    charts: null,     
    modals: null     
};

// ============================================================
// 4. TESTE DOS MÓDULOS (opcional - para desenvolvimento)
// ============================================================

// Teste rápido silencioso (não atrapalha usuário)
setTimeout(() => {
    
    // Testa uma função (silenciosamente)
    if (window.EVSE_showLoading && !document.getElementById('loading-overlay')?.classList.contains('show')) {
        window.EVSE_showLoading(true);
        setTimeout(() => window.EVSE_showLoading(false), 50);
    }
}, 500);

// ============================================================
// 6. EXPORTAÇÃO PARA IMPORTAÇÃO POR OUTROS MÓDULOS (opcional)
// ============================================================

// Exporta como módulo ES6 também (para futuros imports entre módulos)
export {
    // Constantes
    CONFIG,
    MQTT_CONFIG,
    ESTADOS,
    ESTADOS_NOMES,
    CURRENT_STATES,
    
    // Utilitários
    showLoading,
    showError,
    showMessage,
    clearMessage,
    updateElement,
    isTouchDevice,
    isDesktop,
    isMobile,
    escapeHtml,
    getTagClass,
    validateCardId,
    showRfidMessage,
    formatElapsedTime,
    
    // MQTT
    setupMQTT,
    publishMessage,
    setupVisibilityAPI
};

// Exporta o namespace completo como default
export default window.EVSE;
