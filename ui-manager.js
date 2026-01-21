// ui-navigation.js 

import { ESTADOS_NOMES } from './config.js';

export const pageRegistry = {
    lastPage: null,
    currentPage: null
};

/**
 * ==============================================================
 * Função responsável por configurar a navegação entre páginas
 * ==============================================================
 */
export function setupNavigation(dashboardInstance) {

    const navButtons = document.querySelectorAll('.nav-button');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {

            const pageName = button.id.replace('nav-', '');
            const pageId = `page-${pageName}`;

            let page = document.getElementById(pageId);

            if (!page) {
                const template = document.getElementById(`${pageId}-template`);
                if (template) {
                    const container = document.getElementById('page-container');
                    const clone = template.content.cloneNode(true);
                    container.appendChild(clone);
                }
            }
            navigateToPage(dashboardInstance, pageId);

            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });
}

/**
 * ==============================================================
 * Função responsável por navegar para a página especificada
 * ==============================================================
 */
export function navigateToPage(dashboardInstance, pageId) {
    hideAllPages();

    // Mostra a nova página
    const newPage = showPage(pageId);

    if (!newPage) return;

    // Atualiza estado de navegação
    pageRegistry.lastPage = pageRegistry.currentPage;
    pageRegistry.currentPage = pageId;

    if (pageId === 'page-home' && dashboardInstance && dashboardInstance.devices) {
        // Configura o gráfico agregado na página inicial
        //console.log("Navegando para a página inicial, configurando gráfico homeChart.");
        setupHomeChart(dashboardInstance, newPage);
    }
    // Atualiza comportamento de pull-to-refresh
    updatePullToRefresh(dashboardInstance, pageId);
}

/**
 * ==============================================================
 * Função responsável por esconder todas as páginas
 * ==============================================================
 */

export function hideAllPages() {
    const pages = document.querySelectorAll('.app-page');
    pages.forEach(page => page.classList.remove('active'));
}

/**
 * ==============================================================
 * Função responsável por mostrar a página especificada
 * ==============================================================
 */

export function showPage(pageId) {
    const newPage = document.getElementById(pageId);
    
    if (!newPage) {
        console.warn(`Página '${pageId}' não encontrada:`, pageId);
        return null;
    }

    newPage.classList.add('active');
    return newPage;  // ← útil para próximas migrações
}

/**
 * ==============================================================
 * Função responsável por verificar se a página atual suporta
 * pull-to-refresh
 * ==============================================================
 */

export function isRefreshablePage(pageId) {
    const refreshablePages = ['page-home', 'page-history', 'page-stats'];
    return refreshablePages.includes(pageId);
}

/**
 * ==============================================================
 * Função responsável por ativar ou desativar o pull-to-refresh
 * dependendo da página atual.
 * ==============================================================
 */
export function updatePullToRefresh(dashboardInstance, pageId) {
    if (isRefreshablePage(pageId)) {
        if (window.EVSE_isMobile()) {
            dashboardInstance.activatePullToRefresh();
        } else {
            dashboardInstance.deactivatePullToRefresh();
        }
    } else {
        dashboardInstance.deactivatePullToRefresh();
    }
}


/**
 * ==============================================================
 * Função responsável por atualizar a cor da barra de status na página de detalhes.
 * ==============================================================
 */
export function updateDetailStatusBar(pageElement, stateClass) {
    const bar = pageElement.querySelector('.detail-status-bar');
    if (!bar) return;

    // Remove classes antigas
    bar.classList.remove('offline', 'locked', 'charging', 'fault', 'connected', 'available', 'pending');

    // Adiciona a nova classe
    bar.classList.add(stateClass);
}

/**
 * ==============================================================
 * Função responsável por atualizar o estado (ESTADO_A, ESTADO_B ...) na página inicial.
 * Atualiza o ícone, cores, nome do estado.
 * ==============================================================
 */
