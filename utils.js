// utils.js - TODAS AS FUNÇÕES UTILITÁRIAS

// ==================== UI BÁSICA ====================
export function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.toggle('show', show);
        overlay.setAttribute('aria-hidden', !show);
    }
}

export function showError(message) {
    console.error('Dashboard Error:', message);
}

export function updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) element.textContent = content;
}

export function showMessage(element, message, type = 'info') {
    if (!element) return;
    element.textContent = message;
    element.className = `form-message ${type}`;
}

export function clearMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = '';
        element.className = 'form-message';
    }
}

// ==================== DETECÇÃO DISPOSITIVO ====================
export function isTouchDevice() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
}

export function isDesktop() {
    const hasTouch = isTouchDevice();
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return !hasTouch || (hasTouch && !isMobileUserAgent);
}

export function isMobile() {
    return !isDesktop();
}

// ==================== UTILITÁRIOS GERAIS ====================
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function getTagClass(tag) {
    const tagLower = tag.toLowerCase();
    
    const tagMap = {
        'mqtt_service': 'console-tag-mqtt_service',
        'mqtt_core': 'console-tag-mqtt_core',
        'evse_em': 'console-tag-evse_em',
        'wifi': 'console-tag-wifi',
        'rfid': 'console-tag-rfid',
        'atm90': 'console-tag-atm90',
        'debug': 'console-tag-debug',
        'sys': 'console-tag-sys',
        'error': 'console-tag-error',
        'warning': 'console-tag-warning',
        'info': 'console-tag-info',
        'success': 'console-tag-success'
    };

    for (const [key, className] of Object.entries(tagMap)) {
        if (tagLower.includes(key)) {
            return className;
        }
    }

    return 'console-tag-sys';
}

// ==================== FORMULÁRIOS/MODAIS ====================
export function validateCardId(cardId) {
    const cleanId = cardId.trim();
    return cleanId.length >= 4 && /^[A-Fa-f0-9\s]+$/.test(cleanId);
}

export function showRfidMessage(message, type = 'success') {
    const formMessage = document.getElementById('rfid-form-message');
    if (formMessage) {
        formMessage.textContent = message;
        formMessage.className = `form-message ${type}`;
        formMessage.style.display = 'block';
        setTimeout(() => { formMessage.style.display = 'none'; }, 5000);
    }
}

// ==================== TEMPO/FORMATAÇÃO ====================
export function formatElapsedTime(startTime) {
    const now = new Date();
    const diffMs = now - startTime;

    if (diffMs < 0) return '00:00:00';

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    return (
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0')
    );
}