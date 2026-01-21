// mqtt-manager.js - IMPLEMENTAÇÃO COMPLETA DO MQTT

/**
 * @file Módulo para gerenciar a conexão MQTT, publicação e assinatura de tópicos.
 * 
 * setupMQTT: Configura e conecta o cliente MQTT, tratando 3 casos princiais:
 * 1. onConnectionLost
 *      Perda de conexão com o servidor MQTT e tenta uma reconexão automática.
 * 2. onMessageArrived
 *      Processa mensagens recebidas via handleMqttMessage().   
 * 3. connect
 *      Conecta ao broker MQTT e executa lógica pós-conexão. 
 * 
 * Ao se conectar com sucesso ao broker MQTT, o cliente se inscreve unicamente no tópico de
 * descoberta de dispositivos e navega para a página inicial do dashboard.
 * 
 * Os tópicos referentes a cada dispositivo são inscritos após o envio da mensagem
 * de descobreta, nesse momento o cliente apenas escuta o tópico de descoberta.
 * 
 * tópico de descoberta: connectionDiscovery:    'evse/+/status/connection'
 * 
 * A mensagem no tópico de descoberta enviada pelo backend é enviada como retained,
 * fazendo com que a mensage de descoberta seja recebida pela página assim que ela é carregada,
 * mesmo que o backend não tenha enviado, isso faz todos os devices que foram conhecidos uma vez
 * sejam lembrados ao recarregar a página novamente.
 * 
 */

import { handleMqttMessage } from './mqtt-message-handler.js';
import { navigateToPage } from './ui-manager.js';

/**
 * Configura e conecta o cliente MQTT (implementação completa)
 * @param {Object} mqttConfig - Configuração MQTT
 * @param {Object} dashboardInstance - Instância do dashboard (para callbacks)
 * @returns {Object} Cliente MQTT conectado
 */
export function setupMQTT(mqttConfig, dashboardInstance) {
    //console.log("🔌 Iniciando conexão MQTT...");
    
    // 1. Cria o cliente
    const client = new Paho.MQTT.Client(
        mqttConfig.broker,
        mqttConfig.port,
        mqttConfig.clientId
    );

    // 2. Configura callbacks
    client.onConnectionLost = (responseObject) => {
        if (responseObject.errorCode !== 0) {
            console.error("Conexão MQTT perdida:", responseObject.errorMessage);
            
            // Atualiza status no dashboard
            if (dashboardInstance.updateConnectionStatus) {
                dashboardInstance.updateConnectionStatus(false, 'Desconectado');
            }
            
            // Limpa dispositivos na UI
            const devicesContainer = document.getElementById('devices-container');
            if (devicesContainer) devicesContainer.innerHTML = '';
            
            // Tenta reconectar após 5 segundos
            setTimeout(() => {
                console.log("🔄 Tentando reconexão...");
                setupMQTT(mqttConfig, dashboardInstance);
            }, 5000);
        }
    };

    client.onMessageArrived = (message) => {
        //console.log(`📨 Mensagem recebida em: ${topic}`);
        handleMqttMessage(message, dashboardInstance);
    };

    // 3. Conecta ao broker
    client.connect({
        onSuccess: () => {
            handleConnectSuccess(client, mqttConfig, dashboardInstance);
        },
        onFailure: (err) => {
            handleConnectFailure(err, dashboardInstance);
        },
        useSSL: true
    });

    return client;
}

/**
 * Lógica de conexão bem-sucedida
 */
function handleConnectSuccess(client, mqttConfig, dashboardInstance) {
    console.log("✅ Conectado ao broker MQTT!");
    
    // Atualiza status
    if (dashboardInstance.updateConnectionStatus) {
        dashboardInstance.updateConnectionStatus(true, 'Conectado');
    }
    
    // Atualiza console se existir
    if (dashboardInstance.updateConsoleConnectionStatus) {
        dashboardInstance.updateConsoleConnectionStatus();
    }
    
    // Limpa e configura a página inicial
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        pageContainer.innerHTML = '';
        
        const homeTemplate = document.getElementById('page-home-template');
        if (homeTemplate) {
            pageContainer.appendChild(homeTemplate.content.cloneNode(true));
        } else {
            console.error("Template da página inicial não encontrado!");
        }
    }
    
    // Reseta dispositivos e se inscreve no tópico de descoberta
    if (dashboardInstance.devices) {
        dashboardInstance.devices = {};
    }
    
    client.subscribe(mqttConfig.topics.connectionDiscovery);
    console.log(`📡 Inscrito no tópico de descoberta: ${mqttConfig.topics.connectionDiscovery}`);
    
    // Esconde loading
    if (window.EVSE_showLoading) {
        window.EVSE_showLoading(false);
    }
    
    // Navega para página inicial
    if (dashboardInstance) {
        if (!dashboardInstance.mqttClient.isConnected()) {
            window.location.reload();
        }
        navigateToPage(dashboardInstance, 'page-home');
    } else {
        console.warn("Dashboard ainda não inicializado; adiando navegação.");
    }
    
    // Ativa botão home
    const navHome = document.getElementById('nav-home');
    if (navHome) navHome.classList.add('active');
}