export function updateSummaryCardUI(devices, card, stateData, isOnline) {
    const iconContainer = card.querySelector('.summary-icon');
    const statusText = card.querySelector('.summary-status');

    iconContainer.className = 'summary-icon';

    const deviceId = card.dataset.deviceId;
    const blockState = devices[deviceId]?.block_state?.state;

    if (!isOnline) {
        iconContainer.classList.add('offline');
        statusText.textContent = 'Offline';
        iconContainer.innerHTML = `
            <span class="fa-stack" style="vertical-align: top;">
                <i class="fas fa-wifi fa-stack-1x" style="font-size: 1em;"></i>
                <i class="fas fa-slash fa-stack-1x" style="font-size: 0.9em; margin-top: -0.1em"></i>
            </span>
        `;
    } 

    else if (blockState === 'ESTADO_E') {
        iconContainer.classList.add('locked'); // Aplica a classe CSS laranja
        iconContainer.innerHTML = '<i class="fas fa-lock"></i>';
        statusText.textContent = 'ESTADO E'; // Atualiza o texto de status
    }

    else {
        if (stateData) {
            const nomeEstado = ESTADOS_NOMES[stateData.state] || 'Desconhecido';
            statusText.textContent = nomeEstado;

            let iconClass = '';
            let iconColorClass = '';

            if (nomeEstado === 'ESTADO A') {
                iconColorClass = 'available';
                iconClass = 'fas fa-power-off';
            } else if (nomeEstado === 'ESTADO E'){
                iconColorClass = 'locked';
                iconClass = 'fas fa-lock';
            } else if (nomeEstado === 'ESTADO C' || nomeEstado === 'ESTADO D') {
                iconColorClass = 'charging';
                iconClass = 'fas fa-bolt';
            } else if (nomeEstado === 'ESTADO F') {
                iconContainer.classList.add('fault');
                iconColorClass = 'fault';
                iconClass = 'fas fa-exclamation-triangle';
            } else if (nomeEstado === 'ESTADO B') {
                iconColorClass = 'connected';
                iconClass = 'fas fa-plug';
            } else {
                iconColorClass = 'fault';
                iconClass = 'fas fa-exclamation-triangle';
            }
            iconContainer.classList.add(iconColorClass);
            iconContainer.innerHTML = `<i class="${iconClass}"></i>`;
        } else {
            iconContainer.classList.add('pending');
            iconContainer.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            statusText.textContent = 'Aguardando status...';
        }
    }
    
    const powerData = devices[deviceId]?.charging_session;
    if (powerData) {
        const powerValue = powerData.power || 0.0;
        card.querySelector('.summary-power').textContent = `${powerValue.toFixed(1)} kW`;
    }
}

/**
 * ==============================================================
 * Função responsável por criar os cards de cada estação de recarga
 * Chamada sempre que uma nova estação for reconhecida
 * ==============================================================
 */
export function createDeviceCard(dashboardInstance, deviceId) {
    const container = document.querySelector('#page-home .device-list');
    const template = document.getElementById('device-card-summary-template');

    if (!container || !template) {
        console.error("Erro crítico: O container de dispositivos ou o template do card não foram encontrados no HTML.");
        return;
    }

    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.device-card-summary');

    card.dataset.deviceId = deviceId;  
    card.querySelector('.summary-name').textContent = dashboardInstance.devices[deviceId].name;

    card.addEventListener('click', () => {
        //console.log(`Clicou no card do dispositivo: ${deviceId}. Navegação a ser implementada.`);
        dashboardInstance.navigateToDetailPage(deviceId);
    });

    container.appendChild(card);
}

/**
 * ==============================================================
 * Função responsável por conectar os botões da páinga de detalhes 
 * com as funções que realizão as ações para aquele dispositivo
 * ==============================================================
 */
export function addDetailEventListeners(dashborad, pageElement, deviceId) {
    // Conecta os botões da página de detalhes às suas funções
    pageElement.querySelector('.block-btn').addEventListener('click', () => dashborad.alternarBloqueio(deviceId));
    pageElement.querySelector('.schedule-btn').addEventListener('click', () => dashborad.openScheduleModal(deviceId));
    pageElement.querySelector('.rfid-btn').addEventListener('click', () => dashborad.openRfidModal(deviceId));
    pageElement.querySelector('.wifi-btn')?.addEventListener('click', () => dashborad.openWifiModal(deviceId));
    pageElement.querySelector('.current-btn')?.addEventListener('click', () => dashborad.changeCurrent(deviceId));
    pageElement.querySelector('.debug-btn')?.addEventListener('click', () => dashborad.sendDebugCommand(deviceId));
    pageElement.querySelector('.console-btn')?.addEventListener('click', () => dashborad.openConsoleModal(deviceId));
    // ... adicione os outros botões (current, wifi, debug) aqui
}

