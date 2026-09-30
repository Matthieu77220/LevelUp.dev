# Base de donnees

PostgreSQL est la source de verite du projet. Le schema est gere par des
migrations SQL natives afin de conserver les contraintes metier qui ne sont pas
toujours representables par un ORM.

## Demarrage local

Prerequis : Docker Desktop avec la commande `docker` disponible dans le terminal.

```powershell
Copy-Item .env.example .env
npm run db:up
npm run db:migrate
npm run db:verify
```

Les donnees sont conservees dans le volume Docker
`levelup-dev_levelup_postgres_data` lorsque le conteneur est arrete.

## Migrations

Chaque fichier de `migrations/` est applique une seule fois, dans l'ordre de son
nom, puis enregistre dans `app_private.schema_migrations`. Une migration deja
appliquee ne doit jamais etre modifiee : toute evolution passe par un nouveau
fichier numerote.

Les schemas PostgreSQL sont separes par responsabilite :

- `identity` : comptes et profils ;
- `learning` : catalogue pedagogique et projets ;
- `progression` : progression, XP et quetes ;
- `evaluation` : soumissions et resultats ;
- `social` : equipes, amities et revues ;
- `rewards` : badges, cosmetiques et avatars ;
- `boss` : boss, tentatives et gates ;
- `system` : notifications et audit ;
- `app_private` : donnees techniques non exposees.

L'API devra utiliser un role PostgreSQL distinct du proprietaire des migrations.
Ce role et ses permissions seront ajoutes lorsque les besoins exacts de l'API et
du worker seront fixes.
