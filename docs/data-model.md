# Modele de donnees V1

Ce dossier contient le modele conceptuel initial du Developer Leveling System.
Le fichier [`data-model.dbml`](./data-model.dbml) peut etre importe dans
[dbdiagram.io](https://dbdiagram.io) ou tout outil compatible DBML pour obtenir
un diagramme relationnel interactif.

Ce modele est une base de discussion. Il ne constitue pas encore une migration
PostgreSQL et ne depend d'aucun ORM.

## Frontieres du modele

Le schema est organise autour de neuf domaines metier :

1. Identite : `users`, `auth_accounts`, `profiles`.
2. Catalogue pedagogique : `domains`, `blocks`, `skills`, `skill_levels`,
   `learning_modules`, `exercises`, `projects`.
3. Progression : progressions utilisateur et journal `xp_transactions`.
4. Evaluation : `submissions`, `evaluations`, `test_results`.
5. Collaboration : equipes, invitations, amities et revues.
6. Quetes : quetes, progression et recompenses.
7. Personnalisation : badges, cosmetiques et avatar.
8. Boss : definition, tentatives, gates et resultats.
9. Systeme : notifications et journal d'audit.

## Decisions structurantes

### Contenu versionne

Les lecons, consignes, codes de depart et bundles de tests vivent dans le depot
de contenu. PostgreSQL stocke leurs metadonnees, une reference immutable et la
version utilisee. Une soumission garde cette version afin qu'un resultat reste
reproductible apres la publication d'une nouvelle version d'un exercice.

Les tests caches ne sont jamais exposes par l'API publique. Le worker recoit la
reference du bundle directement depuis l'infrastructure d'evaluation.

### Progression auditable

`xp_transactions` est un journal append-only. Une cle d'idempotence empeche une
meme reussite d'attribuer plusieurs fois de l'XP. Les totaux presents dans les
tables de progression sont des projections transactionnelles, pas la source de
verite historique.

Le rang global ne se deduit pas uniquement du total d'XP. Il sera recalcule par
le domaine de progression a partir des rangs de competences, des projets et des
boss valides.

### Soumissions reproductibles

Une soumission `INLINE` contient le code envoye. Une soumission `GIT` pointe
vers un depot, une branche et surtout un commit precis. Les deux modes passent
ensuite par la meme evaluation asynchrone.

Une contrainte PostgreSQL devra imposer exactement une cible parmi
`exercise_id`, `project_id` et `boss_attempt_id`, ainsi que les champs requis
par le `source_type`. DBML ne permet pas d'exprimer proprement toutes ces
contraintes conditionnelles : elles seront ajoutees dans les migrations SQL.

### Boss

Un boss reutilise la definition d'un projet mais ajoute des prerequis, des
tentatives et des gates obligatoires. Les statistiques publiques se calculent
a partir des tentatives ; elles ne sont pas stockees comme source de verite.

## Contraintes a ajouter dans PostgreSQL

- Refuser les auto-prerequis de competence et les cycles dans le graphe.
- Refuser une amitie avec soi-meme et normaliser l'unicite d'une paire.
- Garantir un seul proprietaire actif par equipe.
- Limiter a trois les badges publics d'un profil.
- Verifier les montants d'XP et les limites CPU/memoire strictement positifs.
- Verifier qu'un boss reference soit un boss de bloc ou de domaine, jamais les deux.
- Verifier la coherence entre source `INLINE`/`GIT` et les champs de soumission.
- Interdire la modification et la suppression des transactions d'XP attribuees.

## Questions encore ouvertes

- ORM de l'API : Prisma, Drizzle ou SQL/Kysely.
- Fournisseur d'authentification et gestion des sessions.
- Portee exacte du contenu administrable depuis l'application.
- Conservation du code source inline et duree de retention des resultats bruts.
- Politique de suppression d'un compte et anonymisation des contributions.
- Modele des quetes : moteur JSON generique ou objectifs relationnels types.

## Prochaine etape

La prochaine revue doit parcourir les parcours principaux (inscription,
exercice, projet Git, equipe, revue, boss) et verifier que chaque transition
metier est representable. Une fois ces parcours valides, le modele pourra etre
converti en migrations PostgreSQL et en schema ORM.
