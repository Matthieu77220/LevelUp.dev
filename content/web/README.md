# Exercices HTML et CSS

48 exercices : 24 HTML et 24 CSS, quatre par difficulté E, D, C, B, A et S.
Les sources éditables sont [html.mjs](html.mjs) et [css.mjs](css.mjs).
Chaque entrée contient une consigne, une liste d'éléments autorisés, une solution
de référence et des assertions exécutées dans un vrai navigateur.

## Contrat élève

Une consigne indique tout ce qui sera exigé. L'encadré limite les balises et
attributs HTML ou les propriétés et règles CSS au périmètre de l'exercice.
Le HTML est fourni et non modifiable dans les exercices CSS.

Le résultat est exclusivement `OK` ou la première erreur de syntaxe, de
contrainte ou d'assertion. Aucun indice, solution ou décompte de tests réussis
n'est affiché. Une panne du correcteur renvoie `EvaluationError` et n'attribue
aucun XP. Le lien de contribution pointe vers le fichier de l'exercice.

Les solutions et assertions restent dans les sources destinées aux mainteneurs,
hors du bundle React et des réponses API. Le dépôt étant ouvert, ce ne sont pas
des secrets : la plateforme ne prétend pas empêcher de consulter le dépôt.

Les brouillons restent en mémoire pendant la navigation entre exercices ; un
rechargement les efface. Les réussites, tentatives et XP sont persistées en base.
Les URL d'images, médias et formulaires sont des contrats à écrire ; aucun
téléchargement ni envoi réseau n'est nécessaire à leur validation. L'aperçu
est isolé et ne charge pas les ressources externes.

## Progression

Le rang acquis est distinct de la difficulté de l'exercice en cours.
Un exercice se débloque après la validation de tous les précédents. Une
réussite attribue sa récompense une seule fois, même en cas de requêtes
simultanées ou de nouvelle tentative. Un échec ultérieur ne retire pas un acquis.

| Difficulté | Récompenses des quatre exercices | XP cumulée en fin de groupe | Rang acquis |
| --- | --- | ---: | --- |
| E | 20, 30, 40, 60 | 150 | D |
| D | 75, 100, 125, 150 | 600 | C |
| C | 180, 220, 260, 340 | 1 600 | B |
| B | 400, 500, 600, 800 | 3 900 | A |
| A | 900, 1 100, 1 300, 1 700 | 8 900 | A |
| S | 1 800, 2 200, 2 600, 3 400 | 18 900 | S |

Commencer donne E et 0 XP. S exige les 24 validations, dont ses quatre
épreuves, et 18 900 XP. Les rangs de domaine et le rang global restent régis
par le modèle général du projet ; ces exercices changent le rang de la
compétence et alimentent le journal global d'XP.

## Progression des concepts

| Niveau | HTML | CSS |
| --- | --- | --- |
| E | Paragraphe, titres, liste, ancre | Couleur, typographie, boîte, sélecteurs |
| D | Figure et alternative, repères, tableau, formulaire | Flex, grille, espacement, états et focus |
| C | Description et date, choix exclusifs, FAQ, document complet | Responsive, variables, sticky, pseudo-éléments |
| B | En-têtes croisés, picture/srcset, association de formulaire, internationalisation | RTL et propriétés logiques, conteneurs, cascade, mouvement réduit |
| A | Édition scientifique, médias et alternatives, modèle inerte, réservation native | Subgrid, dimensionnement intrinsèque, :has, impression |
| S | Matrice à trois axes ; contrat complet de soumission ; document international ; dossier de synthèse | Composants conteneur/subgrid ; architecture de cascade ; modes d'écriture et préférences ; interface sous contraintes |

Les épreuves finales combinent des concepts déjà rencontrés et multiplient les
contraintes. La difficulté HTML porte sur les relations, les structures et les
comportements natifs. Elle n'introduit pas artificiellement de l'algorithmique.
Cette série atteste les contrats exercés ; elle ne constitue pas un audit
exhaustif d'accessibilité ou de toute la norme HTML/CSS.

