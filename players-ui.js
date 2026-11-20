// Cartes joueur : codes ami 3DS et identifiants Pretendo (PNID).
// Garder GAMES aligné avec la liste de la règle /players dans firestore.rules.
export const GAMES = [
  'Mario Kart 7', 'Mario Kart 8', 'Splatoon', 'Smash Bros. 3DS', 'Smash Bros. Wii U',
  'Animal Crossing New Leaf', 'Pokémon X / Y', 'Pokémon ROSA', 'Monster Hunter 4U', 'Minecraft',
];
export const MAX_GAMES = 5;
const sound = name => document.dispatchEvent(new CustomEvent("hn-sound", { detail: name }));
const PHOTO = /^https:\/\/(i\.ibb\.co|lh[3-6]\.googleusercontent\.com|cdn\.discordapp\.com)\/[^\s]+$/;

export function formatFriendCode(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1-');
}
export const validFriendCode = value => /^\d{4}-\d{4}-\d{4}$/.test(value);
export const validPnid = value => /^[A-Za-z0-9_.-]{6,16}$/.test(value);
export const safePhoto = value => (typeof value === 'string' && PHOTO.test(value) ? value : '');

const ORB_COLORS = ['a', 'b', 'c', 'd', 'e', 'f'];
function orbColor(uid = '') {
  let sum = 0;
  for (const char of uid) sum = (sum + char.charCodeAt(0)) % 997;
  return ORB_COLORS[sum % ORB_COLORS.length];
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function copyText(button, value) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copié !';
    sound('copy');
  } catch {
    button.textContent = 'Copie impossible';
    sound('error');
  }
  setTimeout(() => { button.textContent = 'Copier'; }, 1600);
}

function idRow(kind, label, value) {
  const row = element('div', 'id-row');
  const name = element('span', 'id-label');
  name.append(element('i', `id-dot ${kind}`), document.createTextNode(label));
  const code = element('code', '', value);
  const copy = element('button', 'copy-button', 'Copier');
  copy.type = 'button';
  copy.setAttribute('aria-label', `Copier ${label} : ${value}`);
  copy.addEventListener('click', () => copyText(copy, value));
  row.append(name, code, copy);
  return row;
}

// player : { uid, displayName, photoURL, friendCode, pnid, lookingFor, games }
export function renderPlayerCard(player, { mine = false, onRemove, badges } = {}) {
  const card = element('article', `player-card${mine ? ' is-mine' : ''}`);
  const head = element('header');
  const orb = element('span', `player-orb orb-${orbColor(player.uid)}`);
  const name = player.displayName || 'Membre';
  const initial = element('span', 'player-initial', name.charAt(0).toUpperCase());
  orb.append(initial);
  const photo = safePhoto(player.photoURL);
  if (photo) {
    const image = element('img');
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.src = photo;
    image.addEventListener('error', () => { image.remove(); initial.hidden = false; });
    initial.hidden = true;
    orb.append(image);
  }
  const titles = element('div');
  const title = element('h3');
  if (player.uid) {
    const link = element('a', '', name);
    link.href = `profil.html?uid=${encodeURIComponent(player.uid)}`;
    title.append(link);
  } else {
    title.textContent = name;
  }
  if (mine) title.append(element('span', 'mine-badge', 'Toi'));
  titles.append(title);
  if (player.lookingFor) titles.append(element('p', '', `Cherche : ${player.lookingFor}`));
  head.append(orb, titles);

  const badgeRow = badges?.length ? renderBadges(badges) : null;
  const ids = element('div', 'player-ids');
  if (player.friendCode) ids.append(idRow('is-3ds', 'Code ami 3DS', player.friendCode));
  if (player.pnid) ids.append(idRow('is-pretendo', 'Pretendo (PNID)', player.pnid));

  card.append(head);
  if (badgeRow) card.append(badgeRow);
  card.append(ids);
  if (player.games?.length) {
    const tags = element('ul', 'game-tags');
    player.games.forEach(game => tags.append(element('li', '', game)));
    card.append(tags);
  }
  if (onRemove) {
    const remove = element('button', 'remove-card', 'Retirer cette carte');
    remove.type = 'button';
    remove.addEventListener('click', () => onRemove(player, remove));
    card.append(remove);
  }
  return card;
}

// ---------- Badges ----------
const BADGES = {
  founder: { icon: '✦', label: 'Fondateur', tone: 'b-gold' },
  moderator: { icon: '🛡', label: 'Modération', tone: 'b-purple' },
  card: { icon: '🎴', label: 'Carte joueur', tone: 'b-green' },
  pretendo: { img: 'assets/badge-pretendo.jpg', label: 'Joueur Pretendo', tone: 'b-pretendo' },
  friendCode: { svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3.5" width="12" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6" y="13.5" width="12" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>', label: 'Joueur 3DS', tone: 'b-orange' },
};
// member : document /members/{uid} (rôle, date d'arrivée) ; player : carte joueur éventuelle.
export function badgesFor(member, player) {
  const list = [];
  if (member?.role === 'founder') list.push(BADGES.founder);
  if (member?.role === 'moderator') list.push(BADGES.moderator);
  const since = member?.since?.toDate?.();
  if (since) list.push({ icon: '★', label: `Membre depuis ${since.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`, tone: 'b-blue' });
  if (player) list.push(BADGES.card);
  if (player?.pnid) list.push(BADGES.pretendo);
  if (player?.friendCode) list.push(BADGES.friendCode);
  return list;
}
export function renderBadges(list, target = element('ul', 'badge-row')) {
  target.replaceChildren();
  for (const badge of list) {
    const item = element('li', `badge ${badge.tone}`);
    const icon = element('i', '', badge.svg || badge.img ? undefined : badge.icon);
    if (badge.svg) icon.innerHTML = badge.svg; // icône fixe définie ci-dessus, jamais de données utilisateur
    if (badge.img) { const image = element('img'); image.src = badge.img; image.alt = ''; icon.append(image); }
    icon.setAttribute('aria-hidden', 'true');
    item.append(icon, document.createTextNode(badge.label));
    target.append(item);
  }
  target.hidden = !list.length;
  return target;
}
