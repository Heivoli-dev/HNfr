// Page de téléchargement des captures Hn screen ! : https://heivoli-network.fr/s/?<id>
// L'image reçue (400 x 480) contient l'écran du haut (0,0 400x240)
// et l'écran du bas centré dessous (40,240 320x240).
(() => {
  const API = "https://hn-screen.heivoli-discord-auth.workers.dev";
  const PARTS = {
    deux: { x: 0, y: 0, w: 400, h: 480, name: "hn-screen.png" },
    haut: { x: 0, y: 0, w: 400, h: 240, name: "hn-screen-haut.png" },
    bas: { x: 40, y: 240, w: 320, h: 240, name: "hn-screen-bas.png" },
  };
  const status = document.getElementById("status");
  const section = document.getElementById("shots");
  const canvas = document.getElementById("view");
  const download = document.getElementById("download");
  const shareBtn = document.getElementById("share");
  const x2 = document.getElementById("x2");
  const tabs = Array.from(document.querySelectorAll("[data-view]"));
  let source = null;
  let view = "deux";
  let blobUrl = null;
  let currentBlob = null;

  const fail = (text) => {
    status.textContent = text;
    status.classList.add("error");
    status.hidden = false;
    section.hidden = true;
  };

  const id = (location.search.slice(1).split("&")[0] || "").toUpperCase();
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(id)) {
    fail("Scanne le QR code affiché par l'appli Hn screen ! sur ta 3DS pour récupérer une capture.");
    return;
  }

  // Une zone unie (gris foncé partout) = écran absent de la capture.
  const isBlank = (part) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    ctx.canvas.width = part.w;
    ctx.canvas.height = part.h;
    ctx.drawImage(source, part.x, part.y, part.w, part.h, 0, 0, part.w, part.h);
    const d = ctx.getImageData(0, 0, part.w, part.h).data;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return false;
    return true;
  };

  const render = () => {
    const p = PARTS[view];
    const s = x2.checked ? 2 : 1;
    canvas.width = p.w * s;
    canvas.height = p.h * s;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, p.x, p.y, p.w, p.h, 0, 0, p.w * s, p.h * s);
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === view)));
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      currentBlob = blob;
      blobUrl = URL.createObjectURL(blob);
      download.href = blobUrl;
      download.download = p.name;
      const file = new File([blob], p.name, { type: "image/png" });
      shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    }, "image/png");
  };

  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      view = t.dataset.view;
      render();
    }),
  );
  x2.addEventListener("change", render);
  shareBtn.addEventListener("click", async () => {
    if (!currentBlob) return;
    const file = new File([currentBlob], PARTS[view].name, { type: "image/png" });
    try {
      await navigator.share({ files: [file], title: "Capture 3DS" });
    } catch {
      /* partage annulé */
    }
  });

  fetch(`${API}/i/${id}.png`, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" })
    .then((r) => {
      if (r.status === 404) throw new Error("expired");
      if (!r.ok) throw new Error("http");
      return r.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      source = bitmap;
      for (const name of ["haut", "bas"]) {
        if (isBlank(PARTS[name])) {
          tabs.find((t) => t.dataset.view === name).hidden = true;
          tabs.find((t) => t.dataset.view === "deux").hidden = true;
          view = name === "haut" ? "bas" : "haut";
        }
      }
      status.hidden = true;
      section.hidden = false;
      render();
    })
    .catch((e) => {
      fail(
        e.message === "expired"
          ? "Cette capture a expiré (les liens durent 24 h). Partage-la de nouveau depuis ta 3DS."
          : "Impossible de charger la capture. Vérifie ta connexion et recharge la page.",
      );
    });
})();
