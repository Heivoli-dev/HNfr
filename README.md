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

### Modération automatique

Le filtre refuse une liste d’insultes (sans distinction majuscules/minuscules)
et les liens explicites HTTP(S), www et invitations Discord. Ce filtre déterministe
ne détecte pas toutes les insultes déguisées ni toutes les formes de harcèlement.
Les modérateurs peuvent toujours supprimer un commentaire manuellement.
Les mêmes contrôles sont appliqués dans le navigateur et dans les règles Firestore.

Chaque commentaire et son compteur privé `commentThrottle/{uid}` sont écrits dans
un même lot : délai minimal de 30 secondes par compte, toutes annonces confondues,
et refus d’un texte identique au dernier message (sans distinction de casse).
Le compteur ne peut pas être supprimé par le membre. Il conserve uniquement le
dernier texte et ses identifiants pour cette protection, et n’est lisible que par
son propriétaire. Les anciens commentaires restent lisibles ; ils ne sont pas
modérés rétroactivement.

Déployer les nouvelles règles puis les fichiers du site dans la même intervention :
les anciennes versions du formulaire sans écriture atomique seront refusées.
Recharger la page après déploiement. Les règles n’accordent aucune exemption aux
modérateurs pour publier des liens ou contourner le délai.

## Profils membres

`profil.html` permet de sauvegarder un pseudo (60 caractères), une description (280 caractères) et une photo via un lien HTTPS imgbb/Google/Discord. Les profils sont publics dans `profiles/{uid}` ; ils ne contiennent ni e-mail ni rôle d’administration. `profil.html?uid=…` affiche un membre et réserve le formulaire au propriétaire. Les commentaires utilisent le profil actuel, avec le nom et la photo d’origine en secours. Les nouvelles annonces enregistrent l’auteur pour rendre son profil accessible. Les modifications nécessitent un permis serveur à usage unique et respectent les bans par compte et connexion.
