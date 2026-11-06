# 02 — Groupes de travail et collaboration entre élèves (IABNE / Yabné Paris)

> Recherche de cas d'usage, novembre 2026. Domaine : groupes créés par les élèves, groupes assignés par les professeurs, collaboration, révision collective avec l'IA, tutorat entre pairs, havrouta, clubs. **Rien n'existe dans le code aujourd'hui** (confirmé dans `ajouts_equipe.md` : « Manque : groupes de travail élèves (rien) »).

---

## 0. Ce que l'existant impose ou permet

| Brique existante | Où | Conséquence pour les groupes |
| --- | --- | --- |
| `users(role IN admin/teacher/student)`, `school_id` partout | `server/db.mjs` | Tout groupe est cloisonné par `school_id`. Pas de rôle parent, CPE ou direction : la modération retombe sur l'admin (ou un futur rôle `staff`). |
| `school_years`, `classes.year_id` | `server/db.mjs` | Un groupe doit être rattaché à une année (`year_id`) pour l'archivage de fin d'année. |
| `memberships(user_id,class_id)` | `server/db.mjs` | Base du périmètre d'invitation : même classe par défaut, même niveau (`classes.level`) ensuite. |
| `courses` liés à **une** classe | `server/db.mjs` | Problème des **spécialités** au lycée (élèves de 1re A et 1re B dans le même cours de spécialité) : un groupe « spécialité » est forcément inter-classes. Un document d'un cours n'est lisible que par les membres de la classe du cours (`canAccessCourse`). Un groupe ne doit **jamais** élargir l'accès à un document. |
| `delegations` (élève délégué → brouillons) | `server/db.mjs`, `auth.mjs` | Modèle de référence : un élève reçoit un droit limité, accordé et révocable par un adulte, avec traçabilité. Les groupes réutilisent ce principe (rôles limités, révocation, journal). |
| Tuteur personnel, mémoire privée, observations | `server/tutor.mjs`, `docs/TUTOR.md` | Règle forte du cahier des charges (§7) : « Les conversations d'un élève avec l'IA ne sont jamais partagées avec d'autres élèves. » La mémoire individuelle n'entre **jamais** dans un contexte de groupe. Le groupe a son propre contexte IA. |
| Quiz (`learning_quizzes`, `learning_quiz_answers`), correction côté serveur | `server/learning.mjs` | Réutilisable pour des quiz de groupe : questions partagées, correction serveur, scores individuels privés. |
| Fiches (`learning_generations`), export PDF | `server/learning.mjs`, `pdf-layout.mjs` | Une fiche peut être partagée au groupe par copie (instantané), jamais par lien vers la bibliothèque privée. |
| Planning (`learning_availability` kinds `available/unavailable/class`, `learning_tasks`, `learning_sessions`) + emploi du temps École Directe (`ed_timetable`) | `learning.mjs`, `ecoledirecte.mjs` | Permet le calcul de créneaux communs **côté serveur**, en ne renvoyant que l'intersection (jamais l'emploi du temps des autres). |
| Statistiques agrégées avec seuil de 5 élèves | `/api/stats` | Même règle pour tout agrégat de groupe visible par un prof. |
| `learning_reports` (signalement d'une réponse IA) | `learning.mjs` | Précédent de signalement ; à étendre pour les contenus de groupe avec un circuit humain. |
| Rate-limit express, helmet, sessions SQLite | `server/index.mjs` | Ajouter des limites spécifiques (invitations/jour, commentaires/minute). |

**Contexte Yabné à intégrer dès la conception**
- Établissement juif sous contrat, collège + lycée : élèves de 11 à 18 ans, majorité mineurs ; les collégiens (moins de 15 ans) appellent des réglages plus stricts que les lycéens.
- **Shabbat et fêtes (Yom Tov)** : pas de notifications, pas de sessions de groupe planifiables, pas de rappels du vendredi avant le coucher du soleil au samedi soir, ni pendant les fêtes ; calendrier configurable par l'admin (heures d'entrée/sortie de Shabbat calculées pour Paris ou saisies).
- **Havrouta** : méthode traditionnelle d'étude à deux (lecture, questionnement, argumentation, reformulation). C'est la forme de collaboration la plus naturelle pour l'établissement ; elle mérite un type de groupe dédié (« binôme »), utilisable aussi en maths, philo ou histoire.
- **Mixité des binômes/groupes** : sujet potentiellement sensible selon les familles et la politique de l'établissement. Ne rien supposer : prévoir un **paramètre établissement** (par exemple « binômes havrouta : libre / même genre recommandé / composés par l'enseignant »). Cela suppose une donnée « genre » qui n'existe pas dans `users` : à ne collecter que si l'établissement le décide, et au strict minimum.
- Programme national **pHARe** (lutte contre le harcèlement) et numéro **3018** : à afficher dans le circuit de signalement.

---

## 1. Principes directeurs (filtre appliqué à chaque cas d'usage)

1. **Espace pédagogique, pas réseau social.** Un groupe sert à travailler : ressources, tâches, séances, quiz. La communication libre est l'exception, encadrée.
2. **Pas de pièce privée invisible aux adultes.** Les espaces de groupe peuvent être consultés par l'équipe éducative habilitée, et les élèves le savent (bandeau permanent). Ce n'est pas de la surveillance continue : accès motivé, journalisé, avec agrégats pour le reste.
3. **La vie privée individuelle prime.** Le tuteur personnel, les erreurs, les notes de quiz et le planning de chaque élève ne sont jamais exposés au groupe sans action explicite (opt-in) et réversible.
4. **Consentement à l'adhésion.** Personne n'est ajouté à un groupe spontané sans accepter. Seuls les groupes assignés par un adulte peuvent être imposés.
5. **L'IA guide, elle ne fait pas à la place du groupe** (valeur §1.3 du cahier des charges). En groupe, elle pose des questions, arbitre, synthétise et ne rédige pas l'exposé.
6. **Pas de classement public d'individus.** Gamification collective, bienveillante, sans comparaison nominative.
7. **Fin de vie prévue.** Tout groupe a une année scolaire, une durée de conservation et un archivage.

---

## 2. Cas d'usage (50)

Légende : **Priorité** P0 = MVP indispensable, P1 = version 2, P2 = version 3, LT = long terme. **Effort** S = moins de 3 j, M = 1 à 2 semaines, L = plus de 2 semaines (pour un développeur sur ce code).

### A. Création, adhésion, périmètre

#### UC-01 — Groupe de révision spontané dans la classe
- **Persona / scénario** : Noa, 1re B, veut réviser le contrôle de maths sur les suites avec trois amies. Elle crée « Suites — contrôle 14/11 », rattaché au cours Maths 1re B, et invite trois élèves de sa classe.
- **Fonctionnalité** : création par un élève d'un groupe `kind=revision`, nom, description, cours de rattachement facultatif, date d'échéance facultative (la date du contrôle), taille maximale.
- **Valeur** : c'est la demande principale de l'utilisateur ; elle ramène dans l'outil le travail fait aujourd'hui sur WhatsApp.
- **Risques** : groupes d'exclusion (« tout le monde sauf X »), noms de groupe insultants, groupes-fantômes. Parades : filtre de noms, limite de groupes par élève, visibilité adulte, signalement.
- **Lien existant** : `memberships`, `courses`, `canAccessCourse`.
- **Priorité** P0 · **Effort** M

