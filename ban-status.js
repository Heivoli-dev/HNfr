import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js';

export function watchBan(db, user, onChange) {
  let timer, stopped = false;
  onChange({ blocked: true, message: 'Vérification de ton compte…' });
  const stop = onSnapshot(doc(db, 'bans', user.uid), snapshot => {
    clearTimeout(timer);
    const data = snapshot.data();
    const expires = data?.expiresAt?.toMillis?.();
    const check = () => {
      if (stopped) return;
      const blocked = user.emailVerified && user.email === 'heivolipro@gmail.com'
        ? false : snapshot.exists() && (data.expiresAt === null || expires > Date.now());
      const message = blocked ? `Ton compte est banni ${expires ? 'jusqu’au ' + new Date(expires).toLocaleString('fr-FR') : 'définitivement'}. Motif : ${data.reason}. Tu peux toujours lire les annonces.` : '';
      onChange({ blocked, message });
      if (blocked && expires) timer = setTimeout(check, Math.min(expires - Date.now() + 100, 2147483647));
    };
    check();
  }, () => onChange({ blocked: true, message: 'Impossible de vérifier ton compte. Réessaie dans un instant.' }));
  return () => { stopped = true; clearTimeout(timer); stop(); };
}
