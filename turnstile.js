let scriptPromise;
export function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    function fail() { clearTimeout(timer); script.remove(); scriptPromise = undefined; reject(new Error('Impossible de charger la vérification anti-spam. Réessaie.')); }
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptPromise;
}
export async function challenge(server, action) {
  const response = await fetch(`${server}/api/turnstile`);
  if (!response.ok) throw new Error('Protection anti-spam indisponible. Réessaie.');
  const config = await response.json();
  if (config.enabled === false) return undefined;
  if (config.enabled !== true || !config.siteKey) throw new Error('Protection anti-spam indisponible.');
  await loadScript();
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Vérification anti-spam');
    const title = document.createElement('p'); title.textContent = 'Vérification anti-spam';
    const container = document.createElement('div');
    const cancel = document.createElement('button'); cancel.textContent = 'Annuler'; cancel.type = 'button';
    dialog.append(title, container, cancel); document.body.append(dialog);
    let widget, finished = false;
    const finish = (token, message) => {
      if (finished) return; finished = true;
      clearTimeout(timer);
      // Callbacks may run during render; defer cleanup until the widget ID is assigned.
      queueMicrotask(() => { if (widget !== undefined) window.turnstile.remove(widget); dialog.close(); dialog.remove(); });
      if (token) resolve(token); else reject(new Error(message || 'Vérification annulée.'));
    };
    const timer = setTimeout(() => finish(null, 'Vérification expirée. Réessaie.'), 180000);
    cancel.onclick = () => finish();
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
    try {
      dialog.showModal();
      widget = window.turnstile.render(container, {
        sitekey: config.siteKey, action, language: 'fr',
        callback: token => finish(token),
        'error-callback': () => { finish(null, 'Vérification indisponible. Réessaie.'); return true; },
        'expired-callback': () => finish(null, 'Vérification expirée. Réessaie.'),
        'timeout-callback': () => finish(null, 'Vérification expirée. Réessaie.')
      });
    } catch { finish(null, 'Vérification indisponible. Réessaie.'); }
  });
}
