# API LevelUp.dev

API metier Go. La premiere verticale implemente l'authentification locale par
username et mot de passe, sans fournisseur externe.

## Demarrage

Depuis la racine, PostgreSQL doit etre actif et les migrations appliquees :

```powershell
npm run db:up
npm run db:migrate
cd backend
go run ./cmd/api
```

L'API ecoute par defaut sur `http://localhost:8081` et accepte le frontend
`http://localhost:5173`.

## Routes

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/learning/catalog` (session requise)
- `POST /api/v1/learning/skills/{skillID}/start` (session et origine requises)
- `GET /health`

Le catalogue expose uniquement les domaines, blocs et competences publies,
avec la progression du compte connecte. Le demarrage est idempotent : passage
de UNRANKED a E, sans XP et sans remettre a zero les acquis. Les prerequis
sont controles cote serveur. Voir [le suivi V3](../docs/roadmap-v3.md).

Les requetes d'ecriture provenant du navigateur doivent fournir un en-tete
`Origin` correspondant a `FRONTEND_ORIGIN`. Les sessions sont transmises par
cookie HttpOnly et leur token est uniquement conserve sous forme de SHA-256 en
base.

## Configuration

- `DATABASE_URL` : utilisee lorsque les variables PostgreSQL detaillees ne sont pas presentes ;
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` et
  `POSTGRES_PORT` : configuration locale prioritaire ;
- `API_ADDRESS` : `127.0.0.1:8081` par defaut ;
- `APP_ENV` : `production` impose cookie Secure et origine HTTPS ;
- `FRONTEND_ORIGIN` : `http://localhost:5173` par defaut ;
- `COOKIE_SECURE` : `false` en local, `true` derriere HTTPS ;
- `SESSION_TTL` : `24h` par defaut, entre `1h` et `720h`.

En production, l'API et le frontend doivent etre exposes sous HTTPS. Avec
`COOKIE_SECURE=true`, le cookie adopte le prefixe securise `__Host-`.

`/health` verifie la connexion PostgreSQL et repond 503 si elle echoue.
Les requetes ont un budget de 10 secondes. Le hachage Argon2id est limite a
quatre operations simultanees ; un surplus recoit 503 avec Retry-After.
Le dernier acces a une session est actualise au plus toutes les cinq minutes.
La duree maximale de session reste absolue, elle n'est pas prolongee a la lecture.

Les limiteurs de tentatives sont locaux a une instance et utilisent RemoteAddr,
jamais un X-Forwarded-For non verifie. Derriere un proxy, prevoir une limitation
adaptee au proxy et une politique explicite de proxies de confiance avant de
passer a plusieurs instances. Un attaquant distribue n'est pas neutralise par
la seule limitation IP.

Avant production : role SQL applicatif a privileges minimaux, sauvegardes
testees, HTTPS, rotation des secrets, retention des sessions/journaux et
supervision. Le compte PostgreSQL Docker local est un compte de developpement.
Ne pas utiliser ses privileges administrateur en production. La recuperation
et le changement de mot de passe ne sont pas encore implementes.