/**
 * ==============================================================
 * Função responsável por configurar o gráfico que mostra as medidas
 * do sinal CP na página de detalhes
 * ==============================================================
 */
export function setupDetailChart(dashboardInstance, pageElement, deviceId) {
    const canvas = pageElement.querySelector('.evse-chart');
    if (!canvas) {
        console.error("Canvas para o gráfico de detalhes não encontrado!");
        return;
    }
    const ctx = canvas.getContext('2d');

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CP High',
                    data: [],
                    borderColor: '#2563eb', // Azul para CP High
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4
                },
                {
                    label: 'CP Low',
                    data: [],
                    borderColor: '#77a6dcff', // Vermelho para CP Low
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
                x: { display: true, 
                    ticks: {
                        maxTicksLimit: 6
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                    grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    labels: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-primary')
                    }
                }
            }
        }
    });

    // Armazena a instância do gráfico no objeto do dispositivo
    dashboardInstance.devices[deviceId].chart = chartInstance;
    //console.log(`Gráfico com CP High/Low inicializado para o dispositivo ${deviceId}.`);
}

/**
 * ==============================================================
 * Função responsável por configurar o gráfico que mostra o consumo
 * agregado na página inicial
 * ==============================================================
 */
export function setupHomeChart(dashboardInstance, pageElement) {
    const ctx = pageElement.querySelector('.home-chart');
    if (!ctx) return;
    
    if (dashboardInstance.homeChart) return;

    // Cria gradiente para efeito de fade
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, ctx.height);
    gradient.addColorStop(0, 'rgba(37, 99, 235, 0.4)'); // topo da curva
    gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');   // fade até transparente

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'kW',
                    data: [],
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    fill: true,           // ativa o preenchimento abaixo da curva
                    backgroundColor: gradient,
                    pointRadius: 0,       // remove as bolinhas
                    tension: 0
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
                x: { 
                    display: true,
                    ticks: {
                        maxTicksLimit: 6
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                    grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                }
            },
            plugins: {
                legend: { 
                    display: false,
                    labels: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-primary')
                    }
                },
                title: {
                    display: true,            // habilita o título
                    text: 'Consumo Total (kW)', // texto do título
                    color: getComputedStyle(document.body).getPropertyValue('--text-primary'), // cor
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 10,
                        bottom: 10
                    }
                }
            }
        }
    });

    // Armazena no dashboard
    dashboardInstance.homeChart = newChart;

    if (!dashboardInstance.homeChartInterval) {
        dashboardInstance.homeChartInterval = setInterval(() => {
            addHomeChartData(dashboardInstance);
        }, 1000);
    }
}



/**
 * ==============================================================
 * Função responsável por adicionar os valores no gráfico do CP 
 * (CP_HIGH e CP_LOW) na páina de detalhaes. 
 * ==============================================================
 */
export function addChartData(chartInstance, cpData) {
    if (!chartInstance || !cpData) {
        console.warn("addChartData foi chamada com uma instância de gráfico inválida ou dados ausentes.");
        return;
    }

    const highData = chartInstance.data.datasets[0].data;
    const lowData = chartInstance.data.datasets[1].data;
    const labels = chartInstance.data.labels;

    const MAX_POINTS = 50;
    
    // Adiciona novos dados e remove os mais antigos se necessário
    if (highData.length >= MAX_POINTS) {
        highData.shift();
        lowData.shift();
        labels.shift();
    }

    // Adiciona os novos valores de cp_high e cp_low
    highData.push(cpData.cp_high || 0);
    lowData.push(cpData.cp_low || 0);
    labels.push('');

    chartInstance.update();
    
    // Atualiza as médias se houver dados
    if (highData.length > 0 && lowData.length > 0) {
        const highSum = highData.reduce((total, currentValue) => total + currentValue, 0);
        const lowSum = lowData.reduce((total, currentValue) => total + currentValue, 0);
        
        const highAverage = highSum / highData.length;
        const lowAverage = lowSum / lowData.length;

        // Encontra os elementos para exibir as médias
        const chartContainer = chartInstance.canvas.parentNode;
        const pageContainer = chartContainer.closest('.app-page');
        const highAverageElement = pageContainer.querySelector('.cp-high-average-value');
        const lowAverageElement = pageContainer.querySelector('.cp-low-average-value');
        const peakToPeakElement = pageContainer.querySelector('.cp-peaktopeak-value');

        // Atualiza os elementos de média se existirem
        if (highAverageElement) {
            highAverageElement.textContent = `${highAverage.toFixed(0)} mV`;
        }
        if (lowAverageElement) {
            lowAverageElement.textContent = `${lowAverage.toFixed(0)} mV`;
        }
        if (peakToPeakElement) {
            const peakToPeak = Math.max(...highData) - Math.min(...highData);
            peakToPeakElement.textContent = `${peakToPeak.toFixed(0)} mV`;
        }
    }
}