/**
 * Lógica de falha na conexão
 */
function handleConnectFailure(err, dashboardInstance) {
    console.error("❌ Falha ao conectar ao MQTT:", err);
    
    // Atualiza status
    if (dashboardInstance.updateConnectionStatus) {
        dashboardInstance.updateConnectionStatus(false, 'Falha na conexão');
    }
    
    // Atualiza console se existir
    if (dashboardInstance.updateConsoleConnectionStatus) {
        dashboardInstance.updateConsoleConnectionStatus();
    }
    
    // Esconde loading
    if (window.EVSE_showLoading) {
        window.EVSE_showLoading(false);
    }
}

/**
 * Publica uma mensagem MQTT
 */
export function publishMessage(client, topic, payload, retained = false) {
    if (client && client.isConnected()) {
        const message = new Paho.MQTT.Message(JSON.stringify(payload));
        message.destinationName = topic;
        message.retained = retained;
        client.send(message);
        //console.log(`📤 Publicado em ${topic}:`, payload);
        return true;
    } else {
        console.error("❌ Não foi possível publicar. Cliente MQTT não conectado.");
        return false;
    }
}

/**
 * Configura API de visibilidade para reconexão
 */

export function setupVisibilityAPI(dashboardInstance) {
    if (!dashboardInstance) {
        console.log("❌ setupVisibilityAPI: dashboardInstance não fornecido");
        return;
    }
    
    //console.log("👁️‍🗨️ Configurando API de visibilidade para reconexão MQTT...");
    
    document.addEventListener("visibilitychange", () => {
        // Apenas age quando a página volta a ficar visível
        if (document.visibilityState !== 'visible') {
            window.EVSE_showLoading(true);
            if (!dashboardInstance) {
                //console.log("🔄 Dashboard reinicializando...");
                dashboardInstance = createDashboard(); // função que cria sua instância e inicializa UI + MQTT
            } else {
                if (!dashboardInstance.mqttClient.isConnected()) {
                    window.location.reload();
                }  
            }
            window.EVSE_showLoading(false);
            return;
        }
        
        //console.log("🔄 Página visível novamente. Verificando status MQTT...");
        
        // Verifica se o cliente MQTT existe e está desconectado
        if (dashboardInstance.mqttClient && !dashboardInstance.mqttClient.isConnected()) {
            console.warn("⚠️ Cliente MQTT desconectado! Tentando reconectar...");
            
            // Tenta reconectar
            if (dashboardInstance.MQTT_CONFIG) {
                //console.log("🔄 Iniciando reconexão MQTT...");
                
                // 1. Remove listeners antigos para evitar duplicação
                dashboardInstance.mqttClient.onConnectionLost = null;
                dashboardInstance.mqttClient.onMessageArrived = null;
                
                // 2. Chama setupMQTT novamente (que já reconecta)
                if (typeof dashboardInstance.setupMQTT === 'function') {
                    dashboardInstance.setupMQTT();
                } else {
                    console.log("❌ dashboardInstance.setupMQTT não é uma função!");
                }
            } else {
                console.log("❌ MQTT_CONFIG não disponível para reconexão");
            }
        } else if (dashboardInstance.mqttClient && dashboardInstance.mqttClient.isConnected()) {
            //console.log("✅ Conexão MQTT já está ativa. Tudo certo!");
        } else {
            //console.log("ℹ️ Cliente MQTT não inicializado ainda.");
        }
    });
    
    //console.log("✅ API de visibilidade configurada com sucesso");
}