# Suivi du cahier des charges V3

Reference : [specification originale](developer_leveling_system_spec_v3.json),
fournie le 2 octobre 2026. Elle decrit l'ensemble de la V1 cible.

## Jalon livre : domaines, blocs et competences

Apres connexion, `/parcours` permet de choisir un domaine, parcourir les blocs,
rechercher une competence, consulter ses rangs et commencer son parcours.
Le profil de compte et la landing donnent acces a cet ecran. Si la session
expire, la connexion ramene a la competence demandee.

La migration additive `0004_learning_catalog` initialise :

- 2 domaines : Developpement web et Logique & algorithmes ;
- les 4 blocs Web et les 9 blocs algorithmiques de la specification ;
- 33 competences, dont Git transversal.

La specification ne detaille pas les competences de chaque bloc algorithmique.
Le catalogue regroupe C, C++, Python et les fondamentaux logiques dans le bloc
Fondamentaux, puis repartit les sujets dans les huit autres blocs. Python cote
serveur et Python algorithmique ont des progressions distinctes. Git conserve
une seule progression, accessible depuis les deux domaines.

Le rang initial est `UNRANKED`. Commencer une competence enregistre `E`, le point
d'entree du debutant absolu, et zero XP. Les appels repetes ou simultanes
conservent une seule progression et ne reinitialisent jamais les acquis.
Le rang global reste celui du profil et l'XP globale est lue dans le journal
`xp_transactions` ; aucun rang global n'est deduit du nombre de clics.

Les prerequis deja presents en base sont verifies au demarrage et exposes comme
un etat verrouille. Aucun nouveau prerequis technique n'est invente par le seed.
Git n'est pas requis pour debuter les autres competences. Les contenus DRAFT
ou ARCHIVED et leurs descendants ne sont pas exposes.

## API

Ces routes exigent le cookie de session habituel :

- `GET /api/v1/learning/catalog` : rang global, XP totale et domaines imbriques
  contenant les blocs et competences avec progression personnelle ;
- `POST /api/v1/learning/skills/{skillID}/start` : demarrage idempotent, sans corps,
  reponse `{ "rank": "E", "xp": 0 }` pour une nouvelle competence.

L'identite provient exclusivement de la session. Les champs envoyes dans un
corps de demarrage ne peuvent attribuer ni XP, ni rang, ni progression a autrui.
Les ecritures exigent une origine de confiance. Un prerequis manquant produit
409 ; un contenu absent ou non publie produit 404 ; un identifiant mal forme
produit 400. Une session absente ou expiree produit 401.

La lecture du catalogue utilise une transaction en lecture seule avec un
snapshot coherent. Le nombre de requetes est fixe, independamment du nombre
de competences. Le client partage le transport HTTP avec l'authentification,
valide les reponses et annule les requetes au depart de la page.

## Choix techniques actuels

Le projet conserve React/Vite/TypeScript et l'API Go/pgx/PostgreSQL existants.
La proposition Next.js/Prisma du JSON ne correspond pas a l'architecture deja
implementee. L'authentification reste par username et mot de passe, comme dans
le projet actuel ; le JSON mentionne email/mot de passe. Ces ecarts sont
explicites et ne changent pas les regles de progression de ce jalon.

## Prochaines livraisons

1. Definir les conditions de validation par rang, les prerequis techniques et
   les recompenses de pratique, puis le service transactionnel et idempotent
   d'attribution d'XP. Le bareme exact n'est pas donne dans la V3.
2. Publier les premiers cours et exemples de rang E, avec contenu versionne.
3. Livrer la premiere boucle de pratique indiquee par la V3 : C `ft_strlen`,
   editeur inline, soumission, worker et sandbox ephemere, contraintes, tests
   visibles/caches, controle memoire, resultat et attribution d'XP.
4. Projets Git avec commit SHA, quetes, avatar/cosmetiques, collaboration,
   revues, puis moteur de boss et statistiques, Enterprise Core et ATLAS.

Les cours et evaluations ne sont pas encore disponibles. L'interface l'indique
sur la fiche de competence ; aucun bouton ne pretend executer ou valider du
code. Les seuils d'XP, un niveau global et les regles de passage de rang ne sont
pas simules.

## Validation

- Tests d'integration PostgreSQL sur bases jetables : catalogue initial,
  sessions/origines, demarrages simultanes, conservation des acquis, isolation
  entre utilisateurs, prerequis, publication des trois niveaux et catalogue vide.
- Playwright ordinateur/mobile : choix de domaine, recherche, demarrage,
  rechargement, verrouillage, lien Git transversal, panne/reessai et reconnexion
  vers la competence demandee. Les reponses API navigateur sont simulees.
- Compilation TypeScript/Vite, ESLint, tests Go et `go vet`.
