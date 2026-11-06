# 04 — Cas d'usage « Professeur » pour IABNE (Yabné Paris)

> Recherche de cas d'usage côté enseignant : gagner du temps, mieux enseigner, garder la main.
> Sources lues : cahier des charges V3, `ajouts_equipe.md`, `docs/*.md`, `server/ai-recipes.mjs`, `server/teacher-tutor.mjs`, `server/practice-agent.mjs`, `server/documents.mjs`, `server/learning.mjs` (stats, signalements), `server/auth.mjs` (cours/affectations/délégations), `server/ecoledirecte.mjs`, `src/TeacherMethod.jsx`. Aucun fichier du dépôt n'a été modifié.

## 0. Ce qui existe déjà côté professeur (constat dans le code)

| Brique | Où | Ce que ça fait vraiment |
| --- | --- | --- |
| Dépôt de documents | `server/documents.mjs` | PDF/DOCX/TXT, **1 fichier par envoi, 10 Mo max**, types `lesson / exercise / exam / correction`, chapitres, brouillon/publié/archivé, versions (métadonnées), remplacement. **Pas d'OCR**, pas de `.doc`, pas de PPTX, pas de liens/vidéos. |
| Méthode du professeur | `server/teacher-tutor.mjs`, `src/TeacherMethod.jsx` | Analyse IA sourcée (`reasoningSteps`, `vocabulary`, `correctionCriteria`, `teachingApproach`) sur 18 fragments publiés (corrigés en priorité), consignes libres ≤ 4 000 caractères, **validation explicite**, invalidation si une source change. Profil **par cours** (clé `course_id`). |
| Atelier IA (recettes) | `server/ai-recipes.mjs` | `lesson_plan` (séance 55 min), `differentiation` (3 variantes soutien/standard/approfondissement), `course_review` (relecture d'un support sans modification auto), `class_remediation` (tendances quiz agrégées ≥ 5 élèves), `sheet`, `quiz`, `method_guide`. |
| Agent de préparation | `server/practice-agent.mjs` | Exercice ou contrôle, 1–8 questions, 5–180 min, barème avec **critères par question** (≤ 6, sommes vérifiées), sujet/corrigé/indices séparés, export PDF, **export en brouillon de classe avec provenance IA**, file asynchrone bornée. |
| Statistiques | `server/learning.mjs` `/api/stats` | Consultations, thèmes fréquents (lexical), notions ratées aux quiz ; **seuil 5 élèves** ; aucune conversation individuelle. |
| Signalements élèves | `server/learning.mjs` `/api/ai/reports` | L'élève peut signaler une réponse/génération ; c'est stocké dans `learning_reports`… **mais aucune route ni écran ne permet au professeur de les lire.** |
| Délégués | `server/auth.mjs` `/api/delegations` | Un élève délégué dépose en brouillon ; le prof publie. |
| École Directe | `server/ecoledirecte.mjs` | **Lecture seule**, côté élève ; aucune route d'écriture (devoirs, notes). Pièces jointes non téléchargées. |
| Cours | `server/auth.mjs` | Un cours = **un seul `teacher_id`** → pas de co-enseignement, pas de remplaçant, pas de transfert. |

Manques transverses observés : pas de banque de questions, pas de grille critériée autonome, pas de correction de copies, pas d'appréciations, pas d'import en masse, pas de vue professeur principal, pas de gestion hébreu/RTL, pas de file de relecture des signalements, pas de programmes officiels.

---

## 1. Catalogue des cas d'usage

Légende : **Existant** = oui / partiel / non (+ fichier). **Priorité** P0 (pilote), P1 (année 1), P2 (année 2), LT (long terme). **Effort** S (≤ 1 sem.), M (2–4 sem.), L (> 1 mois).

### A. Démarrer et alimenter l'outil

#### 1. Import en masse de ses anciens cours
- **Persona / scénario** : Mme Cohen, SVT, 15 ans d'ancienneté, a un dossier de 400 fichiers (Word, PDF, PPTX, scans). Elle refuse de les déposer un par un.
- **Fonctionnalité** : glisser-déposer d'un dossier ou ZIP ; classement automatique proposé (cours/exercice/contrôle/corrigé, chapitre, niveau) via le nom de fichier + contenu ; écran de validation en tableau ; tout arrive **en brouillon** ; détection de doublons (hash SHA-256) et de quasi-doublons (versions 2019/2023).
- **Valeur** : c'est la condition n° 1 pour que l'agent soit « le sien » ; sans corpus, l'IA est vide et le prof conclut que l'outil ne sert à rien.
- **Risques** : documents contenant des noms d'élèves (anciennes copies, listes) → détection de données personnelles avant publication ; contenus d'éditeurs (droit d'auteur, cf. cas 37) ; coût d'extraction ; mauvaise classification silencieuse.
- **Existant** : partiel — dépôt unitaire, types et versions (`server/documents.mjs`), `extraction-worker.mjs`. Pas de lot, pas de ZIP, pas de classification.
- **Priorité** : P0 — **Effort** : M

#### 2. OCR des documents scannés et manuscrits
- **Scénario** : M. Levy (maths) a ses corrigés manuscrits scannés au copieur ; l'extraction texte rend vide.
- **Fonctionnalité** : OCR (y compris formules via un modèle vision), indicateur de qualité d'extraction par document, aperçu « ce que l'IA lit vraiment ».
- **Valeur** : la majorité des anciens contrôles en lycée sont scannés ; les corrigés manuscrits sont la meilleure source de la « méthode du prof ».
- **Risques** : erreurs d'OCR sur formules → l'IA cite une formule fausse « au nom du prof » ; données envoyées à un fournisseur vision.
- **Existant** : non (docs/FEATURES.md : « Pas d'OCR intégré »).
- **Priorité** : P0 — **Effort** : M

#### 3. Formats supplémentaires : PPTX, ODT, .doc, images, Markdown/LaTeX
- **Scénario** : la prof d'histoire fait tout en diaporamas.
- **Fonctionnalité** : extraction PPTX (texte + notes du présentateur), ODT, .doc via conversion, images (OCR), LaTeX pour les maths/physique.
- **Valeur** : élargir le corpus sans travail de conversion.
- **Risques** : mise en page perdue ; poids (limite 10 Mo actuelle).
- **Existant** : non — `documents.mjs` limite à PDF/DOCX/TXT.
- **Priorité** : P0 (PPTX), P1 (le reste) — **Effort** : S à M

#### 4. Ressources multimédia et liens
- **Scénario** : la prof d'anglais veut associer une vidéo BBC et un podcast à un chapitre.
- **Fonctionnalité** : type de document « lien/vidéo » avec titre, description, transcription facultative fournie par le prof (ou sous-titres) indexée ; l'IA peut renvoyer vers « la vidéo vue en classe, minute 3 ».
- **Valeur** : la classe inversée et les langues reposent sur la vidéo.
- **Risques** : l'IA « ne se connecte jamais à Internet » (CDC 4.3) → ne pas aller chercher le contenu, seulement indexer ce que le prof fournit ; liens morts ; YouTube et mineurs (pubs, recommandations) → privilégier liens institutionnels (Lumni, Éduthèque).
- **Existant** : non.
- **Priorité** : P1 — **Effort** : S

#### 5. Nouveau professeur en cours d'année
- **Scénario** : un prof de physique arrive en janvier pour remplacer un départ ; il hérite de 2 classes sans rien savoir de ce qui a été fait.
- **Fonctionnalité** : transfert de cours par l'admin (changement de `teacher_id`) avec choix : reprendre les documents du prédécesseur (si accord) ou repartir à vide ; synthèse « où en est la classe » générée à partir des documents publiés, du cahier de textes et des notions ratées agrégées ; la méthode du prédécesseur **n'est pas** transférée par défaut (elle est personnelle).
- **Valeur** : 2–3 semaines de mise à niveau économisées.
- **Risques** : propriété intellectuelle du prédécesseur ; incohérence de méthode pour les élèves (l'IA explique « à l'ancienne ») → bascule explicite et annonce aux élèves.
- **Existant** : non — un seul `teacher_id`, aucune route de modification d'affectation (cf. `ajouts_equipe.md`).
- **Priorité** : P1 — **Effort** : M

#### 6. Remplacement d'un collègue absent (courte durée)
- **Scénario** : Mme Attal est absente 3 semaines ; le remplaçant doit faire la séance de mardi sur les suites.
- **Fonctionnalité** : rôle « remplaçant » temporaire (dates de début/fin) donnant accès en lecture aux documents publiés et brouillons choisis, à la progression, au résumé des dernières séances et à la méthode validée ; génération d'une « fiche de passation » ; l'agent IA des élèves reste celui de la titulaire ; révocation automatique.
- **Valeur** : continuité pédagogique, argument fort pour la direction.
- **Risques** : accès aux brouillons/évaluations non publiées (fuite de sujet) → sélection explicite ; le remplaçant ne doit pas modifier la méthode validée.
- **Existant** : non (la délégation existe mais seulement pour élèves : `server/auth.mjs` `/api/delegations`).
- **Priorité** : P1 — **Effort** : M

#### 7. Prise en main guidée (onboarding de 20 minutes)
- **Scénario** : un prof se connecte pour la première fois après la réunion de pré-rentrée.
- **Fonctionnalité** : parcours en 5 étapes : déposer 3 documents → poser soi-même 3 questions comme un élève (« mode élève ») → générer une fiche → lancer l'analyse de méthode → publier. Données de démonstration dans un « cours bac à sable » invisible des élèves.
- **Valeur** : la première impression décide de l'adoption.
- **Risques** : bac à sable qui pollue les stats ; coûts IA.
- **Existant** : non.
- **Priorité** : P0 — **Effort** : S

#### 8. « Tester mon agent comme un élève » (prévisualisation)
- **Scénario** : avant de publier son chapitre, M. Benhamou pose les questions typiques de ses élèves pour voir ce que l'IA répondrait, y compris sur des brouillons.
- **Fonctionnalité** : mode « aperçu élève » sur le corpus publié + brouillons sélectionnés, sans enregistrement dans les stats, avec affichage des fragments récupérés et de la méthode appliquée.
- **Valeur** : confiance ; c'est l'outil de contrôle qualité le plus simple.
- **Risques** : faible (ne pas exposer les brouillons aux élèves).
- **Existant** : partiel — le prof peut utiliser le chat du cours (`/api/ai/chat`), mais pas sur brouillons ni avec vue des fragments.
- **Priorité** : P0 — **Effort** : S

### B. Préparer l'enseignement

#### 9. Progression annuelle alignée sur les programmes officiels
- **Scénario** : en août, Mme Sebbag (maths, 2de) veut une progression de 32 semaines respectant le programme, le calendrier scolaire de la zone C et les fêtes juives où l'école est fermée.
- **Fonctionnalité** : référentiel des programmes (BO, attendus, capacités) importé et versionné par l'admin ; proposition de progression semaine par semaine, avec chapitres créés en brouillon ; couverture du programme visualisée (attendus traités / non traités) ; calendrier Yabné (vacances, Souccot, Pessa'h, jours sans cours, examens blancs).
- **Valeur** : gain de plusieurs heures, et vérification de couverture utile pour le bac/brevet.
- **Risques** : le CDC interdit toute source extérieure aux documents du prof → le programme officiel doit être un **document de référence de l'établissement** déposé et cité, pas une connaissance du modèle ; programmes qui changent.
- **Existant** : non (chapitres existent : `/api/chapters`).
- **Priorité** : P1 — **Effort** : L

#### 10. Préparation de séquence (plusieurs séances)
- **Scénario** : séquence de 6 séances sur la Révolution française en 4e.
- **Fonctionnalité** : extension de `lesson_plan` à la séquence : objectifs, séances, évaluation diagnostique/formative/sommative, devoirs entre séances, liens avec les documents.
- **Valeur** : vision cohérente ; aujourd'hui seule une séance de 55 min est générée.
- **Risques** : sur-production de texte non relu.
- **Existant** : partiel — `lesson_plan` dans `server/ai-recipes.mjs`.
- **Priorité** : P1 — **Effort** : S

#### 11. Création de supports à partir de son cours
- **Scénario** : transformer un cours rédigé en diaporama, en trace écrite à trous, en carte mentale, en frise, en fiche élève.
- **Fonctionnalité** : nouvelles recettes « trace écrite à trous », « diaporama (PPTX) », « carte mentale », « fiche activité », exports DOCX/PPTX **modifiables** (pas seulement PDF).
- **Valeur** : le prof retouche toujours ; un PDF figé ne lui sert presque à rien.
- **Risques** : mise en forme ; qualité.
- **Existant** : partiel — fiches et PDF (`server/pdf-layout.mjs`), pas d'export modifiable.
- **Priorité** : P0 (export DOCX), P1 (le reste) — **Effort** : M

#### 12. Adaptation aux élèves à besoins particuliers (PAP/PPS/DYS)
- **Scénario** : 4 élèves de 5e ont un PAP (dyslexie, dyspraxie, TDAH). La prof veut la même évaluation en version adaptée.
- **Fonctionnalité** : recette « adapter un support » avec profils d'aménagement **génériques** (police adaptée type OpenDyslexic/Arial 14, interligne 1,5, consignes découpées, une consigne par ligne, surlignage des mots-clés, réduction de la quantité, QCM au lieu de rédaction, tiers-temps ajusté) ; export séparé ; jamais d'étiquette sur la copie.
- **Valeur** : obligation légale souvent mal tenue faute de temps ; très apprécié.
- **Risques** : **données de santé** (catégorie particulière RGPD) → ne **pas** stocker de diagnostic par élève dans IABNE au départ ; le prof choisit un profil d'aménagement, pas un élève ; ne pas modifier les attendus (PAP ≠ abaissement) ; validation par le référent handicap.
- **Existant** : partiel — `differentiation` (3 niveaux) ; aucun aménagement de forme.
- **Priorité** : P0 — **Effort** : M

#### 13. Différenciation en groupes de besoin
- **Scénario** : après un quiz, la prof veut 3 groupes et une activité par groupe pour demain.
- **Fonctionnalité** : à partir des résultats d'un quiz **donné en classe** (cas 17), proposition de groupes que le prof modifie, puis activités par groupe.
- **Valeur** : différenciation réelle au lieu de théorique.
- **Risques** : étiquetage des élèves ; le code refuse aujourd'hui d'assigner un niveau à un élève nommé (bonne règle) → le regroupement doit rester une décision du prof, données éphémères.
- **Existant** : partiel — `differentiation` sans groupes (`server/ai-recipes.mjs`).
- **Priorité** : P1 — **Effort** : M

#### 14. Classe inversée
- **Scénario** : le prof d'éco publie une vidéo + un texte à étudier à la maison, puis veut savoir en arrivant en cours ce qui a bloqué.
- **Fonctionnalité** : « capsule » = ressource + 3 questions de vérification + bouton « je n'ai pas compris » ; synthèse agrégée le matin du cours (questions posées à l'IA sur la capsule, notions ratées, taux de complétion ≥ 5 élèves) ; plan de séance qui démarre sur ces difficultés.
- **Valeur** : rend la classe inversée praticable.
- **Risques** : surveillance des élèves (« qui n'a pas fait ») → ne montrer d'abord que l'agrégé ; option nominative uniquement pour la complétion, comme un devoir classique, et annoncée.
- **Existant** : partiel — stats agrégées et quiz ; pas de notion de capsule.
- **Priorité** : P2 — **Effort** : M

#### 15. Relecture critique d'un support avant diffusion
- **Scénario** : le prof veut vérifier les ambiguïtés de son énoncé de DS.
- **Fonctionnalité** : existe ; à enrichir : vérification de la lisibilité (niveau de langue vs âge), estimation de la durée de l'épreuve, détection de questions dépendantes (si Q2 dépend de Q1), cohérence barème/durée.
- **Valeur** : moins de questions hors sujet le jour J.
- **Risques** : faux positifs ; l'IA ne doit pas affirmer une erreur scientifique sans preuve (règle déjà dans la recette).
- **Existant** : oui (base) — `course_review` dans `server/ai-recipes.mjs`.
- **Priorité** : P1 (enrichissement) — **Effort** : S

### C. Évaluer

#### 16. Génération d'évaluations officielles (pas seulement d'entraînement)
- **Scénario** : Mme Cohen veut un DS de 1 h sur la génétique, deux sujets A/B pour éviter la triche, avec corrigé et barème.
- **Fonctionnalité** : agent de préparation en mode « évaluation de classe » : sujets A/B équivalents, version adaptée PAP (cas 12), **jamais visible par les élèves ni par l'IA élève avant publication**, verrouillage de l'accès jusqu'à la date du contrôle, puis publication du corrigé après.
- **Valeur** : c'est l'usage qui fait gagner le plus de temps aux profs.
- **Risques** : fuite de sujet (les brouillons sont déjà exclus du corpus élève : bon) ; « sujet généré par IA » perçu comme moins sérieux ; erreurs de corrigé.
- **Existant** : partiel — `server/practice-agent.mjs` (sujet/corrigé séparés, export brouillon), présenté comme « entraînement non officiel ». Pas de variantes A/B ni de publication programmée.
- **Priorité** : P0 — **Effort** : M

#### 17. Grilles critériées et compétences
- **Scénario** : la prof de français évalue une dissertation par compétences (problématique, argumentation, expression).
- **Fonctionnalité** : éditeur de grilles (critères, niveaux, descripteurs, points) réutilisables, rattachées à une évaluation ; génération d'une grille à partir de ses anciennes corrections ; grille compréhensible par l'élève (« version élève ») ; alignement sur le socle commun (collège).
- **Valeur** : transparence pour les élèves et harmonisation entre collègues.
- **Risques** : grilles trop génériques si le corpus est pauvre.
- **Existant** : partiel — critères par question dans `practice-agent.mjs` (lignes ~174) et `correctionCriteria` de la méthode ; pas de grille autonome.
- **Priorité** : P1 — **Effort** : M

#### 18. Banque de questions personnelle et partagée par matière
- **Scénario** : les 3 profs de maths de 3e veulent mutualiser leurs exercices sur les fonctions pour préparer le brevet.
- **Fonctionnalité** : banque d'items (énoncé, corrigé, notion, niveau, difficulté, durée, compétence, auteur, usage précédent « déjà donné en 3eB en 2025 ») ; partage explicite au sein de l'équipe disciplinaire ; génération d'un sujet en piochant dans la banque ; un item généré par IA y entre seulement après validation.
- **Valeur** : capitalisation ; répond à la contradiction du CDC (agent isolé par prof vs partage) par un partage **choisi**.
- **Risques** : isolement par professeur exigé par le CDC (5.2) → partage opt-in, attribution visible ; items qui fuient vers les élèves.
- **Existant** : non.
- **Priorité** : P1 — **Effort** : L

#### 19. Aide à la correction de copies (scan, propositions d'annotations)
- **Scénario** : M. Levy a 32 copies de DS. Il les scanne au copieur (un PDF), l'outil découpe par élève, propose pour chaque question une évaluation selon la grille et des annotations ; il valide/modifie et **saisit lui-même la note**.
- **Fonctionnalité** : import d'un lot de copies, appariement copie↔élève (QR code sur la page de garde générée), lecture manuscrite, proposition critère par critère avec justification citant la copie, file de validation question par question (corriger « en colonne » : la Q1 de toutes les copies, puis la Q2), commentaire final proposé, export annoté.
- **Valeur** : le poste le plus chronophage du métier (5–10 h par paquet).
- **Risques** : majeurs — biais, erreurs de lecture manuscrite, tentation de valider sans lire ; décision individuelle automatisée (RGPD art. 22) → **la note reste du prof**, proposition jamais affichée à l'élève, journal de ce que le prof a modifié ; données de copies d'élèves mineurs envoyées au fournisseur ; écriture manuscrite = données personnelles. Mesurer le taux de désaccord prof/IA et afficher l'incertitude.
- **Existant** : non (`ajouts_equipe.md` : « correction avec note indicative » reste à faire, côté élève).
- **Priorité** : P1 (pilote sur QCM/questions courtes), P2 (rédaction) — **Effort** : L

#### 20. Harmonisation de la correction entre professeurs
- **Scénario** : bac blanc de philo corrigé par 3 profs ; écarts de moyenne de 3 points.
- **Fonctionnalité** : grille commune, double correction d'un échantillon, comparaison statistique anonymisée des notes par correcteur, copies « étalons » commentées, signalement des écarts par critère.
- **Valeur** : équité, très demandé en examens blancs.
- **Risques** : mise en concurrence des collègues → résultats visibles uniquement des correcteurs concernés.
- **Existant** : non.
- **Priorité** : P2 — **Effort** : M

#### 21. Rédaction de feedback individualisé
- **Scénario** : après correction, la prof veut un commentaire constructif par copie (point fort, point à travailler, conseil concret) dans son style.
- **Fonctionnalité** : à partir des points attribués par critère (saisis par le prof), proposition de 2–3 phrases ; banque de commentaires personnels réutilisables ; ton bienveillant paramétrable ; lien vers une fiche de remédiation.
- **Valeur** : feedback de qualité sans y passer 3 min par copie.
- **Risques** : commentaires stéréotypés ; formulation blessante → règles de ton ; ne jamais inventer d'éléments non présents dans la copie.
- **Existant** : non.
- **Priorité** : P1 — **Effort** : S

#### 22. Quiz en classe et évaluation diagnostique rapide
- **Scénario** : début de cours, 5 questions sur téléphone/ordinateur, résultats agrégés en direct.
- **Fonctionnalité** : quiz poussé par le prof à la classe (même questions pour tous), résultats en direct anonymisés, puis remédiation (`class_remediation`) immédiate.
- **Valeur** : diagnostic réel, alimente les stats même quand les élèves n'utilisent pas l'IA chez eux.
- **Risques** : téléphones interdits au collège (loi 2018) → usage sur poste/tablette de l'établissement ou papier + QR.
- **Existant** : partiel — quiz individuels générés par l'élève (`/api/quizzes`), pas de quiz poussé par le prof.
- **Priorité** : P1 — **Effort** : M

### D. Suivre les élèves (avec éthique)

#### 23. Tableau de bord de classe agrégé
- **Scénario** : vendredi, la prof regarde ce qui a été consulté, les questions fréquentes, les notions ratées.
- **Fonctionnalité** : existe ; à améliorer : thèmes regroupés sémantiquement (pas seulement mots fréquents), tendances par chapitre et par semaine, rapprochement avec la progression (« le chapitre 3 n'a jamais été consulté »), export.
- **Valeur** : pilotage pédagogique.
- **Risques** : sur-interprétation (déjà signalé : « pistes, pas diagnostic ») ; seuil 5 à conserver.
- **Existant** : oui (base) — `/api/stats` dans `server/learning.mjs`.
- **Priorité** : P0 (lisibilité), P1 (sémantique) — **Effort** : M

#### 24. Questions fréquentes des élèves → FAQ validée
- **Scénario** : 12 élèves ont demandé à l'IA « quelle différence entre mitose et méiose ». La prof veut écrire une réponse officielle une fois pour toutes.
- **Fonctionnalité** : regroupement des questions fréquentes (agrégé ≥ 5, sans auteur), proposition de réponse sourcée, édition et validation par le prof ; la FAQ validée devient une source prioritaire de l'agent ; publication en page « FAQ du chapitre ».
- **Valeur** : améliore la qualité des réponses de l'IA et la confiance du prof.
- **Risques** : fuite d'une question personnelle (« je suis nul, ma mère va me tuer ») → n'exposer que des formulations reformulées/regroupées, jamais le texte brut s'il contient des données personnelles.
- **Existant** : partiel — `frequentTopics` lexical dans `/api/stats`.
- **Priorité** : P1 — **Effort** : M

#### 25. Alertes de décrochage (éthique)
- **Scénario** : un élève de 1re ne consulte plus rien, rate tous ses quiz depuis 3 semaines.
- **Fonctionnalité** : **pas d'alerte automatique nominative au prof par défaut**. Alternative proposée : (1) signaux agrégés de classe ; (2) l'IA encourage l'élève lui-même et lui propose de prévenir son prof ; (3) éventuellement, alerte nominative limitée au professeur principal/CPE sur des indicateurs **scolaires** explicites et connus des familles (absence de rendu de devoirs), validée par la direction et le DPO, jamais sur le contenu des conversations.
- **Valeur** : prévention réelle si bien cadrée.
- **Risques** : profilage de mineurs, effet Pygmalion, faux positifs, rupture de la confiance (« l'IA me surveille ») qui ferait fuir les élèves du tuteur ; AI Act (systèmes d'évaluation/orientation en éducation = haut risque) ; signaux de détresse (harcèlement, idées suicidaires) dans les conversations → **protocole distinct** de protection de l'enfance (cf. note de sécurité) indépendant du prof de matière.
- **Existant** : non (choix explicite du code : pas d'accès individuel ; CDC « vision long terme : analyse prédictive »).
- **Priorité** : LT (alertes nominatives) ; P0 pour le protocole détresse — **Effort** : M

#### 26. Vue transversale du professeur principal
- **Scénario** : M. Dahan, PP de 2nde 3, veut savoir avant le conseil de classe quelles matières posent problème à la classe.
- **Fonctionnalité** : vue de la classe toutes matières (agrégats uniquement, ≥ 5), charge de travail hebdomadaire réelle (devoirs importés/déclarés par jour → détection de semaines surchargées : 3 contrôles le même jour), calendrier des évaluations partagé entre les profs de la classe.
- **Valeur** : le calendrier commun des contrôles évite les surcharges — gain immédiat pour élèves et parents.
- **Risques** : rôle PP inexistant ; accès aux données d'autres profs → seulement agrégats et dates.
- **Existant** : non (pas de rôle PP ; les devoirs ED sont privés à l'élève).
- **Priorité** : P1 (calendrier des évaluations), P2 (reste) — **Effort** : M

#### 27. Préparation des appréciations de conseil de classe (avec garde-fous)
- **Scénario** : 150 appréciations à écrire en 2 jours fin décembre.
- **Fonctionnalité** : le prof saisit pour chaque élève des éléments factuels (moyenne, tendance, 2–3 mots-clés « participe, irrégulier, progrès en rédaction ») ; l'IA propose une appréciation dans son style et sa longueur (≤ 200 caractères pour le bulletin) ; variations pour éviter le copier-coller ; vérification de ton (pas de jugement sur la personne, pas de comparaison, pas d'info médicale/familiale) ; copier vers École Directe à la main.
- **Valeur** : énorme gain de temps à un moment de pic de charge ; **argument d'adoption n° 1** chez les profs.
- **Risques** : l'appréciation est un acte engageant de l'enseignant (lue par les familles, dossier Parcoursup) → jamais automatique, jamais d'usage des conversations IA de l'élève, aucune donnée tirée du tuteur personnel ; noms d'élèves envoyés au fournisseur → pseudonymiser (« Élève 12 ») avant appel et remplacer après.
- **Existant** : non.
- **Priorité** : P1 (à livrer avant le 1er conseil) — **Effort** : S

#### 28. Préparation du conseil de classe (synthèse de classe pour le PP)
- **Scénario** : le PP prépare l'appréciation générale de la classe et l'ordre du jour.
- **Fonctionnalité** : synthèse à partir des appréciations finalisées des collègues (saisies dans IABNE ou collées) : tendances, points de vigilance, proposition d'appréciation générale.
- **Valeur** : gain de temps PP.
- **Risques** : idem cas 27 ; ne pas produire de recommandations d'orientation automatisées.
- **Existant** : non.
- **Priorité** : P2 — **Effort** : S

### E. Devoirs et communication

#### 29. Publication des devoirs vers École Directe
- **Scénario** : la prof prépare des exercices dans IABNE et voudrait qu'ils apparaissent dans le cahier de textes ED sans double saisie.
- **Fonctionnalité** : à court terme : bouton « copier pour École Directe » (texte formaté + lien IABNE) ; à moyen terme : écriture via l'API **uniquement** si Aplim/École Directe fournit un accès officiel (convention établissement).
- **Valeur** : évite la double saisie, principal frein déclaré.
- **Risques** : l'API utilisée est **communautaire et non officielle** (`docs/ECOLEDIRECTE.md`) ; écrire au nom d'un prof avec une API non officielle = risque contractuel et de sécurité ; le connecteur actuel est en lecture seule et c'est voulu.
- **Existant** : non (lecture seule, côté élève : `server/ecoledirecte.mjs`).
- **Priorité** : P0 (copier-coller), LT (écriture API) — **Effort** : S / L

#### 30. Lien devoir ↔ ressource ↔ tuteur
- **Scénario** : le devoir ED « Ex. 12 p. 84 » ; l'élève ouvre l'aide, mais l'IA n'a pas l'énoncé (manuel).
- **Fonctionnalité** : le prof rattache dans IABNE un devoir à un document publié (énoncé, méthode), et peut définir le niveau d'aide autorisé (indices seulement, pas de solution avant la date de rendu).
- **Valeur** : « l'IA guide, ne fait pas à la place » rendu concret ; le prof contrôle le niveau d'aide.
- **Risques** : énoncés de manuels sous droit d'auteur (cas 37).
- **Existant** : partiel — le tuteur prépare une demande depuis un devoir sans inventer l'énoncé (`docs/USAGES_IA.md`) ; pas de réglage prof.
- **Priorité** : P1 — **Effort** : M

#### 31. Réglage pédagogique de l'agent par le prof
- **Scénario** : pendant la semaine du DM, le prof de maths veut que l'IA ne donne que des indices sur le chapitre 4.
- **Fonctionnalité** : paramètres par cours/chapitre/période : niveau d'aide max, solutions interdites jusqu'à une date, thèmes hors-sujet refusés, ton, longueur ; message d'accueil personnalisé de l'agent.
- **Valeur** : le prof garde la main ; réduit la peur de la triche.
- **Risques** : frustration élève → message clair « ton prof a choisi les indices seulement jusqu'au 12/11 ».
- **Existant** : partiel — consignes libres de méthode (`server/teacher-tutor.mjs`), pas de règles datées.
- **Priorité** : P0 — **Effort** : S

### F. Contrôle qualité de ce que l'IA dit au nom du prof

#### 32. File de relecture des signalements d'élèves
- **Scénario** : un élève signale « l'IA a dit que la dérivée de x² est x ».
- **Fonctionnalité** : écran prof « signalements » : extrait de la réponse incriminée et sources citées (sans le reste de la conversation, sans identité par défaut), actions : corriger la source, ajouter une FAQ, marquer « réponse correcte », remercier l'élève ; statistiques de taux d'erreur.
- **Valeur** : boucle d'amélioration ; prouve au prof qu'il garde le contrôle.
- **Risques** : extraits de conversation privée → l'élève consent explicitement au partage de l'extrait au moment du signalement.
- **Existant** : partiel — **les signalements sont enregistrés (`learning_reports`, `server/learning.mjs` l. 793) mais aucun écran ni route ne les montre au prof**. Lacune facile à combler.
- **Priorité** : P0 — **Effort** : S

#### 33. « Mode surveillance » de son agent (audit par échantillon)
- **Scénario** : la prof veut lire, chaque semaine, 10 réponses de l'IA sur son cours pour vérifier la qualité.
- **Fonctionnalité** : échantillon aléatoire de paires question/réponse **anonymisées et filtrées** (noms, infos personnelles retirées), consenti dans la charte d'usage connue des élèves ; notation 👍/👎 par le prof transformée en jeu d'évaluation ; alerte si l'IA s'abstient trop ou cite mal.
- **Valeur** : confiance mesurable ; matériau pour l'évaluation IA « sur vrais cours » encore à faire.
- **Risques** : contredit la promesse actuelle (« pas d'accès aux conversations individuelles ») → doit être un choix d'établissement, transparent pour les élèves, désactivable ; ne jamais montrer les conversations du tuteur personnel.
- **Existant** : non (choix volontaire).
- **Priorité** : P1 — **Effort** : M

#### 34. Banc d'essai automatique de l'agent (évaluation continue)
- **Scénario** : après chaque nouveau dépôt, vérifier que l'IA répond toujours bien aux 20 questions de référence du prof.
- **Fonctionnalité** : le prof (ou la FAQ) définit des questions-réponses étalons ; exécution périodique ; rapport de régression (abstention, citation, cohérence).
- **Valeur** : qualité garantie quand le corpus ou le modèle change.
- **Risques** : coût IA ; faux sentiment de sécurité.
- **Existant** : non (tests existants = réponses synthétiques, `docs/VALIDATION.md`).
- **Priorité** : P1 — **Effort** : M

#### 35. Traçabilité « dit au nom du prof »
- **Scénario** : un parent conteste une explication donnée par « l'IA de M. X ».
- **Fonctionnalité** : chaque réponse affiche sources + version de méthode validée ; bandeau clair « assistant IA basé sur les documents de M. X, pas M. X lui-même » ; historique des validations de méthode.
- **Valeur** : responsabilité claire, protège le prof.
- **Risques** : faible.
- **Existant** : partiel — citations et validation/invalidation de méthode (`server/teacher-tutor.mjs`).
- **Priorité** : P0 (wording), P1 (historique) — **Effort** : S

#### 36. Validation des contenus générés avant usage élève
- **Scénario** : les fiches générées par les élèves sont « non officielles » ; le prof aimerait valider une fiche de référence par chapitre.
- **Fonctionnalité** : le prof génère, corrige et publie une fiche « validée par le professeur » (badge), que les élèves voient avant les générations libres.
- **Valeur** : qualité perçue, moins de fiches fausses en circulation.
- **Existant** : partiel — export en brouillon avec provenance IA (`practice-agent.mjs`), publication manuelle.
- **Priorité** : P1 — **Effort** : S

### G. Équipe, droits et cadre

#### 37. Droit d'auteur sur les documents
- **Scénario** : un prof dépose des pages scannées du manuel Hachette et des annales payantes.
- **Fonctionnalité** : case obligatoire au dépôt « origine : production personnelle / manuel (référence) / ressource libre (licence) / annale officielle » ; rappel des règles (exception pédagogique, accord CFC : extraits limités, usage en classe) ; documents d'éditeurs consultables mais **non téléchargeables** et exclus des générations longues ; détection des reprises longues (le code détecte déjà certaines reprises textuelles) ; question de la propriété des cours du prof (le prof reste auteur ; licence d'usage à l'établissement définie dans la charte, réversible à son départ).
- **Valeur** : sécurité juridique, rassure les profs qui craignent que l'école « s'approprie » leurs cours.
- **Risques** : contrefaçon ; perte de confiance des profs.
- **Existant** : partiel — détection de reprises longues dans `practice-agent.mjs` ; rien sur l'origine.
- **Priorité** : P0 (champ origine + charte) — **Effort** : S

#### 38. Co-enseignement et équipes disciplinaires
- **Scénario** : deux profs en co-intervention (français + histoire en 3e, ou prof + AESH, ou « Devoirs faits ») ; une équipe de maths partage une progression commune en 2de.
- **Fonctionnalité** : plusieurs enseignants par cours avec rôles (propriétaire, co-enseignant, lecteur) ; espace « équipe disciplinaire » (documents partagés, banque, grilles, progression commune) ; méthode par professeur conservée, l'agent indique de quel prof vient chaque source.
- **Valeur** : travail collectif = adoption collective (un prof convaincu entraîne ses collègues).
- **Risques** : CDC « agent isolé par professeur » → co-enseignement explicite seulement.
- **Existant** : non — un seul `teacher_id` par cours (`server/auth.mjs`).
- **Priorité** : P1 — **Effort** : M

#### 39. Réutilisation d'une année sur l'autre et entre classes
- **Scénario** : en septembre, le prof retrouve ses 2 classes de 1re ; il veut dupliquer son cours de l'an dernier vers la nouvelle classe, et partager un chapitre entre 1reA et 1reB.
- **Fonctionnalité** : « dupliquer le cours » (documents, chapitres, méthode validée, réglages) vers une nouvelle classe/année ; un document publié dans plusieurs classes sans copie.
- **Valeur** : gain évident chaque rentrée.
- **Risques** : stats d'une année mélangées à l'autre.
- **Existant** : non (pas de passage d'année, cf. `ajouts_equipe.md`).
- **Priorité** : P0 (avant la rentrée suivante) — **Effort** : M

#### 40. Restauration d'une version et historique
- **Scénario** : le prof a remplacé son cours par erreur.
- **Fonctionnalité** : restaurer une ancienne version (le fichier est-il conservé ?), comparer deux versions.
- **Existant** : partiel — historique en métadonnées, « restauration non proposée » (`docs/FEATURES.md`).
- **Priorité** : P1 — **Effort** : S

#### 41. Charge de travail et adoption réelle (profs réticents)
- **Scénario** : M. Haddad (lettres, 58 ans) pense que l'IA « tue la réflexion » et refuse d'y mettre ses cours.
- **Fonctionnalité** : (1) usage **à la carte** : utiliser l'Atelier pour soi sans ouvrir d'agent aux élèves ; (2) agent désactivable par cours (« mes élèves voient mes documents, sans IA ») ; (3) indicateur de temps gagné déclaratif ; (4) mode « IA socratique seulement » ; (5) transparence totale sur ce que l'IA voit.
- **Valeur** : l'adoption ne peut pas être forcée ; un outil qui respecte le refus est mieux adopté.
- **Risques** : élèves inégaux entre matières ; pression de la direction.
- **Existant** : non (l'agent est actif dès qu'il y a des documents publiés).
- **Priorité** : P0 — **Effort** : S

#### 42. Formation continue et communauté interne
- **Scénario** : séances de 30 min « IABNE du jeudi » ; partage de bonnes recettes entre collègues.
- **Fonctionnalité** : bibliothèque de « recettes » de prompts partagées entre profs (ex. « exercice type bac SES »), tutoriels vidéo de 2 min intégrés, référent IA dans l'établissement, centre d'aide contextuel.
- **Valeur** : la diffusion entre pairs est le premier moteur d'adoption.
- **Existant** : non (les recettes sont codées en dur dans `ai-recipes.mjs`).
- **Priorité** : P1 — **Effort** : S

#### 43. Recettes personnalisées par le professeur
- **Scénario** : la prof d'anglais veut une recette « dialogue à compléter niveau A2 » qu'elle réutilise chaque semaine.
- **Fonctionnalité** : créer ses propres recettes (mission, format, contraintes), les partager avec l'équipe ; garde-fous serveur conservés (sources, citations).
- **Valeur** : l'outil s'adapte à chaque discipline au lieu de l'inverse.
- **Risques** : injection de consignes qui contournent les règles → les règles système restent prioritaires.
- **Existant** : non (8 recettes fixes).
- **Priorité** : P1 — **Effort** : M

### H. Spécificités Yabné : études juives et hébreu

#### 44. Support hébreu et textes bilingues (RTL, nikoud)
- **Scénario** : le prof de Kodech dépose un dossier de Michna avec commentaire de Rachi en hébreu et traduction française ; le prof d'hébreu moderne dépose des textes avec voyelles.
- **Fonctionnalité** : extraction correcte de l'hébreu (PDF RTL souvent cassés), affichage RTL et mixte, conservation des voyelles et cantillation, recherche avec/sans nikoud, export PDF avec police hébraïque, OCR hébreu.
- **Valeur** : sans cela, toute une partie de l'enseignement de Yabné est exclue.
- **Risques** : PDF hébreu à l'ordre des caractères inversé ; qualité des modèles sur l'araméen.
- **Existant** : non (aucune gestion RTL trouvée dans `src/`).
- **Priorité** : P0 (extraction + affichage), P1 (OCR) — **Effort** : M

#### 45. Agent d'études juives respectueux de la tradition de l'école
- **Scénario** : un élève demande à l'IA « pourquoi Rachi explique ainsi ? » ; le rav veut que l'IA reste dans les commentaires étudiés en classe et la ligne de l'établissement, et renvoie aux enseignants pour les questions de halakha pratique.
- **Fonctionnalité** : réglage « matière sensible » : réponses strictement limitées aux sources déposées, refus poli + renvoi au rav pour toute question de pratique (« puis-je… ? »), affichage systématique de la source (verset, page de Guemara) ; travail en havrouta guidé (questions, pas réponses) ; méthode du prof analysée (structure d'un dvar Torah, analyse d'un commentaire).
- **Valeur** : rend l'outil légitime aux yeux de l'équipe de Kodech, souvent la plus réticente.
- **Risques** : une réponse halakhique erronée « au nom du rav » serait très grave ; diversité des opinions ; sensibilité communautaire.
- **Existant** : partiel — l'agent est déjà borné au corpus avec abstention et citations (`server/learning.mjs`) ; pas de règle « renvoi au rav ».
- **Priorité** : P1 — **Effort** : S

#### 46. Calendrier hébraïque et organisation
- **Scénario** : la progression et les dates de contrôle doivent tenir compte des fêtes (Roch Hachana, Kippour, Souccot, Pessa'h, Chavouot), des vendredis courts en hiver et du Chabbat.
- **Fonctionnalité** : calendrier établissement avec jours non travaillés et horaires réduits ; utilisé par la progression (cas 9), le calendrier des évaluations (cas 26) et le planificateur élève (pas de session de révision le Chabbat/fête si l'élève le souhaite).
- **Valeur** : crédibilité locale ; le planificateur actuel proposerait des sessions le samedi.
- **Existant** : non.
- **Priorité** : P1 — **Effort** : S

#### 47. Double cursus : vue de la charge globale
- **Scénario** : les élèves de Yabné cumulent programme national + études juives ; le PP veut équilibrer la semaine.
- **Fonctionnalité** : intégré au cas 26 : devoirs et évaluations des deux cursus dans un même calendrier de classe.
- **Existant** : non. — **Priorité** : P2 — **Effort** : S (si 26 fait)

---

## 2. Tableau récapitulatif

| # | Cas | Existant | Prio | Effort |
| --- | --- | --- | --- | --- |
| 1 | Import en masse | partiel | P0 | M |
| 2 | OCR scans/manuscrits | non | P0 | M |
| 3 | PPTX/ODT/LaTeX | non | P0/P1 | S–M |
| 4 | Multimédia/liens | non | P1 | S |
| 5 | Nouveau prof en cours d'année | non | P1 | M |
| 6 | Remplaçant temporaire | non | P1 | M |
| 7 | Onboarding guidé | non | P0 | S |
| 8 | Tester son agent comme un élève | partiel | P0 | S |
| 9 | Progression annuelle / programmes | non | P1 | L |
| 10 | Séquence multi-séances | partiel | P1 | S |
| 11 | Supports + export DOCX/PPTX | partiel | P0/P1 | M |
| 12 | Adaptation PAP/PPS/DYS | partiel | P0 | M |
| 13 | Groupes de besoin | partiel | P1 | M |
| 14 | Classe inversée | partiel | P2 | M |
| 15 | Relecture de support enrichie | oui | P1 | S |
| 16 | Évaluations officielles A/B | partiel | P0 | M |
| 17 | Grilles critériées | partiel | P1 | M |
| 18 | Banque de questions partagée | non | P1 | L |
| 19 | Aide à la correction de copies | non | P1/P2 | L |
| 20 | Harmonisation entre correcteurs | non | P2 | M |
| 21 | Feedback individualisé | non | P1 | S |
| 22 | Quiz en classe | partiel | P1 | M |
| 23 | Tableau de bord agrégé | oui | P0/P1 | M |
| 24 | FAQ validée | partiel | P1 | M |
| 25 | Décrochage (éthique) / protocole détresse | non | LT / P0 | M |
| 26 | Vue PP + calendrier des évaluations | non | P1/P2 | M |
| 27 | Appréciations conseil de classe | non | P1 | S |
| 28 | Synthèse conseil pour PP | non | P2 | S |
| 29 | Devoirs vers École Directe | non | P0 (copie) / LT | S/L |
| 30 | Devoir ↔ ressource ↔ niveau d'aide | partiel | P1 | M |
| 31 | Réglages datés de l'agent | partiel | P0 | S |
| 32 | File des signalements élèves | partiel | P0 | S |
| 33 | Mode surveillance (échantillon) | non | P1 | M |
| 34 | Banc d'essai de l'agent | non | P1 | M |
| 35 | Traçabilité « au nom du prof » | partiel | P0/P1 | S |
| 36 | Fiche de référence validée | partiel | P1 | S |
| 37 | Droit d'auteur / origine | partiel | P0 | S |
| 38 | Co-enseignement / équipes | non | P1 | M |
| 39 | Duplication de cours / année | non | P0 | M |
| 40 | Restauration de version | partiel | P1 | S |
| 41 | Adoption à la carte / IA désactivable | non | P0 | S |
| 42 | Formation / communauté | non | P1 | S |
| 43 | Recettes personnalisées | non | P1 | M |
| 44 | Hébreu / RTL | non | P0/P1 | M |
| 45 | Agent études juives (renvoi au rav) | partiel | P1 | S |
| 46 | Calendrier hébraïque | non | P1 | S |
| 47 | Double cursus | non | P2 | S |

---

## 3. Top 10 (rapport valeur / effort pour les professeurs)

1. **Import en masse + OCR + PPTX (1, 2, 3)** — sans corpus, rien ne marche ; c'est le premier mur rencontré.
2. **File des signalements élèves (32)** — données déjà collectées, aucun écran : effort S, gain de confiance immédiat.
3. **Tester son agent comme un élève (8)** — le prof voit en 2 minutes ce que l'IA dira en son nom.
4. **Évaluations prêtes à l'emploi : sujets A/B, version PAP, export DOCX modifiable (16, 12, 11)** — étendre l'agent existant ; c'est là que les heures sont gagnées.
5. **Réglages de l'agent par le prof : indices seulement, solutions après date, IA désactivable (31, 41)** — répond à la peur de la triche et respecte les réticents.
6. **Appréciations de conseil de classe avec pseudonymisation (27)** — effort S, énorme valeur perçue au premier trimestre.
7. **Droit d'auteur / origine des documents + charte de propriété des cours (37)** — lève le principal frein juridique et symbolique.
8. **Hébreu/RTL + règles pour les études juives (44, 45)** — indispensable pour que toute l'équipe Yabné soit concernée.
9. **Co-enseignement, remplaçant, duplication de cours (38, 6, 39)** — modèle de données à corriger tôt (un seul `teacher_id`), sinon dette coûteuse.
10. **Grilles critériées + feedback individualisé, puis correction assistée de copies en pilote sur questions courtes (17, 21, 19)** — le plus gros gain de temps à terme, à introduire prudemment.

Hors top 10 mais **P0 non négociable** : protocole de détresse/protection de l'enfance (25) indépendant des stats, et le maintien du seuil d'agrégation à 5.

---

## 4. Stratégie d'adoption par les professeurs

### Principes
- **Le prof garde la main, visiblement** : rien n'est publié, noté ou envoyé sans lui ; chaque écran le dit. L'IA est présentée comme « assistant de préparation », jamais comme évaluateur.
- **Gagner du temps avant de demander du temps** : le premier usage doit économiser une heure, pas en coûter une.
- **Respecter le refus** : utilisation à la carte, agent élève désactivable par cours, aucune obligation hiérarchique en année 1.
- **Par les pairs** : 3–5 profs pilotes volontaires (au moins un en maths, un en lettres, un en Kodech), qui montrent leurs résultats aux collègues.

### Semaine 1 : ce qui convaincra
| Jour | Action | Effet recherché |
| --- | --- | --- |
| Pré-rentrée (1 h) | Démo en direct avec **les vrais cours d'un collègue volontaire** : dépôt → question élève → réponse citée → génération d'un DS + corrigé + version PAP en 5 min. | « Ça marche avec mes documents, et ça cite mes documents. » |
| J1 | Session « apporte ta clé USB » : import en masse assisté par le référent ; tout reste en brouillon. | Le corpus existe ; aucune exposition aux élèves sans décision du prof. |
| J2 | Chaque prof teste son agent en mode aperçu élève et corrige 2–3 sources. | Confiance, sentiment de contrôle. |
| J3 | Génération d'un premier support réellement utilisé en classe (exercice différencié ou évaluation diagnostique), export **DOCX** retouché. | Premier gain de temps concret. |
| J4 | Publication du premier chapitre aux élèves avec réglage « indices seulement ». | Pas de peur de la triche. |
| J5 | Retour : stats agrégées de la semaine + signalements + 15 min d'échange. | Boucle de retour visible ; ajustements rapides. |

### Ce qui fait durer l'adoption
- Calendrier de valeur aligné sur les pics de charge : **évaluations** (octobre), **appréciations** (décembre, mars, juin), **bac/brevet blancs** (harmonisation), **rentrée suivante** (duplication de cours).
- Mesure honnête : temps gagné déclaré, nombre de supports réutilisés, taux de signalements corrigés — pas le nombre de clics.
- Référent IA (un prof déchargé quelques heures) + permanence hebdomadaire de 30 min.
- Charte co-écrite avec les profs : propriété de leurs cours, ce que l'IA voit et ne voit pas, ce que la direction peut ou ne peut pas consulter (jamais d'évaluation des profs par leurs stats IA).
- Pour les réticents : leur proposer seulement l'Atelier (préparation personnelle, invisible des élèves) et les appréciations ; ne pas exiger de publier un agent.

### Pièges à éviter
- Lancer sans corpus (agent qui s'abstient tout le temps = abandon immédiat).
- Afficher des statistiques qui ressemblent à une surveillance des élèves ou à une évaluation des professeurs.
- Une erreur grossière en études juives ou en maths diffusée sans canal de correction : d'où la file de signalements en P0.
- Promettre la correction automatique : la présenter comme une aide à la relecture, en pilote.
