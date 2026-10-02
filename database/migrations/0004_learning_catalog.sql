-- V3 learning catalogue. Entry at rank E grants no XP and requires no Git knowledge.
INSERT INTO learning.domains (slug, name, description, sort_order, status, content_version) VALUES
    ('web', 'Développement web', 'Construis des interfaces, des API et des applications complètes.', 1, 'PUBLISHED', 'spec-v3'),
    ('logic_algorithms', 'Logique & algorithmes', 'Apprends à résoudre des problèmes, maîtriser la mémoire et concevoir des algorithmes.', 2, 'PUBLISHED', 'spec-v3');

INSERT INTO learning.blocks (domain_id, slug, name, description, sort_order, status, content_version)
SELECT domains.id, seed.slug, seed.name, seed.description, seed.position, 'PUBLISHED', 'spec-v3'
FROM (VALUES
    ('web', 'frontend', 'Front-end', 'Donne vie aux interfaces du navigateur.', 1),
    ('web', 'backend', 'Back-end', 'Construis la logique et les services de tes applications.', 2),
    ('web', 'database', 'Bases de données', 'Modélise, conserve et interroge tes données.', 3),
    ('web', 'tooling', 'Outils du développeur', 'Versionne ton travail et prépare la collaboration.', 4),
    ('logic_algorithms', 'fundamentals', 'Fondamentaux', 'Découvre les langages et les premiers raisonnements, sans prérequis.', 1),
    ('logic_algorithms', 'strings_arrays', 'Chaînes & tableaux', 'Manipule des collections et du texte.', 2),
    ('logic_algorithms', 'memory', 'Mémoire', 'Comprends les pointeurs et la durée de vie des données.', 3),
    ('logic_algorithms', 'data_structures', 'Structures de données', 'Organise tes données selon le problème à résoudre.', 4),
    ('logic_algorithms', 'sorting_searching', 'Tri & recherche', 'Retrouve et ordonne efficacement tes données.', 5),
    ('logic_algorithms', 'recursion', 'Récursivité', 'Décompose un problème en problèmes plus petits.', 6),
    ('logic_algorithms', 'graphs', 'Graphes', 'Représente et explore les relations entre objets.', 7),
    ('logic_algorithms', 'optimization', 'Optimisation', 'Mesure et améliore les coûts en temps et en mémoire.', 8),
    ('logic_algorithms', 'parsing', 'Parsing', 'Transforme une entrée textuelle en données structurées.', 9)
) AS seed(domain_slug, slug, name, description, position)
JOIN learning.domains AS domains ON domains.slug = seed.domain_slug;

INSERT INTO learning.skills (block_id, slug, name, description, is_transversal, sort_order, status, content_version)
SELECT blocks.id, seed.slug, seed.name, seed.description, seed.slug = 'git', seed.position, 'PUBLISHED', 'spec-v3'
FROM (VALUES
    ('web', 'frontend', 'html', 'HTML', 'Structure ta première page et découvre les éléments du Web.', 1),
    ('web', 'frontend', 'css', 'CSS', 'Mets en forme tes pages, des premières couleurs aux mises en page adaptatives.', 2),
    ('web', 'frontend', 'javascript', 'JavaScript', 'Découvre les variables, les conditions et les fonctions.', 3),
    ('web', 'frontend', 'typescript', 'TypeScript', 'Exprime les types pour rendre ton code plus fiable.', 4),
    ('web', 'frontend', 'browser_javascript', 'JavaScript navigateur', 'Manipule le DOM, les événements et les API du navigateur.', 5),
    ('web', 'frontend', 'react', 'React', 'Compose des interfaces avec des composants et des états.', 6),
    ('web', 'frontend', 'react_typescript', 'React + TypeScript', 'Construis des interfaces React typées.', 7),
    ('web', 'backend', 'nodejs', 'Node.js', 'Découvre JavaScript côté serveur et tes premiers services.', 1),
    ('web', 'backend', 'nodejs_typescript', 'Node.js + TypeScript', 'Structure des services Node.js avec des types explicites.', 2),
    ('web', 'backend', 'python', 'Python', 'Développe des services et traite des données en Python.', 3),
    ('web', 'backend', 'go', 'Go', 'Découvre Go et construis des services fiables.', 4),
    ('web', 'backend', 'rest_api', 'API REST', 'Conçois des échanges HTTP et des contrats compréhensibles.', 5),
    ('web', 'backend', 'authentication', 'Authentification', 'Comprends les identités, les sessions et les autorisations.', 6),
    ('web', 'backend', 'backend_architecture', 'Architecture back-end', 'Organise les responsabilités et les dépendances de tes services.', 7),
    ('web', 'database', 'database_fundamentals', 'Fondamentaux des données', 'Découvre les tables, les clés, les relations et les transactions.', 1),
    ('web', 'database', 'mysql', 'MySQL', 'Interroge et structure une base relationnelle MySQL.', 2),
    ('web', 'database', 'postgresql', 'PostgreSQL', 'Apprends SQL, les contraintes et les index avec PostgreSQL.', 3),
    ('web', 'database', 'mongodb', 'MongoDB', 'Découvre les documents et la modélisation dans MongoDB.', 4),
    ('web', 'tooling', 'git', 'Git', 'Commence avec un dépôt local, git status, git add et ton premier commit.', 1),
    ('logic_algorithms', 'fundamentals', 'logic_fundamentals', 'Logique fondamentale', 'Décompose un problème et construis ton premier algorithme.', 1),
    ('logic_algorithms', 'fundamentals', 'c', 'C', 'Pars de zéro : compilation, main, variables et premières fonctions.', 2),
    ('logic_algorithms', 'fundamentals', 'cpp', 'C++', 'Découvre la compilation, les objets et la gestion des ressources.', 3),
    ('logic_algorithms', 'fundamentals', 'python', 'Python algorithmique', 'Écris tes premiers algorithmes avec une syntaxe accessible.', 4),
    ('logic_algorithms', 'strings_arrays', 'strings', 'Chaînes de caractères', 'Parcours, compare et transforme du texte.', 1),
    ('logic_algorithms', 'strings_arrays', 'arrays', 'Tableaux', 'Stocke et parcours des suites de valeurs.', 2),
    ('logic_algorithms', 'memory', 'memory', 'Gestion de la mémoire', 'Explore les adresses, les allocations et la libération des ressources.', 1),
    ('logic_algorithms', 'data_structures', 'data_structures', 'Structures de données', 'Construis des listes, des piles, des files et des tables de hachage.', 1),
    ('logic_algorithms', 'sorting_searching', 'sorting', 'Algorithmes de tri', 'Compare et implémente différentes façons de trier.', 1),
    ('logic_algorithms', 'sorting_searching', 'searching', 'Algorithmes de recherche', 'Retrouve une valeur et analyse le coût de ta recherche.', 2),
    ('logic_algorithms', 'recursion', 'recursion', 'Récursivité', 'Identifie le cas de base et décompose les appels.', 1),
    ('logic_algorithms', 'graphs', 'graphs', 'Graphes', 'Parcours des réseaux et calcule des chemins.', 1),
    ('logic_algorithms', 'optimization', 'optimization', 'Optimisation', 'Évalue la complexité et mesure les performances.', 1),
    ('logic_algorithms', 'parsing', 'parsing', 'Analyse syntaxique', 'Lis, valide et structure des formats textuels.', 1)
) AS seed(domain_slug, block_slug, slug, name, description, position)
JOIN learning.domains AS domains ON domains.slug = seed.domain_slug
JOIN learning.blocks AS blocks ON blocks.domain_id = domains.id AND blocks.slug = seed.block_slug;
