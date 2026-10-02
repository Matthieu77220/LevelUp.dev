# Base de donnees

PostgreSQL est la source de verite du projet. Le schema est gere par des
migrations SQL natives afin de conserver les contraintes metier qui ne sont pas
toujours representables par un ORM.

## Demarrage local

Prerequis : Docker Desktop avec la commande `docker` disponible dans le terminal.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run db:up
npm run db:migrate
npm run db:verify
```

Renseigner les variables PostgreSQL avant de lancer ces commandes (voir README
racine). Modifier POSTGRES_PASSWORD sur un volume existant ne modifie pas le
mot de passe deja initialise dans PostgreSQL. Ne jamais supprimer le volume
pour resoudre ce probleme sans sauvegarde et decision explicite.

Le port PostgreSQL est expose uniquement sur 127.0.0.1. `db:up` attend l'etat
healthy du conteneur.

Les donnees sont conservees dans le volume Docker
`levelup-dev_levelup_postgres_data` lorsque le conteneur est arrete.

## Migrations

Chaque fichier de `migrations/` est applique une seule fois, dans l'ordre de son
nom, puis enregistre dans `app_private.schema_migrations`. Une migration deja
appliquee ne doit jamais etre modifiee : toute evolution passe par un nouveau
fichier numerote.

Le script utilise un verrou consultatif transactionnel et relit l'etat sous
verrou pour serialiser les migrations concurrentes. Une erreur annule toute
la migration courante. Les scripts transmettent le SQL en UTF-8.

`0003_data_integrity` interdit les recompenses XP sans montant et les
soumissions Git sans SHA complet (40 ou 64 caracteres). Une cle etrangere
composee conserve la coherence du username entre comptes et profils. Si des
donnees existantes violent ces contraintes, la migration echoue sans les effacer.

`0004_learning_catalog` initialise les deux domaines, treize blocs et trente-trois
competences de la V3. Les nouvelles progressions sont creees a la demande par
l'API ; cette migration n'attribue aucune progression ou XP aux comptes existants.

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
