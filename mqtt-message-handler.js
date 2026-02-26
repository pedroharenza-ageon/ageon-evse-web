// mqtt-message-handler.js - PROCESSAMENTO DE MENSAGENS MQTT

/**
 * Processa uma mensagem MQTT recebida
 * @param {Object} message - Mensagem MQTT {destinationName, payloadString}
 * @param {Object} dashboardInstance - Instância do dashboard
 * @returns {boolean} true se processada com sucesso
 */ 
export function handleMqttMessage(message, dashboardInstance) {
    const topic = message.destinationName;
    const payload = message.payloadString;
    
    //console.log(`📨 Mensagem recebida: ${topic}`);
    
    try {
        const parts = topic.split('/');
        const data = payload ? JSON.parse(payload) : {};
        //console.log("parts:", parts, "data:", data);

        // 1. Mensagens de conexão/descoberta
        if (topic.includes('/status/connection')) {
            
            const deviceId = data.deviceId || parts[1];
            if (!deviceId) return false;
            
            // Novo dispositivo
            if (!dashboardInstance.devices[deviceId]) {
                if (dashboardInstance.handleDeviceDiscovery) {
                    dashboardInstance.handleDeviceDiscovery(deviceId);
                }
            }
            
            // Atualização de status
            if (topic.includes('/status/connection')) {
                const isOnline = data.status === 'online';
                if (dashboardInstance.updateDeviceConnectionStatus) {
                    dashboardInstance.updateDeviceConnectionStatus(deviceId, isOnline);
                }
            }
            return true;
        }

        // 2. Console output
        if (parts[3] === 'console_output') {
            if (dashboardInstance.handleConsoleMessage) {
                dashboardInstance.handleConsoleMessage(parts[1], data);
            }
            return true;
        }

        // 3. RFID UID
        if (parts[3] === 'last_rfid_uid') {
            if (EVSE.ui.updateRfidUidInModal) {
                EVSE.ui.updateRfidUidInModal(data.uid);
            }
            return true;
        }

        const deviceId = parts[1];
        //console.log("deviceId:", deviceId);
        const statusName = parts[3];

        // 4. Dispositivo desconhecido
        if (!dashboardInstance.devices[deviceId]) {
            console.log(`Mensagem para dispositivo desconhecido: ${deviceId}`);
            if (dashboardInstance.handleDeviceDiscovery) {
                dashboardInstance.handleDeviceDiscovery(deviceId);
            }
            return false;
        }

        // 5. Atualiza dados do dispositivo
        dashboardInstance.devices[deviceId][statusName] = data;

        // 6. Notifica atualizações específicas
        notifyStatusUpdate(deviceId, statusName, data, dashboardInstance);

        return true;

    } catch (error) {
        console.warn(`❌ Erro ao processar mensagem ${topic}:`, error);
        return false;
    }
}

/**
 * Notifica atualizações de status específicas
 */
function notifyStatusUpdate(deviceId, statusName, data, dashboardInstance) {
    // Atualiza UI do cartão de resumo
    const summaryCard = document.querySelector(`#page-home .device-card-summary[data-device-id="${deviceId}"]`);
    if (summaryCard && EVSE.ui.updateSummaryCardUI) {
        EVSE.ui.updateSummaryCardUI(
            dashboardInstance,
            summaryCard, 
            dashboardInstance.devices[deviceId].state, 
            dashboardInstance.devices[deviceId].online
        );
    }

    // Atualiza página de detalhes se estiver ativa
    const detailPage = document.getElementById(`page-detail-${deviceId}`);
    if (detailPage && detailPage.classList.contains('active')) {
        if (EVSE.ui.updateDetailPageUI) {
            EVSE.ui.updateDetailPageUI(dashboardInstance, deviceId, statusName, data);
        }
    }

    // Casos especiais
    switch (statusName) {
        case 'charging_session':
            handleChargingSession(deviceId, data, dashboardInstance);
            break;
            
        case 'temperature':
            handleTemperature(deviceId, data, dashboardInstance);
            break;
            
        case 'cp_data':
            handleCPData(deviceId, data, dashboardInstance);
            break;
        
        case 'vrms_data':
            handleVRMSData(deviceId, data, dashboardInstance);

        case 'irms_data':
            handleIRMSData(deviceId, data, dashboardInstance);
    }
}

