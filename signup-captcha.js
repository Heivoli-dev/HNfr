import { loadScript } from './turnstile.js';

export function setupSignupCaptcha({ server, container, status, buttons }) {
  let verifiedUntil = 0, timer, generation = 0;
  const isVerified = () => Date.now() < verifiedUntil;
  function lock(message) {
    generation++;
    verifiedUntil = 0;
    clearTimeout(timer);
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = message;
  }
  lock('Chargement de la vérification anti-robot…');
  (async () => {
    try {
      const response = await fetch(`${server}/api/turnstile`);
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.enabled || !config.siteKey) throw new Error();
      await loadScript();
      status.textContent = 'Valide la vérification ci-dessous pour continuer avec Google ou Discord.';
      window.turnstile.render(container, {
        sitekey: config.siteKey, action: 'signup', language: 'fr',
        callback: async token => {
          lock('Vérification en cours…');
          const attempt = generation;
          try {
            const response = await fetch(`${server}/api/signup-captcha`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
            });
            const result = await response.json();
            if (attempt !== generation) return;
            if (!response.ok || result.verified !== true) throw new Error();
            verifiedUntil = Date.now() + 180000;
            buttons.forEach(button => { button.disabled = false; });
            status.textContent = 'Vérification réussie. Choisis Google ou Discord pour créer ton compte ou te connecter.';
            timer = setTimeout(() => lock('Vérification expirée. Actualise le captcha pour continuer.'), 180000);
          } catch { if (attempt === generation) lock('Vérification impossible. Actualise le captcha ou recharge la page pour réessayer.'); }
        },
        'expired-callback': () => lock('Vérification expirée. Valide à nouveau le captcha.'),
        'timeout-callback': () => lock('Vérification expirée. Réessaie.'),
        'error-callback': () => { lock('Le captcha ne peut pas se charger. Recharge la page pour réessayer.'); return true; }
      });
    } catch { lock('La vérification anti-robot est indisponible. Recharge la page pour réessayer.'); }
  })();
  return { isVerified };
}
