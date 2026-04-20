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
        const powerValue = powerData.power || 0.00;
        card.querySelector('.summary-power').textContent = `${powerValue.toFixed(2)} kW`;
    }
}


/**
 * ==============================================================
 * Função responsável por atualizar a UI da sessão de carga na página de detalhes.
 * ==============================================================
 */
export function chargingSessionUIUpdate(deviceId, data, dashboardInstance) {
    
    // Página de detalhes
    const page = document.getElementById(`page-detail-${deviceId}`);
    if (page && page.classList.contains('active')) {
        const powerEl = page.querySelector('.power-value');
        const energyEl = page.querySelector('.energy-value');

        if (powerEl) {
            powerEl.innerHTML = `${(data.power ?? 0).toFixed(3)} <small>kW</small>`;
        }

        if (energyEl) {
            energyEl.innerHTML = `${(data.energy ?? 0).toFixed(5)} <small>kWh</small>`;
        }

        // Timer visual
        if (dashboardInstance._updateTimerUI) {
            dashboardInstance._updateTimerUI(
                deviceId, 
                data.sessionTime || '--:--:--'
            );
        }
    }

    // Cartão de resumo
    const summaryCard = document.querySelector(
        `#page-home .device-card-summary[data-device-id="${deviceId}"]`
    );

    if (summaryCard) {
        const powerValue = data.power ?? 0;
        const summaryPower = summaryCard.querySelector('.summary-power');

        if (summaryPower) {
            summaryPower.textContent = `${powerValue.toFixed(1)} kW`;
        }
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
    const canvas1 = pageElement.querySelector('.evse-detail-device-chart-1');
    const canvas2 = pageElement.querySelector('.evse-detail-device-chart-2');
    const canvas3 = pageElement.querySelector('.evse-detail-device-chart-3');

    if (!canvas1 || !canvas2 || !canvas3) {
        console.error("Canvas para o gráfico de detalhes não encontrado!");
        return;
    }

    const ctx1 = canvas1.getContext('2d');
    const ctx2 = canvas2.getContext('2d');
    const ctx3 = canvas3.getContext('2d');

    /* ==========================
       Configuração do Gráfico 1
       (LINHA)
       ========================== */
    const chartConfig1 = {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CP High',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4
                },
                {
                    label: 'CP Low',
                    data: [],
                    borderColor: '#77a6dcff',
                    backgroundColor: '#77a6dcff',
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
                x: {
                    display: true,
                    ticks: { maxTicksLimit: 6 }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-secondary')
                    },
                    grid: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--border-color')
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-primary')
                    }
                }
            }
        }
    };

    /* ==========================
       Configuração do Gráfico 2
       ========================== */
    const chartConfig2 = {
        type: 'line', 
        data: {
            labels: [], 
            datasets: [
                // Datasets de Tensão (VAC) - Eixo Y Esquerdo
                {
                    label: 'Vrms A',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y',
                },
                {
                    label: 'Vrms B',
                    data: [],
                    borderColor: '#1d4ed8',
                    backgroundColor: '#1d4ed8',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y',
                },
                {
                    label: 'Vrms C',
                    data: [],
                    borderColor: '#1e40af',
                    backgroundColor: '#1e40af',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y',
                },
                // Datasets de Corrente (IAC) - Eixo Y Direito
                {
                    label: 'Irms A',
                    data: [],
                    borderColor: '#77a6dcff',
                    backgroundColor: '#77a6dcff',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y1',
                },
                {
                    label: 'Irms B',
                    data: [],
                    borderColor: '#93c5fd',
                    backgroundColor: '#93c5fd',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y1',
                },
                {
                    label: 'Irms C',
                    data: [],
                    borderColor: '#bfdbfe',
                    backgroundColor: '#bfdbfe',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 }, 
            scales: {
                x: {
                    display: true,
                    ticks: { maxTicksLimit: 6 }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-secondary')
                    },
                    grid: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--border-color')
                    }
                },
                y1: {
                    beginAtZero: false,
                    position: 'right',
                    ticks: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-secondary')
                    },
                    grid: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--border-color')
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-primary')
                    }
                }
            }
        }
    };

    /* ==========================
       Configuração do Gráfico 3
       ========================== */

    const chartConfig3 = {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Energia Consumida (kWh)',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 1,
                    tension: 0.4
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
                    ticks: { maxTicksLimit: 6 }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-secondary')
                    },
                    grid: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--border-color')
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: getComputedStyle(document.body)
                            .getPropertyValue('--text-primary')
                    }
                }
            }
        }
    };

    /* ==========================
       Criação dos gráficos
       ========================== */
    const chartInstance1 = new Chart(ctx1, chartConfig1);
    const chartInstance2 = new Chart(ctx2, chartConfig2);
    const chartInstance3 = new Chart(ctx3, chartConfig3);

    /* ==========================
       Armazena as instâncias
       ========================== */
    dashboardInstance.devices[deviceId].chart1 = chartInstance1;
    dashboardInstance.devices[deviceId].chart2 = chartInstance2;
    dashboardInstance.devices[deviceId].chart3 = chartInstance3;
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
export function addDetailChartData(chartInstance, data, graphType) {
    if (!chartInstance || !data) {
        console.warn("addDetailChartData foi chamada com uma instância de gráfico inválida ou dados ausentes.");
        return;
    }

    // ================================
    // GRÁFICO 1 (LINHA / CP)
    // ================================
    if (graphType === 'cp' && chartInstance.config.type === 'line') {
        const highData = chartInstance.data.datasets[0].data;
        const lowData = chartInstance.data.datasets[1].data;
        const labels = chartInstance.data.labels;

        const MAX_POINTS = 50;

        // Remove os pontos mais antigos se necessário
        if (highData.length >= MAX_POINTS) {
            highData.shift();
            lowData.shift();
            labels.shift();
        }

        // Adiciona os novos valores
        highData.push(data.cp_high || 0);
        lowData.push(data.cp_low || 0);
        labels.push(''); // labels podem ser vazias para linha

        chartInstance.update();

        // Atualiza médias e P2P
        if (highData.length > 0 && lowData.length > 0) {
            const highAverage = highData.reduce((a, b) => a + b, 0) / highData.length;
            const lowAverage = lowData.reduce((a, b) => a + b, 0) / lowData.length;

            const chartContainer = chartInstance.canvas.parentNode;
            const pageContainer = chartContainer.closest('.app-page');
            const highAverageElement = pageContainer.querySelector('.cp-high-average-value');
            const lowAverageElement = pageContainer.querySelector('.cp-low-average-value');
            const peakToPeakElement = pageContainer.querySelector('.cp-peaktopeak-value');

            if (highAverageElement) highAverageElement.textContent = `${highAverage.toFixed(0)} mV`;
            if (lowAverageElement) lowAverageElement.textContent = `${lowAverage.toFixed(0)} mV`;
            if (peakToPeakElement) {
                const peakToPeak = Math.max(...highData) - Math.min(...highData);
                peakToPeakElement.textContent = `${peakToPeak.toFixed(0)} mV`;
            }
        }
    }

    // ================================
    // GRÁFICO 2 (VRMS e IRMS)
    // ================================
    if (graphType === 'vrms' && chartInstance.config.type === 'line') {
        const labels = chartInstance.data.labels;
        const v1data = chartInstance.data.datasets[0].data;
        const v2data = chartInstance.data.datasets[1].data;
        const v3data = chartInstance.data.datasets[2].data;

        const MAX_POINTS = 50;

        if (v1data.length >= MAX_POINTS) {
            v1data.shift();
            v2data.shift();
            v3data.shift();
        }

        // Atualiza cada dataset de Tensão (Índices 0, 1 e 2 na nossa configuração)
        // Dataset 0: Vrms A
        // Dataset 1: Vrms B
        // Dataset 2: Vrms C
        v1data.push(data.V1 || 0);
        v2data.push(data.V2 || 0);
        v3data.push(data.V3 || 0);

        if (v1data.length > 0 && v2data.length > 0 && v3data.length > 0) {
            const v1Average = v1data.reduce((a, b) => a + b, 0) / v1data.length;
            const v2Average = v2data.reduce((a, b) => a + b, 0) / v2data.length;
            const v3Average = v3data.reduce((a, b) => a + b, 0) / v3data.length;
            const chartContainer = chartInstance.canvas.parentNode;
            const pageContainer = chartContainer.closest('.app-page');
            const v1AverageElement = pageContainer.querySelector('.vla-average-value');
            const v2AverageElement = pageContainer.querySelector('.vlb-average-value');
            const v3AverageElement = pageContainer.querySelector('.vlc-average-value');

            if (v1AverageElement) v1AverageElement.textContent = `${v1Average.toFixed(0)} V`;
            if (v2AverageElement) v2AverageElement.textContent = `${v2Average.toFixed(0)} V`;
            if (v3AverageElement) v3AverageElement.textContent = `${v3Average.toFixed(0)} V`;
        }
    }

    if (graphType === 'irms' && chartInstance.config.type === 'line') {
        const labels = chartInstance.data.labels;
        const i1data = chartInstance.data.datasets[3].data;
        const i2data = chartInstance.data.datasets[4].data;
        const i3data = chartInstance.data.datasets[5].data;

        const MAX_POINTS = 50;

        if (i1data.length >= MAX_POINTS) {
            i1data.shift();
            i2data.shift();
            i3data.shift();
            labels.shift();
        }

        // Atualiza cada dataset de Corrente (Índices 3, 4 e 5 na nossa configuração)
        // Dataset 3: Irms A
        // Dataset 4: Irms B
        // Dataset 5: Irms C
        i1data.push(data.I1 || 0);
        i2data.push(data.I2 || 0);
        i3data.push(data.I3 || 0);

        if (i1data.length > 0 && i2data.length > 0 && i3data.length > 0) {
            const i1Average = i1data.reduce((a, b) => a + b, 0) / i1data.length;
            const i2Average = i2data.reduce((a, b) => a + b, 0) / i2data.length;
            const i3Average = i3data.reduce((a, b) => a + b, 0) / i3data.length;
            const chartContainer = chartInstance.canvas.parentNode;
            const pageContainer = chartContainer.closest('.app-page');
            const i1AverageElement = pageContainer.querySelector('.ila-average-value');
            const i2AverageElement = pageContainer.querySelector('.ilb-average-value');
            const i3AverageElement = pageContainer.querySelector('.ilc-average-value');

            if (i1AverageElement) i1AverageElement.textContent = `${i1Average.toFixed(2)} A`;
            if (i2AverageElement) i2AverageElement.textContent = `${i2Average.toFixed(2)} A`;
            if (i3AverageElement) i3AverageElement.textContent = `${i3Average.toFixed(2)} A`;
        }

        labels.push('');
        chartInstance.update();
    }

    // ================================
    // GRÁFICO 3 (LINHA / ENERGIA)
    // ================================

    if (graphType === 'energy' && chartInstance.config.type === 'line') {
        const energyData = chartInstance.data.datasets[0].data;
        const labels = chartInstance.data.labels;

        // const MAX_POINTS = 50;

        // if (energyData.length >= MAX_POINTS) {
        //     energyData.shift();
        //     labels.shift();
        // }

        energyData.push(data.energy || 0);
        labels.push(''); // labels podem ser vazias para linha

        chartInstance.update();
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
                EVSE.ui.addDetailChartData(device.chart1, data, 'cp');
            }
            break;
        }
        
        case 'vrms_data': {
            if (device) {
                EVSE.ui.addDetailChartData(device.chart2, data, 'vrms');
            }
            break;
        }

        case 'irms_data': {
            if (device) {
                EVSE.ui.addDetailChartData(device.chart2, data, 'irms');
            }
            break;
        }

        case 'charging_session': {
            if (device) {
                EVSE.ui.addDetailChartData(device.chart3, data, 'energy');
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