/**
 * ============================================================== 
 * Função responsável por atualizar o gráfico de consumo agregado na página home
 * ============================================================== 
 */
export function addHomeChartData(dashboardInstance) {
    if (!dashboardInstance.homeChart) {
        console.log("Tentativa de adicionar dados, gráfico homeChart não inicializado!");
        return;
    }

    // Soma o power de todos os devices
    let totalPower = 0;
    for (const deviceId in dashboardInstance.devices) {
        const device = dashboardInstance.devices[deviceId];
        if (device.charging_session && device.charging_session.power) {
            totalPower += device.charging_session.power;
        }
    }

    const chart = dashboardInstance.homeChart;
    const labels = chart.data.labels;
    const dataset = chart.data.datasets[0].data;

    const MAX_POINTS = 100;

    // Remove dados mais antigos se necessário
    if (dataset.length >= MAX_POINTS) {
        dataset.shift();
        labels.shift();
    }

    // Adiciona novo ponto
    dataset.push(totalPower);
    labels.push(''); // ou use um timestamp se quiser mostrar eixo X

    chart.update();
}


/**
 * ==============================================================
 * Função responsável por atualizar a UI na página de detalhes.
 * Sem essa função, a página de detalhes não carrega.
 * ==============================================================
 */
export function updateDetailPageUI(dashboardInstance, deviceId, statusName, data) {
    const page = document.getElementById(`page-detail-${deviceId}`);
    if (!page) {
        return;
    }

    const device = dashboardInstance.devices[deviceId];
    if (!device) {
        return;
    }
    
    const updateHero = () => {
        const hero = page.querySelector('.detail-hero-status');
        const icon = hero.querySelector('.detail-status-icon i');
        const text = hero.querySelector('.detail-status-text');

        hero.className = 'detail-hero-status';

        icon.innerHTML = ''; 

        if (!device.online) {
            hero.classList.add('offline');
            icon.className = 'fas fa-wifi-slash';
            text.textContent = 'OFFLINE';
            icon.innerHTML = `
                <span class="fa-stack" style="font-size: 0.8em;">
                    <i class="fas fa-wifi fa-stack-1x"></i>
                    <i class="fas fa-slash fa-stack-1x"></i>
                </span>
            `;
            updateDetailStatusBar(page, 'offline');
        }  
        
        else if (device.block_state?.state === 'ESTADO_E') {
            hero.classList.add('locked');
            icon.className = 'fas fa-lock';
            text.textContent = 'ESTADO E';
            updateDetailStatusBar(page, 'locked');
        } 
        
        else if (device.state) {
            const nomeEstado = ESTADOS_NOMES[device.state.state] || 'Desconhecido';
            text.textContent = nomeEstado.toUpperCase();

            if (nomeEstado === 'ESTADO A') { 
                hero.classList.add('available'); 
                icon.className = 'fas fa-power-off'; 
                updateDetailStatusBar(page, 'available');  
            } else if (nomeEstado === 'ESTADO B') { 
                hero.classList.add('connected'); 
                icon.className = 'fas fa-plug'; 
                updateDetailStatusBar(page, 'connected');
            } else if (nomeEstado === 'ESTADO C' || nomeEstado === 'ESTADO D') { 
                hero.classList.add('charging'); 
                icon.className = 'fas fa-bolt'; 
                updateDetailStatusBar(page, 'charging');
            } else if (nomeEstado === 'ESTADO F') { 
                hero.classList.add('fault'); 
                icon.className = 'fas fa-exclamation-triangle';
                updateDetailStatusBar(page, 'fault'); 
            } else if (nomeEstado === 'ESTADO E') {
                hero.classList.add('locked'); 
                icon.className = 'fas fa-lock'; 
                updateDetailStatusBar(page, 'locked');
            } else { 
                hero.classList.add('fault'); 
                icon.className = 'fas fa-exclamation-triangle'; 
                updateDetailStatusBar(page, 'fault');
            }
        } else {
            hero.classList.add('pending');
            icon.className = 'fas fa-spinner fa-spin';
            text.textContent = 'CONECTANDO...';
            updateDetailStatusBar(page, 'pending');
        }
    };

    switch (statusName) {
        case 'connection_status_change':
            updateHero();
            break;

        case 'state': 
        case 'block_state':
            updateHero();
            
            if (statusName === 'block_state') {
                const btn = page.querySelector('.block-btn');
                if (btn) {
                    const isBlocked = data.state === 'ESTADO_E';
                    btn.innerHTML = `<i class="fas ${isBlocked ? 'fa-unlock' : 'fa-lock'}"></i> ${isBlocked ? 'Desbloquear' : 'Bloquear'} Carregador`;
                }
            }
            break;

        case 'current_state': {
            const currentValueElement = page.querySelector('.current-value');
            if (currentValueElement) {
                const stateKey = parseInt(data.state, 10);
                if (CURRENT_STATES.hasOwnProperty(stateKey)) {
                    const currentText = CURRENT_STATES[stateKey];
                    const numericValue = currentText.replace('A', '');
                    currentValueElement.innerHTML = `${numericValue} <small>A</small>`;
                } else {
                    currentValueElement.innerHTML = `-- <small>A</small>`;
                }
            }
            break;
        }

        case 'temperature': {
            // Atualizar temperaturas na página de detalhes
            const temp1 = data.sensor1 !== undefined ? data.sensor1.toFixed(1) : '--';
            const temp2 = data.sensor2 !== undefined ? data.sensor2.toFixed(1) : '--';
            
            page.querySelector('.temp-value-1').innerHTML = `${temp1} <small>°C</small>`;
            page.querySelector('.temp-value-2').innerHTML = `${temp2} <small>°C</small>`;
            break;
        }

        case 'cp_data': {
            if (device) {
                EVSE.ui.addChartData(device.chart, data);
            }
            break;
        }
        case 'debug_data':
            const debugString = JSON.stringify(data, null, 2);
            alert(`Dados de Debug para ${deviceId}:\n\n${debugString}`);
            break;
    }
}

