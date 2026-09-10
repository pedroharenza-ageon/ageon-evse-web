// O worker permanece na raiz para controlar todo o prefixo do projeto Pages.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
            .then(registration => registration.update())
            .catch(error => console.warn('Não foi possível atualizar o cache do painel:', error));
    });
}
