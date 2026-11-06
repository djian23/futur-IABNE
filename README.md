# Futur IABNE

Application scolaire en cours de développement : espaces élèves, professeurs et administration, documents pédagogiques et accompagnement fondé sur les cours. Cette première version ne constitue pas une validation de conformité ni un service prêt à accueillir les données réelles d’un établissement.

Le [détail des fonctionnalités et limites](docs/FEATURES.md) distingue le code livré des validations restant à réaliser.

Le [tuteur personnel](docs/TUTOR.md) combine les méthodes validées de chaque professeur avec la mémoire privée de chaque élève : erreurs, exercices, devoirs et temps de révision. Il accompagne les tentatives étape par étape et conserve des pistes pédagogiques confirmables, sans mélanger les profils.

Le [catalogue des usages IA](docs/USAGES_IA.md) décrit les parcours livrés : atelier professeur, différenciation, remédiation collective et agent de préparation de sujets avec indices, corrigés et exports séparés.

## Installation et lancement

Prérequis : **Node.js 24.5 ou supérieur** et npm. Le serveur utilise SQLite intégré à Node (`node:sqlite`) ; aucun service de base de données externe n’est nécessaire pour le développement local. Les exports PDF nécessitent les polices système DejaVu Sans régulière et grasse (`fonts-dejavu-core` sous Debian/Ubuntu) ; elles sont installées par l’image Docker.

Depuis la racine du dépôt :

```sh
npm ci
SEED_DEMO=true npm run dev
```

Vite sert l’interface sur le port **5173** et transmet `/api` au serveur Express sur le port **3001**. La création des données de démonstration est volontaire : ne pas activer `SEED_DEMO` pour des données réelles.

Pour compiler puis servir l’interface et l’API avec un seul processus :

```sh
npm run build
npm start
```

Le serveur écoute par défaut sur `0.0.0.0`, port **3001** (`HOST` et `PORT` configurables). Utiliser `HOST=127.0.0.1` pour limiter l’API à la machine locale si nécessaire. La commande de construction compile l’interface ; elle ne remplace ni les tests ni les vérifications opérationnelles.

```sh
npm test
```

Consulter les résultats de la commande pour connaître les vérifications effectivement exécutées.

## Démonstration

Les comptes suivants sont réservés aux données de démonstration, activées avec `SEED_DEMO=true` :

| Profil | Identifiant |
| --- | --- |
| Administration | `admin@demo.local` |
| Professeur | `prof@demo.local` |
| Élève | `eleve@demo.local` |
| Élève délégué | `delegue@demo.local` |

Le mot de passe de démonstration est `EcoleDemo2026!`. Ces identifiants sont publics : ne jamais les utiliser sur un environnement contenant des données réelles ou exposé au public.

## Configuration et données locales

Les variables disponibles sont décrites dans [.env.example](.env.example). Une configuration locale peut être placée dans `.env`, ignoré par Git. Ne jamais y copier des secrets dans un fichier versionné.

`DATA_DIR` désigne le répertoire persistant local, par défaut `./data`. Ce répertoire, les bases SQLite, leurs fichiers WAL/SHM et les dépendances sont ignorés par Git. Un chemin personnalisé doit rester hors du dépôt ou être explicitement ignoré. Sauvegarder ensemble la base et les fichiers pédagogiques : la seule base ne suffit pas à restaurer les documents.

## Hébergement Railway

La cible d’hébergement retenue est **Railway**, avec un service Node unique et un volume persistant monté sur `/data`. La configuration de déploiement, le premier compte administratif et les sauvegardes sont décrits dans [OPERATIONS.md](docs/OPERATIONS.md). Cette configuration ne signifie pas qu’un service distant a déjà été déployé ou testé.

## Permissions et délégations

Les droits doivent être contrôlés par le serveur, y compris lorsqu’une requête utilise directement un identifiant de document ou de classe.

- L’administration gère les comptes, classes et affectations de son établissement.
- Le professeur gère ses contenus dans les classes auxquelles il est affecté.
- L’élève consulte les contenus autorisés et ses propres données.
- Une délégation ne transforme pas un élève en professeur. Le professeur propriétaire accorde l’autorisation à un élève de sa classe pour un cours précis. Le délégué peut y déposer ses fichiers en **brouillon** ; il ne peut pas publier ni gérer les fichiers des autres. Le professeur garde la validation et la publication. La révocation retire la gestion des brouillons délégués ; elle ne doit pas être interprétée comme leur suppression automatique.

## Périmètre et limites

