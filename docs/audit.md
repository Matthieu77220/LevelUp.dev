# Bilan technique du 2 octobre 2026

## Perimetre

Audit du code applicatif present, configuration, migrations, documentation et
dependances. Pas de refonte graphique ni implementation des futurs cours,
workers d'evaluation, quetes ou boss. La landing reste une presentation du projet.

## Corrections

- Deconnexion : une erreur SQL ne produit plus de faux succes et ne supprime
  plus le cookie permettant de retenter la revocation.
- Lecture du compte : une panne SQL ne deconnecte plus le navigateur ; les
  sessions absentes ou expirees restent rejetees. Ecritures last_seen limitees
  a une fois par cinq minutes au lieu d'une par lecture.
- Comptes sans hash local : refus de connexion generique au lieu d'une erreur
  de conversion SQL. Verification stricte du format des cookies et hashes.
- JSON : type MIME exact, rejet de null, champs inconnus et corps multiples.
  Bornes sur les identifiants et mots de passe avant calcul couteux.
- Calculs Argon2id limites en concurrence, memoire du limiteur IP bornee,
  delai des requetes et protections d'origine conserves.
- Demarrage Go : ouverture du port avant annonce de disponibilite, attente de
  l'arret HTTP avant fermeture PostgreSQL, erreurs de configuration sans URL
  de connexion sensible. Controle HTTPS/cookie Secure en APP_ENV=production.
- Migration additive 0003 ; verrou de migration, transmission UTF-8, erreurs
  Docker explicites. Port PostgreSQL local uniquement.
- Frontend : profil charge depuis l'API, navigation apres authentification,
  deconnexion avec gestion d'erreur, validation de la reponse API, timeout,
  labels accessibles, longueur UTF-8 du mot de passe coherente avec Go.
- TypeScript strict, decoupage des routes, styles globaux independants,
  proxy Vite, navigation mobile et boutons de landing relies.
- Compose, docs et fichiers lock ne sont plus ignores par Git ; fichiers
  d'environnement, builds et resultats de tests restent exclus.

## Verifications reproductibles

### Complement de maintenance du 2 octobre 2026

- Deconnexion : les reponses HTML et les succes HTTP inattendus sont rejetes ;
  seul le statut 204 du contrat API confirme la fermeture de session.
- Profil : un HTTP 401 sans JSON redirige aussi vers la connexion. Les donnees
  invalides (dont les dates) affichent une erreur recuperable avec reessai.
- Requetes : annulation au demontage de la page, y compris pendant la lecture
  du corps ; prevention des redirections tardives et des soumissions simultanees.
- Nettoyage : gestion des mutations partagee entre connexion, inscription et
  deconnexion, suppression des etats d'erreur redondants, indentation des routes
  et de Vite corrigee, resultats Playwright exclus du lint.
- Backend : rejet des hashes Argon2id avec un prefixe parasite, couvert par un
  test de regression qui echouait avant la correction.
- Tests navigateur : couverture des erreurs HTTP, reponses de deconnexion
  inattendues, profil invalide et annulation d'une connexion. La fixture de
  username respecte maintenant la limite de 32 caracteres imposee par l'API.

### Commandes

Commandes dans le README racine. Tests Go unitaires et d'integration sur une
base temporaire ; tests Playwright desktop/mobile avec API simulee ; compilation
TypeScript/Vite, ESLint, go vet, verification des migrations. Les tests navigateur
ne constituent pas a eux seuls un test de bout en bout du PostgreSQL reel.

L'audit initial govulncheck signalait notamment les anciennes versions de Go,
pgx et x/text. Correctifs de reference :
[pgx GO-2026-5004](https://pkg.go.dev/vuln/GO-2026-5004) et
[x/text GO-2026-5970](https://pkg.go.dev/vuln/GO-2026-5970).
La toolchain et ces dependances sont actualisees dans go.mod/go.sum.

## Avant production

- Configurer un role SQL applicatif distinct de l'administrateur local ; le
  compte Docker actuel est reserve au developpement et aux migrations.
- Configurer HTTPS, reverse proxy same-site, sauvegardes et restauration,
  supervision, rotation des secrets et retention des journaux/sessions.
- Le rate limiting est en memoire par instance et par IP. Il ne constitue pas
  une defense suffisante contre une attaque distribuee. Ne pas faire confiance
  aux en-tetes de proxy sans configuration explicite.
- Ajouter les parcours de changement/recuperation de mot de passe et de gestion
  des sessions selon les choix produit. Sans email, aucune recuperation par
  email ne peut etre promise.
- Le modele conceptuel DBML precede les migrations d'authentification. Les
  migrations SQL sont la reference executable ; les regles metier du reste
  de la plateforme devront etre implementees avec leurs tests lors des modules.
- Aucun benchmark de charge ni audit d'intrusion externe n'a ete realise.
  Des tests et scanners verts ne constituent pas une garantie absolue de securite.
