// Variável para armazenar o evento do navegador
let deferredPrompt = null;

/**
 * Função para detectar se o app já está instalado ou rodando em modo standalone.
 * Também verifica se o usuário já fechou o popup manualmente nesta sessão.
 */
function shouldShowInstallPopup() {
  // 1. Verifica se já está em modo standalone (instalado e aberto pelo ícone)
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                       window.navigator.standalone === true;
  
  // 2. Verifica se o usuário já marcou para não mostrar o popup (opcional, via localStorage)
  const isDismissed = localStorage.getItem("pwa-install-dismissed") === "true";

  // Só mostra se NÃO for standalone E NÃO tiver sido dispensado
  return !isStandalone && !isDismissed;
}

// Captura o evento antes do prompt de instalação
window.addEventListener("beforeinstallprompt", (e) => {
  // Bloqueia o prompt automático do navegador
  e.preventDefault();
  
  // Armazena o evento para uso posterior
  deferredPrompt = e;

  // Verifica se deve mostrar o popup customizado
  if (shouldShowInstallPopup()) {
    const popup = document.getElementById("install-popup");
    if (popup) popup.style.display = "block";
  }
});

// Botão de instalação
const installBtn = document.getElementById("install-btn");
if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    // Mostra o prompt oficial do navegador
    deferredPrompt.prompt();
    
    // Aguarda a escolha do usuário
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Usuário escolheu: ${outcome}`);
    
    // Limpa o evento, pois ele só pode ser usado uma vez
    deferredPrompt = null;

    // Esconde o popup
    const popup = document.getElementById("install-popup");
    if (popup) popup.style.display = "none";
    
    // Se instalado com sucesso, salvamos para não incomodar mais
    if (outcome === 'accepted') {
      localStorage.setItem("pwa-install-dismissed", "true");
    }
  });
}

// Botões de fechar/dispensar popup
const closeButtons = ["close-btn", "dismiss-btn"];
closeButtons.forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener("click", () => {
      const popup = document.getElementById("install-popup");
      if (popup) popup.style.display = "none";
      
      // Opcional: Salva que o usuário fechou para não mostrar novamente nesta sessão
      // localStorage.setItem("pwa-install-dismissed", "true"); 
    });
  }
});

// Evento disparado quando o app é instalado com sucesso
window.addEventListener("appinstalled", (evt) => {
  console.log("PWA instalado com sucesso!");
  deferredPrompt = null;
  const popup = document.getElementById("install-popup");
  if (popup) popup.style.display = "none";
  
  // Garante que não apareça mais
  localStorage.setItem("pwa-install-dismissed", "true");
});