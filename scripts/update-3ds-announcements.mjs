import { readFile, writeFile } from 'node:fs/promises';
const endpoint = 'https://firestore.googleapis.com/v1/projects/heivoli-network-408f3/databases/(default)/documents:runQuery';
const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ structuredQuery: {
  select: { fields: ['title', 'type', 'text', 'createdAt'].map(fieldPath => ({ fieldPath })) },
  from: [{ collectionId: 'announcements' }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 6
} }) });
if (!response.ok) throw new Error(`Lecture des annonces impossible (${response.status}).`);
const data = await response.json();
if (!Array.isArray(data)) throw new Error('Réponse Firestore invalide.');
const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const content = data.filter(entry => entry.document).map(({ document: doc }) => {
  const fields = doc.fields || {}, value = key => escape(fields[key]?.stringValue);
  const id = doc.name.split('/').pop();
  let date = '';
  if (fields.createdAt?.timestampValue) date = `<p class="meta">${escape(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(fields.createdAt.timestampValue)))}</p>`;
  return `<div class="announcement"><p class="meta">${value('type')}</p><h3>${value('title')}</h3>${date}<p class="body">${value('text')}</p><a href="https://heivoli-network.fr/annonce.html?id=${encodeURIComponent(id)}">Discussion sur le site complet</a></div>`;
}).join('\n') || '<p>Aucune annonce pour le moment.</p>';
const path = new URL('../3ds/index.html', import.meta.url);
const template = await readFile(path, 'utf8');
await writeFile(path, template.replace(/<!-- HN_ANNOUNCEMENTS_START -->[\s\S]*?<!-- HN_ANNOUNCEMENTS_END -->/, () => `<!-- HN_ANNOUNCEMENTS_START -->\n${content}\n<!-- HN_ANNOUNCEMENTS_END -->`));
await writeFile(new URL('../3ds/cache/announcements.json', import.meta.url), JSON.stringify(data));
console.log(`Version légère mise à jour : ${data.filter(entry => entry.document).length} annonce(s).`);
