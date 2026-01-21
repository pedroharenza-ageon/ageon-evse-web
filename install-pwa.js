// Variável para armazenar o evento do navegador
let deferredPrompt = null;

// Captura o evento antes do prompt de instalação
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // bloqueia o prompt automático
  deferredPrompt = e;

  if (!isAppInstalled()) {
    document.getElementById("install-popup").style.display = "block"; 
  }
});

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

// Botão de instalação
document.getElementById("install-btn").addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt(); // mostra prompt oficial
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;

  // Esconde o popup depois da escolha
  document.getElementById("install-popup").style.display = "none";
});

// Botão de fechar popup ("Agora não")
document.getElementById("close-btn").addEventListener("click", () => {
  document.getElementById("install-popup").style.display = "none";
});

// << NOVO: Botão de fechar popup ('X') >>
// Adiciona a mesma função de fechar para o botão 'X'.
document.getElementById("dismiss-btn").addEventListener("click", () => {
  document.getElementById("install-popup").style.display = "none";
});


// Evento quando o app é instalado (para evitar mostrar popup no futuro)
window.addEventListener("appinstalled", () => {
  console.log("PWA instalado com sucesso!");
  document.getElementById("install-popup").style.display = "none";
});
