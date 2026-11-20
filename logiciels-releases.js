// Met à jour automatiquement la version et la taille des fichiers de chaque logiciel
// à partir de la dernière Release GitHub. Le contenu écrit dans la page sert de secours hors ligne.
(() => {
  const formatSize = (bytes) => {
    const mo = bytes / 1048576;
    return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 100 ? 1 : 0 })} Mo`;
  };

  const formatDate = (ms, withYear) => new Date(ms).toLocaleDateString('fr-FR', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });

  const loadRelease = async (repo) => {
    const key = `release-v2:${repo}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
    } catch { /* stockage indisponible */ }
    const headers = { Accept: 'application/vnd.github+json' };
    const [res, commitsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/commits?per_page=40`, { headers }).catch(() => null),
    ]);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    // Les messages de commit « v1.5.2 : … » servent de journal des nouveautés.
    const changes = [];
    if (commitsRes?.ok) {
      const seen = new Set();
      for (const item of await commitsRes.json()) {
        const match = /^v(\d+(?:\.\d+){1,3})\s*[:：–-]\s*(.+)$/.exec(String(item?.commit?.message || '').split('\n')[0].trim());
        if (!match || seen.has(match[1])) continue;
        seen.add(match[1]);
        changes.push({ version: `v${match[1]}`, text: match[2].slice(0, 140), date: String(item.commit.committer?.date || item.commit.author?.date || '') });
        if (changes.length >= 4) break;
      }
    }
    const data = {
      tag: String(json.tag_name || ''),
      date: String(json.published_at || ''),
      assets: (json.assets || []).map((a) => ({ name: String(a.name), size: Number(a.size) || 0 })),
      changes,
    };
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
    return data;
  };

  document.querySelectorAll('[data-release-repo]').forEach(async (card) => {
    const repo = card.dataset.releaseRepo;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
    try {
      const release = await loadRelease(repo);
      const version = card.querySelector('[data-release-version]');
      if (version && /^v?\d+(\.\d+){1,3}$/.test(release.tag)) version.textContent = release.tag.startsWith('v') ? release.tag : `v${release.tag}`;
      const dateEl = card.querySelector('[data-release-date]');
      const published = Date.parse(release.date);
      if (dateEl && published) dateEl.textContent = `· ${formatDate(published, true)}`;
      const box = card.querySelector('[data-whats-new]');
      if (box && release.changes?.length) {
        const list = box.querySelector('ol');
        list.replaceChildren();
        for (const change of release.changes) {
          const item = document.createElement('li');
          const version = document.createElement('strong');
          version.textContent = change.version;
          const text = document.createElement('span');
          text.textContent = change.text.charAt(0).toUpperCase() + change.text.slice(1);
          const time = document.createElement('time');
          const when = Date.parse(change.date);
          if (when) { time.dateTime = new Date(when).toISOString(); time.textContent = formatDate(when, false); }
          item.append(version, text, time);
          list.append(item);
        }
        box.hidden = false;
      }
      card.querySelectorAll('[data-release-asset]').forEach((el) => {
        const asset = release.assets.find((a) => a.name === el.dataset.releaseAsset);
        const size = el.querySelector('[data-release-size]');
        if (asset && size && asset.size) size.textContent = `${size.dataset.prefix || ''}${formatSize(asset.size)}`;
      });
    } catch { /* GitHub injoignable : on garde les valeurs écrites dans la page */ }
  });

  // Ouvre le guide Mac quand on clique sur son lien (ou si l'adresse pointe dessus)
  const openGuide = () => {
    const g = document.getElementById(location.hash.slice(1));
    if (g && g.tagName === 'DETAILS') { g.open = true; g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  window.addEventListener('hashchange', openGuide);
  document.querySelectorAll('a[href="#installer-sur-mac"]').forEach((a) => a.addEventListener('click', () => setTimeout(openGuide, 0)));
  if (location.hash) openGuide();
})();