/**
 * ==============================================================
 * Função responsável por ler e escrever o UID do cartão RFID quando o
 * modo de cadastro estiver ativo
 * ==============================================================
 */
export function updateRfidUidInModal(uid) {
    const cardIdInput = document.getElementById('card-id');
    if (cardIdInput) {
        cardIdInput.value = uid;
        window.EVSE_showRfidMessage(`Cartão detectado: ${uid}`, 'success');
        document.getElementById('card-name').focus();
    }
}

/**
 * ==============================================================
 * Função responsável por renderizar a lista de cartões RFID cadastrados ao abrir o modal
 * ==============================================================
 */
export function renderCardsList(dashboardInstance) {
    const cardsList = document.getElementById('cards-list');
    if (!cardsList) return;

    if (dashboardInstance.registeredCards.length === 0) {
        cardsList.innerHTML = '<div class="empty-state"><p>Nenhum cartão cadastrado</p></div>';
        return;
    }

    cardsList.innerHTML = dashboardInstance.registeredCards.map(card => `
        <div class="card-item" data-card-id="${card.id}">
            <div class="card-info">
                <span class="card-name">${card.name}</span>
                <span class="card-id">ID: ${card.id}</span>
            </div>
            <button type="button" class="btn-remove-card" data-card-id="${card.id}" aria-label="Remover cartão ${card.name}">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        </div>
    `).join('');

    cardsList.querySelectorAll('.btn-remove-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardId = btn.getAttribute('data-card-id');
            if (confirm('Tem certeza que deseja remover este cartão?')) {
                dashboardInstance.removeCard(cardId);
            }
        });
    });
}