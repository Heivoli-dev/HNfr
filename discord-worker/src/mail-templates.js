// Modèles des e-mails automatiques de Heivoli Network (style bulle, compatible clients mail).
// Tout le texte venant des membres passe par esc() avant d'être inséré.
const SITE = "https://heivoli-network.fr";
const LOGO = `${SITE}/assets/hn-logo.png`;
const FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

export const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const TONES = {
  purple: { pill: "#5a4bd8", pillBg: "#ece9ff", btnTop: "#8a80ff", btnBottom: "#4a3dd0" },
  orange: { pill: "#c24a00", pillBg: "#ffeadb", btnTop: "#ff9a5c", btnBottom: "#e64d00" },
  red: { pill: "#b3261e", pillBg: "#fde4e2", btnTop: "#f26a5f", btnBottom: "#c4271b" },
  green: { pill: "#3d7a10", pillBg: "#e6f5d6", btnTop: "#8fd14f", btnBottom: "#4f9a14" },
};

function button(label, href, tone) {
  const t = TONES[tone] || TONES.purple;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="border-radius:999px;background:${t.btnBottom};background-image:linear-gradient(180deg,${t.btnTop} 0%,${t.btnBottom} 100%);box-shadow:0 6px 16px rgba(60,40,160,.28)">
<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}

function quote(text) {
  return `<div style="margin:18px 0 16px;padding:14px 16px;border-radius:16px;background:#f5f4ff;border:1px solid #e4e1fb;font:15px/1.55 ${FONT};color:#3a3750;white-space:pre-wrap">${esc(text)}</div>`;
}

