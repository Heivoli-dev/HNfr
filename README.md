# Heivoli Network

Site statique de la communauté Heivoli Network, avec connexion Google/Firebase,
connexion Discord via un Cloudflare Worker, annonces et tickets privés Firestore.

Les pages peuvent être publiées avec GitHub Pages depuis la racine de `main`.
Les règles Firestore et le Worker Discord nécessitent une publication distincte.

Consulter [SECURITY.md](SECURITY.md) pour les corrections de sécurité, les tests
et la procédure de publication coordonnée.

Tests locaux : `npm ci && npm test` (Node.js 22 ou supérieur).
