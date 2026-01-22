let deferredPrompt = null;

function isRunningStandalone() {
  // Camada 1: Verifica se a URL contém um parâmetro que você define no seu manifest.json
  // DICA: No seu manifest.json, mude o "start_url" para "/?mode=pwa" ou similar.
  const urlParams = new URLSearchParams(window.location.search);
  const isPwaParam = urlParams.get('mode') === 'pwa' || urlParams.get('utm_source') === 'pwa';

  // Camada 2: Verificação padrão de Media Query
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // Camada 3: Verificação específica para Safari/iOS
  const isIOSStandalone = window.navigator.standalone === true;

  return isPwaParam || isStandalone || isIOSStandalone;
}

// Função para esconder o popup com segurança
function hideInstallPopup() {
  const popup = document.getElementById("install-popup");
  if (popup) {
    popup.style.display = "none";
  }
}

// Captura o evento de instalação
window.addEventListener("beforeinstallprompt", (e) => {
  // SEMPRE bloqueia o prompt padrão primeiro
  e.preventDefault();
  deferredPrompt = e;

  // SÓ mostra o popup se tivermos certeza absoluta que NÃO estamos no app
  if (!isRunningStandalone()) {
    const popup = document.getElementById("install-popup");
    if (popup) {
      popup.style.display = "block";
    }
  } else {
    // Se detectarmos que já estamos no app, garantimos que o popup suma
    hideInstallPopup();
    console.log("PWA detectado como instalado/standalone. Popup bloqueado.");
  }
});

// Lógica do botão de instalação
const installBtn = document.getElementById("install-btn");
if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('Usuário aceitou a instalação');
      hideInstallPopup();
    }
    deferredPrompt = null;
  });
}

// Botões de fechar
["close-btn", "dismiss-btn"].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener("click", hideInstallPopup);
  }
});

// Evento de sucesso na instalação
window.addEventListener("appinstalled", () => {
  console.log("PWA instalado com sucesso!");
  hideInstallPopup();
  deferredPrompt = null;
});

/**
 * EXECUÇÃO IMEDIATA
 * Às vezes o evento beforeinstallprompt demora. 
 * Verificamos imediatamente se estamos no app para esconder qualquer popup residual.
 */
if (isRunningStandalone()) {
  // Usamos um pequeno delay para garantir que o DOM carregou
  setTimeout(hideInstallPopup, 100);
}