function layout({ preheader, tone = "purple", pill, title, bodyHtml, footerNote }) {
  const t = TONES[tone] || TONES.purple;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#efedf9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efedf9;background-image:linear-gradient(180deg,#f7f6fd 0%,#e9e6fa 100%)"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px"><a href="${SITE}" style="text-decoration:none"><img src="${LOGO}" width="64" height="64" alt="Heivoli Network" style="display:block;border:0;border-radius:18px;background:#ffffff;box-shadow:0 6px 18px rgba(50,39,101,.14)"></a></td></tr>
<tr><td style="border-radius:30px;border:1px solid #ffffff;background:#ffffff;background-image:linear-gradient(180deg,#ffffff 0%,#f6f5ff 60%,#eeebfd 100%);box-shadow:0 18px 44px rgba(50,39,101,.14);padding:34px 32px 30px">
<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${t.pillBg};color:${t.pill};font:800 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase">${esc(pill)}</span>
<h1 style="margin:16px 0 0;font:800 28px/1.15 ${FONT};letter-spacing:-.02em;color:#282639">${title}</h1>
<div style="margin-top:14px;font:15px/1.65 ${FONT};color:#4a4760">${bodyHtml}</div>
</td></tr>
<tr><td align="center" style="padding:20px 18px 0;font:12px/1.6 ${FONT};color:#7a7791">
${footerNote ? `${footerNote}<br>` : ""}<a href="${SITE}" style="color:#5040b7;text-decoration:none;font-weight:700">heivoli-network.fr</a> · <a href="https://discord.gg/Z7kZ3WWZxw" style="color:#5040b7;text-decoration:none">Discord</a> · <a href="${SITE}/conditions.html#confidentialite" style="color:#5040b7;text-decoration:none">Confidentialité</a><br>Heivoli Network · La passion Nintendo, ensemble.<br>
<span style="color:#9a97ad">© ${new Date().getFullYear()} Heivoli Network. Tous droits réservés.</span>
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 12px">${html}</p>`;

export function welcomeMail({ name }) {
  return {
    subject: "Bienvenue sur Heivoli Network !",
    html: layout({
      preheader: "Ton compte est prêt : profil, carte joueur et logiciels t'attendent.",
      pill: "Bienvenue",
      title: `Salut ${esc(name)},<br><span style="color:#5a4bd8">bienvenue&nbsp;!</span>`,
      bodyHtml: p("Ton compte Heivoli Network est prêt. Merci d'avoir accepté les règles de la communauté : elles permettent à tout le monde de se sentir bien.")
        + p("Pour bien commencer :")
        + `<ul style="margin:0 0 4px;padding-left:20px"><li style="margin:0 0 6px"><strong>Complète ton profil</strong> : pseudo, photo et description.</li><li style="margin:0 0 6px"><strong>Crée ta carte joueur</strong> avec ton code ami 3DS ou ton identifiant Pretendo pour trouver des joueurs.</li><li style="margin:0 0 6px"><strong>Découvre nos logiciels</strong> : ScreenLink 3DS, 3DS Theme Studio et Hn screen !</li></ul>`
        + button("Compléter mon profil", `${SITE}/profil.html`, "purple"),
      footerNote: "Tu reçois ce mail parce que tu viens de créer ton compte.",
    }),
  };
}

export function ticketReplyMail({ name, subject, ticketId, message }) {
  return {
    subject: `Nouvelle réponse à ton ticket : ${subject}`,
    html: layout({
      preheader: `La modération a répondu à « ${subject} ».`,
      pill: "Ticket",
      title: "La modération<br>t'a répondu",
      bodyHtml: p(`Salut ${esc(name)}, ton ticket <strong>« ${esc(subject)} »</strong> a reçu une nouvelle réponse :`)
        + quote(message)
        + button("Voir le ticket", `${SITE}/tickets.html?ticket=${encodeURIComponent(ticketId)}`, "purple"),
      footerNote: "Pour répondre, utilise le ticket sur le site : les réponses à ce mail ne sont pas lues.",
    }),
  };
}

export function sanctionMail({ name, type, reason, until }) {
  const isBan = type === "ban";
  const permanent = isBan && !until;
  const when = until ? new Date(until).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }) : "";
  return {
    subject: isBan ? (permanent ? "Ton compte a été banni" : "Ton compte est suspendu temporairement") : "Tu as reçu un avertissement",
    html: layout({
      preheader: isBan ? "Motif et durée de la sanction, et comment la contester." : "Un rappel des règles de la communauté.",
      tone: isBan ? "red" : "orange",
      pill: isBan ? (permanent ? "Bannissement" : "Bannissement temporaire") : "Avertissement",
      title: isBan ? (permanent ? "Ton compte a<br>été banni" : "Ton compte est<br>suspendu") : "Tu as reçu un<br>avertissement",
      bodyHtml: p(`Salut ${esc(name)}, la modération de Heivoli Network ${isBan ? "a sanctionné ton compte" : "t'envoie un avertissement"}. Voici le motif :`)
        + quote(reason)
        + (isBan ? p(`<strong>Durée :</strong> ${permanent ? "définitive" : `jusqu'au ${esc(when)}`}.`) : p("Ce n'est pas une sanction, mais en cas de récidive, la modération peut suspendre ton compte."))
        + p(isBan ? "Tu penses que c'est une erreur ? Tu peux contester une fois cette décision avec un ticket « Contestation »." : "Prends une minute pour relire les règles de la communauté.")
        + button(isBan ? "Contester la décision" : "Relire les règles", isBan ? `${SITE}/tickets.html` : `${SITE}/conditions.html#regles`, isBan ? "red" : "orange"),
      footerNote: "Ce mail est envoyé automatiquement à chaque décision de la modération.",
    }),
  };
}

export function newsMail({ name, type, title, text, unsubscribeUrl }) {
  return {
    subject: `${type} : ${title}`,
    html: layout({
      preheader: text.slice(0, 120),
      tone: type === "Important" ? "orange" : "purple",
      pill: type,
      title: esc(title),
      bodyHtml: p(`Salut ${esc(name)}, du nouveau sur Heivoli Network :`)
        + quote(text)
        + button("Lire l'annonce", `${SITE}/annonce.html`, type === "Important" ? "orange" : "purple"),
      footerNote: `Tu reçois les nouveautés parce que tu les as demandées. <a href="${esc(unsubscribeUrl)}" style="color:#5040b7">Se désabonner en un clic</a>`,
    }),
  };
}

export function autoReplyMail({ subject }) {
  return {
    subject: `Re: ${subject || "ton message"}`,
    html: layout({
      preheader: "On a bien reçu ton message, on te répond au plus vite.",
      tone: "green",
      pill: "Message reçu",
      title: "Merci pour<br>ton message&nbsp;!",
      bodyHtml: p("On a bien reçu ton mail et on te répond dès que possible, en général sous quelques jours.")
        + p("Pour une réponse plus rapide :")
        + `<ul style="margin:0 0 4px;padding-left:20px"><li style="margin:0 0 6px"><strong>Une question sur un compte ou un signalement</strong> : ouvre un ticket sur le site.</li><li style="margin:0 0 6px"><strong>Une question rapide</strong> : passe sur le serveur Discord.</li></ul>`
        + button("Ouvrir un ticket", `${SITE}/tickets.html`, "green"),
      footerNote: "Réponse automatique de contact@heivoli-network.fr.",
    }),
  };
}
