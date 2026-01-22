// Prevent scroll bounce on specified sides of the viewport or scrollable elements
function preventBounce(sides = { top: true, bottom: true, left: true, right: true }) {
  let startX, startY;

  // Capture initial touch position when user starts touching the screen
  document.addEventListener('touchstart', e => {
    [startX, startY] = [e.touches[0].clientX, e.touches[0].clientY];
  }, { passive: false }); // passive: false is needed to allow preventDefault later

  // Monitor touch movement to detect and block bounce
  document.addEventListener('touchmove', e => {
    // Find the closest scrollable ancestor or fallback to the main scroll container
    const el = e.target.closest('[data-scrollable]') || document.scrollingElement;

    // Calculate movement deltas
    const [dx, dy] = [
      e.touches[0].clientX - startX,
      e.touches[0].clientY - startY
    ];

    // Vertical scroll info: scrollTop, scrollHeight, and visible height
    const [st, sh, oh] = [el.scrollTop, el.scrollHeight, el.offsetHeight];

    // Horizontal scroll info: scrollLeft, scrollWidth, and visible width
    const [sl, sw, ow] = [el.scrollLeft, el.scrollWidth, el.offsetWidth];

    // Prevent bounce if user is trying to scroll past the edge in a blocked direction
    if (
      (sides.top && dy > 0 && st <= 0) ||            // Pulling down at the top
      (sides.bottom && dy < 0 && st + oh >= sh) ||   // Pulling up at the bottom
      (sides.left && dx > 0 && sl <= 0) ||           // Swiping right at the left edge
      (sides.right && dx < 0 && sl + ow >= sw)       // Swiping left at the right edge
    ) {
      e.preventDefault(); // Block the bounce
    }
  }, { passive: false }); // Again, passive: false is required to call preventDefault
}   