Un connecteur communautaire **École Directe expérimental** est implémenté et désactivé par défaut. Il prépare une connexion avec vérification d’appareil et une synchronisation manuelle en lecture seule de l’emploi du temps, des devoirs et des contenus de séance, réservée aux comptes élèves. Le transport est maintenu directement dans le projet, sans SDK École Directe tiers. Il **n’a pas été validé contre le service distant** : accord d’utilisation et accès de test autorisé restent nécessaires. Le planning manuel reste disponible. Voir [ECOLEDIRECTE.md](docs/ECOLEDIRECTE.md) pour les conditions, variables et limites.

L’IA, lorsqu’un fournisseur est configuré, doit être évaluée sur des cours autorisés : pertinence des citations, abstention lorsque les sources manquent et séparation des accès. Une réponse générée peut être incorrecte ; sa présence ne prouve pas la qualité pédagogique. L’indexation, les quotas et les fonctions réellement disponibles doivent être vérifiés dans la version utilisée.

### Fournisseur IA facultatif

Configurer **soit** `ANTHROPIC_API_KEY` avec `ANTHROPIC_MODEL`, **soit** `AI_API_KEY` avec `AI_MODEL`. Les modèles par défaut figurent dans `.env.example` et doivent être disponibles pour le compte fournisseur utilisé. Anthropic a priorité si les deux clés sont présentes. `AI_BASE_URL` accepte seulement l’API officielle `https://api.openai.com/v1`, pas une adresse arbitraire.

Sans clé, le service indique explicitement que l’IA n’est pas configurée lorsqu’un corpus pertinent existe ; il ne simule pas une génération. Sans passage pertinent, il s’abstient. Les appels transmettent des extraits au fournisseur choisi, sans outil de navigation Web. Ce choix doit être validé avant données réelles.

Le prototype utilise une recherche lexicale d’extraits, sans entraînement individuel du modèle. Les corrections publiées et autorisées font partie du corpus IA ; les brouillons et contenus archivés n’en font pas partie. Les réponses demandent des références aux extraits, mais la présence d’une référence ne prouve pas son exactitude sémantique. Limites actuelles : une génération simultanée par utilisateur, 20 demandes par heure, délai de 45 secondes et question de 2 000 caractères maximum. Les statistiques agrégées ne s’affichent qu’à partir de cinq participants ; les conversations privées ne sont pas une vue de supervision professeur.

Les consignes du tuteur demandent de reprendre le vocabulaire, les notations, les méthodes et la progression observables du professeur, sans inventer ses attentes. La génération de sujets donne priorité aux anciens contrôles publiés pour leur structure et leur difficulté observables ; un barème généré reste proposé et non officiel. Cette personnalisation par contexte n’équivaut pas à un modèle entraîné par professeur et doit être évaluée sur des cours réels autorisés.

Les exports PDF comportent titres, sous-titres, listes, couleurs, références, avertissements et pagination avec polices Unicode DejaVu. Ils n’effectuent pas de composition mathématique spécialisée et ne garantissent pas le rendu de toute formule complexe.

Les imports acceptent PDF, DOCX et texte UTF-8 jusqu’à 10 Mo, avec limites supplémentaires de complexité (PDF : 100 pages ; DOCX : 30 Mo décompressés). Les anciens fichiers Word `.doc` ne sont pas pris en charge. Aucun OCR n’est intégré : les scans et la restitution fiable des formules ou tableaux ne sont pas garantis. Un contenu sans texte exploitable ne peut pas alimenter utilement l’IA.

Les quiz interactifs comportent cinq QCM générés à partir des sources autorisées. Après chaque réponse, l’élève reçoit une explication ; les erreurs proposent des notions à revoir dans son espace privé. La difficulté commence au niveau moyen puis s’adapte aux trois derniers quiz terminés du même cours. Une source modifiée ou retirée bloque les nouvelles réponses au quiz concerné. La génération exige un fournisseur configuré et une réponse structurée valide ; aucun faux quiz ne remplace un appel refusé. L’adaptation est une règle de ce prototype, pas une mesure validée du niveau scolaire.

Le planning est calculé sans IA à partir des disponibilités, cours, indisponibilités et tâches saisis ou importés, en créneaux de 15 minutes. Les horaires utilisent les dates et heures locales saisies, sans conversion de fuseau. Une heure de cours n’est exclue que si elle a été renseignée ou importée. Le connecteur expérimental ne synchronise rien automatiquement en arrière-plan.

Les tests locaux vérifient des règles techniques et des échanges simulés contrôlés. Ils ne prouvent ni la qualité pédagogique des générations d’un vrai fournisseur IA, ni la compatibilité actuelle d’École Directe, ni le fonctionnement d’un déploiement Railway. Ces validations externes restent distinctes.

L’exploitation avec des mineurs demande notamment la validation des prestataires et des lieux de traitement, l’information des utilisateurs, une politique de conservation et un processus de gestion des droits. La rétention automatique n’est pas à considérer comme réglée. Voir [les consignes d’exploitation](docs/OPERATIONS.md).
