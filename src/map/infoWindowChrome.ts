const CLOSE_ICON =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M6 6l12 12M18 6L6 18" stroke="#5f6368" stroke-width="2" stroke-linecap="round"/></svg>';

export function ensureInfoWindowStyleOverride(): void {
  if (document.getElementById('map-infowindow-style')) return;
  const style = document.createElement('style');
  style.id = 'map-infowindow-style';
  style.textContent = `
    .gm-style-iw-d { overflow: visible !important; }
    .gm-style-iw-c { padding: 12px !important; }
    .gm-style-iw-chr { display: none !important; }
  `;
  document.head.appendChild(style);
}

export function createInfoWindowCloseButton(onClose: () => void): HTMLButtonElement {
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = CLOSE_ICON;
  closeBtn.style.cssText =
    'position:absolute;top:-4px;right:-4px;width:20px;height:20px;display:flex;align-items:center;' +
    'justify-content:center;border:none;border-radius:999px;background:#f1f3f4;cursor:pointer;padding:0;';
  closeBtn.addEventListener('mouseenter', () => (closeBtn.style.background = '#e2e4e6'));
  closeBtn.addEventListener('mouseleave', () => (closeBtn.style.background = '#f1f3f4'));
  closeBtn.addEventListener('click', onClose);
  return closeBtn;
}
