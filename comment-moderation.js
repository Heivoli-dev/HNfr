// Keep these expressions aligned with acceptableComment() in firestore.rules.
const insults = /(^|[^a-zà-ÿ0-9])(connards?|connasses?|encul[eé]s?|salope?s?|pute?s?|fdp|ntm|n[i1]gg(?:er|a)s?)([^a-zà-ÿ0-9]|$)/i;
const links = /(https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/)/i;
export function commentModerationError(text) {
  if (!text.trim()) return "Écris un commentaire avant de le publier.";
  if (text.length > 800) return "Ton commentaire dépasse les 800 caractères autorisés.";
  if (links.test(text)) return "Les liens ne sont pas autorisés dans les commentaires.";
  if (insults.test(text)) return "Reformule ton commentaire sans insultes pour le publier.";
  return "";
}
