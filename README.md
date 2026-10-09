# Heivoli Network

Site statique de la communauté Heivoli Network, avec connexion Google/Firebase,
connexion Discord via un Cloudflare Worker, annonces et tickets privés Firestore.

Les pages peuvent être publiées avec GitHub Pages depuis la racine de `main`.
Les règles Firestore et le Worker Discord nécessitent une publication distincte.

Consulter [SECURITY.md](SECURITY.md) pour les corrections de sécurité, les tests
et la procédure de publication coordonnée.

Tests locaux : `npm ci && npm test` (Node.js 22 ou supérieur).

## Commentaires des annonces

Les annonces publiées possèdent une section Commentaires (les annonces de
présentation sans identifiant ne sont pas commentables). La lecture est publique,
la publication nécessite un compte Google ou Discord, et seuls l’auteur et les
modérateurs peuvent supprimer un message. Les 50 derniers messages sont affichés.
Le texte est limité à 800 caractères, les noms proviennent du jeton authentifié,
et les dates sont attribuées par Firestore. Aucun e-mail n’est enregistré dans les commentaires.

Publier les règles avant le site :
`firebase deploy --only firestore:rules --project heivoli-network-408f3`.
Un envoi sur GitHub ne déploie pas les règles Firebase. Vérifier ensuite avec deux
comptes : publication, lecture après rechargement, suppression de son message et
refus de suppression du message d’un autre membre. Les tests de règles nécessitent
l’émulateur Firestore sur localhost:8080 (`npm run test:rules`).
