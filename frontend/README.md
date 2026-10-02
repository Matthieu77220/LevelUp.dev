# Frontend LevelUp.dev

React / TypeScript strict / Vite / Tailwind. Routes dans `src/App.tsx`, pages
chargees a la demande et styles globaux dans `src/index.css`.

## Commandes

```powershell
npm ci
npm run dev
npm run build
npm run lint
npm run test:e2e
```

`/` : landing ; `/inscription` et `/connexion` : formulaires ; `/profil` : compte
charge via `/auth/me`, redirection connexion si session absente.
`/parcours` : catalogue personnel, selection d'un domaine, recherche et
demarrage d'une competence. Les parametres `domaine` et `competence` permettent
un lien direct ; la connexion restaure cette destination.
Les sessions restent dans un cookie HttpOnly, sans token en localStorage.

Le client API valide les statuts HTTP et les donnees du profil avant de les
afficher. Une reponse 401 renvoie vers la connexion, meme sans corps JSON ;
seul un statut 204 confirme une deconnexion. Les formulaires partagent le hook
`useAuthMutation`, qui empeche les envois concurrents et annule les requetes
lorsqu'on quitte la page. La lecture du profil est egalement annulable.
Le transport partage est dans `src/lib/api.ts`, le contrat du catalogue dans
`src/lib/learningApi.ts`. Les cours ne sont pas encore publies ; le demarrage
enregistre uniquement le point d'entree E a zero XP.

Vite lit le `.env` racine. Ne jamais mettre de secret dans une variable `VITE_*`.
`/api/v1` est l'URL par defaut, relayee en developpement vers `API_PROXY_TARGET`
(localhost:8081). Voir le README racine pour demarrer les deux services.

Playwright utilise Edge, le port 5174, quatre workers et des reponses API simulees. Les tests
backend couvrent le vrai PostgreSQL. Captures et traces dans `test-results/`.

En production, servir `dist/`, relayer `/api` vers Go et renvoyer `index.html`
pour les routes frontend. Le proxy Vite n'existe pas dans le build. La
configuration des cookies actuelle attend un deploiement same-site sous HTTPS.
