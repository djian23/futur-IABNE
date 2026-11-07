# Rôles : qui accède à quoi, et pourquoi

Principe : **chacun accède à ce dont il a besoin pour son métier, pas plus.** La direction et l’administration **pilotent** ; les professeurs **enseignent** ; les élèves **apprennent**. Ces règles sont appliquées par le serveur (pas seulement masquées dans l’interface) et couvertes par des tests.

## Direction / administration — piloter
Pour : créer et gérer les comptes, la structure de l’établissement, avoir une **vision globale**, protéger les élèves.

| Peut | Ne peut pas |
| --- | --- |
| Créer, activer, désactiver, supprimer des comptes ; importer ; codes d’activation | Lire un cours, un document, un corrigé, une méthode de professeur |
| Créer classes, groupes d’enseignement, matières, années ; affecter les professeurs ; passage d’année | Utiliser l’assistant IA, les quiz, l’atelier IA (ce sont des outils pédagogiques) |
| Désigner un titulaire, un co-enseignant, un remplaçant d’un cours | Lire la conversation, la mémoire ou le planning d’un élève |
| **Pilotage** : agrégats globaux et détaillés **par classe, par niveau et par matière** (activité par semaine, adoption, matières sans contenu, volumes IA), avec seuils : 5 élèves minimum, et pour une matière au moins 2 professeurs | Voir le nom d’un élève ou d’un professeur dans les statistiques ; évaluer un professeur |
| Voir et traiter les **alertes de sécurité** (élève à contacter, sans le message) | Lire les signalements de réponses IA (seulement leur nombre) |
| Modérer les groupes de travail (consultation journalisée et visible des élèves) | Écrire dans un groupe créé par des élèves |
| Journal d’audit, calendrier de l’établissement, export/suppression RGPD, 2FA | Changer le rôle ou l’e-mail d’un compte existant |

## Professeur — enseigner
Pour : déposer ses cours, adapter l’IA à sa façon d’enseigner, suivre ses élèves sans les surveiller.

| Peut | Ne peut pas |
| --- | --- |
| Créer l’espace de ses cours (dans ses classes et matières affectées), chapitres, documents, publication | Voir les cours d’un autre professeur (sauf co-enseignement ou remplacement déclaré par l’administration) |
| Régler l’IA de son cours : activation, niveau d’aide, génération, date de visibilité des corrigés | Créer des comptes, des classes ou des affectations |
| Valider sa méthode pédagogique | Lire les conversations privées des élèves |
| Désigner des élèves délégués (dépôt en brouillon) | Voir le nom d’un élève qui signale une réponse IA |
| Statistiques de **ses** cours (agrégées à partir de 5 élèves), signalements de réponses IA, atelier IA | Voir les statistiques des autres professeurs |
| Créer des groupes de projet pour ses classes ; consulter les groupes de ses classes (journalisé, visible) | |

## Élève — apprendre
Pour : comprendre ses cours, s’entraîner, s’organiser, travailler avec ses camarades.

| Peut | Ne peut pas |
| --- | --- |
| Lire les documents publiés des cours de **sa** classe ; poser des questions à l’assistant | Voir les brouillons, les corrigés verrouillés, les cours d’une autre classe |
| Quiz, exercices, mémoire du tuteur (qu’il peut voir, suspendre, effacer), planning | Obtenir la correction sans tentative (ou plus que ce que le professeur autorise) |
| Créer des groupes de révision et des binômes dans sa classe ; inviter des camarades de sa classe | Écrire en privé à un camarade ; entrer dans un groupe sans invitation |
| Déposer des documents en brouillon **s’il est délégué** par le professeur du cours | Publier, gérer les documents des autres |
| Signaler une réponse IA ou un message de groupe | |

## Tableau synthétique

| Donnée | Élève | Professeur | Direction / admin |
| --- | :-: | :-: | :-: |
| Documents publiés d’un cours | sa classe | ses cours | — |
| Brouillons, méthode, réglages IA | — | ses cours | — |
| Conversations avec l’IA, mémoire du tuteur, planning | les siens | — | — |
| Réponses IA signalées | — | ses cours, sans nom | nombre seulement |
| Statistiques d’usage | — | ses cours (≥ 5 élèves) | globales, par classe (≥ 5 élèves), sans noms |
| Comptes, classes, affectations | son profil | ses classes (liste d’élèves) | tous |
| Alertes de sécurité | — | — | oui |
| Journal d’audit | — | — | oui |
| Groupes de travail | les siens | ses classes, journalisé | modération, journalisé |

## Détail du pilotage : jusqu'où aller
La direction voit le détail **par classe, par niveau et par matière**, mais jamais plus fin :
- **Jamais** un élève nommé ni un professeur nommé, et pas de classement.
- Une activité n'est affichée qu'à partir de **5 élèves**.
- L'activité d'une **matière** n'est affichée que si **au moins 2 professeurs** l'enseignent : sinon, ce serait l'évaluation d'une personne (qui doit rester l'affaire de la direction avec le professeur, hors de l'outil). La case est alors masquée avec la raison.
- Les croisements matière × niveau ne sont pas proposés, pour la même raison.
Si la direction veut aller plus loin, la bonne voie est un échange avec le professeur concerné, pas une donnée de plus dans l'outil.

## Évolution possible (non réalisée)
Un rôle unique « administration » regroupe aujourd’hui la direction et le secrétariat. À terme, on peut les séparer : **secrétariat** (comptes, import, structure, sans statistiques), **direction** (pilotage et alertes, sans gestion de comptes), **vie scolaire / CPE** (alertes et groupes de ses niveaux), **professeur principal** (vue de sa classe), **référent numérique**, **DPO** (audit et droits RGPD). Le modèle de droits est centralisé dans `canManageCourse` / `canAccessCourse` (`server/auth.mjs`) et les gardes de `server/admin.mjs`, ce qui permet d’ajouter ces rôles sans réécrire les cours.