/**
 * Processa dados de sessão de carga
 */
// function handleChargingSession(deviceId, data, dashboardInstance) {
//     // Atualiza dados da sessão
//     dashboardInstance.devices[deviceId].charging_session = data;

//     // Atualiza UI da página de detalhes
//     const page = document.getElementById(`page-detail-${deviceId}`);
//     if (page && page.classList.contains('active')) {
//         page.querySelector('.power-value').innerHTML = `${(data.power || 0.00).toFixed(2)} <small>kW</small>`;
//         page.querySelector('.energy-value').innerHTML = `${(data.energy || 0.000).toFixed(3)} <small>kWh</small>`;
        
//         // Atualiza timer
//         if (dashboardInstance._updateTimerUI) {
//             dashboardInstance._updateTimerUI(deviceId, data.sessionTime || '--:--:--');
//         }
//     }
    
//     // Atualiza cartão de resumo
//     const summaryCard = document.querySelector(`#page-home .device-card-summary[data-device-id="${deviceId}"]`);
//     if (summaryCard) {
//         const powerValue = data.power || 0.0;
//         summaryCard.querySelector('.summary-power').textContent = `${powerValue.toFixed(1)} kW`;
//     }
    
//     // Gerencia timer da sessão
//     if (dashboardInstance.manageSessionTimer) {
//         dashboardInstance.manageSessionTimer(deviceId, data.sessionStartTime);
//     }
// }

function handleChargingSession(deviceId, data, dashboardInstance) {
    // Atualiza dados da sessão (estado)
    dashboardInstance.devices[deviceId].charging_session = data;

    // Atualiza UI separadamente
    EVSE.ui.chargingSessionUIUpdate(deviceId, data, dashboardInstance);

    // Gerencia timer da sessão (lógica)
    if (dashboardInstance.manageSessionTimer) {
        dashboardInstance.manageSessionTimer(deviceId, data.sessionStartTime);
    }
}

/**
 * Processa dados de temperatura
 */
function handleTemperature(deviceId, data, dashboardInstance) {
    dashboardInstance.devices[deviceId].temperature = data;
    
    const page = document.getElementById(`page-detail-${deviceId}`);
    if (page && page.classList.contains('active')) {
        const temp1 = data.sensor1 !== undefined ? data.sensor1.toFixed(1) : '--';
        const temp2 = data.sensor2 !== undefined ? data.sensor2.toFixed(1) : '--';
        
        page.querySelector('.temp-value-1').innerHTML = `${temp1} <small>°C</small>`;
        page.querySelector('.temp-value-2').innerHTML = `${temp2} <small>°C</small>`;
    }
}

/**
 * Processa dados CP (gráfico)
 */
function handleCPData(deviceId, data, dashboardInstance) {
    const device = dashboardInstance.devices[deviceId];
    if (device && EVSE.ui.addDetailChartData && device.chart) {
        EVSE.ui.addDetailChartData(device.chart, data, 'cp');
    } 
}

function handleVRMSData(deviceId, data, dashboardInstance) {
    const device = dashboardInstance.devices[deviceId];
    if (device && EVSE.ui.addDetailChartData && device.vrmChart) {
        EVSE.ui.addDetailChartData(device.vrmChart, data, 'vrms');
    }
}

function handleIRMSData(deviceId, data, dashboardInstance) {
        const device = dashboardInstance.devices[deviceId];
    if (device && EVSE.ui.addDetailChartData && device.vrmChart) {
        EVSE.ui.addDetailChartData(device.vrmChart, data, 'irms');
    }
}