// EVSE Dashboard

const CONFIG = window.EVSE_CONFIG;
const MQTT_CONFIG = window.EVSE_MQTT_CONFIG;
const ESTADOS = window.EVSE_ESTADOS;
const ESTADOS_NOMES = window.EVSE_ESTADOS_NOMES;
const CURRENT_STATES = window.EVSE_CURRENT_STATES;

let currentState = 1;

class EVSEDashboard {
    constructor() {
        this.homeChart = null;
        this.homeChartInterval = null;
        this.devices = {}; 
        this.mqttClient = null;
        this.activeModalDeviceId = null;
        this.elementToFocusOnModalClose = null;
        this.registeredCards = []; 
        this.sessionTimers = {};

        this.consoleMessages = [];
        this.consoleTags = new Set();
        this.consoleFilterTag = 'all';
        this.consoleSearchTerm = '';
        this.consoleMaxMessages = 100;

        this.messageObserver = null;
        this.observedMessages = new Set();

        this.init();

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                // Procura por qualquer modal que esteja com a classe 'show'
                const activeModal = document.querySelector('.modal.show'); 
                if (activeModal) {
                    this.closeModal(activeModal);
                }
            }
        });
    }

    // Inicialização
    async init() {
        try {
            window.EVSE_showLoading(true);

            this.setupModals();
            this.setupMQTT();
            EVSE.ui.setupNavigation(this);
            window.EVSE_MQTT_MANAGER.setupVisibilityAPI(this); 
        } catch (error) {
            console.error('Erro na inicialização:', error);
            window.EVSE_showError('Erro ao inicializar o dashboard');
            window.EVSE_showLoading(false);
            this.updateConnectionStatus(false, 'Erro');
        }
    }

    setupMQTT() {
        // Apenas chama a implementação completa do módulo
        this.mqttClient = window.EVSE_MQTT_MANAGER.setupMQTT(MQTT_CONFIG, this);
    }

    handleDeviceDiscovery(deviceId) {
        if (this.devices[deviceId]) return;

        console.log(`Novo dispositivo descoberto: ${deviceId}.`);

        this.devices[deviceId] = {
            name: `EVSE ${deviceId.slice(-6)}`,
            online: true,
            state: null,
            block_state: null,
            charging_session: null,
            current_state: null,
            chart1: null,
            chart2: null,
            chart3: null
        };

        const statusTopic = MQTT_CONFIG.topics.statusTemplate.replace('{deviceId}', deviceId);
        this.mqttClient.subscribe(statusTopic);
        //console.log(`Inscrito em TODOS os tópicos de status para ${deviceId} via: ${statusTopic}`);

        //console.log(`Solicitando dados iniciais para ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'get_initial_data');

        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { request: true });

        EVSE.ui.createDeviceCard(this, deviceId);
    }

    updateDeviceConnectionStatus(deviceId, isOnline) {
        const device = this.devices[deviceId];

        if (!device) {
            console.warn(`Tentativa de atualizar status de conexão para dispositivo desconhecido: ${deviceId}`);
            return;
        }

        device.online = isOnline;
        //console.log(`Dispositivo ${deviceId} agora está ${isOnline ? 'Online' : 'Offline'}.`);

        const summaryCard = document.querySelector(`#page-home .device-card-summary[data-device-id="${deviceId}"]`);
        if (summaryCard) {
            EVSE.ui.updateSummaryCardUI(this.devices, summaryCard, device.state, isOnline);
        }
        EVSE.ui.updateDetailPageUI(this, deviceId, 'connection_status_change', { online: isOnline });
    }

    navigateToDetailPage(deviceId) {
        const pageId = `page-detail-${deviceId}`;
        let detailPage = document.getElementById(pageId);
        const device = this.devices[deviceId];

        if (!device) {
            console.error(`Tentou navegar para os detalhes de um dispositivo desconhecido: ${deviceId}`);
            return;
        }

        if (!detailPage) {
            const container = document.getElementById('page-container');
            const template = document.getElementById('device-detail-page-template');
            if (!container || !template) {
                console.error("Template da página de detalhes não encontrado!");
                return;
            }

            const clone = template.content.cloneNode(true);
            detailPage = clone.querySelector('.app-page');
            detailPage.id = pageId;

            detailPage.querySelector('.page-title').textContent = this.devices[deviceId].name;
            detailPage.querySelector('.back-button').addEventListener('click', (e) => {
                e.preventDefault();
                EVSE.ui.navigateToPage(this, 'page-home');
            });
            
            EVSE.ui.addDetailEventListeners(this, detailPage, deviceId);
            container.appendChild(clone); 

            EVSE.ui.setupDetailChart(this, detailPage, deviceId); 
        }
        //console.log(`Populando página de detalhes para ${deviceId} com dados armazenados.`);

        EVSE.ui.updateDetailPageUI(this, deviceId, 'connection_status_change', {});

        if (device.state) {
            EVSE.ui.updateDetailPageUI(this, deviceId, 'state', device.state);
        }
        if (device.block_state) {
            EVSE.ui.updateDetailPageUI(this, deviceId, 'block_state', device.block_state);
        }
        if (device.current_state) {
            EVSE.ui.updateDetailPageUI(this, deviceId, 'current_state', device.current_state);
        }
        if (device.temperature) {
            EVSE.ui.updateDetailPageUI(this, deviceId, 'temperature', device.temperature);
        }
        
        const powerSessionData = device.charging_session;
        if (powerSessionData) {
            // 1. Atualiza a UI com os últimos dados de potência e energia que temos.
            detailPage.querySelector('.power-value').innerHTML = `${(powerSessionData.power || 0.00).toFixed(2)} <small>kW</small>`;
            detailPage.querySelector('.energy-value').innerHTML = `${(powerSessionData.energy || 0.000).toFixed(3)} <small>kWh</small>`;
            
            // 2. Atualiza o tempo com o último valor recebido do backend.
            this._updateTimerUI(deviceId, powerSessionData.sessionTime || '--:--:--');

            // 3. Inicia o cronômetro do frontend imediatamente, sem esperar pelo próximo MQTT.
            this.manageSessionTimer(deviceId, powerSessionData.sessionStartTime);
        }
        
        EVSE.ui.navigateToPage(this, pageId);
    }

    alternarBloqueio(deviceId) {
        if (!this.devices[deviceId]) {
            console.error(`Dispositivo ${deviceId} não encontrado.`);
            return;
        }

        const estadoAtual = this.devices[deviceId].block_state?.state;
        const comandoParaEnviar = (estadoAtual === 'ESTADO_E') ? 'ESTADO_A' : 'ESTADO_E';

        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'block');

        console.log(`Alterando o estado de ${deviceId} para: ${comandoParaEnviar}`);
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { state: comandoParaEnviar });
    }

    sendDebugCommand(deviceId) {
        if (!deviceId) {
            console.error("sendDebugCommand chamado sem um deviceId.");
            return;
        }

        console.log(`Enviando comando de DEBUG para o dispositivo ${deviceId}...`);

        // Constrói o tópico de comando de debug específico para este dispositivo.
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'debug');

        // Publica a mensagem MQTT. O payload pode ser simples,
        // pois o backend provavelmente só precisa saber que o comando chegou.
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { debug: 1 });
    }

    forceCharge(deviceId, forcecharge_state) {
        if (!deviceId) {
            console.error("forceCharge chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de forceCharge para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'force_charge');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { force_charge: forcecharge_state });
    }

    forceError(deviceId) {
        if (!deviceId) {
            console.error("forceError chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de forceError para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'force_error');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { force_error: true });
    }

    resetRfid(deviceId) {
        if (!deviceId) {
            console.error("reset_rfid chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de reset_rfid para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'reset_rfid');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});
    }

    resetEvse(deviceId) {
        if (!deviceId) {
            console.error("resetEvse chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de resetEvse para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'reset_evse');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});
    }

    toggleRainbow(deviceId) {
        if (!deviceId) {
            console.error("toggleRainbow chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de toggleRainbow para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'toggle_rainbow_mode');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});
    }

    gfciSelfTest(deviceId) {
        if (!deviceId) {
            console.error("gfciSelfTest chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de gfciSelfTest para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'gfci_self_test');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});
    }

    calibrateCurrent(deviceId) {
        if (!deviceId) {
            console.error("calibrateCurrent chamado sem um deviceId.");
            return;
        }
        console.log(`Enviando comando de calibrateCurrent para o dispositivo ${deviceId}...`);
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'calibrate_current_offset');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});
    }

    changeCurrent(deviceId) {
        if (!deviceId) {
            console.error("changeCurrent chamado sem um deviceId.");
            return;
        }

        const device = this.devices[deviceId];
        const currentKeyState = device?.current_state?.state || 1;

        const nextState = (currentKeyState === 1) ? 2 : 1;

        console.log(`Alterando corrente para o dispositivo ${deviceId}. Estado atual: ${currentKeyState}, Próximo estado: ${nextState}`);

        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', deviceId)
            .replace('{commandName}', 'set_current');

        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { state: nextState });

        const optimisticData = { state: nextState };
        if (!this.devices[deviceId]) this.devices[deviceId] = {};
        this.devices[deviceId].current_state = optimisticData;
        EVSE.ui.updateDetailPageUI(this, deviceId, 'current_state', optimisticData);
    }

    async clearSchedule(messageElement) {
        if (!this.activeModalDeviceId) {
            window.EVSE_showMessage(messageElement, 'Erro: Dispositivo não identificado.', 'error');
            return;
        }

        // Constrói o tópico de comando específico
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', this.activeModalDeviceId)
            .replace('{commandName}', 'schedule_clear');

        window.EVSE_showMessage(messageElement, 'Limpando agendamento...', 'info');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, {});

        // Otimização: Limpa o estado local para feedback visual instantâneo
        if (this.devices[this.activeModalDeviceId]) {
            this.devices[this.activeModalDeviceId].schedule = { start: '', end: '', weekdays: [] };
        }

        setTimeout(() => this.closeModal(document.getElementById('schedule-modal')), 1500);
    }

    async saveSchedule(form, messageElement) {
        // 1. Verifica se temos um dispositivo ativo para configurar
        if (!this.activeModalDeviceId) {
            window.EVSE_showMessage(messageElement, 'Erro: Dispositivo não identificado.', 'error');
            return;
        }

        // 2. Coleta os valores dos seletores de hora e minuto
        const startH = form.querySelector('#hours-schedule-start').value;
        const startM = form.querySelector('#minutes-schedule-start').value;
        const endH = form.querySelector('#hours-schedule-end').value;
        const endM = form.querySelector('#minutes-schedule-end').value;

        // 3. Validação: Garante que todos os campos de horário foram preenchidos
        if (startH === '' || startM === '' || endH === '' || endM === '') {
            window.EVSE_showMessage(messageElement, 'Por favor, preencha os horários de início e fim.', 'error');
            return;
        }

        // 4. Monta o objeto 'payload' no formato JSON que o backend espera
        const payload = {
            start: `${startH}:${startM}`,
            end: `${endH}:${endM}`,
            weekdays: Array.from(form.querySelectorAll('input[name="weekday"]:checked')).map(chk => Number(chk.value))
        };

        // 5. Constrói o tópico de comando MQTT correto
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', this.activeModalDeviceId)
            .replace('{commandName}', 'schedule'); // Corresponde ao nome do comando no backend

        // 6. Envia a mensagem e dá feedback ao usuário
        window.EVSE_showMessage(messageElement, 'Salvando agendamento...', 'info');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, payload);

        // 7. Otimização (UI Otimista): Atualiza o estado local imediatamente.
        // Isso faz com que, se o usuário reabrir o modal rapidamente, os novos dados já apareçam,
        // mesmo antes da confirmação do backend chegar.
        if (this.devices[this.activeModalDeviceId]) {
            this.devices[this.activeModalDeviceId].schedule = payload;
        }

        // 8. Fecha o modal após um curto período
        setTimeout(() => this.closeModal(document.getElementById('schedule-modal')), 1500);
    }

    saveWifi(form, messageElement) {
        if (!this.activeModalDeviceId) {
            console.error("Nenhum deviceId ativo para salvar o Wi-Fi.");
            window.EVSE_showMessage(messageElement, 'Erro: Dispositivo não selecionado.', 'error');
            return;
        }

        const formData = new FormData(form);
        const ssid = formData.get('ssid');
        const password = formData.get('password');

        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', this.activeModalDeviceId)
            .replace('{commandName}', 'wifi_save'); 

        window.EVSE_showMessage(messageElement, 'Salvando credenciais...', 'info');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { ssid, password });
        
        setTimeout(() => {
            window.EVSE_showMessage(messageElement, 'Comando enviado! O dispositivo irá reiniciar se as credenciais estiverem corretas.', 'success');
        }, 1000);

        setTimeout(() => {
            this.closeModal(document.getElementById('wifi-config-modal'));
        }, 3000);
    }

    saveRfidConfig(messageElement) {
        // 1. Verifica se temos um dispositivo ativo para o qual salvar a configuração
        if (!this.activeModalDeviceId) {
            window.EVSE_showMessage(messageElement, 'Erro: Dispositivo não identificado.', 'error');
            return;
        }

        // 2. Pega o estado do toggle 'rfidEnabled'
        const rfidEnabledToggle = document.getElementById('rfid-enabled');
        const isEnabled = rfidEnabledToggle ? rfidEnabledToggle.checked : false;

        // 3. Validação: Se o RFID está sendo ativado, deve haver pelo menos um cartão.
        if (isEnabled && this.registeredCards.length === 0) {
            window.EVSE_showRfidMessage('Para ativar o RFID, é necessário cadastrar pelo menos um cartão.', 'error');
            return; // Interrompe o salvamento
        }

        // 4. Monta o payload com o estado do toggle e a lista de cartões.
        // A lista `this.registeredCards` já foi atualizada pelos métodos `addCard` e `removeCard`.
        const payload = {
            rfidEnabled: isEnabled,
            cards: this.registeredCards
        };

        // 5. Constrói o tópico de comando MQTT correto
        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', this.activeModalDeviceId)
            .replace('{commandName}', 'save_rfid_config');

        // 6. Envia a mensagem e dá feedback ao usuário
        window.EVSE_showMessage(messageElement, 'Salvando configurações RFID...', 'info');
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, payload);

        // 7. Fecha o modal após um curto período
        setTimeout(() => {
            this.closeModal(document.getElementById('rfid-config-modal'));
        }, 1500);
    }

    setRfidCadastroMode(isCadastro) {
        if (!this.activeModalDeviceId) return;

        const commandTopic = MQTT_CONFIG.topics.commandTemplate
            .replace('{deviceId}', this.activeModalDeviceId)
            .replace('{commandName}', 'set_rfid_register_mode');

        console.log(`Enviando comando para modo de cadastro RFID: ${isCadastro}`);
        window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { cadastro: isCadastro });
    }

    setupModals() {
        this.setupScheduleModal();
        this.setupWifiModal();
        this.setupRfidModal();
        this.setupConsoleModal();

        const wifiModal = document.getElementById('wifi-config-modal');
        const wifiForm = document.getElementById('wifi-config-form');
        const wifiCloseBtn = wifiModal?.querySelector('.modal-close');
        const wifiMessage = document.getElementById('form-message');

        wifiCloseBtn?.addEventListener('click', () => this.closeModal(wifiModal));
        wifiModal?.addEventListener('click', (e) => { if (e.target === wifiModal) this.closeModal(wifiModal); });
        wifiForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveWifi(wifiForm, wifiMessage);
        });
    }

    setupScheduleModal() {
        const modal = document.getElementById('schedule-modal');
        const form = document.getElementById('schedule-form');
        const closeBtn = document.getElementById('btn-close-schedule');
        const message = document.getElementById('schedule-message');

        // Se os listeners já foram adicionados, não faz nada para evitar duplicatas.
        if (modal.dataset.listenersAdded === 'true') {
            return;
        }

        this.populateScheduleTimeSelects();
        closeBtn?.addEventListener('click', () => this.closeModal(modal));
        window.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(modal); });

        form?.addEventListener('submit', (e) => {
            e.preventDefault(); // Previne o recarregamento da página

            // e.submitter nos diz qual botão <button type="submit"> foi clicado.
            const clickedButton = e.submitter;
            if (!clickedButton) return;

            // Verifica o atributo 'name' do botão que foi clicado
            if (clickedButton.name === 'clear') {
                console.log("Botão 'Limpar' clicado.");
                // Chama a versão corrigida de clearSchedule, sem o 'form'
                this.clearSchedule(message); 
            } else if (clickedButton.name === 'save') {
                console.log("Botão 'Salvar' clicado.");
                this.saveSchedule(form, message);
            }
        });

        // Marca que os listeners foram adicionados para não adicioná-los novamente.
        modal.dataset.listenersAdded = 'true';
    }

    setupWifiModal() {
        const modal = document.getElementById('wifi-config-modal');
        const form = document.getElementById('wifi-config-form');
        const closeBtn = document.getElementById('btn-close-modal');
        const message = document.getElementById('form-message');
        closeBtn?.addEventListener('click', () => this.closeModal(modal));
        window.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(modal); });
        form?.addEventListener('submit', (e) => { e.preventDefault(); this.saveWifi(form, message); });
    }

    setupRfidModal() {
        const modal = document.getElementById('rfid-config-modal');
        const form = document.getElementById('rfid-config-form');
        const closeBtn = document.getElementById('btn-close-rfid');
        const addCardBtn = document.getElementById('add-card-btn');
        const cardNameInput = document.getElementById('card-name');
        const cardIdInput = document.getElementById('card-id');
        
        // Pega a referência ao elemento de mensagem para feedback
        const messageElement = document.getElementById('rfid-form-message');

        closeBtn?.addEventListener('click', () => this.closeModal(modal));
        window.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(modal); });
        addCardBtn?.addEventListener('click', () => this.addCard());
        cardNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); cardIdInput.focus(); } });
        cardIdInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addCard(); } });
        
        form?.addEventListener('submit', (e) => {
            e.preventDefault(); 
            this.saveRfidConfig(messageElement);
        });
        
        EVSE.ui.renderCardsList(this);
    }

    setupConsoleModal() {
        const modal = document.getElementById('console-modal');
        const closeBtn = document.getElementById('btn-close-console');
        const clearBtn = document.getElementById('btn-clear-console');
        const copyBtn = document.getElementById('btn-copy-console');
        const filterSelect = document.getElementById('console-filter-tag');
        const searchInput = document.getElementById('console-search');
        const commandInput = document.getElementById('console-command-input');
        const sendCommandBtn = document.getElementById('btn-send-command');

        if (!modal) return;

        // Event listeners
        closeBtn?.addEventListener('click', () => this.closeModal(modal));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal(modal);
        });

        // Botão para limpar console
        clearBtn?.addEventListener('click', () => {
            this.consoleMessages = [];
            this.updateConsoleDisplay();
            //this.showConsoleMessage('Console limpo', 'info');
        });

        // Botão para copiar log
        copyBtn?.addEventListener('click', () => {
            const logText = this.consoleMessages
                .map(msg => `[${msg.timestamp}] [${msg.tag}] ${msg.message}`)
                .join('\n');
            
            navigator.clipboard.writeText(logText)
                .then(() => this.showConsoleMessage('Log copiado para a área de transferência', 'success'))
                .catch(err => {
                    console.error('Erro ao copiar:', err);
                    this.showConsoleMessage('Erro ao copiar log', 'error');
                });
        });

        // Filtro por tag
        filterSelect?.addEventListener('change', (e) => {
            this.consoleFilterTag = e.target.value;
            this.updateConsoleDisplay();
        });

        // Busca nas mensagens
        searchInput?.addEventListener('input', (e) => {
            this.consoleSearchTerm = e.target.value.toLowerCase();
            this.updateConsoleDisplay();
        });

        // Envio de comando
        const sendConsoleCommand = () => {
            const command = commandInput.value.trim();
            if (!command) return;

            // Obtém o deviceId do modal
            const consoleModal = document.getElementById('console-modal');
            const deviceId = consoleModal.dataset.deviceId;

            if (!deviceId) {
                this.showConsoleMessage('Nenhum dispositivo selecionado', 'warning');
                return;
            }

            // Processa comandos locais primeiro
            if (this.processLocalConsoleCommand(command)) {
                commandInput.value = '';
                return;
            }

            // Envia o comando para o dispositivo específico
            const commandTopic = MQTT_CONFIG.topics.commandTemplate
                .replace('{deviceId}', deviceId)
                .replace('{commandName}', 'console_input');
            
            window.EVSE_MQTT_MANAGER.publishMessage(this.mqttClient, commandTopic, { command });
            this.addConsoleMessage('USER', `Comando enviado: ${command}`, deviceId);

            commandInput.value = '';
        };

        sendCommandBtn?.addEventListener('click', sendConsoleCommand);
        commandInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendConsoleCommand();
        });

        // Atualiza status da conexão
        this.updateConsoleConnectionStatus();
    }

    processLocalConsoleCommand(command) {
        const lowerCommand = command.toLowerCase();
        const consoleModal = document.getElementById('console-modal');
        const currentDeviceId = consoleModal?.dataset.deviceId;
        
        switch (lowerCommand) {
            case 'help':
                this.showLocalHelp();
                return true;
                
            case 'clear':
                this.consoleMessages = [];
                this.updateConsoleDisplay();
                return true;
                
            case 'version':
                this.addConsoleMessage('SYS', 'EVSE Dashboard v1.0.0', currentDeviceId);
                return true;
                
            case 'devices':
                const deviceCount = Object.keys(this.devices).length;
                this.addConsoleMessage('SYS', `${deviceCount} dispositivo(s) conectado(s):`, currentDeviceId);
                Object.keys(this.devices).forEach(id => {
                    const device = this.devices[id];
                    this.addConsoleMessage('SYS', `  ${id}: ${device.name} (${device.online ? 'Online' : 'Offline'})`, currentDeviceId);
                });
                return true;
                
            case 'stats':
                const onlineCount = Object.values(this.devices).filter(d => d.online).length;
                this.addConsoleMessage('SYS', `Estatísticas do Sistema:`, currentDeviceId);
                this.addConsoleMessage('SYS', `  Dispositivos: ${Object.keys(this.devices).length}`, currentDeviceId);
                this.addConsoleMessage('SYS', `  Online: ${onlineCount}`, currentDeviceId);
                this.addConsoleMessage('SYS', `  Mensagens no console: ${this.consoleMessages.filter(msg => !msg.deviceId || msg.deviceId === currentDeviceId).length}`, currentDeviceId);
                return true;
            
            case 'tglblock':
                this.alternarBloqueio(currentDeviceId);
                this.addConsoleMessage('SYS', 'toggle block', currentDeviceId);
                return true;
            
            case 'force_charge 1':
                this.forceCharge(currentDeviceId, true);
                this.addConsoleMessage('SYS', 'force charge ON', currentDeviceId);
                return true;

            case 'force_charge 0':
                this.forceCharge(currentDeviceId, false);
                this.addConsoleMessage('SYS', 'force charge OFF', currentDeviceId);
                return true;

            case 'force_error':
                this.forceError(currentDeviceId);
                this.addConsoleMessage('SYS', 'forcing error state..', currentDeviceId);
                return true;
            
            case 'reset_rfid':
                this.resetRfid(currentDeviceId);
                this.addConsoleMessage('SYS', 'running resetrfid..', currentDeviceId);
                return true;
            
            case 'reset':
                this.resetEvse(currentDeviceId);
                this.addConsoleMessage('SYS', 'running reset evse..', currentDeviceId);
                return true;

            case 'rainbow':
                this.toggleRainbow(currentDeviceId);
                this.addConsoleMessage('SYS', 'toggle rainbow', currentDeviceId);
                return true;
            
            case 'gfci_test':
                this.gfciSelfTest(currentDeviceId);
                this.addConsoleMessage('SYS', 'running GFCI self-test..', currentDeviceId);
                return true;

            case 'calibrate_current_offset':
                this.calibrateCurrent(currentDeviceId);
                this.addConsoleMessage('SYS', 'calibrating current..', currentDeviceId);
                return true;
        }
        
        return false;
    }

    showLocalHelp() {
        const consoleModal = document.getElementById('console-modal');
        const currentDeviceId = consoleModal?.dataset.deviceId;

        this.addConsoleMessage('SYS', 'Comandos locais disponíveis:', currentDeviceId);
        this.addConsoleMessage('SYS', 'help ------------------------ Mostra esta ajuda', currentDeviceId);
        this.addConsoleMessage('SYS', 'clear ----------------------- Limpa o console', currentDeviceId);
        this.addConsoleMessage('SYS', 'version --------------------- Mostra versão do dashboard', currentDeviceId);
        this.addConsoleMessage('SYS', 'devices --------------------- Lista dispositivos conectados', currentDeviceId);
        this.addConsoleMessage('SYS', 'stats ----------------------- Mostra estatísticas do sistema', currentDeviceId);
        this.addConsoleMessage('SYS', 'tglblock -------------------- Toggle bloqueio', currentDeviceId);
        this.addConsoleMessage('SYS', 'force_charge 1 -------------- Força início de carregamento', currentDeviceId);
        this.addConsoleMessage('SYS', 'force_charge 0 -------------- Força parada de carregamento', currentDeviceId);
        this.addConsoleMessage('SYS', 'force_error ----------------- Força estado de erro ESTADO_F', currentDeviceId);
        this.addConsoleMessage('SYS', 'reset_rfid ------------------ Reseta configuração RFID', currentDeviceId);
        this.addConsoleMessage('SYS', 'reset ------------------------ Reseta o EVSE', currentDeviceId);
        this.addConsoleMessage('SYS', 'gfci_test -------------------- Inicia auto-teste do GFCI', currentDeviceId);
        this.addConsoleMessage('SYS', 'calibrate_current_offset ----- Inicia calibração de corrente', currentDeviceId);
        this.addConsoleMessage('SYS', '1.0', currentDeviceId);
    }

    addConsoleMessage(tag, message, sourceDeviceId = null) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('pt-BR', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const consoleMessage = {
            timestamp,
            tag: tag.toUpperCase(),
            message,
            deviceId: sourceDeviceId, // Armazena qual dispositivo enviou
            id: Date.now() + Math.random().toString(36).substr(2, 9)
        };

        // Adiciona à lista de mensagens
        this.consoleMessages.push(consoleMessage);
        
        // Mantém o limite de mensagens
        if (this.consoleMessages.length > this.consoleMaxMessages) {
            this.consoleMessages.shift();
        }

        // Adiciona tag ao conjunto de tags
        this.consoleTags.add(tag.toUpperCase());

        // Atualiza o filtro de tags
        this.updateConsoleTagFilter();

        // Atualiza a exibição
        this.updateConsoleDisplay();

        // Se o console estiver aberto, rola para a mensagem mais recente
        const consoleModal = document.getElementById('console-modal');
        if (consoleModal && consoleModal.classList.contains('show')) {
            setTimeout(() => {
                const output = document.getElementById('console-output');
                if (output) {
                    output.scrollTop = output.scrollHeight;
                }
            }, 10);
        }
    }

    /**
     * Atualiza o filtro de tags do console
     */
    updateConsoleTagFilter() {
        const filterSelect = document.getElementById('console-filter-tag');
        if (!filterSelect) return;

        // Salva a seleção atual
        const currentSelection = filterSelect.value;

        // Limpa as opções, mantendo apenas "Todas as tags"
        filterSelect.innerHTML = '<option value="all">Todas as tags</option>';

        // Adiciona as tags em ordem alfabética
        Array.from(this.consoleTags).sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            filterSelect.appendChild(option);
        });

        // Restaura a seleção anterior, se ainda existir
        if (currentSelection && Array.from(filterSelect.options).some(opt => opt.value === currentSelection)) {
            filterSelect.value = currentSelection;
        } else {
            filterSelect.value = 'all';
        }
        this.consoleFilterTag = filterSelect.value;
    }

    /**
     * Atualiza a exibição do console
     */
    updateConsoleDisplay() {
        const outputElement = document.getElementById('console-output');
        const consoleModal = document.getElementById('console-modal');

        if (!outputElement || !consoleModal) return;

        // Obtém o deviceId do modal atual
        const currentDeviceId = consoleModal.dataset.deviceId;

        // Filtra as mensagens
        let filteredMessages = this.consoleMessages;
        
        // Filtro 1: Por dispositivo (mostra apenas mensagens do dispositivo atual ou sem deviceId)
        if (currentDeviceId) {
            filteredMessages = filteredMessages.filter(msg => 
                !msg.deviceId || msg.deviceId === currentDeviceId
            );
        }
        
        // Filtro 2: Por tag
        if (this.consoleFilterTag !== 'all') {
            filteredMessages = filteredMessages.filter(msg => msg.tag === this.consoleFilterTag);
        }
        
        // Filtro 3: Por busca
        if (this.consoleSearchTerm) {
            const searchTerm = this.consoleSearchTerm.toLowerCase();
            filteredMessages = filteredMessages.filter(msg => 
                msg.message.toLowerCase().includes(searchTerm) ||
                msg.tag.toLowerCase().includes(searchTerm) ||
                (msg.deviceId && msg.deviceId.toLowerCase().includes(searchTerm))
            );
        }

        // Se não houver mensagens após filtro
        if (filteredMessages.length === 0) {
            if (this.consoleSearchTerm || this.consoleFilterTag !== 'all') {
                outputElement.innerHTML = `
                    <div class="console-empty-state">
                        <i class="fas fa-search"></i>
                        <p>Nenhuma mensagem encontrada</p>
                        <small>Tente ajustar os filtros de busca</small>
                    </div>
                `;
            } else {
                outputElement.innerHTML = `
                    <div class="console-empty-state">
                        <i class="fas fa-terminal"></i>
                        <p>Aguardando mensagens do console...</p>
                        <small>As mensagens de debug aparecerão aqui automaticamente</small>
                    </div>
                `;
            }
            return;
        }

        // Renderiza as mensagens
        outputElement.innerHTML = filteredMessages.map(msg => {
            const tagClass = window.EVSE_getTagClass(msg.tag);
            const messageHtml = window.EVSE_escapeHtml(msg.message);

            let deviceBadge = '';
            if (msg.deviceId) {
                if (window.EVSE_isMobile()) {
                    // Mobile: mostra apenas últimos 4 caracteres
                    deviceBadge = `<span class="console-device-badge mobile" title="Dispositivo: ${msg.deviceId}">
                        ${msg.deviceId.slice(-4)}
                    </span>`;
                } else {
                    // Desktop: mostra últimos 6 caracteres
                    deviceBadge = `<span class="console-device-badge desktop" title="Dispositivo: ${msg.deviceId}">
                        ${msg.deviceId.slice(-6)}
                    </span>`;
                }
            }
            
            return `
                <div class="console-message" 
                        data-id="${msg.id}"
                        data-device-id="${msg.deviceId || ''}"
                        data-timestamp="${msg.timestamp}">
                    <span class="console-timestamp">[${msg.timestamp}]</span>
                    ${deviceBadge}
                    <span class="console-tag ${tagClass}">${msg.tag}</span>
                    <span class="console-text">${messageHtml}</span>
                </div>
            `;
        }).join('');

        // Restante do código permanece igual...
        setTimeout(() => {
            if (this.messageObserver) {
                this.messageObserver.disconnect();
                
                document.querySelectorAll('.console-message').forEach(msg => {
                    const messageId = msg.dataset.id;
                    
                    if (messageId && !this.observedMessages.has(messageId)) {
                        this.messageObserver.observe(msg);
                    }
                });
            }
        }, 0);

        if (consoleModal.classList.contains('show')) {
            const output = document.getElementById('console-output');
            if (output) {
                const isNearBottom = (output.scrollHeight - output.scrollTop - output.clientHeight) < 50;
                if (isNearBottom) {
                    setTimeout(() => {
                        output.scrollTop = output.scrollHeight;
                    }, 10);
                }
            }
        }
    }

    /**
     * Atualiza o status da conexão no console
     */
    updateConsoleConnectionStatus() {
        const statusElement = document.getElementById('console-connection-status');
        if (!statusElement) return;

        const isConnected = this.mqttClient && this.mqttClient.isConnected();
        
        if (isConnected) {
            statusElement.innerHTML = '<i class="fas fa-wifi"></i> Conectado';
            statusElement.className = 'status-badge status-online';
        } else {
            statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Desconectado';
            statusElement.className = 'status-badge status-offline';
        }
    }

    /**
     * Mostra uma mensagem temporária no console
     */
    showConsoleMessage(message, type = 'info') {
        const tag = type.toUpperCase();
        this.addConsoleMessage(tag, message);
    }

    /**
     * Abre o modal do console
     */
    openConsoleModal(deviceId) {
        this.activeModalDeviceId = deviceId;
        const modal = document.getElementById('console-modal');
        const deviceName = this.devices[deviceId]?.name || deviceId;
        
        if (modal) {
            // Atualiza o título do modal com o nome do dispositivo
            const title = modal.querySelector('.modal-title');
            if (title) {
                title.textContent = `Console - ${deviceName}`;
            }
            
            // Armazena o deviceId no próprio modal para referência
            modal.dataset.deviceId = deviceId;
            
            this.showModal(modal);
            
            // Atualiza a conexão MQTT no console
            this.updateConsoleConnectionStatus();
            
            // Atualiza a exibição
            this.updateConsoleDisplay();
            
            // Foca no input de comando
            setTimeout(() => {
                const commandInput = document.getElementById('console-command-input');

                const output = document.getElementById('console-output');
                if (output) {
                    output.scrollTop = output.scrollHeight;
                }
            }, 100);
        }
    }

    /**
     * Processa mensagens recebidas do tópico console_output
     */
    handleConsoleMessage(deviceId, data) {
        // Adiciona a mensagem ao console
        this.addConsoleMessage(data.tag, data.message, deviceId);
        
        // Se o console estiver aberto para este dispositivo, atualiza automaticamente
        const consoleModal = document.getElementById('console-modal');
        if (consoleModal && consoleModal.classList.contains('show') && 
            consoleModal.activeModalDeviceId === deviceId) {
            this.updateConsoleDisplay();
        }
    }

    populateScheduleTimeSelects() {
        const fillSelect = (select, max) => {
            if (!select || select.children.length) return;
            select.innerHTML = `<option value="" disabled selected>--</option>`;
            for (let i = 0; i < max; i++) select.innerHTML += `<option value="${i}">${String(i).padStart(2, '0')}</option>`;
        };
        fillSelect(document.getElementById('hours-schedule-start'), 24);
        fillSelect(document.getElementById('minutes-schedule-start'), 60);
        fillSelect(document.getElementById('hours-schedule-end'), 24);
        fillSelect(document.getElementById('minutes-schedule-end'), 60);
    }

    openScheduleModal(deviceId) {
        // 1. Armazena o ID do dispositivo que está sendo configurado
        this.activeModalDeviceId = deviceId;
        const device = this.devices[deviceId];

        // 2. Se não tivermos dados do dispositivo ou do agendamento, usa valores padrão
        const scheduleData = device?.schedule || { start: '', end: '', weekdays: [] };

        const modal = document.getElementById('schedule-modal');
        const form = document.getElementById('schedule-form');

        // 3. Função para preencher os seletores de hora/minuto
        const setSelects = (prefix, time) => {
            const hoursSelect = form.querySelector(`#hours-schedule-${prefix}`);
            const minutesSelect = form.querySelector(`#minutes-schedule-${prefix}`);
            
            if (!time || time === '--:--' || time.split(':').length !== 2) {
                hoursSelect.value = '';
                minutesSelect.value = '';
            } else {
                const [hh, mm] = time.split(':');
                hoursSelect.value = parseInt(hh, 10);
                minutesSelect.value = parseInt(mm, 10);
            }
        };

        // 4. Preenche os horários de início e fim
        setSelects('start', scheduleData.start);
        setSelects('end', scheduleData.end);

        // 5. Preenche os checkboxes dos dias da semana
        const allCheckboxes = form.querySelectorAll('input[name="weekday"]');
        allCheckboxes.forEach(cb => {
            // Verifica se o valor do checkbox (0-6) está no array de weekdays do dispositivo
            const isChecked = Array.isArray(scheduleData.weekdays) && scheduleData.weekdays.includes(parseInt(cb.value, 10));
            cb.checked = isChecked;
        });

        window.EVSE_clearMessage('schedule-message');
        this.showModal(modal);
    }

    openWifiModal(deviceId) {
        this.activeModalDeviceId = deviceId;
        const device = this.devices[deviceId];

        const modal = document.getElementById('wifi-config-modal');
        const form = document.getElementById('wifi-config-form');

        if (form) form.reset();
        window.EVSE_clearMessage('form-message'); 

        const wifiInfo = device?.wifi_info || { ssid: null };
        const ssidDisplayElement = form.querySelector('#current-ssid-display');

        if (ssidDisplayElement) {
            if (wifiInfo.ssid && wifiInfo.ssid !== 'N/A') {
                // Se temos um SSID, mostramos ele
                ssidDisplayElement.textContent = wifiInfo.ssid;
                ssidDisplayElement.classList.remove('loading');
            } else {
                // Se não, mostramos uma mensagem padrão
                ssidDisplayElement.textContent = 'Nenhuma rede conectada';
                ssidDisplayElement.classList.add('loading');
            }
        }

        this.showModal(modal);
    }

    openRfidModal(deviceId) {
        // 1. Armazena o ID do dispositivo que estamos configurando.
        // Isso será crucial para os próximos passos (salvar a configuração).
        this.activeModalDeviceId = deviceId;
        const device = this.devices[deviceId];

        // 2. Pega os dados de configuração RFID do objeto do dispositivo.
        // Seu `handleMqttMessage` já armazena os dados recebidos em `device.rfid_config`.
        // Se `rfid_config` não existir, usamos um objeto padrão para evitar erros.
        const rfidConfig = device?.rfid_config || { rfidEnabled: false, cards: [] };

        const modal = document.getElementById('rfid-config-modal');
        const form = document.getElementById('rfid-config-form');

        // 3. Define o estado do toggle (ativado/desativado)
        const rfidEnabledToggle = form.querySelector('#rfid-enabled');
        if (rfidEnabledToggle) {
            rfidEnabledToggle.checked = rfidConfig.rfidEnabled;
        }

        // 4. Armazena a lista de cartões recebida em uma propriedade da classe.
        // Isso facilita o gerenciamento (adicionar/remover cartões) nos próximos passos.
        this.registeredCards = rfidConfig.cards || [];
        
        // 5. Chama a função que renderiza a lista de cartões na tela.
        // Seu código já possui o método `renderCardsList`, que fará o trabalho pesado.
        EVSE.ui.renderCardsList(this);

        // 6. Limpa os campos de input e mensagens de erro antigas
        const cardNameInput = form.querySelector('#card-name');
        const cardIdInput = form.querySelector('#card-id');
        if (cardNameInput) cardNameInput.value = '';
        if (cardIdInput) cardIdInput.value = '';
        window.EVSE_clearMessage('rfid-form-message');
        
        // 7. Mostra o modal para o usuário
        this.showModal(modal);
        
        // 8. Ativa o modo de cadastro no backend (será implementado no Passo 3)
        // Por enquanto, vamos deixar comentado para não causar erros.
        this.setRfidCadastroMode(true); 
    }

    showModal(modal) {
        this.elementToFocusOnModalClose = document.activeElement;
        modal.style.display = 'flex';

        setTimeout(() => {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');

            const firstFocusableElement = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (firstFocusableElement) {
                firstFocusableElement.focus();
            }
        }, 10);        
    }

    closeModal(modal) {
        if (!modal) return;

        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');

        if (this.elementToFocusOnModalClose) {
            this.elementToFocusOnModalClose.focus();
        }

        const messageElement = modal.querySelector('.form-message');
        if (messageElement && messageElement.id) {
            setTimeout(() => {
                window.EVSE_clearMessage(messageElement.id);
            }, 250); 
        }

        if (modal.id === 'rfid-config-modal') {
            this.setRfidCadastroMode(false); 
        }

        setTimeout(() => {
            modal.style.display = 'none';
        }, 250);
    }

    updateConnectionStatus(connected, statusText) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            const icon = statusElement.querySelector('.fas');
            const text = statusElement.querySelector('span');
            if (connected) {
                icon.style.color = 'var(--secondary-color)';
                text.textContent = statusText;
            } else {
                icon.style.color = 'var(--danger-color)';
                text.textContent = statusText;
            }
        }
    }

    addCard() {
        const cardNameInput = document.getElementById('card-name');
        const cardIdInput = document.getElementById('card-id');
        const cardName = cardNameInput.value.trim();
        const cardId = cardIdInput.value.trim().toUpperCase();

        if (!cardName) {
            window.EVSE_showRfidMessage('Por favor, insira um nome para o cartão.', 'error');
            return;
        }
        if (!cardId || !window.EVSE_validateCardId(cardId)) {
            window.EVSE_showRfidMessage('ID do cartão inválido.', 'error');
            return;
        }
        if (this.registeredCards.some(card => card.id === cardId)) {
            window.EVSE_showRfidMessage('Este cartão já está cadastrado.', 'error');
            return;
        }

        this.registeredCards.push({ id: cardId, name: cardName });
        EVSE.ui.renderCardsList(this);
        cardNameInput.value = '';
        cardIdInput.value = '';
        window.EVSE_showRfidMessage(`Cartão "${cardName}" adicionado. Salve para aplicar.`, 'info');
    }

    removeCard(cardId) {
        const cardIndex = this.registeredCards.findIndex(card => card.id === cardId);
        if (cardIndex > -1) {
            const removedCard = this.registeredCards.splice(cardIndex, 1)[0];
            EVSE.ui.renderCardsList(this);
            window.EVSE_showRfidMessage(`Cartão "${removedCard.name}" removido. Salve para aplicar.`, 'info');
        }
    }

    saveRfidConfigToStorage() {
        try {
            const rfidEnabledToggle = document.getElementById('rfid-enabled');
            const configData = {
                rfidEnabled: rfidEnabledToggle ? rfidEnabledToggle.checked : false,
                registeredCards: this.registeredCards || []
            };
            localStorage.setItem('rfidConfig', JSON.stringify(configData));
        } catch (e) { console.error('Erro ao salvar configurações RFID no localStorage:', e); }
    }

    // Cleanup
    destroy() {
        console.log("dstroy chamado");
        if (this.clockInterval) clearInterval(this.clockInterval);
        if (this.rtcSyncInterval) clearInterval(this.rtcSyncInterval);
        if (this.chart1) this.chart1.destroy();
        if (this.mqttClient && this.mqttClient.isConnected()) {
            this.mqttClient.disconnect();
        }
    }

    /**
     * Atualiza o elemento de tempo na UI para um dispositivo específico.
     * Este é um método auxiliar interno.
     * @param {string} deviceId - O ID do dispositivo cuja UI será atualizada.
     * @param {string} formattedTime - A string de tempo já formatada (ex: "00:05:32").
     */
    _updateTimerUI(deviceId, formattedTime) {
        // 1. Encontra a página de detalhes específica para este dispositivo.
        const page = document.getElementById(`page-detail-${deviceId}`);

        // 2. Condição de segurança: Procede apenas se a página existir E estiver ativa (visível).
        if (page && page.classList.contains('active')) {
            
            // 3. Encontra o elemento específico que mostra o tempo da sessão.
            // Baseado no seu código, este é o elemento com a classe '.detail-sub-text'.
            const timeElement = page.querySelector('.detail-sub-text');

            // 4. Outra condição de segurança: Procede apenas se o elemento de tempo for encontrado.
            if (timeElement) {
                // 5. Atualiza o conteúdo do texto do elemento.
                timeElement.textContent = `Sessão: ${formattedTime}`;
            }
        }
    }

    /**
     * Gerencia o ciclo de vida do cronômetro de sessão para um dispositivo.
     * Inicia, continua ou para o timer com base no startTimeStr.
     * @param {string} deviceId - O ID do dispositivo.
     * @param {string | null} startTimeStr - A string de data/hora ISO 8601 do início da sessão, ou null para parar o timer.
     */
    manageSessionTimer(deviceId, startTimeStr) {
        // 1. Limpa qualquer timer que já esteja rodando para este dispositivo.
        // Isso é crucial para evitar timers duplicados.
        if (this.sessionTimers[deviceId]) {
            clearInterval(this.sessionTimers[deviceId]);
        }

        // 2. Se startTimeStr for nulo ou vazio, a sessão terminou.
        // Apenas paramos o timer e removemos a referência.
        if (!startTimeStr) {
            delete this.sessionTimers[deviceId];
            //console.log(`Timer da sessão para ${deviceId} parado.`);
            return; // Encerra a execução do método aqui.
        }

        console.log(`Iniciando/Continuando timer da sessão para ${deviceId}...`);
        
        // 3. Converte a string de data recebida (que vem do MQTT) em um objeto Date do JavaScript.
        const startTime = new Date(startTimeStr);

        // 4. Inicia um novo timer que executa uma função a cada 1000 milissegundos (1 segundo).
        // E armazena o ID retornado por setInterval no nosso objeto de controle.
        this.sessionTimers[deviceId] = setInterval(() => {
            // O código dentro desta função será executado repetidamente a cada segundo.

            // a. Chama o método do Passo 1 para calcular o tempo decorrido.
            const formattedTime = window.EVSE_formatElapsedTime(startTime);
            
            // b. Chama o método do Passo 2 para atualizar a UI com o tempo calculado.
            this._updateTimerUI(deviceId, formattedTime);

        }, 1000);
    } 

    
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new EVSEDashboard();
});

window.addEventListener('beforeunload', () => {
    window.dashboard?.destroy();
});

