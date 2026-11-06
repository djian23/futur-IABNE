# Tuteur personnel : méthode du professeur et parcours de l’élève

L’accompagnement utilise deux contextes distincts, en plus des documents publiés du cours. Il ne nécessite pas de réentraîner un modèle de langage pour chaque personne : les données utiles sont relues au moment de chaque demande, avec leurs autorisations actuelles.

## La méthode du professeur

Dans un cours, le professeur ouvre **Personnaliser mon agent IA de professeur**. Il peut :

1. Décrire ses attentes de raisonnement, de rédaction et de notation.
2. Faire analyser ses documents publiés, avec priorité aux corrections, puis aux contrôles et exercices.
3. Vérifier le résumé, les étapes de raisonnement, le vocabulaire et les critères explicites extraits, avec leurs références.
4. Valider cette méthode pour son cours. Un brouillon non validé n’est pas utilisé pour les élèves.

Le profil est attaché au professeur propriétaire **et au cours** : deux enseignants ou deux niveaux ne partagent pas leurs méthodes implicitement. Une nouvelle publication alimente immédiatement le corpus documentaire. La synthèse durable des méthodes est une analyse distincte, déclenchée et validée par le professeur ; aucune génération distante cachée ne tourne en boucle. Si l’un des documents ayant servi à l’analyse change ou est retiré, celle-ci devient obsolète et cesse de guider les réponses jusqu’à révision.

Le professeur peut aussi utiliser uniquement ses consignes validées, sans lancer d’analyse IA. L’IA ne doit pas inventer des attentes implicites, un barème officiel ou des connaissances absentes des sources autorisées.

## Le parcours privé de l’élève

Dans **Assistant pédagogique**, l’élève dispose de son espace **Mon tuteur personnel** :

- erreurs et réussites des quiz, limitées aux sources encore valides ;
- difficultés déclarées et observations pédagogiques de l’IA ;
- exercices suivis, tentatives et retours « compris » ou « encore difficile » ;
- objectif et préférence d’explication : étapes, concision ou exemples ;
- devoirs personnels correspondant à la matière, échéances et difficulté déclarée ;
- temps chronométré et temps prévu dans le planning, présentés séparément ;
- suggestions de notions à reprendre et de rappels espacés.

Les repères sont recalculés lors des consultations et des demandes IA. Les quiz, notes personnelles et exercices nourrissent donc les demandes suivantes sans devoir recopier tout son parcours. La mémoire reste séparée par élève, établissement et cours.

## Passer des priorités au travail

Chaque prochaine étape propose **Travailler cette notion** pour préparer une question au tuteur et **Préparer des exercices ciblés** pour ouvrir l’agent avec le cours et la notion préremplis. L’élève vérifie la durée, le nombre de questions et les autres options avant de lancer un appel IA ; la navigation seule ne lance aucune génération.

Chaque devoir de la matière propose **Préparer avec mon tuteur**. La demande préparée reprend son titre et son échéance, puis demande au tuteur de recueillir l’énoncé et la tentative avant d’aider. Un titre de devoir ne suffit pas à en inventer le contenu. Ces boutons préparent la demande sans l’envoyer automatiquement.

## Aide sur un exercice

L’élève renseigne la notion et l’énoncé, éventuellement relié à un document publié du professeur. Il peut ensuite reprendre cette session et choisir : **indice**, **méthode**, **vérification de sa tentative** ou **correction expliquée**.

Le tuteur reçoit l’énoncé, la tentative actuelle, les précédents échanges de cet exercice lorsque la personnalisation est active, la méthode validée du professeur et les sources autorisées. Il est invité à identifier le premier point de blocage, proposer une étape utile et vérifier la compréhension. Les échanges validés sont conservés pour reprendre le raisonnement plus tard. Un document retiré ne peut plus alimenter cette aide.

Le modèle peut proposer des observations structurées sur une erreur. Leur preuve doit citer exactement une partie de la tentative actuelle ; une observation sans cette preuve n’est pas enregistrée. Ces observations restent des **hypothèses**, visibles par l’élève, qui peut les confirmer, les écarter ou indiquer que le blocage est résolu. Elles ne constituent ni une note officielle ni un diagnostic. Leur pertinence pédagogique nécessite une évaluation avec un vrai fournisseur et des enseignants.

## Chronomètre de révision

Une seule séance peut être ouverte à la fois. Les battements du navigateur créditent le temps côté serveur, au maximum 90 secondes entre deux battements et trois heures par séance. Le navigateur cesse les battements s’il est masqué ou sans interaction récente. Une séance sans battement pendant quinze minutes expire sans ajouter tout le temps d’absence.

Le chronomètre mesure une durée d’utilisation déclarée comme travail, pas l’attention ni la compréhension. Le temps prévu dans un planning ne devient jamais automatiquement du temps réalisé.

## Contrôle de la mémoire

- **Suspendre la personnalisation** empêche l’envoi du profil, des anciennes conversations et des précédentes tentatives dans les nouvelles demandes. Les données restent consultables dans leurs espaces.
- **Réinitialiser la mémoire du cours** supprime ses difficultés, observations, séances et exercices suivis. Les quiz et conversations existants restent consultables, mais les données antérieures à cette réinitialisation ne sont plus réutilisées par cette mémoire ni par l’adaptation des prochains quiz.
- Les réponses commencées avec un ancien profil sont écartées si celui-ci est modifié ou oublié pendant l’appel.
- Les enseignants n’accèdent pas à ce profil individuel ; les statistiques existantes restent agrégées.

Lorsqu’un fournisseur IA est activé, le contexte personnel utile à la demande peut lui être transmis. L’établissement doit encadrer ce traitement et informer les utilisateurs. Sans clé fournisseur, le logiciel conserve les activités et affiche l’indisponibilité ; il ne fabrique ni explication ni analyse prétendument produite par une IA.

## Endpoints supplémentaires

- `GET /api/tutor/profile?courseId=...` ; `PATCH /api/tutor/profile` avec `{courseId,memoryEnabled,goal,style}`.
- `DELETE /api/tutor/memory?courseId=...`.
- `POST /api/tutor/mistakes` avec `{courseId,topic,note}` ; `DELETE /api/tutor/mistakes/:id`.
- `GET /api/tutor/exercises?courseId=...` ; `POST /api/tutor/exercises` avec `{courseId,topic,statement,documentId?}` ; `PATCH /api/tutor/exercises/:id` avec `{courseId,status}` ; `DELETE /api/tutor/exercises/:id`.
- `POST /api/tutor/study/start` avec `{courseId,taskId?}` ; `POST /api/tutor/study/:id/heartbeat` ; `POST /api/tutor/study/:id/stop`.
- `PATCH /api/tutor/observations/:id` avec `{courseId,status:"confirmed"|"dismissed"}`.
- `POST /api/ai/chat` accepte aussi `{exerciseId?,helpMode:"hint"|"method"|"check"|"solution"}`.
- `GET /api/teacher-tutor/profile?courseId=...` ; `PATCH /api/teacher-tutor/profile` avec `{courseId,instructions,approved,useAnalysis}` ; `POST /api/teacher-tutor/analyze` avec `{courseId}`.

Les contrôles d’autorisation s’appliquent côté serveur. Seul le professeur propriétaire peut valider sa méthode ; un élève ne choisit jamais l’identité dont la mémoire est chargée.