Références de conception : [HTML Living Standard](https://html.spec.whatwg.org/multipage/),
[CSS Grid Level 2](https://www.w3.org/TR/css-grid-2/) et
[CSS Containment Level 3](https://www.w3.org/TR/css-contain-3/).

## Installation et exécution

Depuis la racine, avec Node, Go, PostgreSQL et Edge installé sur Windows :

```powershell
npm --prefix frontend ci
npm --prefix content/web ci
npm run db:migrate
npm run dev:back
```

Puis `npm run dev:front` dans un autre terminal. Après connexion et démarrage
de la compétence, ouvrir `/parcours/html` ou `/parcours/css`.

L'API lance `node content/web/evaluate-cli.mjs` avec une entrée JSON sur stdin.
La recherche du script fonctionne depuis la racine ou `backend/`.
`WEB_EVALUATOR_PATH` peut préciser un chemin absolu lors du déploiement.
`WEB_EVALUATOR_BROWSER` choisit le canal Playwright (`msedge` par défaut sous
Windows, `chromium` ailleurs). Pour Chromium, installer le navigateur avec
`npm --prefix frontend exec -- playwright install chromium`.
Le correcteur utilise le Playwright déjà verrouillé par le frontend ; conserver
ces dépendances sur la machine qui exécute l'API.

La soumission ne peut fournir ni tests, ni XP, ni identité. Les éléments HTML
sont analysés avec parse5 ; les propriétés CSS avec PostCSS et CSS.supports.
Chaque soumission a un contexte navigateur neuf, JavaScript désactivé, réseau
interdit, CSP restrictive et sandbox Chromium activée. Le code CSS est inséré
comme texte, jamais interpolé dans une balise HTML côté correcteur.
Limites : 64 Kio de source, 2 000 nœuds/règles, deux évaluations simultanées,
60 requêtes de soumission par minute et par IP, huit secondes de vérification
après le démarrage du navigateur (jusqu'à quinze secondes pour ce démarrage).
L'appel complet du correcteur est limité à vingt-quatre secondes.
Le navigateur constitue l'isolation locale de ce jalon. La valeur mémoire de
la fiche d'exercice n'est pas un quota OS appliqué : un déploiement public doit
isoler le worker dans un service ou conteneur avec quotas CPU/mémoire.

## Contribution et vérification

1. Modifier la consigne, la liste autorisée, la solution et les assertions dans
   le même exercice. Ne tester que des exigences annoncées dans la consigne.
2. Ajouter un contre-exemple qui échoue sur la règle modifiée ; accepter les
   implémentations différentes qui satisfont le même contrat.
3. Exécuter `npm run content:generate` puis `npm run test:content`.
4. Pour une modification de l'interface/API : `npm run build`, `npm run lint`,
   `npm run test:front`, `npm run test:back` et `go -C backend vet ./...`.
5. Ouvrir une PR expliquant l'exercice concerné, la règle et le contre-exemple.

Le générateur produit `backend/internal/learning/web_catalog.json` (projection
publique embarquée par Go) et la migration additive `0005_web_exercises.sql`.
La vérification `--check` détecte une divergence avec les sources. Après la
première publication de cette migration, les changements de seed devront
passer par une nouvelle migration, sans réécrire l'historique déjà appliqué.

Les tests du contenu exécutent toutes les références et rejettent toutes les
soumissions vides. Des contre-exemples couvrent les contraintes, l'inertie des
templates, les tableaux, les formulaires, les conteneurs et les préférences.
Playwright vérifie aussi les parcours de l'interface sur ordinateur et mobile.
Les tests PostgreSQL créent leurs propres bases jetables et couvrent la boucle
réelle de soumission HTML/CSS, les verrous, l'idempotence et le passage à S :

```powershell
$env:RUN_DATABASE_TESTS = '1'
go -C backend test ./... -count=1
Remove-Item Env:RUN_DATABASE_TESTS
```

Exécuter les suites navigateur et PostgreSQL l'une après l'autre pour ne pas
mettre en concurrence les navigateurs de test avec le budget du correcteur.
