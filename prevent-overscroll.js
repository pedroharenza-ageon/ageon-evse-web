// prevent-overscroll.js

const scrollable = document.querySelector('.main-content');

if (scrollable) {
  // salva a posição inicial do toque
  scrollable.addEventListener('touchstart', e => {
    scrollable._startY = e.touches[0].clientY;
  }, { passive: false });

  // bloqueia overscroll somente no topo/fundo
  scrollable.addEventListener('touchmove', e => {
    const st = scrollable.scrollTop;
    const sh = scrollable.scrollHeight;
    const oh = scrollable.offsetHeight;

    const dy = e.touches[0].clientY - scrollable._startY;

    // Se estiver tentando rolar além do topo ou do fundo, bloqueia
    if ((dy > 0 && st <= 0) || (dy < 0 && st + oh >= sh)) {
      e.preventDefault();
    }
  }, { passive: false });
}
