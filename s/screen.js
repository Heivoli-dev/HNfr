// Galerie Hn screen ! : https://heivoli-network.fr/s/
// On scanne le QR code affiché par la 3DS (ou on arrive avec ?<id>) : la capture est téléchargée
// une seule fois depuis le serveur (qui l'efface aussitôt) et ne reste que dans cet onglet.
// Image reçue (400 x 480) : écran du haut (0,0 400x240), écran du bas centré dessous (40,240 320x240).
(() => {
  const API = "https://hn-screen.heivoli-discord-auth.workers.dev";
  const ID_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
  const STORE = "hn-screen-galerie";
  const PARTS = {
    deux: { x: 0, y: 0, w: 400, h: 480, name: "hn-screen" },
    haut: { x: 0, y: 0, w: 400, h: 240, name: "hn-screen-haut" },
    bas: { x: 40, y: 240, w: 320, h: 240, name: "hn-screen-bas" },
  };
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  const gallery = $("gallery");
  const photos = []; // { id, at, url (data:), bitmap, parts: [...] }
  const seen = new Set();

  const say = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
    status.hidden = !text;
  };

  // ---------- photos gardées dans l'onglet (sessionStorage : effacé à la fermeture) ----------
  const persist = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(photos.map(({ id, at, url }) => ({ id, at, url }))));
    } catch {
      /* stockage plein : les photos restent affichées tant que la page est ouverte */
    }
  };

  // Une zone unie = écran absent de la capture.
  const isBlank = (bitmap, part) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    ctx.canvas.width = part.w;
    ctx.canvas.height = part.h;
    ctx.drawImage(bitmap, part.x, part.y, part.w, part.h, 0, 0, part.w, part.h);
    const d = ctx.getImageData(0, 0, part.w, part.h).data;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return false;
    return true;
  };

  const addPhoto = async (id, at, url, blob) => {
    const bitmap = await createImageBitmap(blob || dataUrlToBlob(url));
    let parts = ["deux", "haut", "bas"];
    if (isBlank(bitmap, PARTS.haut)) parts = ["bas"];
    else if (isBlank(bitmap, PARTS.bas)) parts = ["haut"];
    const photo = { id, at, url, bitmap, parts };
    photos.unshift(photo);
    seen.add(id);
    render();
    return photo;
  };

  const dataUrlToBlob = (url) => {
    const [head, body] = url.split(",");
    const bytes = atob(body);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
    return new Blob([out], { type: head.slice(5).split(";")[0] || "image/png" });
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // Récupère la capture (une seule fois possible) puis l'ajoute à la galerie.
  const take = async (id) => {
    if (seen.has(id)) {
      say("Cette photo est déjà dans ta galerie.");
      return;
    }
    seen.add(id);
    say("Récupération de la photo…");
    try {
      const response = await fetch(`${API}/i/${id}.png`, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (response.status === 404) throw new Error("gone");
      if (!response.ok) throw new Error("http");
      const blob = await response.blob();
      const url = await blobToDataUrl(blob);
      const photo = await addPhoto(id, Date.now(), url, blob);
      persist();
      say("");
      if (navigator.vibrate) navigator.vibrate(60);
      openViewer(photo);
    } catch (error) {
      seen.delete(id);
      say(
        error.message === "gone"
          ? "Cette photo a déjà été récupérée ou a expiré (10 minutes). Partage-la de nouveau depuis ta 3DS."
          : "Impossible de récupérer la photo. Vérifie ta connexion et réessaie.",
        true,
      );
    }
  };

  // ---------- galerie ----------
  const draw = (canvas, photo, view, scale) => {
    const p = PARTS[view];
    canvas.width = p.w * scale;
    canvas.height = p.h * scale;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(photo.bitmap, p.x, p.y, p.w, p.h, 0, 0, p.w * scale, p.h * scale);
  };

  const fileName = (photo, view) => {
    const d = new Date(photo.at);
    const pad = (n) => String(n).padStart(2, "0");
    return `${PARTS[view].name}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  };

  const exportBlob = (photo, view, scale) =>
    new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      draw(canvas, photo, view, scale);
      canvas.toBlob(resolve, "image/png");
    });

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  function render() {
    $("empty").hidden = photos.length > 0;
    $("gallery-head").hidden = photos.length === 0;
    $("count").textContent = photos.length ? `(${photos.length})` : "";
    gallery.replaceChildren(
      ...photos.map((photo) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "thumb";
        button.setAttribute("aria-label", "Ouvrir la photo");
        const canvas = document.createElement("canvas");
        draw(canvas, photo, photo.parts[0], 1);
        button.append(canvas);
        button.addEventListener("click", () => openViewer(photo));
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = new Date(photo.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const save = document.createElement("button");
        save.type = "button";
        save.className = "btn small";
        save.textContent = "Télécharger";
        save.addEventListener("click", async () => saveBlob(await exportBlob(photo, photo.parts[0], 2), fileName(photo, photo.parts[0])));
        li.append(button, time, save);
        return li;
      }),
    );
  }

  $("save-all").addEventListener("click", async () => {
    for (const photo of photos) {
      saveBlob(await exportBlob(photo, photo.parts[0], 2), fileName(photo, photo.parts[0]));
      await new Promise((r) => setTimeout(r, 350)); // laisse le navigateur enchaîner les téléchargements
    }
  });
  $("clear").addEventListener("click", () => {
    if (!confirm("Retirer toutes les photos de cette page ? Elles ne sont plus sur le serveur : télécharge celles que tu veux garder avant.")) return;
    photos.length = 0;
    persist();
    render();
  });

  // ---------- visionneuse ----------
  const viewer = $("viewer");
  const canvas = $("view");
  const download = $("download");
  const shareBtn = $("share");
  const x2 = $("x2");
  const tabs = Array.from(document.querySelectorAll("[data-view]"));
  let current = null;
  let view = "deux";
  let blobUrl = null;
  let currentBlob = null;

  const renderViewer = () => {
    if (!current) return;
    draw(canvas, current, view, x2.checked ? 2 : 1);
    tabs.forEach((t) => {
      t.hidden = !current.parts.includes(t.dataset.view);
      t.setAttribute("aria-selected", String(t.dataset.view === view));
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      currentBlob = blob;
      blobUrl = URL.createObjectURL(blob);
      download.href = blobUrl;
      download.download = fileName(current, view);
      const file = new File([blob], fileName(current, view), { type: "image/png" });
      shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    }, "image/png");
  };

  function openViewer(photo) {
    current = photo;
    view = photo.parts[0];
    renderViewer();
    if (!viewer.open) viewer.showModal();
  }

  tabs.forEach((t) => t.addEventListener("click", () => { view = t.dataset.view; renderViewer(); }));
  x2.addEventListener("change", renderViewer);
  $("close").addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
  shareBtn.addEventListener("click", async () => {
    if (!currentBlob) return;
    try {
      await navigator.share({ files: [new File([currentBlob], fileName(current, view), { type: "image/png" })], title: "Capture 3DS" });
    } catch {
      /* partage annulé */
    }
  });

  // ---------- scanner de QR code ----------
  const video = $("video");
  const scanStatus = $("scan-status");
  let stream = null;
  let timer = null;
  let detector = null;
  let busy = false;
  const work = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  const loadJsQR = () =>
    window.jsQR
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "jsqr.js?v=1";
          s.onload = resolve;
          s.onerror = reject;
          document.head.append(s);
        });

  const handleCode = (text) => {
    let url;
    try { url = new URL(text); } catch { url = null; }
    if (url && url.host === "heivoli-network.fr" && url.pathname.replace(/\/$/, "") === "/s") {
      const id = url.search.slice(1).split("&")[0].toUpperCase();
      if (ID_RE.test(id)) {
        if (!seen.has(id)) {
          scanStatus.textContent = "QR code trouvé ✓";
          take(id);
        }
        return;
      }
    }
    if (url && url.protocol === "http:" && /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(url.hostname)) {
      // Partage en Wi-Fi local : la photo est sur la console, pas sur le serveur.
      scanStatus.textContent = "Partage en Wi-Fi local : ouverture du lien de la console…";
      stopScan();
      location.href = url.href;
      return;
    }
    scanStatus.textContent = "Ce QR code ne vient pas de Hn screen !";
  };

  const tick = async () => {
    if (!stream || busy || video.readyState < 2) return;
    busy = true;
    try {
      if (detector) {
        const codes = await detector.detect(video);
        if (codes[0]) handleCode(codes[0].rawValue);
      } else {
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        work.canvas.width = w;
        work.canvas.height = h;
        work.drawImage(video, 0, 0, w, h);
        const code = window.jsQR(work.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (code) handleCode(code.data);
      }
    } catch {
      /* image illisible : on réessaie à la suivante */
    }
    busy = false;
  };

  async function startScan() {
    say("");
    if (!navigator.mediaDevices?.getUserMedia) {
      say("Ce navigateur ne peut pas utiliser la caméra. Scanne le QR code avec l'appareil photo du téléphone.", true);
      return;
    }
    $("scanner").hidden = false;
    scanStatus.textContent = "Ouverture de la caméra…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      if ("BarcodeDetector" in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch { detector = null; }
      }
      if (!detector) await loadJsQR();
      scanStatus.textContent = "Vise le QR code affiché sur l'écran du bas de ta 3DS.";
      timer = setInterval(tick, 180);
      $("scanner").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      stopScan();
      say(
        error && error.name === "NotAllowedError"
          ? "L'accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur pour scanner."
          : "Impossible d'ouvrir la caméra. Scanne le QR code avec l'appareil photo du téléphone.",
        true,
      );
    }
  }

  function stopScan() {
    clearInterval(timer);
    timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    $("scanner").hidden = true;
  }

  $("scan").addEventListener("click", () => (stream ? stopScan() : startScan()));
  $("stop").addEventListener("click", stopScan);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });

  // ---------- démarrage ----------
  (async () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
      for (const p of saved.reverse()) await addPhoto(p.id, p.at, p.url);
    } catch {
      /* rien de gardé */
    }
    render();
    // Arrivée par le QR code scanné avec l'appareil photo du téléphone : /s/?<id>
    const id = (location.search.slice(1).split("&")[0] || "").toUpperCase();
    if (id) {
      history.replaceState(null, "", location.pathname);
      if (ID_RE.test(id)) await take(id);
      else say("Ce lien n'est pas valide. Scanne le QR code affiché par Hn screen ! sur ta 3DS.", true);
    }
  })();
})();