#### UC-02 — Invitation et acceptation explicites
- **Scénario** : Noa choisit ses camarades dans la liste de sa classe (nom seul, pas d'email). Elles reçoivent une invitation dans « Mes groupes » et acceptent ou refusent ; le refus n'est pas notifié nominativement à l'inviteuse (« invitation non acceptée »).
- **Fonctionnalité** : table d'invitations, statuts `pending/accepted/declined/revoked/expired`, expiration à 7 jours, une seule invitation en attente par couple groupe/élève.
- **Valeur** : consentement, pas d'ajout forcé.
- **Risques** : spam d'invitations, pression sociale du refus visible. Parades : quota (10 invitations/jour), refus discret, option « ne plus recevoir d'invitations de cet élève » (blocage).
- **Lien existant** : aucune notification n'existe ; l'invitation apparaît dans le bootstrap (`/api/bootstrap`).
- **Priorité** P0 · **Effort** S

#### UC-03 — Code d'invitation temporaire
- **Scénario** : en classe, Eden affiche un code à 6 caractères valable 30 minutes ; les autres le saisissent pour demander à rejoindre, et Eden valide.
- **Fonctionnalité** : code aléatoire lié au groupe, expiration courte, usage limité, validation par le propriétaire.
- **Valeur** : rapide en présentiel, évite de parcourir des listes.
- **Risques** : code diffusé hors de la classe. Parades : le code ne marche que dans le périmètre autorisé (même établissement + règle de périmètre) et exige une validation.
- **Priorité** P1 · **Effort** S

#### UC-04 — Groupe inter-classes du même niveau (spécialités, options)
- **Scénario** : en Terminale, la spécialité SES réunit des élèves de Tle A et Tle C. Yoni crée un groupe de révision SES ouvert au niveau Terminale.
- **Fonctionnalité** : périmètre d'invitation `class` / `level` / `school`, réglé par l'admin et par défaut `level` au lycée et `class` au collège.
- **Valeur** : indispensable au lycée réformé, où les groupes réels ne suivent pas les classes.
- **Risques** : documents de cours non accessibles à tous les membres. Règle : un lien vers un document n'est affiché qu'aux membres qui y ont déjà accès (vérification `accessibleDocument` à chaque lecture).
- **Lien existant** : limite du modèle `courses.class_id` ; à terme, prévoir des « groupes d'enseignement » côté admin (hors de ce domaine, mais à signaler).
- **Priorité** P1 · **Effort** S

#### UC-05 — Groupe inter-niveaux encadré (mentorat)
- **Scénario** : Léa (Tle) aide trois élèves de 2nde en maths. Le groupe ne peut être créé que par un adulte (prof ou CPE) qui en devient référent.
- **Fonctionnalité** : `origin=teacher/admin` obligatoire pour mélanger collège/lycée ou des niveaux éloignés ; référent adulte obligatoire.
- **Valeur** : solidarité, valorisation des grands, aide aux petits.
- **Risques** : asymétrie d'âge (un majeur de 18 ans et un collégien de 11 ans) : **interdire le contact sans adulte référent**, pas de commentaires libres entre majeur et collégien, séances uniquement à l'école ou en visio supervisée.
- **Priorité** P2 · **Effort** M

#### UC-06 — Groupes d'exposé/projet assignés par le professeur
- **Scénario** : Mme Cohen (histoire, 3e A) crée 6 groupes de 4 pour un exposé sur la Guerre froide, avec un sujet par groupe et une date de rendu.
- **Fonctionnalité** : création en lot par le professeur propriétaire du cours ; `kind=project`, `origin=teacher` ; membres imposés (sans acceptation), modifiables par le prof seulement ; sujet, consignes, date de rendu.
- **Valeur** : suppression des listes papier, suivi du projet dans un seul espace.
- **Risques** : élève isolé ou mis avec un harceleur. Parade : le prof voit les incompatibilités signalées par la vie scolaire (champ « ne pas associer », visible par les adultes seulement), en V2.
- **Lien existant** : `canManageCourse`, `chapters` (rattacher l'exposé à un chapitre).
- **Priorité** P0 · **Effort** M

#### UC-07 — Composition assistée des groupes par le professeur
- **Scénario** : M. Lévy veut des groupes hétérogènes en physique. Il choisit « aléatoire », « équilibré » ou « par affinités exprimées » (chaque élève propose 2 noms, l'outil satisfait au moins un vœu).
- **Fonctionnalité** : algorithme côté serveur ; le mode « équilibré » ne peut utiliser que des données que le prof possède déjà (aucune donnée du tuteur privé), et l'outil ne montre pas d'étiquette de niveau.
- **Valeur** : gain de temps, groupes plus justes.
- **Risques** : profilage des élèves. Règle : interdiction d'utiliser la mémoire tuteur, les quiz privés ou les conversations ; les vœux d'affinité restent confidentiels.
- **Priorité** P1 · **Effort** M

#### UC-08 — Quitter, exclure, dissoudre
- **Scénario** : Tom ne veut plus du groupe ; il le quitte en un clic, sans justification. La propriétaire peut retirer un membre inactif, et le membre retiré reçoit un message neutre. Un groupe vide ou inactif depuis 60 jours est proposé à la dissolution.
- **Fonctionnalité** : `left_at`, `left_reason`, transfert de propriété automatique au plus ancien membre, dissolution avec conservation des contenus pour le délai de rétention.
- **Valeur** : liberté, propreté des données.
- **Risques** : exclusion comme outil de harcèlement (« on t'a viré »). Parades : les retraits répétés d'un même élève sont visibles par la vie scolaire ; un groupe assigné ne peut pas exclure.
- **Priorité** P0 · **Effort** S

#### UC-09 — Fin d'année et passage d'année
- **Scénario** : au 31 juillet, tous les groupes de l'année passent en « archivé », en lecture seule ; chaque élève peut exporter ses propres contributions en PDF jusqu'au 31 octobre, puis tout est purgé (sauf exigence légale).
- **Fonctionnalité** : `year_id`, job d'archivage déclenché par l'admin au passage d'année, export individuel, purge.
- **Valeur** : RGPD (limitation de la conservation), rentrée propre.
- **Lien existant** : le passage d'année manque aussi côté admin (`ajouts_equipe.md`) ; à faire ensemble.
- **Priorité** P0 · **Effort** S

#### UC-10 — Limites de taille et de nombre
- **Fonctionnalité** : réglages établissement (`max_members` 6 par défaut pour la révision, 2 pour un binôme, 40 pour un club ; 5 groupes actifs par élève ; 20 groupes par prof et par cours).
- **Valeur** : évite les « groupes classe » parallèles et le spam.
- **Priorité** P0 · **Effort** S

### B. Rôles et gouvernance

#### UC-11 — Rôles dans le groupe, avec rotation
- **Scénario** : dans un groupe d'exposé, Sarah est animatrice, David secrétaire (compte rendu), Maya gardienne du temps ; les rôles tournent à chaque séance.
- **Fonctionnalité** : rôle technique (`owner/member/referent`) distinct des **rôles pédagogiques** (`animateur`, `secretaire`, `temps`, `verificateur`), ces derniers sans droits supplémentaires ; suggestion de rotation.
- **Valeur** : pédagogie coopérative classique (rôles tournants), répartition de la charge.
- **Risques** : faibles.
- **Priorité** P1 · **Effort** S

#### UC-12 — Adulte référent du groupe
- **Scénario** : chaque groupe de projet ou club a un adulte référent qui voit tout, peut verrouiller le groupe, masquer un contenu et traiter un signalement de premier niveau.
- **Fonctionnalité** : `referent_id` ; obligatoire pour `project`, `club` et inter-niveaux ; facultatif pour la révision (le prof du cours rattaché sert de référent par défaut, sans notification active).
- **Valeur** : responsabilité claire en cas de problème.
- **Lien existant** : analogue à `delegations.created_by`.
- **Priorité** P0 (pour project et club) · **Effort** S

#### UC-13 — Délégué de classe, animateur des révisions de la classe
- **Scénario** : Lou, déléguée en Maths Tle A, ouvre avant le bac blanc un « groupe de révision ouvert » où chaque élève de la classe peut s'inscrire librement.
- **Fonctionnalité** : groupe « ouvert » (adhésion sans invitation, dans la classe), créable par un délégué ou un prof.
- **Lien existant** : `hasDelegation`.
- **Priorité** P2 · **Effort** S

### C. Contenus partagés

#### UC-14 — Partager une fiche de révision générée
- **Scénario** : Noa a généré une fiche « Suites arithmétiques » avec le tuteur ; elle la partage au groupe et les autres la consultent et la téléchargent en PDF.
- **Fonctionnalité** : copie instantanée (contenu et sources) dans `group_resources` ; mention « générée par l'IA à partir des cours de Mme X, non validée par le professeur » ; l'auteure peut la retirer.
- **Valeur** : mutualisation, moins d'appels IA (coûts).
- **Risques** : diffusion de contenus faux. Parade : bouton « signaler une erreur » qui alimente `learning_reports` du cours.
- **Lien existant** : `learning_generations`, `/api/generations/:id/pdf`.
- **Priorité** P0 · **Effort** M

#### UC-15 — Fiche commune co-écrite
- **Scénario** : le groupe rédige ensemble la fiche « Causes de la Première Guerre mondiale », chacun prend une section, et l'IA vérifie à la fin la fidélité au cours et signale les oublis sans réécrire.
- **Fonctionnalité** : note collaborative avec sections attribuées, versions, auteur par section ; édition en temps réel inutile au début (verrou par section).
- **Valeur** : apprentissage actif par production.
- **Risques** : conflits d'édition, contenus inappropriés. Parades : historique, restauration, modération.
- **Priorité** P1 · **Effort** L

#### UC-16 — Fichiers du groupe
- **Scénario** : pour l'exposé, Ethan dépose ses photos de sources et un brouillon .docx.
- **Fonctionnalité** : dépôt PDF/DOCX/TXT/images, 10 Mo par fichier et 100 Mo par groupe, même pipeline d'extraction que `documents.mjs`, stockage séparé `documents/groups/`.
- **Valeur** : tout le projet au même endroit.
- **Risques** : images inappropriées, droits d'auteur, photos de camarades (droit à l'image). Parades : rappel de charte au dépôt, signalement, images non indexées par l'IA, pas d'aperçu public.
- **Lien existant** : `documents.mjs` (validation mime, taille).
- **Priorité** P1 · **Effort** M

#### UC-17 — Banque de questions et cartes mémoire du groupe
- **Scénario** : chaque membre ajoute 5 questions sur le chapitre ; l'IA vérifie qu'elles sont fondées sur le cours, et le groupe les utilise en cartes mémoire avec répétition espacée.
- **Fonctionnalité** : questions créées par les élèves et vérifiées par l'IA (source citée ou refus), intégrées aux quiz de groupe.
- **Valeur** : produire des questions est l'une des meilleures méthodes de révision.
- **Lien existant** : « révisions espacées » est dans le reste à faire du tuteur ; mutualiser le moteur.
- **Priorité** P1 · **Effort** M

#### UC-18 — Lien vers un document du cours (sans copie)
- **Scénario** : « Revoir le corrigé du DS2, exercice 3 » : la tâche pointe vers le document publié du prof.
- **Fonctionnalité** : ressource `kind=document` qui ne stocke que l'id ; l'accès est revérifié à chaque lecture (un membre hors de la classe voit « document non accessible »).
- **Valeur** : pas de duplication, respect des droits.
- **Priorité** P0 · **Effort** S

### D. Organisation du travail

#### UC-19 — Tableau de tâches du groupe
- **Scénario** : exposé en 3 semaines : tâches « recherches partie 1 » (Maya), « plan » (tous), « diaporama » (David), en colonnes À faire / En cours / Fait.
- **Fonctionnalité** : tâches avec responsable facultatif, échéance, statut, ordre ; l'IA peut proposer un découpage du projet (validé par le groupe).
- **Valeur** : apprendre à gérer un projet, rendre visible la répartition.
- **Risques** : un élève qui fait tout, un autre rien. C'est une information pédagogique (voir UC-44), pas une sanction.
- **Priorité** P0 · **Effort** M

#### UC-20 — Tâches de groupe dans le planning personnel
- **Scénario** : la tâche de David « diaporama, pour le 20/11, 2 h » apparaît dans son planificateur, qui la répartit dans ses créneaux.
- **Fonctionnalité** : à l'attribution, création d'une `learning_tasks` liée (`group_task_id`), synchronisée (statut fait ↔ fait).
- **Lien existant** : `learning_tasks`, `/api/planner/generate`.
- **Priorité** P1 · **Effort** M

#### UC-21 — Créneaux communs (croisement des emplois du temps)
- **Scénario** : « Quand peut-on se voir cette semaine ? » L'outil propose : mardi 12 h 30–13 h 30 (CDI), jeudi 17 h–18 h (visio).
- **Fonctionnalité** : calcul serveur à partir des `learning_availability` (`available` moins `class`/`unavailable`) et de l'emploi du temps École Directe de chaque membre **qui a consenti au partage de ses disponibilités avec ce groupe** ; réponse = liste de créneaux communs, avec le nombre de membres disponibles, **sans montrer qui est occupé et pourquoi**. Exclusion automatique de Shabbat, des fêtes et des heures calmes.
- **Valeur** : grande, c'est la fonction qui distingue IABNE d'un groupe WhatsApp.
- **Risques** : inférence de l'emploi du temps d'autrui par requêtes répétées (attaque par différence) → limiter à 10 calculs par jour et par groupe, arrondir à 30 min, ne jamais renvoyer la liste nominative des absents ; minimum de 2 membres consentants.
- **Lien existant** : `learning_availability`, `ed_timetable`.
- **Priorité** P0 (sur les disponibilités saisies) · P1 (avec École Directe) · **Effort** M

#### UC-22 — Séance de révision planifiée
- **Scénario** : séance jeudi 17 h, ordre du jour « chap. 3, ex. 12–15, quiz final », réponses oui/non/peut-être, rappel la veille ; elle bloque le créneau dans le planning personnel.
- **Fonctionnalité** : `group_sessions` + réponses ; insertion d'une indisponibilité dans le planning des participants ; lieu (école, visio, autre) sans adresse personnelle.
- **Risques** : rendez-vous hors école entre mineurs : pas de champ d'adresse libre, uniquement « à l'école (salle/CDI) », « en ligne », « autre ».
- **Priorité** P1 · **Effort** M

#### UC-23 — Respect de Shabbat, des fêtes et des heures calmes
- **Fonctionnalité** : calendrier établissement (Shabbat hebdomadaire, Yom Tov, vacances), heures calmes (par défaut 21 h 30–7 h pour les lycéens et 20 h 30–7 h pour les collégiens) : aucune notification, séance ou commentaire pendant ces plages (lecture seule) ; message clair « reprise samedi soir à 19 h 12 ».
- **Valeur** : cohérence avec l'identité de l'établissement, droit à la déconnexion, réduction des conflits nocturnes.
- **Priorité** P0 · **Effort** S

#### UC-24 — Compte à rebours partagé d'un contrôle
- **Scénario** : le groupe est lié au devoir « DS chimie 18/11 » (importé d'École Directe) ; le tableau de bord affiche J-5 et la progression collective (tâches faites).
- **Lien existant** : `learning_tasks` / `ed_homework` ; le lien est déclaré par l'élève (pas d'accès aux devoirs des autres).
- **Priorité** P1 · **Effort** S

### E. Révision collective avec le tuteur IA

#### UC-25 — Quiz de groupe asynchrone
- **Scénario** : Noa lance un quiz de 10 questions sur les suites pour le groupe ; chacun répond quand il veut avant jeudi ; résultat : « 3 questions maîtrisées par tous, la question 7 ratée par la majorité ». Chacun voit son score, et le groupe voit les statistiques par question si au moins 3 membres ont répondu.
- **Fonctionnalité** : quiz instancié une fois et partagé ; correction serveur ; agrégat anonyme par question ; l'IA propose une mini-explication collective de la question la plus ratée.
- **Valeur** : identifier les notions à travailler ensemble sans exposer personne.
- **Risques** : triche (un membre donne les réponses) : sans enjeu, puisque ce n'est pas noté ; les explications ne s'affichent qu'après réponse.
- **Lien existant** : `learning_quizzes`, `/api/quizzes/:id/answer` (correction unique).
- **Priorité** P1 (MVP+) · **Effort** M

#### UC-26 — Quiz « salle » en direct
- **Scénario** : en séance au CDI, les 4 membres répondent en même temps question par question (style Kahoot, sans chronomètre stressant), et l'IA commente chaque question.
- **Fonctionnalité** : état de séance synchronisé (polling court ou SSE), avancement par l'animateur.
- **Risques** : techniques (temps réel avec SQLite et une instance, ce qui reste faisable en SSE).
- **Priorité** P2 · **Effort** L

#### UC-27 — Défi entre groupes
- **Scénario** : deux groupes de 2nde se lancent un défi sur les fonctions ; score **collectif** (moyenne de groupe), aucun score individuel affiché.
- **Risques** : compétition malsaine, groupe « nul ». Parades : défis coopératifs (objectif commun à la classe) plutôt que des duels ; activé par un prof.
- **Priorité** P2 · **Effort** M

#### UC-28 — « Explique à ton camarade » (effet protégé)
- **Scénario** : l'IA tire une notion ; Eden doit l'expliquer par écrit (ou à l'oral en V3) à Tom ; Tom pose une question ; l'IA évalue l'explication par rapport au cours du prof (exactitude, vocabulaire, étapes) et donne un retour à Eden seul.
- **Fonctionnalité** : activité structurée à deux rôles ; le retour IA est privé pour l'explicateur, sauf s'il le partage.
- **Valeur** : expliquer est la manière la plus efficace d'apprendre (effet protégé) ; cohérent avec « l'IA guide ».
- **Lien existant** : méthode validée du prof (`teacher-tutor.mjs`), mode `check` du tuteur.
- **Priorité** P1 · **Effort** M

#### UC-29 — Tuteur IA de groupe
- **Scénario** : pendant la séance, le groupe pose au tuteur « Pourquoi la raison est-elle q et pas 1/q ? » ; la réponse est visible par tous les membres.
- **Fonctionnalité** : fil IA propre au groupe (`group_ai_chats`), contexte = documents du cours **accessibles à tous les membres** (intersection) + méthode validée du prof ; **aucune** mémoire individuelle ; aide progressive (indice d'abord).
- **Risques** : un membre pose une question personnelle ou inappropriée visible par tous → avertissement avant envoi, modération, signalement. Coût IA : quota par groupe.
- **Lien existant** : `/api/ai/chat` (RAG, citations, abstention).
- **Priorité** P1 · **Effort** L

#### UC-30 — Synthèse IA de séance
- **Scénario** : en fin de séance, le secrétaire demande un compte rendu : notions vues, questions restées ouvertes, prochaines tâches proposées (à valider).
- **Fonctionnalité** : synthèse à partir des ressources, tâches et du fil IA du groupe (pas des conversations privées).
- **Priorité** P2 · **Effort** M

#### UC-31 — Notions communes à retravailler (opt-in)
- **Scénario** : chaque membre peut cocher « partager mes notions à revoir en maths avec ce groupe » ; le groupe voit « 3 membres sur 4 ont la notion *suite géométrique* à revoir » et l'IA propose une séance ciblée.
- **Fonctionnalité** : agrégat calculé depuis la mémoire tuteur **seulement si l'élève l'active pour ce groupe**, révocable, sans nominatif si au moins 3 membres.
- **Risques** : pression à partager ; jamais activé par défaut, jamais demandé par un camarade.
- **Lien existant** : mémoire tuteur (`tutor_mistakes`, notions à retravailler des quiz).
- **Priorité** P2 · **Effort** M

### F. Tutorat entre pairs

#### UC-32 — Mentorat Terminale → Seconde
- **Scénario** : la CPE organise un dispositif « grands frères / grandes sœurs » : 10 terminales volontaires suivent chacun 1 à 3 secondes, avec une séance par semaine en étude surveillée.
- **Fonctionnalité** : groupes `kind=pair`/`revision` créés par un adulte, référent obligatoire, séances uniquement dans des lieux de l'établissement ou en visio supervisée ; fiche de suivi de séance (notion travaillée, durée) remplie par le tuteur.
- **Risques** : emprise, harcèlement, majeurs et mineurs : charte signée, pas de commentaires libres, référent informé de chaque séance.
- **Priorité** P2 · **Effort** M

#### UC-33 — Bourse d'entraide « j'aide / j'ai besoin »
- **Scénario** : Ilan indique « je peux aider en anglais » ; Rachel « j'ai besoin d'aide en anglais ». Un adulte valide la mise en relation, et l'outil ne fait aucun appariement automatique visible des élèves.
- **Fonctionnalité** : déclarations (visibles uniquement des adultes), proposition d'appariement aux adultes, création d'un binôme encadré.
- **Risques** : étiquette « élève en difficulté » visible : interdit ; la demande d'aide n'est jamais publique.
- **Priorité** P2 · **Effort** M

#### UC-34 — Reconnaissance de l'engagement de tutorat
- **Scénario** : en fin d'année, Léa obtient une attestation « 24 séances de tutorat » signée par la CPE, utile pour la rubrique « engagement » de Parcoursup.
- **Fonctionnalité** : comptage des séances validées par le référent, export PDF.
- **Lien existant** : `pdf-layout.mjs`.
- **Priorité** P2 · **Effort** S

### G. Havrouta et binômes

#### UC-35 — Binôme havrouta
- **Scénario** : en cours de Guemara ou de Tanakh (et aussi en philo ou en maths), le prof forme des havroutot. Le binôme ouvre la séance : texte source (document du cours), minuteur par phases (lecture à voix haute, explication par A, questions de B, inversion des rôles, synthèse commune), et à la fin chacun note la question la plus forte du jour.
- **Fonctionnalité** : `kind=pair` (2 membres exactement), modèle de séance en phases paramétrable par le prof, rôles alternés, journal de havrouta (questions soulevées, désaccords, résolutions).
- **Valeur** : très forte pour Yabné ; méthode d'apprentissage actif reconnue, déjà pratiquée dans l'établissement.
- **Risques** : composition des binômes (mixité selon la politique de l'école, voir §0) ; un partenaire absent : bascule possible en « havrouta avec l'IA » (UC-37).
- **Lien existant** : documents du cours ; chronomètre du tuteur (`tutor_study`), à réutiliser pour les phases.
- **Priorité** P1 · **Effort** M

#### UC-36 — Binôme de travail (partenaire de régularité)
- **Scénario** : Maya et Lior se fixent un objectif hebdomadaire (« 3 séances de 45 min ») et voient chacune si l'autre a validé ses séances (pas le contenu).
- **Fonctionnalité** : objectif partagé, case « séance faite » déclarative ; le temps chronométré n'est partagé que sur opt-in.
- **Risques** : culpabilisation ; ton positif, pas de relance insistante.
- **Lien existant** : `tutor_study` (temps), planning.
- **Priorité** P1 · **Effort** S

#### UC-37 — L'IA comme « troisième voix » de la havrouta
- **Scénario** : bloqué sur un passage, le binôme demande à l'IA « une question pour avancer » ; l'IA propose des questions d'analyse (« Quelle est la difficulté que soulève ce mot ? Comment Rachi le lit-il selon le document de votre professeur ? ») et ne donne jamais l'explication complète d'emblée.
- **Fonctionnalité** : mode IA « questionneur » contraint aux sources du prof (aucune source extérieure, conforme au §4.3), aide progressive.
- **Risques** : sur les textes religieux, l'IA ne doit pas trancher ni inventer d'interprétations : abstention si la source manque, et renvoi au professeur.
- **Priorité** P2 · **Effort** M

### H. Communication, modération, sécurité

#### UC-38 — Commentaires structurés plutôt que chat libre (MVP)
- **Scénario** : sur la tâche « plan », David commente « J'ai fini la partie 2, vous pouvez relire ? ». Pas de messages privés entre élèves.
- **Fonctionnalité** : commentaires courts (500 caractères) attachés à une tâche, une ressource ou une séance, sans images, sans édition après 5 min, avec suppression par l'auteur (trace conservée pour la modération), respect des heures calmes, 20 commentaires par heure au maximum.
- **Valeur** : coordination suffisante sans ouvrir un réseau social.
- **Priorité** P0 · **Effort** S

#### UC-39 — Messagerie de groupe modérée (V3, optionnelle)
- **Scénario** : l'établissement active, pour les lycéens seulement, un fil de discussion par groupe.
- **Fonctionnalité** : fil par groupe (pas de messages privés 1-à-1 entre élèves), heures d'ouverture, pré-modération IA, signalement, conservation limitée (90 jours), désactivable par groupe, niveau et établissement.
- **Risques** : élevés (harcèlement, captures d'écran, contenus sexuels, radicalisation) ; impose une **AIPD** (analyse d'impact RGPD), une charte, des modérateurs humains disponibles et un circuit pHARe. Recommandation : ne pas développer avant que les UC-38/40/41 fonctionnent et que l'établissement le demande.
- **Priorité** LT · **Effort** L

#### UC-40 — Signalement et circuit vie scolaire
- **Scénario** : Rachel trouve un commentaire blessant ; elle le signale (motif : moquerie, insulte, contenu choquant, exclusion, autre) ; le contenu est masqué pour elle tout de suite ; le référent et l'admin le reçoivent ; Rachel voit le suivi (« reçu », « traité ») et les ressources d'aide (CPE, 3018).
- **Fonctionnalité** : `group_reports`, file de traitement admin/référent, masquage, verrouillage du groupe, retrait d'un membre, journal ; le signalant n'est jamais révélé au signalé.
- **Valeur** : obligation de protection des mineurs.
- **Lien existant** : `learning_reports` (signalement IA), à distinguer.
- **Priorité** P0 · **Effort** M

#### UC-41 — IA de modération (assistance, pas sanction)
- **Scénario** : avant publication, un commentaire « t'es trop nul, personne veut de toi ici » est retenu ; l'auteur voit « Ce message pourrait blesser. Reformuler ? » ; en cas de récidive, une alerte part au référent.
- **Fonctionnalité** : classification (insulte, harcèlement, contenu sexuel, données personnelles comme un numéro de téléphone ou une adresse, détresse) ; **aucune sanction automatique** ; signal de détresse → alerte humaine prioritaire.
- **Risques** : faux positifs, envoi de contenus de mineurs à un fournisseur IA (à encadrer contractuellement, minimisation) ; un filtre local par mots-clés suffit en V1.
- **Priorité** P2 (filtre simple en P0) · **Effort** M

#### UC-42 — Visibilité adulte et journal d'audit
- **Scénario** : le référent ouvre l'espace du groupe ; l'accès est journalisé (« consulté par M. Lévy le 12/11 ») et visible des membres. L'admin voit la liste de tous les groupes (nom, type, taille, activité, signalements) sans ouvrir les contenus, sauf accès motivé.
- **Fonctionnalité** : `group_audit` ; tableau de bord admin des groupes ; bandeau élève « Cet espace peut être consulté par l'équipe éducative ».
- **Valeur** : confiance des familles, protection, transparence.
- **Priorité** P0 · **Effort** S

#### UC-43 — Information des familles
- **Scénario** : au premier groupe créé, une notice explique aux parents ce que sont les groupes ; à terme (rôle parent absent aujourd'hui), le parent voit les groupes de son enfant (noms, membres) mais pas les contenus.
- **Priorité** P2 (notice en P0) · **Effort** S

### I. Projets, rendus, évaluation

#### UC-44 — Suivi de contribution d'un exposé
- **Scénario** : le prof voit pour chaque groupe : tâches par membre, ressources déposées, sections de la fiche commune écrites, séances suivies, plus une auto-déclaration finale (« j'ai fait X ») de chacun.
- **Fonctionnalité** : indicateurs factuels et déclaratifs, jamais un « score de productivité » ; visibles du prof référent et des membres eux-mêmes.
- **Valeur** : repérer le passager clandestin et l'élève qui porte tout.
- **Risques** : surveillance ressentie, contributions hors ligne invisibles ; d'où l'importance de la déclaration et du commentaire libre.
- **Priorité** P1 · **Effort** M

#### UC-45 — Rendu de groupe au professeur
- **Scénario** : le groupe rend le diaporama et la fiche ; un membre soumet, tous les membres confirment « je valide ce rendu » ; le prof reçoit le rendu, horodaté, avec mention des retards.
- **Fonctionnalité** : `group_submissions` (fichiers, statut, confirmations), dépôt verrouillé après échéance (sauf délai accordé), retour du prof (commentaire et note facultative, la note officielle restant dans École Directe).
- **Lien existant** : pipeline documents ; le rendu n'entre jamais dans le corpus IA du cours.
- **Priorité** P1 · **Effort** M

#### UC-46 — Évaluation par les pairs et auto-évaluation critériée
- **Scénario** : après l'exposé, chaque élève évalue les autres groupes sur 4 critères du prof (clarté, sources, oral, réponses aux questions) avec un commentaire constructif obligatoire ; à l'intérieur du groupe, il évalue la coopération (confidentiel, visible du prof seul).
- **Fonctionnalité** : grilles créées par le prof, anonymat entre élèves, contrôle des commentaires (IA de modération), synthèse pour le prof.
- **Risques** : règlements de comptes, notes de complaisance : le prof garde la décision, et les évaluations de pairs sont indicatives.
- **Priorité** P2 · **Effort** M

#### UC-47 — Préparation du Grand oral en groupe
- **Scénario** : 3 terminales répètent leur Grand oral ; chacun présente 5 min (chronomètre), les autres remplissent une grille (posture, clarté, réponse aux questions) ; l'IA génère des questions de jury plausibles à partir des cours de spécialité.
- **Fonctionnalité** : séance « oral blanc » avec rotation, grille, chrono, banque de questions de jury ; en V3, l'enregistrement audio privé et la transcription pour un retour IA (consentement explicite).
- **Valeur** : forte en Terminale, l'oral se travaille mal seul.
- **Risques** : enregistrement de voix de mineurs (données personnelles) : uniquement opt-in, stockage privé, suppression rapide.
- **Priorité** P1 · **Effort** M

#### UC-48 — Groupes de préparation au bac et au brevet
- **Scénario** : en 3e, groupe « Brevet — sciences » : planning de révisions jusqu'à juin, sujets d'entraînement générés (agent existant) partagés au groupe, correction individuelle puis mise en commun.
- **Fonctionnalité** : modèle de groupe préconfiguré (tâches types, jalons, quiz récurrents), sujets générés partagés sans le corrigé, corrigé débloqué après tentative.
- **Lien existant** : `practice-agent.mjs` (sujets, indices, corrigés séparés).
- **Priorité** P1 · **Effort** S

### J. Vie de l'établissement et motivation

#### UC-49 — Clubs, associations, BDE
- **Scénario** : club d'échecs, comité Tsédaka, BDE qui prépare la fête de Pourim : membres, référent adulte obligatoire, annonces (par le référent et les responsables), tâches, sessions, documents.
- **Fonctionnalité** : `kind=club`, inter-niveaux, adhésion ouverte ou sur demande, annonces descendantes plutôt que chat.
- **Risques** : mélange d'âges, contenus non pédagogiques : référent obligatoire, pas de fichiers image libres.
- **Priorité** P2 · **Effort** M

#### UC-50 — Gamification saine
- **Scénario** : le groupe débloque des jalons collectifs (« 5 séances tenues », « 100 questions révisées ensemble ») ; la classe a un objectif commun (« 500 quiz avant le bac blanc ») ; il n'y a pas de classement nominatif.
- **Fonctionnalité** : badges de groupe, série hebdomadaire tolérante (une semaine manquée ne remet pas à zéro), jamais de série pendant Shabbat, les fêtes ou les vacances, aucune récompense liée au temps d'écran nocturne.
- **Risques** : addiction, comparaison, exclusion des élèves moins actifs ; pas de leaderboard individuel, pas de notifications de pression.
- **Priorité** P2 · **Effort** S

---

## 3. Synthèse des priorités

| Priorité | Cas d'usage |
| --- | --- |
| **P0 (MVP)** | UC-01, 02, 06, 08, 09, 10, 12 (project), 14, 18, 19, 21 (disponibilités saisies), 23, 38, 40, 41 (filtre simple), 42, 43 (notice) |
| **P1** | UC-03, 04, 07, 11, 15, 16, 17, 20, 21 (École Directe), 22, 24, 25, 28, 29, 35, 36, 44, 45, 47, 48 |
| **P2** | UC-05, 13, 26, 27, 30, 31, 32, 33, 34, 37, 41 (IA), 43 (parents), 46, 49, 50 |
| **Long terme** | UC-39 (messagerie), oral enregistré (UC-47 V3), groupes d'enseignement admin (spécialités) |

---

## 4. Proposition de MVP « Groupes »

### 4.1 Périmètre fonctionnel
1. Groupes de **révision** créés par les élèves (même classe ; même niveau si l'établissement l'autorise) et groupes de **projet** créés par un professeur pour un de ses cours.
2. Invitations avec acceptation (groupes élèves), affectation directe (groupes prof).
3. Ressources : fiches générées partagées (copie), liens vers des documents du cours (droits revérifiés), notes courtes.
4. Tableau de tâches à 3 colonnes.
5. Créneaux communs calculés sur les disponibilités saisies (opt-in).
6. Commentaires courts sur les tâches et ressources, avec heures calmes, Shabbat, filtre de mots et signalement.
7. Visibilité du référent et de l'admin, journal d'audit, verrouillage, archivage de fin d'année.
8. Réglages établissement.

Hors MVP : chat, fichiers libres, quiz de groupe, tuteur IA de groupe, havrouta (V2).

### 4.2 Modèle de données (SQLite, style `server/db.mjs`)

Nouveau module `server/groups.mjs` avec `initialize()` sur le modèle de `learning.mjs`. Ids `TEXT` (`uid()`), dates ISO `TEXT` (`now()`), `school_id` sur chaque table pour les filtres, `CHECK` pour les énumérations.

```sql
-- Réglages par établissement
CREATE TABLE IF NOT EXISTS group_settings(
  school_id TEXT PRIMARY KEY REFERENCES schools(id),
  student_creation INTEGER NOT NULL DEFAULT 1,              -- les élèves peuvent créer des groupes
  student_scope TEXT NOT NULL DEFAULT 'class'
    CHECK(student_scope IN ('class','level','school')),     -- périmètre d'invitation
  max_members INTEGER NOT NULL DEFAULT 6 CHECK(max_members BETWEEN 2 AND 40),
  max_groups_per_student INTEGER NOT NULL DEFAULT 5,
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  quiet_start TEXT NOT NULL DEFAULT '21:30',                -- HH:MM, heure de Paris
  quiet_end TEXT NOT NULL DEFAULT '07:00',
  observe_shabbat INTEGER NOT NULL DEFAULT 1,
  retention_days_after_archive INTEGER NOT NULL DEFAULT 90,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL);

-- Plages fermées (Shabbat, Yom Tov, vacances) saisies ou générées par l'admin
CREATE TABLE IF NOT EXISTS school_closures(
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
  label TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,   -- ISO avec fuseau
  kind TEXT NOT NULL CHECK(kind IN ('shabbat','holiday','vacation','other')));
CREATE INDEX IF NOT EXISTS idx_closures ON school_closures(school_id,starts_at);

CREATE TABLE IF NOT EXISTS study_groups(
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  year_id TEXT NOT NULL REFERENCES school_years(id),
  kind TEXT NOT NULL CHECK(kind IN ('revision','project','pair','club')),
  origin TEXT NOT NULL CHECK(origin IN ('student','teacher','admin')),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 3 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 500),
  scope TEXT NOT NULL DEFAULT 'class' CHECK(scope IN ('class','level','school')),
  class_id TEXT REFERENCES classes(id),          -- classe de référence (NULL si inter-classes)
  level TEXT,                                    -- niveau de référence si scope='level'
  course_id TEXT REFERENCES courses(id),         -- matière de rattachement (facultative)
  chapter_id TEXT REFERENCES chapters(id),
  referent_id TEXT REFERENCES users(id),         -- adulte responsable
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','locked','archived','dissolved')),
  max_members INTEGER NOT NULL DEFAULT 6 CHECK(max_members BETWEEN 2 AND 40),
  due_date TEXT,                                 -- YYYY-MM-DD (contrôle, rendu)
  brief TEXT NOT NULL DEFAULT '',                -- consignes du prof (projets)
  locked_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT);
CREATE INDEX IF NOT EXISTS idx_groups_school ON study_groups(school_id,year_id,status);
CREATE INDEX IF NOT EXISTS idx_groups_course ON study_groups(course_id,status);

CREATE TABLE IF NOT EXISTS group_members(
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  school_id TEXT NOT NULL REFERENCES schools(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
  edu_role TEXT CHECK(edu_role IN ('animateur','secretaire','temps','verificateur')),  -- V2
  share_availability INTEGER NOT NULL DEFAULT 0,  -- opt-in créneaux communs
  joined_at TEXT NOT NULL, left_at TEXT,
  left_reason TEXT CHECK(left_reason IN ('left','removed','dissolved','year_end')),
  PRIMARY KEY(group_id,user_id));
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id,left_at);

CREATE TABLE IF NOT EXISTS group_invitations(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id),
  invitee_id TEXT NOT NULL REFERENCES users(id),
  invited_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','declined','revoked','expired')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, responded_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_invite_pending
  ON group_invitations(group_id,invitee_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_group_invite_user ON group_invitations(invitee_id,status);

-- Blocage : un élève refuse toute invitation d'un autre
CREATE TABLE IF NOT EXISTS group_blocks(
  user_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  school_id TEXT NOT NULL REFERENCES schools(id),
  created_at TEXT NOT NULL, PRIMARY KEY(user_id,blocked_id));

CREATE TABLE IF NOT EXISTS group_resources(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id),
  kind TEXT NOT NULL CHECK(kind IN ('generation','document','note')),
  ref_id TEXT,                         -- learning_generations.id d'origine ou documents.id
  course_id TEXT REFERENCES courses(id),
  title TEXT NOT NULL CHECK(length(title) <= 120),
  body TEXT NOT NULL DEFAULT '',       -- instantané de la fiche ou texte de la note (<= 20000)
  sources TEXT NOT NULL DEFAULT '[]',  -- JSON, recopié de la génération
  shared_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  removed_at TEXT, removed_by TEXT REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_group_resources ON group_resources(group_id,removed_at);

CREATE TABLE IF NOT EXISTS group_tasks(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id),
  title TEXT NOT NULL CHECK(length(title) <= 120),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
  assignee_id TEXT REFERENCES users(id),
  resource_id TEXT REFERENCES group_resources(id) ON DELETE SET NULL,
  due_date TEXT, position INTEGER NOT NULL DEFAULT 0,
  planner_task_id TEXT REFERENCES learning_tasks(id) ON DELETE SET NULL,  -- V2 (UC-20)
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_group_tasks ON group_tasks(group_id,status,position);

CREATE TABLE IF NOT EXISTS group_comments(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id),
  target_type TEXT NOT NULL CHECK(target_type IN ('task','resource','session')),
  target_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  moderation TEXT NOT NULL DEFAULT 'ok' CHECK(moderation IN ('ok','flagged','hidden')),
  created_at TEXT NOT NULL,
  deleted_at TEXT,                                  -- suppression par l'auteur (contenu gardé pour la modération pendant la rétention)
  hidden_at TEXT, hidden_by TEXT REFERENCES users(id), hidden_reason TEXT);
CREATE INDEX IF NOT EXISTS idx_group_comments ON group_comments(group_id,target_type,target_id);

-- V2 (UC-22), mais la table peut exister dès le MVP
CREATE TABLE IF NOT EXISTS group_sessions(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id),
  date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  place TEXT NOT NULL CHECK(place IN ('school','online','other')),
  place_detail TEXT NOT NULL DEFAULT '' CHECK(length(place_detail) <= 60),  -- « CDI », « salle 204 »
  agenda TEXT NOT NULL DEFAULT '' CHECK(length(agenda) <= 1000),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','cancelled','done')),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_session_rsvp(
  session_id TEXT NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  response TEXT NOT NULL CHECK(response IN ('yes','no','maybe')),
  availability_id TEXT REFERENCES learning_availability(id) ON DELETE SET NULL, -- créneau bloqué dans le planning perso
  updated_at TEXT NOT NULL, PRIMARY KEY(session_id,user_id));

CREATE TABLE IF NOT EXISTS group_reports(
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  group_id TEXT NOT NULL REFERENCES study_groups(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK(target_type IN ('group','comment','resource','task','member')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('insult','mockery','exclusion','sexual','personal_data','distress','cheating','other')),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),  -- 'distress' => urgent
  handled_by TEXT REFERENCES users(id), handled_at TEXT, resolution TEXT,
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_group_reports ON group_reports(school_id,status,priority);

CREATE TABLE IF NOT EXISTS group_audit(
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,        -- create, invite, join, leave, remove, lock, unlock, staff_view, hide, archive, dissolve...
  target_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_group_audit ON group_audit(group_id,created_at);
```

Remarques :
- `group_audit` n'a pas de `ON DELETE CASCADE` vers `users` : à intégrer dans la future « suppression RGPD complète » (anonymisation `actor_id`), qui manque déjà ailleurs.
- `group_members.school_id` est redondant mais facilite les requêtes filtrées sur l'établissement, comme `delegations.school_id`.
- V2 ajoutera : `group_quizzes`/`group_quiz_answers` (copie du schéma `learning_quizzes`), `group_ai_chats`, `group_files`, `group_submissions` (+ `group_submission_files`, `group_submission_confirmations`), `pair_sessions` (havrouta : phases, journal), `peer_reviews`.

### 4.3 Contrôle d'accès (à placer dans `groups.mjs`)

```js
// Membre actif ?
isGroupMember(user, groupId)       // group_members avec left_at IS NULL, même school_id
// Adulte habilité ?
isGroupStaff(user, group)          // admin de l'école, referent_id, ou prof propriétaire de group.course_id
canViewGroup(user, groupId)        // membre || staff (si staff non membre => écrire group_audit 'staff_view')
canEditGroup(user, group)          // membre && status='active' && hors plage calme (pour l'écriture élève)
canManageGroup(user, group)        // owner (groupe élève) || staff ; pour les groupes 'teacher', membres non modifiables par les élèves
canInvite(user, group, invitee)    // même school, invitee.role='student', active, périmètre respecté
                                   // (class : memberships commune ; level : classes.level identique dans la même year),
                                   // pas de blocage, quota non dépassé, max_members non atteint
```
Toute ressource `document` est revérifiée avec `accessibleDocument(member, doc)` à chaque lecture. Toute ressource `generation` n'est partageable que par son propriétaire (`learning_generations.user_id = req.user.id`).

### 4.4 Routes API (MVP)

Élève / membre :
| Méthode | Route | Corps / effet |
| --- | --- | --- |
| GET | `/api/groups` | Mes groupes actifs + invitations en attente |
| POST | `/api/groups` | `{name,description,kind:'revision',courseId?,scope?,dueDate?}` (élève) ; crée `owner` |
| GET | `/api/groups/:id` | Détail : membres (nom, rôle), ressources, tâches, prochaines séances ; bandeau de visibilité adulte |
| PATCH | `/api/groups/:id` | `{name,description,dueDate}` (owner/staff) |
| DELETE | `/api/groups/:id` | Dissolution (owner pour un groupe élève, staff) → `status='dissolved'` |
| GET | `/api/groups/:id/invitable` | Élèves invitables (nom + classe), filtrés par périmètre, sans email |
| POST | `/api/groups/:id/invitations` | `{userIds:[...]}` (quota 10/jour) |
| POST | `/api/group-invitations/:id/accept` · `/decline` | Réponse de l'invité |
| DELETE | `/api/group-invitations/:id` | Révocation par l'inviteur |
| POST | `/api/groups/:id/leave` | Quitter (transfert automatique de propriété) |
| DELETE | `/api/groups/:id/members/:userId` | Retrait (owner d'un groupe élève, staff) |
| PATCH | `/api/groups/:id/me` | `{shareAvailability}` (opt-in créneaux) |
| POST | `/api/groups/:id/resources` | `{kind:'generation',generationId}` · `{kind:'document',documentId}` · `{kind:'note',title,body}` |
| GET | `/api/groups/:id/resources/:rid` | Contenu (droits documents revérifiés) ; `/pdf` pour une fiche |
| DELETE | `/api/groups/:id/resources/:rid` | Auteur ou staff (soft delete) |
| GET/POST | `/api/groups/:id/tasks` | Liste / création `{title,details,assigneeId?,dueDate?}` |
| PATCH/DELETE | `/api/groups/:id/tasks/:tid` | `{status,assigneeId,position,...}` |
| GET | `/api/groups/:id/common-slots?from=&to=` | Créneaux communs (opt-in seulement, 10 appels/jour/groupe, granularité 30 min, sans nominatif) |
| GET/POST | `/api/groups/:id/comments?targetType=&targetId=` | Commentaires (refus 423 pendant les heures calmes ou Shabbat, filtre) |
| DELETE | `/api/groups/:id/comments/:cid` | Auteur (soft delete) |
| POST | `/api/groups/:id/reports` | `{targetType,targetId,reason,details}` |
| POST | `/api/blocks` · DELETE `/api/blocks/:userId` | Blocage d'invitations |

Professeur :
| Méthode | Route | Corps / effet |
| --- | --- | --- |
| POST | `/api/courses/:courseId/groups/batch` | `{groups:[{name,memberIds,brief,dueDate}]}` ou `{mode:'random',size:4,brief,dueDate}` → groupes `project`, `origin='teacher'`, `referent_id=prof` |
| GET | `/api/courses/:courseId/groups` | Groupes du cours : taille, activité, tâches faites/total, signalements |
| PUT | `/api/groups/:id/members` | `{memberIds}` (groupes prof uniquement) |
| POST | `/api/groups/:id/lock` · `/unlock` | `{reason}` |
| POST | `/api/groups/:id/comments/:cid/hide` | Masquage avec motif |

Administration :
| Méthode | Route | Corps / effet |
| --- | --- | --- |
| GET/PATCH | `/api/admin/group-settings` | Réglages établissement |
| GET/POST/DELETE | `/api/admin/closures` | Shabbat, fêtes, vacances (import d'une liste annuelle) |
| GET | `/api/admin/groups?status=&kind=&classId=` | Liste globale sans contenus |
| GET | `/api/admin/group-reports?status=` · PATCH `/api/admin/group-reports/:id` | Traitement `{status,resolution}` |
| POST | `/api/admin/groups/archive-year` | `{yearId}` → archivage, `left_reason='year_end'` |
| GET | `/api/groups/:id/audit` | Journal (staff ; les membres voient les seules entrées `staff_view`) |

Toutes les routes passent par `requireAuth`, filtrent sur `school_id`, valident les longueurs, renvoient 404 (et non 403) pour un groupe hors périmètre afin d'éviter l'énumération, et sont limitées en débit (`express-rate-limit` dédié : 30 écritures/min/utilisateur).

### 4.5 Écrans (React, `src/`)

Nouveau composant `src/Groups.jsx` (sur le modèle de `PersonalTutor.jsx`), branché dans `main.jsx` :

1. **Élève — « Mes groupes »** (onglet principal) : cartes de groupes (nom, matière, échéance J-x, tâches restantes), badge d'invitations, bouton « Créer un groupe », bandeau « Les espaces de groupe peuvent être consultés par l'équipe éducative ».
2. **Création / invitation** : formulaire (nom, matière, date, description), puis sélection dans la liste de classe avec recherche locale ; message « Tes camarades devront accepter ».
3. **Espace du groupe**, en 4 onglets :
   - *Tableau* : colonnes À faire / En cours / Fait, glisser-déposer accessible (boutons « déplacer » pour clavier et mobile).
   - *Ressources* : fiches partagées (lecture, PDF), liens vers des documents du cours, notes ; bouton « Partager une de mes fiches » (liste de `learning_generations`).
   - *Se retrouver* : interrupteur « partager mes disponibilités avec ce groupe », créneaux communs de la semaine, (V2) séances et réponses.
   - *Membres* : liste, quitter, retirer (owner), signaler, journal des consultations adultes.
   - Commentaires en panneau latéral sur chaque tâche ou ressource, désactivés avec explication pendant les heures calmes et Shabbat.
4. **Professeur — « Groupes du cours »** dans la page cours : création en lot (manuel ou aléatoire), tableau d'avancement par groupe, ouverture d'un groupe (avec bandeau « votre consultation est visible des membres »), verrouillage.
5. **Admin — « Groupes et signalements »** : réglages, calendrier de fermeture (Shabbat/fêtes), liste des groupes, file des signalements (urgents en haut), archivage de l'année.

---

## 5. Règles de sécurité recommandées

**Protection des mineurs et prévention du harcèlement**
1. Aucun message privé 1-à-1 entre élèves. Communication uniquement dans des espaces de groupe, attachée à un objet de travail (MVP), visibles par les adultes habilités.
2. Adhésion consentie (sauf groupes imposés par un adulte), refus discret, blocage possible, quitter sans justification.
3. Collégiens : périmètre `class` imposé, commentaires désactivables par niveau, heures calmes plus larges. Mélange collège/lycée et mineur/majeur : uniquement dans des groupes créés par un adulte avec référent, sans commentaires libres.
4. Séances : pas d'adresse personnelle ; lieux de l'établissement ou en ligne.
5. Filtre de contenu à l'écriture (insultes, numéros de téléphone, adresses, emails, liens externes bloqués en MVP), signalement en 2 clics, masquage immédiat pour le signalant, circuit humain (référent, puis admin/CPE), priorité « détresse » avec affichage des ressources (CPE, infirmerie, **3018**), lien avec le protocole **pHARe** de l'établissement.
6. Aucune sanction automatique par l'IA ; l'IA aide à détecter, un adulte décide.

**Confidentialité et RGPD**
7. Le tuteur personnel, les conversations IA, les erreurs, les quiz individuels, le temps de travail et le planning ne sont **jamais** visibles du groupe ; tout partage est opt-in, par groupe, révocable (UC-21, 31, 36).
8. Créneaux communs : calcul serveur, intersection seule, granularité 30 min, quota d'appels, pas de nominatif, au moins 2 consentants.
9. Pas d'email ni d'identifiant interne exposés dans les listes d'invitation (nom + classe seulement).
10. Minimisation : pas de photo de profil, pas de champ libre « bio ». Si un champ genre est créé pour les binômes, il n'est visible que des adultes.
11. Rétention : archivage au passage d'année, export individuel de ses contributions, purge après `retention_days_after_archive` (90 j par défaut) ; les signalements et audits suivent une durée distincte, fixée par l'établissement (par exemple 1 an).
12. **AIPD** recommandée avant l'ouverture des commentaires et indispensable avant toute messagerie ou modération IA envoyant des contenus d'élèves à un fournisseur ; information des familles et charte d'usage signée (élèves).
13. Visibilité adulte transparente : bandeau, journal `staff_view` visible des membres, admin sans accès aux contenus par défaut (liste et métadonnées), accès motivé.

**Intégrité scolaire (anti-triche)**
14. Un groupe n'élargit jamais l'accès aux documents (revérification de chaque lecture).
15. Les sorties du tuteur en mode `solution` et les corrigés générés ne sont pas partageables dans un groupe avant l'échéance du devoir lié ; les sujets partagés le sont sans corrigé, débloqué après tentative individuelle.
16. Les rendus de groupe et les ressources de groupe n'entrent jamais dans le corpus RAG du cours.
17. Les agrégats visibles par un professeur respectent le seuil existant de 5 élèves lorsqu'ils dépassent un groupe ; à l'intérieur d'un groupe, les statistiques de quiz sont anonymes à partir de 3 répondants.

**Technique**
18. Toutes les vérifications côté serveur (`school_id`, appartenance, statut `active`, plages calmes), 404 sur un groupe hors périmètre, limites de débit dédiées, longueurs bornées en base (`CHECK`), rendu du texte sans HTML exécutable (comme pour l'IA aujourd'hui), journalisation des actions sensibles.

---

## 6. Roadmap en 3 versions

### V1 — « Travailler ensemble en sécurité » (MVP, environ 4 à 5 semaines pour un développeur)
- Tables §4.2 (sans quiz, IA ni fichiers), module `server/groups.mjs`, `src/Groups.jsx`.
- UC-01, 02, 06, 08, 09, 10, 12, 14, 18, 19, 21 (disponibilités saisies), 23, 38, 40, 41 (filtre local), 42, 43 (notice).
- Réglages établissement et calendrier Shabbat/fêtes ; file de signalements admin ; archivage de l'année.
- Tests : permissions (inter-école, inter-classe, membre parti, groupe verrouillé), créneaux sans fuite, heures calmes, quotas.
- Préalables hors domaine à mener en parallèle : passage d'année admin, suppression RGPD, charte et notice familles.

### V2 — « Réviser ensemble avec l'IA » (environ 6 à 8 semaines)
- Quiz de groupe asynchrone (UC-25), « explique à ton camarade » (UC-28), tuteur IA de groupe avec contexte partagé sans mémoire individuelle (UC-29), banque de questions et cartes mémoire (UC-17).
- **Binômes havrouta** (UC-35) et binômes de régularité (UC-36).
- Séances planifiées et réponses, synchronisation avec le planning et École Directe (UC-20, 21, 22, 24).
- Projets : rôles pédagogiques (UC-11), fichiers de groupe (UC-16), fiche co-écrite (UC-15), suivi de contribution (UC-44), rendu au prof (UC-45), composition assistée (UC-07), groupes inter-classes (UC-04), code d'invitation (UC-03).
- Grand oral et bac/brevet (UC-47 sans enregistrement, UC-48).

### V3 — « Communauté apprenante » (au-delà)
- Mentorat inter-niveaux encadré et bourse d'entraide (UC-05, 32, 33, 34), havrouta avec l'IA questionneuse (UC-37), synthèse de séance (UC-30), notions communes opt-in (UC-31).
- Évaluation par les pairs (UC-46), quiz « salle » en direct (UC-26), défis coopératifs (UC-27), gamification collective (UC-50).
- Clubs, associations, BDE (UC-49), groupe ouvert par un délégué (UC-13), modération IA (UC-41) après AIPD, vue parents (UC-43) quand un rôle parent existera.
- Long terme, sur décision de l'établissement uniquement : messagerie de groupe modérée (UC-39), oral enregistré avec retour IA, groupes d'enseignement administrés (spécialités) pour lever la limite `courses.class_id`.
