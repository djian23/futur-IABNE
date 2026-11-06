# Fonctions livrées et limites de validation

Le cahier des charges V3 et l’ajout des élèves délégués constituent le périmètre produit. Ce document décrit le code livré, sans assimiler un test local à une validation pédagogique ou à un déploiement distant.

| Besoin | Réalisation |
| --- | --- |
| Comptes administrés | Création par administrateur, connexion, sessions, changement et réinitialisation du mot de passe, désactivation. Aucune inscription libre. |
| Classes et matières | Établissements, années scolaires, classes, inscriptions, matières, affectations des enseignants et espaces de cours. |
| Documents | PDF, DOCX et TXT ; chapitres ; brouillon, publication, archivage, remplacement et historique des versions ; suppression des fichiers et fragments. |
| Élèves délégués | Désignation par professeur pour un cours de leur classe ; dépôt en brouillon ; auteur visible pour le professeur ; publication réservée au professeur/administrateur ; révocation immédiate. |
| Consultation | Lecture du texte extrait, téléchargement de l’original, recherche dans les titres et le contenu autorisé. |
| Assistant par cours/professeur | Recherche dans les fragments des documents publiés autorisés ; fournisseur Anthropic ou OpenAI ; vocabulaire et méthodes des sources ; citations ; abstention ; contexte de conversation privé. |
| Méthodes du professeur | Analyse sourcée des raisonnements et corrigés publiés ; consignes de rédaction et de notation ; validation par le professeur propriétaire ; invalidation si les sources changent. |
| Tuteur personnel | Mémoire privée du parcours, erreurs des quiz, observations IA confirmables, exercices et tentatives, devoirs par matière, chronomètre distinct du planning, rappels et explications adaptées. Suspension et réinitialisation par l’élève. Voir [TUTOR.md](TUTOR.md). |
| Fiches et sujets | Génération par cours ou chapitre, bibliothèque privée, sources versionnées et signalement d’obsolescence ; export PDF avec titres, couleurs, références et pagination. Les anciens contrôles sont privilégiés pour guider le style des sujets. |
| Quiz interactifs | Cinq QCM, réponses masquées avant tentative, correction serveur unique, explications sourcées, difficulté proposée à partir des trois derniers quiz terminés et notions privées à retravailler. |
| Suivi professeur | Consultations, questions et thèmes agrégés ; notions à revoir issues des réponses aux quiz ; seuil de cinq élèves pour limiter l’identification. Pas d’accès général aux conversations individuelles. |
| Organisation du travail | Disponibilités, cours, indisponibilités, tâches, difficulté perçue, échéances, sessions réparties et plafonds quotidiens ; signalement du travail impossible à placer. |
| École Directe | Connecteur communautaire expérimental, activation volontaire, vérification QCM, jetons chiffrés, synchronisation manuelle bornée de l’emploi du temps et des devoirs, imports sans doublons et déconnexion. Désactivé par défaut. |
| Interface | Français, ordinateur et mobile, formulaires étiquetés et erreurs explicites ; rendu IA sans HTML exécutable. L’accessibilité complète reste à auditer. |
| Railway | Docker multiétape, interface et API sur le même service, `PORT`, contrôle de santé, volume persistant, sessions sécurisées et processus applicatif non privilégié. |
| Sauvegardes | Scripts de sauvegarde et restauration, vérification SQLite et SHA-256, refus d’écraser une installation, révocation des sessions restaurées. Maintenance préalable requise. |

## Règles appliquées

- Documents privés à la classe par défaut. Le cahier des charges contient une contradiction concernant la consultation libre des autres classes ; aucun partage automatique entre classes n’est activé.
- Un délégué contribue aux documents ; il ne reçoit pas les droits de gestion d’un professeur.
- Les corrigés publiés sont accessibles et utilisables par l’IA. Les brouillons et évaluations non publiées restent exclus du corpus élève.
- Le RAG consulte les cours ; il ne réentraîne pas un modèle individuel. La recherche actuelle est lexicale, sans embeddings.
- Une génération est un support d’entraînement, pas un document officiellement validé par le professeur. Une citation valide techniquement peut néanmoins être pédagogiquement incorrecte.
- Une demande IA ne peut être conservée si son compte ou ses sources perdent leurs autorisations pendant l’appel.
- Les discussions et résultats individuels restent privés. Les agrégats ne sont pas des diagnostics scolaires.

## Ce qui nécessite encore une validation extérieure

1. **IA réelle** : fournir une clé côté serveur, choisir un modèle disponible et vérifier les réponses sur un corpus autorisé avec les enseignants. Les tests de frontière fournisseur utilisent des réponses synthétiques explicitement isolées des processus de production.
2. **École Directe réelle** : vérifier les conditions et autorisations, puis tester avec un compte autorisé. Les tests du connecteur simulent les réponses distantes ; ils ne prouvent pas que l’API communautaire fonctionne aujourd’hui dans chaque établissement.
3. **Railway distant** : créer le service et son volume, configurer les variables, provisionner l’administrateur, déployer et vérifier le domaine HTTPS. Les essais Docker locaux ne constituent pas ce déploiement.
4. **Données réelles** : fixer les responsabilités, prestataires, lieux de traitement, durées de conservation, demandes de suppression et procédures avec l’établissement. Aucun label de conformité n’est revendiqué.

## Limites connues

- Une seule instance applicative avec SQLite et stockage sur volume ; une montée en charge multi-instance nécessite une évolution du stockage.
- Pas d’OCR intégré, de prise en charge `.doc`, ni de garantie de restitution des équations, schémas et manuscrits. L’aperçu textuel ne conserve pas la mise en page des originaux.
- Historique des versions consultable en métadonnées ; restauration d’une ancienne version non proposée dans l’interface.
- Pas de rétention automatique globale ni de suppression administrative complète d’une identité et de toutes ses dépendances ; les données réelles exigent cette politique et son outillage.
- Pas de prédiction des résultats, d’application mobile native ni de console commerciale multiétablissement : ces éléments figurent dans la vision long terme du document.
- Pas d’envoi automatique de mails : activation et récupération des comptes sont gérées par l’administration.

Voir [OPERATIONS.md](OPERATIONS.md), [API.md](API.md) et [ECOLEDIRECTE.md](ECOLEDIRECTE.md) pour les détails d’exploitation et d’intégration.

## Atelier et agent IA

Voir [USAGES_IA.md](USAGES_IA.md) pour les outils élèves et professeurs, les préparations asynchrones, la séparation sujet/corrigé, les brouillons pédagogiques et les limites de validation.

## Connecteur École Directe indépendant

Le transport réseau est séparé et maintenu dans le projet. Les imports conservent les consignes complètes, les deux champs documentés de contenu de séance et les métadonnées d’emploi du temps dans un cahier de textes privé. L’interface permet de choisir la période et expose le diagnostic de la dernière tentative. Les pièces jointes sont signalées mais non téléchargées. La compatibilité réelle reste à vérifier ; voir [ECOLEDIRECTE.md](ECOLEDIRECTE.md).
