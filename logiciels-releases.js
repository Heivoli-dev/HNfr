// Met à jour automatiquement la version et la taille des fichiers de chaque logiciel
// à partir de la dernière Release GitHub. Le contenu écrit dans la page sert de secours hors ligne.
(() => {
  const formatSize = (bytes) => {
    const mo = bytes / 1048576;
    return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 100 ? 1 : 0 })} Mo`;
  };

  const loadRelease = async (repo) => {
    const key = `release:${repo}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
    } catch { /* stockage indisponible */ }
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const data = {
      tag: String(json.tag_name || ''),
      assets: (json.assets || []).map((a) => ({ name: String(a.name), size: Number(a.size) || 0 })),
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
      card.querySelectorAll('[data-release-asset]').forEach((el) => {
        const asset = release.assets.find((a) => a.name === el.dataset.releaseAsset);
        const size = el.querySelector('[data-release-size]');
        if (asset && size && asset.size) size.textContent = `${size.dataset.prefix || ''}${formatSize(asset.size)}`;
      });
    } catch { /* GitHub injoignable : on garde les valeurs écrites dans la page */ }
  });
})();
