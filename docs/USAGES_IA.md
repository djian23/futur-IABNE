# L’IA dans les parcours pédagogiques

L’IA accompagne les élèves et les professeurs depuis les documents autorisés du cours. Les fonctionnalités ci-dessous sont implémentées ; leurs réponses doivent encore être évaluées avec un fournisseur réel et des contenus pédagogiques autorisés.

## Élève : comprendre, pratiquer et réviser

- Poser des questions sur ses cours avec références aux documents publiés.
- Travailler un exercice avec indices, méthode, vérification d’une tentative et solution demandée séparément.
- Retrouver un profil personnel : erreurs de quiz, difficultés déclarées, observations étayées par ses tentatives, devoirs et temps de travail chronométré.
- Confirmer ou rejeter les observations, suspendre la mémoire et l’effacer.
- Générer des fiches, guides de méthode et programmes de révision proposés ; conserver et exporter les ressources en PDF.
- Passer des QCM corrigés avec explications et difficulté adaptée aux derniers résultats dont les sources restent valides.
- Créer des exercices ou contrôles d’entraînement puis ouvrir une question dans le tuteur personnel. Depuis une priorité, le cours et la notion sont préremplis ; depuis un devoir, une demande d’accompagnement est préparée sans inventer son énoncé.

Le planning par créneaux reste calculé par des règles ; le programme de révision IA est une proposition distincte. Le suivi personnel fournit du contexte au modèle, sans réentraînement de ses poids. Voir [TUTOR.md](TUTOR.md).

## Professeur : préparer, adapter et accompagner

L’Atelier IA propose la préparation d’une séance, trois variantes d’une activité, la relecture d’un support, des fiches et guides de méthode, ainsi qu’une remédiation collective. La remédiation utilise uniquement des tendances de quiz récentes dont les sources sont valides, avec au moins cinq élèves actifs distincts par notion. Elle ne donne pas accès aux conversations ou profils personnels.

Le professeur peut faire analyser ses corrections et anciens contrôles publiés, modifier la méthode proposée puis la valider. Les outils du cours utilisent cette méthode tant que ses sources restent valides. Les brouillons et méthodes d’autres professeurs sont exclus.

Le professeur conserve la publication : les délégués déposent des brouillons, et les supports créés par l’agent arrivent aussi en brouillon. Aucun outil ne publie ni n’attribue une note officielle automatiquement.

## Agent de préparation d’exercices et de contrôles

La demande précise cours, chapitre éventuel, thème, difficulté, nombre de questions, durée et barème. Le traitement asynchrone conserve les étapes : recherche des sources, planification, génération et contrôle de structure, puis résultat ou erreur explicite.

L’agent privilégie les exercices et anciens contrôles publiés pour leurs caractéristiques observables. En leur absence, l’interface indique que l’adaptation repose sur la méthode validée ou seulement sur les cours. Les documents identifiés comme générés par l’application ne servent pas d’exemples authentiques du style du professeur, ni à son analyse de méthode.

Le serveur vérifie les références, le nombre de questions, les doublons, certaines reprises textuelles longues et les sommes du barème et de ses critères. Ces contrôles ne démontrent pas la justesse mathématique ou pédagogique d’une réponse.

Le sujet reste séparé du corrigé. Les indices sont demandés progressivement. Sujet et corrigé ont des exports PDF distincts. Un professeur responsable peut créer les deux documents en brouillon, avec une provenance IA visible ; renouveler cet export ne crée pas de doublons. Les informations privées d’un élève ne sont pas transférées dans ces documents de classe.

## Exécution et limites

Trois traitements de préparation au maximum s’exécutent en parallèle dans le processus, avec une demande active par utilisateur et une file bornée à 100. Les quotas IA habituels restent applicables. Les demandes et leurs étapes sont persistées ; un redémarrage marque les travaux inachevés comme interrompus, sans nouvel appel payant automatique.

La suppression d’une préparation annule son traitement local et demande l’arrêt de l’appel distant ; un appel déjà commencé peut néanmoins être facturé par le fournisseur. Les documents déjà exportés en brouillon sont conservés. Les permissions, versions des sources et profils utilisés sont revérifiés ; une source retirée empêche de nouvelles utilisations du résultat dépendant de cette source.

Sans clé fournisseur, aucune génération fictive n’est affichée. Les documents scannés nécessitant un OCR, l’audio et la composition mathématique spécialisée ne sont pas implémentés. Le code et le conteneur sont testés localement ; aucun déploiement Railway distant ni validation pédagogique d’un modèle réel n’est inclus dans ces résultats.
