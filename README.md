# LevelUp.dev

Plateforme d'apprentissage du developpement avec progression technique inspiree
des jeux de role.

## Etat du projet

- `frontend/` : React, TypeScript strict, Vite, Tailwind, React Router.
- `backend/` : API Go, sessions PostgreSQL et authentification locale.
- `database/` : migrations SQL transactionnelles et verifications.
- `docs/` : modele conceptuel et [bilan technique](docs/audit.md).

Fonctionnel : landing, inscription, connexion, profil de compte, restauration
de session, deconnexion et espace `/parcours` : 2 domaines, 13 blocs,
33 competences, recherche et demarrage persistant au rang E sans attribution
d'XP. Les cours, quetes, evaluations et boss restent a implementer ; les
exemples de progression de la landing sont une maquette.

Le [suivi V3](docs/roadmap-v3.md) detaille ce jalon et les prochaines etapes a
partir du [cahier des charges original](docs/developer_leveling_system_spec_v3.json).

## Lancer en local (PowerShell)

Prerequis : Docker Desktop actif, Node compatible avec Vite (22.12+), npm et Go.
La version Go du projet est declaree dans `backend/go.mod` et telechargee
automatiquement si `GOTOOLCHAIN=auto`.

Sur un nouveau clone uniquement, creer `.env` a partir de `.env.example` sans
ecraser un fichier existant. Renseigner `POSTGRES_DB`, `POSTGRES_USER`,
`POSTGRES_PASSWORD` et `POSTGRES_PORT` (exemple local : `levelup`, `levelup`,
un mot de passe de developpement, `5432`). Laisser `DATABASE_URL` vide avec
cette configuration. Ne jamais committer `.env`.

```powershell
npm --prefix frontend ci
npm run db:up
npm run db:migrate
npm run db:verify
npm run dev:back
```

Dans un second terminal, depuis la racine :

```powershell
npm run dev:front
```

Frontend : http://localhost:5173 ; API : http://localhost:8081 ; sante :
http://localhost:8081/health. Utiliser `localhost` dans le navigateur pour
correspondre a `FRONTEND_ORIGIN`, pas alternativement `127.0.0.1`.

Vite relaie `/api` vers l'API. `API_PROXY_TARGET` permet de changer son port ;
`VITE_API_URL=/api/v1` est le reglage recommande. Un ancien `.env` contenant
l'URL absolue localhost:8081 reste compatible. Redemarrer Vite apres modification.
Si un port est occupe, arreter son ancien serveur ou ajuster les deux cotes ;
ne pas lancer une seconde instance du meme service.

## Verifications

```powershell
npm run build
npm run lint
npm run test:back
go -C backend vet ./...
npm run test:front
```

Les tests navigateur utilisent Edge installe et le port 5174. Leurs reponses
API sont simulees pour tester les etats du frontend de facon deterministe.
Les tests d'integration Go utilisent un vrai PostgreSQL dans une base jetable :

```powershell
$env:RUN_DATABASE_TESTS = '1'
go -C backend test ./... -count=1
Remove-Item Env:RUN_DATABASE_TESTS
```

Ils necessitent le droit CREATEDB, appliquent toutes les migrations et suppriment
uniquement leur propre base `levelup_test_<aleatoire>`.

Voir [backend/README.md](backend/README.md) et
[database/README.md](database/README.md) pour les limites avant production.
