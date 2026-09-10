# Sécurité — audit du 10 septembre 2026

Les modifications sont locales : elles ne protègent pas encore la version publiée.
Aucun audit ne garantit l’absence de toutes les failles. Cet examen porte sur le code
présent dans ce dépôt, pas sur les comptes et configurations des fournisseurs.

## Corrections

- Les annonces issues de Firestore sont insérées comme texte, jamais comme HTML.
- Les droits fondateur et administrateur exigent une adresse e-mail vérifiée.
  Les autorisations utilisent les documents `admins/{email}` comme l’interface ;
  les anciens documents nommés par UID ne donnent plus de privilèges.
- Firestore contrôle les champs autorisés, leurs types et longueurs, les auteurs,
  les catégories et les dates serveur. Les propriétaires de tickets ne peuvent
  pas modifier leur identité, leur statut ou les messages déjà envoyés.
- Un membre ne peut lire que ses tickets et leurs messages. Seule la modération
  accède à tous les tickets. Les annonces restent publiques.
- Discord exige un état OAuth lié à un cookie sécurisé `__Host-`, et un second état
  conservé dans l’onglet d’origine. Les retours non sollicités sont rejetés.
  Les destinations de retour sont limitées à deux pages du site.
- Les jetons personnalisés Discord expirent après cinq minutes. Les réponses
  d’authentification interdisent la mise en cache et l’envoi du référent. Le jeton
  est retiré du fragment d’URL avant utilisation ; il reste un secret au porteur
  pendant sa courte validité. Les jetons Discord ne sont jamais envoyés au site.
- La permission Discord de lire l’e-mail a été supprimée car inutilisée.
- La session Firebase est limitée à la session de l’onglet. Les données affichées
  et les abonnements privés sont nettoyés lors d’un changement de compte.
- Les pages ont une politique CSP restrictive (scripts inline interdits) et
  `no-referrer`. Les domaines Firebase nécessaires à la connexion sont autorisés.
- Wrangler est fixé à une version précise et sa dépendance Sharp à la version
  corrigée 0.35.4. Les fichiers secrets usuels sont exclus des nouveaux commits.

## Validation

Tests sans compte réel :

```sh
npm ci
npm test
```

Tests des droits Firestore : Java 21 et Firebase CLI doivent être disponibles
sur le poste de test. Le CLI est un outil externe, non une dépendance du site.
Utiliser exclusivement le projet de démonstration ci-dessous :

```sh
firebase emulators:exec --only firestore --project demo-heivoli 'npm run test:rules'
```

Six tests JavaScript et cinq tests dans l’émulateur Firestore ont réussi. Ils
couvrent l’injection HTML, les retours OAuth invalides et valides, la signature et
la durée des jetons, les lectures croisées interdites, les e-mails non vérifiés,
l’usurpation d’auteur, les champs falsifiés et les tickets fermés. Le Worker a
également été compilé avec `wrangler deploy --dry-run`, sans publication.
La connexion Google/Discord complète avec de vrais comptes reste à vérifier lors
de la publication, notamment les restrictions CSP et les domaines autorisés.

## Publication coordonnée

1. Publier `firestore.rules` sur le projet `heivoli-network-408f3` depuis la console
   Firebase ou avec `firebase deploy --only firestore:rules --project heivoli-network-408f3`.
2. Publier le Worker Discord et les pages du site dans la même fenêtre de maintenance :
   le nouveau protocole `clientState` nécessite les deux versions ensemble.
3. Contrôler avec deux comptes membres distincts et un administrateur : connexion
   Google et Discord, création de ticket, réponse, fermeture, déconnexion et annonces.
   Une connexion Discord commencée avant la mise à jour devra être recommencée.
4. Vérifier les règles réellement actives dans Firebase ; un commit GitHub ne les
   publie pas. Vérifier que les secrets du Worker sont définis comme secrets Cloudflare,
   jamais dans `wrangler.jsonc` ou le dépôt.

## Protections à configurer dans les services

La réponse HTTP publique vérifiée pendant l’audit est servie par GitHub Pages et
ne contient pas de CSP HTTP, `X-Frame-Options` ou HSTS. La CSP dans les pages couvre
les scripts, mais `frame-ancestors` nécessite un en-tête HTTP. Ajouter via une couche
HTTP configurable devant le site : `Content-Security-Policy: frame-ancestors 'none'`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
et HSTS une fois HTTPS vérifié sur le domaine. Une migration d’hébergement/DNS n’a
pas été effectuée dans cet audit.

Configurer Firebase App Check avec un fournisseur web, observer les requêtes
légitimes puis activer son application pour Firestore. Prévoir également des limites
anti-abus côté serveur pour les créations de tickets et le service OAuth : les règles
actuelles limitent le contenu mais ne limitent pas le nombre de tickets/messages.
Activer des alertes de consommation et surveiller les erreurs d’authentification.

Activer l’authentification multifacteur des comptes Google fondateur, GitHub et
Cloudflare ; vérifier leurs accès et les permissions minimales du compte de service
Firebase. Le bot Discord n’a besoin que des permissions nécessaires à ses fonctions.
Révoquer les clés si elles ont été exposées ; leur absence dans les fichiers actuels
ne prouve pas leur absence dans l’historique Git ou les journaux.

La clé API Firebase publique identifie le projet et ne remplace pas les règles
Firestore. Ne pas y stocker de secrets serveur. La description du profil demeure
enregistrée localement sur l’appareil comme l’indique l’interface.

Références : [contexte d’authentification et dates serveur Firebase](https://firebase.google.com/docs/reference/rules/rules.firestore.Request),
[limites de frame-ancestors dans une balise meta](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
