# 05 — Direction, vie scolaire, parents et spécificités de Yabné

Recherche de cas d'usage pour IABNE (Yabné Paris). Domaine : direction, pilotage, vie scolaire, professeur principal, familles, calendrier, orientation et spécificités de l'établissement.

Sources lues : cahier des charges V3, ajouts de l'équipe, `README.md`, `docs/*.md`, et un survol du schéma (`server/db.mjs`, `server/learning.mjs`). Aucun fichier du dépôt n'a été modifié.

Convention : **[à confirmer]** = hypothèse sur l'organisation de Yabné, à valider avec la direction. **[à vérifier juridiquement]** = point de droit à faire valider par le DPO ou un conseil. Rien ici ne constitue un avis juridique.

---

## 0. Constat de départ (état du code au 6 novembre 2026)

| Élément | État constaté |
| --- | --- |
| Rôles | `users.role` ∈ `admin`, `teacher`, `student`. Aucun rôle direction, CPE, professeur principal, parent, DPO, ni coordinateur des études juives. |
| Multi-établissement | Une table `schools` et un cloisonnement par `school_id`. Aucune notion de **site** à l'intérieur d'un établissement. |
| Statistiques | `GET /api/stats` : agrégats par cours pour le professeur, seuil de 5 participants. Pas de vue direction. |
| Coûts IA | `learning_usage` compte les **demandes** (20/h par utilisateur, `AI_SCHOOL_HOURLY_LIMIT` par établissement, 200/h par défaut). Aucun suivi des jetons, du coût, ni des fonctions utilisées. |
| Signalements | `learning_reports` : un élève peut signaler une réponse. Pas de file de revue côté personnel. |
| Calendrier | Le planificateur fonctionne par créneaux de 15 min, en heure locale sans fuseau. Pas de calendrier d'établissement, de vacances, de fêtes ni de Shabbat. |
| École Directe | Connecteur expérimental, lecture seule, **comptes élèves uniquement** (famille et professeur refusés). Emploi du temps, devoirs, contenus de séance. Pas de notes, absences ni messagerie. |
| Hébreu / RTL | Aucune gestion de la direction d'écriture (aucune occurrence `rtl`). La recherche est lexicale, sans normalisation propre à l'hébreu. Polices PDF DejaVu Sans : elles couvrent l'alphabet hébreu de base, mais le rendu des voyelles (nikoud) et du bidirectionnel dans les PDF reste **à vérifier**. |
| Parents | `OPERATIONS.md` : « Aucun portail parent n'est exigé par défaut ». |
| Notifications | Aucun envoi de mails ni de notifications push. |

---

## 1. Principes transversaux proposés (à faire valider par la direction)

Ce ne sont pas des fonctionnalités. Ce sont des règles qui conditionnent tous les cas ci-dessous.

1. **Le tuteur est un espace d'apprentissage, pas un dossier.** Conversations, erreurs, tentatives et mémoire du tuteur ne servent jamais à évaluer, noter, orienter ni sanctionner. Ils n'apparaissent ni en conseil de classe ni auprès des familles. Sans cette règle, les élèves cesseront d'oser se tromper.
2. **Agréger avant de montrer.** Toute vue destinée au personnel (hors professeur sur son propre cours, déjà encadré) est agrégée, avec le seuil de 5 déjà présent dans le code. Les exceptions nominatives sont rares, justifiées, journalisées et connues des élèves.
3. **Pas de doublon d'École Directe.** Notes, absences, retards, sanctions, bulletins, messagerie officielle et carnet de correspondance restent dans École Directe (ou dans l'outil officiel de l'établissement). IABNE ajoute la pédagogie et y renvoie par des liens.
4. **Pas d'inférence émotionnelle.** L'AI Act interdit les systèmes de reconnaissance des émotions dans les établissements d'enseignement (art. 5(1)(f), applicable depuis février 2025) **[à vérifier juridiquement pour la qualification exacte]**. IABNE ne doit donc ni « détecter le stress » ni analyser le sentiment des messages des élèves.
5. **Santé et psychologie hors périmètre.** L'infirmerie, le psychologue et les dossiers médicaux ne sont pas dans IABNE. Ce sont des données sensibles (RGPD art. 9) et elles relèvent d'un secret professionnel propre.
6. **Données religieuses : minimiser.** La pratique religieuse individuelle (présence aux offices, niveau d'observance, alimentation) est une donnée sensible au sens de l'art. 9. IABNE ne la collecte pas. Les matières de kodesh sont traitées comme des matières scolaires, sans plus.
7. **Sécurité renforcée.** Une fuite de la liste des élèves révélerait l'appartenance probable de mineurs à une communauté religieuse, dans un contexte de sécurité sensible pour les établissements juifs. Il faut viser la minimisation : pas d'annuaire, pas de photos, pas d'adresses, export restreint.
8. **Respect de Shabbat et des fêtes par défaut.** Le système ne planifie rien et n'envoie rien pendant ces périodes. Les paramètres exacts relèvent de l'établissement.
9. **Le professeur et la direction gardent la main.** Rien n'est publié, noté ni signalé automatiquement (c'est déjà le cas pour les contenus).

---

## 2. Cas d'usage

Format de chaque cas : persona et scénario, fonctionnalité, valeur, risques, puis **Existant / Priorité / Effort**.
Priorités : P0 = avant les données réelles ou le pilote. P1 = premier déploiement. P2 = après adoption. LT = long terme.
Effort : S < 1 semaine, M = 1 à 3 semaines, L > 3 semaines (ordre de grandeur pour un développeur sur ce code).

### A. Gouvernance, rôles et confiance

#### DIR-01 · Rôles à périmètre (direction, site, CPE, PP, coordinateur kodesh, DPO)
- **Persona / scénario** : la directrice du lycée veut voir les indicateurs de son site, mais pas ceux de l'école primaire. La CPE du collège doit voir les classes de 6e à 3e. Le responsable des études juives coordonne les professeurs de kodesh de tous les niveaux.
- **Fonctionnalité** : un modèle de rôles combinant (rôle × périmètre). Rôles : `direction` (chef d'établissement, adjoint, directeur de site), `cpe`, `professeur_principal` (attribut d'une affectation, pas un rôle séparé), `coordinateur` (par discipline ou pour le pôle kodesh), `dpo` (lecture du registre, des demandes et des journaux, sans contenu pédagogique), `parent` plus tard. Périmètres : établissement, site, niveau, classe. Plusieurs rôles possibles pour une même personne (un professeur peut aussi être PP).
- **Valeur** : c'est la condition de tous les autres cas. Cela répond aussi à la priorité de l'utilisateur, « toute l'administration ».
- **Risques** : l'escalade de privilèges, et un rôle `admin` technique qui verrait tout. Il faut séparer l'admin technique (comptes) de la direction pédagogique (indicateurs).
- **Existant** : non (3 rôles fixes, contrainte `CHECK` en base) · **Priorité** : P0 · **Effort** : M

#### DIR-02 · Journal d'audit des accès du personnel
- **Persona / scénario** : un parent demande qui a consulté les données de son enfant. Le DPO doit pouvoir répondre.
- **Fonctionnalité** : un journal immuable (qui, quand, quelle ressource, quel motif) pour les accès du personnel aux vues nominatives, aux exports, aux réinitialisations, aux changements de rôle et aux connexions administratives. Une vue est réservée au DPO et à la direction. La durée de conservation doit être définie (par exemple 6 à 12 mois **[à vérifier juridiquement]**).
- **Valeur** : responsabilisation (accountability RGPD), dissuasion des consultations abusives, réponse aux demandes d'accès.
- **Risques** : le journal est lui-même une donnée personnelle. Son accès doit rester restreint.
- **Existant** : non · **Priorité** : P0 · **Effort** : M

#### DIR-03 · Charte d'usage, mentions d'information et page de transparence
- **Persona / scénario** : à la rentrée, élèves, parents et professeurs reçoivent une information claire. Un élève de 4e veut savoir « qui voit mes questions à l'IA ».
- **Fonctionnalité** : une page « Qui voit quoi » générée à partir des permissions réelles, par rôle. Une charte acceptée à la première connexion (élève, professeur). Une notice pour les familles, en langage adapté à l'âge. La liste des sous-traitants (hébergeur, fournisseur IA) et leurs lieux de traitement. Les principes du §1 sont rendus publics.
- **Valeur** : la confiance. C'est aussi une obligation d'information (RGPD art. 12 à 14, et transparence de l'AI Act pour une IA qui dialogue avec des personnes).
- **Risques** : une page qui affirme plus que ce que le code garantit. Il faut la générer depuis les règles et non la rédiger à la main.
- **Existant** : partiel (documentation technique honnête, rien côté utilisateur) · **Priorité** : P0 · **Effort** : S

#### DIR-04 · Paramètres d'établissement
- **Persona / scénario** : la direction veut couper le générateur de contrôles en Terminale pendant le bac blanc, réserver le tuteur au collège et au lycée, et fixer la marge avant Shabbat.
- **Fonctionnalité** : un écran de paramètres. Fonctions activées par site ou niveau, seuil d'agrégation (5 au minimum, non abaissable), quotas IA, fuseau `Europe/Paris`, coordonnées pour le calcul des horaires, marges Shabbat et fêtes, textes de charte, contacts d'aide (CPE, référent).
- **Valeur** : l'outil s'adapte sans redéploiement. Les décisions de la direction deviennent explicites.
- **Risques** : des paramètres qui affaiblissent la confidentialité. Il faut des planchers techniques non modifiables.
- **Existant** : non (variables d'environnement uniquement) · **Priorité** : P1 · **Effort** : M

#### DIR-05 · Sécurité renforcée et minimisation des données d'identité
- **Persona / scénario** : la direction s'inquiète : « Si on nous vole la base, que voit l'attaquant ? »
- **Fonctionnalité** : ne stocker que le nécessaire (nom d'usage, classe, identifiant). Pas d'adresse, de téléphone, de photo ni de date de naissance précise sauf besoin. Double authentification obligatoire pour le personnel. Exports restreints et journalisés. Chiffrement des sauvegardes. Alerte sur les connexions inhabituelles. Hébergement et fournisseur IA validés (zone UE). Procédure de violation de données (notification CNIL sous 72 h).
- **Valeur** : réduit l'impact d'un incident, dans un contexte où l'appartenance religieuse de mineurs pourrait être déduite.
- **Risques** : la friction. La double authentification pour les élèves peut se discuter ; pour le personnel, elle est indispensable.
- **Existant** : partiel (sessions sécurisées, jetons ED chiffrés, scripts de sauvegarde) · **Priorité** : P0 · **Effort** : M

#### DIR-06 · Exercice des droits RGPD par les familles et les élèves
- **Persona / scénario** : un père demande une copie des données de son fils de 5e. Une élève de Terminale qui quitte l'établissement demande l'effacement.
- **Fonctionnalité** : un registre des demandes (accès, rectification, effacement, opposition, limitation) avec échéance d'un mois. Un export lisible des données d'un élève (profil, mémoire du tuteur, générations, planning). Une suppression complète en cascade. La vérification de l'identité et de la qualité de représentant légal se fait hors outil, par le secrétariat.
- **Valeur** : c'est une obligation légale. La documentation indique que la suppression administrative complète n'existe pas encore.
- **Risques** : un export remis à un tiers non autorisé (parent privé d'autorité parentale, par exemple). La vérification doit être humaine.
- **Existant** : partiel (l'élève peut effacer sa mémoire ; pas de suppression complète ni d'export) · **Priorité** : P0 · **Effort** : M

### B. Pilotage pédagogique par la direction

#### DIR-07 · Tableau de bord d'adoption (agrégé, sans classement nominatif)
- **Persona / scénario** : en conseil pédagogique de décembre, le chef d'établissement veut savoir si l'outil est utilisé et où il ne l'est pas, pour décider de former, d'ajuster ou d'arrêter.
- **Fonctionnalité** : par site, niveau et matière : nombre de cours ayant au moins un document publié, élèves actifs par semaine (taux), demandes IA par semaine, part des fonctions utilisées (tuteur, quiz, fiches, planning). Tendances sur la période. Une synthèse mensuelle non nominative en PDF.
- **Valeur** : décider sur des faits, mesurer le pilote (phase 4), justifier le coût.
- **Risques** : **surveillance des enseignants**. Un indicateur « professeur X a publié 0 document » devient une évaluation individuelle. Recommandations : pas de classement nominatif des professeurs, matière avec un seul professeur masquée ou fusionnée, information préalable des personnels, consultation des instances représentatives s'il en existe (Code du travail L1222-4 et L2312-38 sur les moyens de contrôle) **[à vérifier juridiquement, le statut des maîtres contractuels du privé sous contrat étant particulier]**.
- **Existant** : partiel (stats par cours pour le professeur seulement) · **Priorité** : P1 · **Effort** : M

#### DIR-08 · Suivi des coûts IA et budget
- **Persona / scénario** : la gestionnaire doit prévoir le budget annuel. En période de bac blanc, les appels explosent et elle veut un plafond.
- **Fonctionnalité** : enregistrer pour chaque appel le modèle, les jetons d'entrée et de sortie, la fonction (tuteur, quiz, fiche, agent sujets, atelier), le niveau et le site, mais pas l'élève dans la vue. Coût estimé à partir d'une grille de prix paramétrable. Budget mensuel avec alerte à 80 % et plafond doux (dégradation, par exemple vers un modèle moins cher, ou file d'attente). Projection de fin de mois. Coût par élève actif.
- **Valeur** : maîtrise financière. Permet de comparer les fournisseurs et de choisir un modèle par fonction.
- **Risques** : un coût affiché par élève inciterait à « rationner » les élèves en difficulté. Il faut agréger, et assurer un plafond par utilisateur qui reste équitable.
- **Existant** : partiel (compteur de demandes et quotas horaires, sans jetons ni coût) · **Priorité** : P0 (avant toute ouverture large) · **Effort** : M

#### DIR-09 · Couverture des contenus et lacunes détectées par les abstentions de l'IA
- **Persona / scénario** : le coordinateur de mathématiques découvre que 40 % des questions de 1re sur les suites reçoivent « je ne trouve pas cela dans le cours ». Il manque un document.
- **Fonctionnalité** : une carte par niveau et matière des chapitres avec ou sans documents publiés, du taux d'abstention de l'IA par chapitre et des thèmes de questions sans source (agrégés, seuil de 5). Le professeur concerné est notifié en premier, avant la direction.
- **Valeur** : améliore le corpus, donc la qualité des réponses. C'est un indicateur utile, pas une note des professeurs.
- **Risques** : être vécu comme un contrôle du travail du professeur. La formulation doit porter sur les contenus et non sur les personnes, avec une diffusion d'abord au professeur.
- **Existant** : non (l'abstention existe, pas son agrégation) · **Priorité** : P1 · **Effort** : M

#### DIR-10 · Notions difficiles inter-classes pour la coordination disciplinaire
- **Persona / scénario** : en réunion d'équipe d'histoire, on constate que les trois classes de 3e échouent sur la même notion dans les quiz. L'équipe organise une séance de remédiation commune.
- **Fonctionnalité** : agrégation des notions à revoir (déjà calculées par cours) au niveau du niveau scolaire et de la matière, visible par les professeurs de la matière et le coordinateur. Seuil de 5 par classe et par notion.
- **Valeur** : harmonisation, remédiation collective. Dans l'esprit des « indicateurs pédagogiques globaux » de la vision long terme.
- **Risques** : la comparaison entre classes, donc entre professeurs. Présenter un total par niveau et non classe par classe, sauf pour le professeur sur ses propres classes.
- **Existant** : partiel (notions à revoir par cours, remédiation collective) · **Priorité** : P1 · **Effort** : S à M

#### DIR-11 · Revue des signalements et qualité des réponses IA
- **Persona / scénario** : une élève signale qu'une réponse sur la Guemara attribue un avis à la mauvaise autorité. Personne ne le voit aujourd'hui.
- **Fonctionnalité** : une file de revue des signalements, routée vers le professeur du cours, puis vers un référent IA désigné par la direction. Le professeur voit la question, la réponse et les sources du signalement : c'est une consultation consentie par le geste de signaler, à préciser dans la charte. Statut et suites données. Indicateur agrégé du taux de signalement par matière. Échantillonnage d'évaluation qualité avant et pendant le pilote.
- **Valeur** : boucle d'amélioration et preuve de vigilance (attendue pour un déploiement IA auprès de mineurs).
- **Risques** : le signalement donne accès à une conversation privée. L'élève doit le savoir au moment de signaler, et voir l'option « signaler sans montrer ma question ».
- **Existant** : partiel (table `learning_reports`, pas d'interface de revue) · **Priorité** : P0 · **Effort** : S à M

### C. Analyse prédictive et repérage des difficultés

#### DIR-12 · Auto-diagnostic « Où j'en suis » visible par l'élève seul
- **Persona / scénario** : un élève de 2nde voit, avant le conseil, les notions qu'il maîtrise mal d'après ses quiz, et un plan d'action.
- **Fonctionnalité** : une synthèse privée à partir des quiz, des erreurs confirmées et du temps de révision. Suggestions de révision. Bouton « partager avec mon PP » (opt-in, voir DIR-25).
- **Valeur** : c'est l'élève qui agit, sans surveillance. C'est l'alternative éthique à la prédiction imposée.
- **Risques** : faible. Message encourageant, sans étiquette du type « à risque ».
- **Existant** : partiel (tuteur, profil, notions à revoir) · **Priorité** : P1 · **Effort** : S à M

#### DIR-13 · Signaux explicables définis par l'équipe (pas de score)
- **Persona / scénario** : le PP de 3e veut être prévenu si un élève n'a plus ouvert son planning depuis 3 semaines alors que le brevet blanc approche.
- **Fonctionnalité** : des règles simples, lisibles et paramétrées par l'équipe, par exemple « aucune connexion depuis N jours » ou « devoirs importés en retard ». **Jamais** de contenu des conversations. La règle déclenchée est affichée telle quelle (« aucune connexion depuis 21 jours »). L'élève est informé que ces règles existent. L'équipe peut ignorer le signal. Désactivé par défaut.
- **Valeur** : repérer le décrochage de l'outil, sans boîte noire.
- **Risques** : glissement vers la surveillance. Une absence d'usage d'un outil facultatif n'est pas un indicateur scolaire. À limiter à l'accompagnement, jamais au disciplinaire. Droit d'opposition (RGPD art. 21) si la base légale est l'intérêt public ou légitime **[à vérifier juridiquement]**.
- **Existant** : non · **Priorité** : P2 · **Effort** : M

#### DIR-14 · Analyse prédictive des résultats (vision long terme du cahier)
- **Persona / scénario** : la direction voudrait « identifier les élèves en difficulté avant les examens ».
- **Fonctionnalité** : un modèle estimant un risque d'échec par élève. **Recommandation : ne pas le faire tant que ces conditions ne sont pas réunies.**
  1. Une AIPD (analyse d'impact). Elle est très probablement obligatoire : données de mineurs, profilage, technologie innovante (liste CNIL).
  2. La qualification AI Act : un système qui évalue les acquis ou oriente l'apprentissage figure dans les usages à haut risque de l'annexe III, point 3. Les obligations du déployeur s'appliquent (contrôle humain, journalisation, information). Le calendrier d'application de 2026-2027 est **[à vérifier juridiquement]**, des reports ayant été discutés.
  3. Pas de décision automatisée (RGPD art. 22). Un humain décide. Le score n'entre jamais dans le dossier.
  4. Données pertinentes : IABNE n'a pas les notes (elles sont dans École Directe). Prédire à partir de l'usage du tuteur violerait le principe n°1.
  5. Tests de biais : kodesh et hol, élèves avec aménagements, filles et garçons, sites, nouveaux arrivants.
  6. Transparence (facteurs expliqués), droit d'opposition, revue annuelle.
- **Valeur** : potentielle mais incertaine. Les équipes repèrent déjà la plupart des difficultés en conseil.
- **Risques** : effet d'étiquette (prophétie autoréalisatrice), discrimination, perte de confiance, contentieux.
- **Existant** : non · **Priorité** : LT, sous conditions · **Effort** : L

### D. Vie scolaire, CPE et bien-être

#### DIR-15 · Liens vers École Directe plutôt que doublons
- **Persona / scénario** : la CPE ne veut pas d'un deuxième logiciel d'absences. L'élève veut retrouver ses notes depuis IABNE.
- **Fonctionnalité** : des liens profonds et explicites (« Voir mes absences dans École Directe »). Une décision documentée sur ce qu'IABNE ne fera pas (absences, retards, sanctions, bulletins, messagerie officielle).
- **Valeur** : évite la double saisie et les incohérences. Clarifie le positionnement : IABNE est le complément pédagogique.
- **Risques** : aucun, si c'est explicite.
- **Existant** : non · **Priorité** : P0 (décision) · **Effort** : S

#### DIR-16 · Rattrapage après absence
- **Persona / scénario** : un élève absent une semaine (maladie, ou fête si la famille a des usages différents **[à confirmer]**) doit savoir ce qu'il a manqué.
- **Fonctionnalité** : une vue « Ce que j'ai manqué » qui croise les contenus de séance importés d'École Directe pour la période, les documents publiés entre-temps et les devoirs. Le tuteur propose un parcours de rattrapage par chapitre. L'élève déclare lui-même la période : pas d'import des absences.
- **Valeur** : très concrète pour les élèves et la vie scolaire. Évite les « je n'étais pas là ».
- **Risques** : faibles. Ne pas déduire ni stocker le motif d'absence.
- **Existant** : partiel (contenus de séance importés, documents, tuteur) · **Priorité** : P1 · **Effort** : M

#### DIR-17 · Aménagements pédagogiques (PAP, PPS, PPRE) sans données médicales
- **Persona / scénario** : un élève dyslexique de 6e a un PAP. Il a besoin de fiches en police adaptée, de consignes courtes et de lecture audio.
- **Fonctionnalité** : des préférences d'accessibilité choisies par l'élève ou sa famille, ou activées par le référent avec leur accord : police, interlignage, consignes segmentées, temps majoré pour les quiz chronométrés, synthèse vocale plus tard. **Aucun diagnostic ni type de trouble stocké** : seulement les adaptations voulues. Le professeur voit, s'il le faut, qu'une adaptation est active, pas pourquoi.
- **Valeur** : inclusion. Le tuteur personnalisé est un atout réel pour ces élèves.
- **Risques** : déduire une donnée de santé à partir des adaptations. Il faut minimiser et restreindre la visibilité.
- **Existant** : non · **Priorité** : P1 · **Effort** : M

#### DIR-18 · Protocole de détresse dans le tuteur
- **Persona / scénario** : à 23 h, une élève écrit au tuteur de français : « de toute façon je veux disparaître ».
- **Fonctionnalité** : une détection limitée aux expressions explicites de danger (idées suicidaires, violences subies, harcèlement), et non une analyse de sentiment. L'IA répond avec bienveillance, sans faire de thérapie. Elle affiche les ressources : 3114 (prévention du suicide), 119 (enfance en danger), 3018 (cyberharcèlement), 112 en cas d'urgence, ainsi que les contacts internes (CPE, infirmière, rav ou référent **[à confirmer]**). Un bouton « Je veux parler à un adulte de l'école » envoie une demande au CPE ou au référent. **Question ouverte pour la direction** : faut-il aussi une alerte humaine automatique en cas de danger grave ? Cela touche à la confidentialité, au devoir de protection (information préoccupante) et à la faisabilité (qui reçoit l'alerte la nuit ?). Il faut décider avec le DPO et l'équipe médico-sociale **[à vérifier juridiquement]**.
- **Valeur** : un outil disponible le soir pour des mineurs doit savoir réagir. Ne rien prévoir serait un risque.
- **Risques** : faux positifs, faux sentiment de prise en charge, alerte non lue. Bien distinguer cela d'une surveillance générale des conversations, qui reste exclue. Respecter l'interdiction de la reconnaissance des émotions (principe 4).
- **Existant** : non · **Priorité** : P0 · **Effort** : M

#### DIR-19 · Canal de signalement (harcèlement, situation préoccupante)
- **Persona / scénario** : un élève témoin de harcèlement en 4e n'ose pas aller voir la CPE.
- **Fonctionnalité** : un formulaire « Signaler une situation » transmis aux référents désignés (programme pHARe, si l'établissement le met en œuvre **[à confirmer]**), avec accusé de réception. L'auteur est identifié par défaut ; l'anonymat est à décider. Pas d'IA dans le traitement.
- **Valeur** : un canal de plus, accessible.
- **Risques** : signalements malveillants, données sensibles, délai de traitement. Ne doit pas remplacer les circuits existants. Durée de conservation courte.
- **Existant** : non · **Priorité** : P2 · **Effort** : M

#### DIR-20 · Calendrier des évaluations et charge de travail de la classe
- **Persona / scénario** : la 1re B a quatre contrôles la même semaine que l'examen de Michna. Personne ne l'avait vu.
- **Fonctionnalité** : un calendrier partagé des évaluations par classe, alimenté par les devoirs importés et les saisies des professeurs. Visible par les professeurs de la classe, le PP et la CPE. Alerte « semaine chargée » au moment où un professeur ajoute un contrôle. Hol et kodesh sont réunis sur le même calendrier. Le planificateur de chaque élève en tient compte.
- **Valeur** : bien-être et qualité des révisions, avec une donnée purement organisationnelle (non nominative).
- **Risques** : faibles. Cela peut être perçu comme une contrainte sur la liberté pédagogique : présenter une alerte, pas un blocage.
- **Existant** : partiel (devoirs importés par chaque élève, sans vue de classe ; surcharge détectée seulement dans le planning individuel) · **Priorité** : P1 · **Effort** : M

### E. Professeur principal et conseils de classe

#### DIR-21 · Espace professeur principal
- **Persona / scénario** : le PP de Terminale ouvre « Ma classe » : évaluations à venir, cours sans contenu, usage agrégé de l'outil par sa classe, demandes « parler à un adulte » qui lui sont adressées.
- **Fonctionnalité** : un tableau de classe agrégé (seuil de 5), le calendrier des évaluations (DIR-20), les partages opt-in des élèves (DIR-25), un lien vers les annonces de la classe (DIR-32).
- **Valeur** : le PP a une vue d'ensemble, aujourd'hui dispersée.
- **Risques** : vue nominative cachée. Ne montrer de nominatif que ce que l'élève a partagé.
- **Existant** : non · **Priorité** : P1 · **Effort** : M

#### DIR-22 · Aide à la rédaction de la synthèse du conseil de classe
- **Persona / scénario** : le PP colle les appréciations des collègues et veut un projet de synthèse cohérent pour la classe, et non pour chaque élève.
- **Fonctionnalité** : à partir d'un texte saisi ou collé par le PP (appréciations, remarques), l'IA propose une synthèse collective de la classe et des points à aborder en conseil. **Aucune donnée du tuteur n'est utilisée.** Les appréciations individuelles restent rédigées par les professeurs ; au mieux, l'IA aide à reformuler un brouillon écrit par le professeur.
- **Valeur** : gain de temps en fin de trimestre.
- **Risques** : appréciations standardisées et impersonnelles. Transfert d'avis nominatifs vers le fournisseur IA, à encadrer. Glisser vers des appréciations générées automatiquement contredirait le principe « le professeur garde la main ».
- **Existant** : non (l'Atelier IA pourrait accueillir un modèle de demande dédié) · **Priorité** : P2 · **Effort** : S à M

#### DIR-23 · Portfolio partagé à l'initiative de l'élève
- **Persona / scénario** : avant le conseil, un élève veut montrer au PP qu'il a beaucoup travaillé les maths : 15 h chronométrées, 12 quiz.
- **Fonctionnalité** : l'élève choisit d'envoyer au PP ou à un professeur un bilan figé (temps de révision, quiz, notions travaillées), révocable. Jamais les conversations.
- **Valeur** : valorise l'effort, avec le consentement de l'élève.
- **Risques** : pression sociale implicite (« pourquoi tu n'as pas partagé ? »). Il faut que les professeurs ne puissent pas le demander de façon systématique ; c'est à inscrire dans la charte.
- **Existant** : non · **Priorité** : P2 · **Effort** : S à M

### F. Parents et communication école-famille

#### DIR-24 · Décision : pas de portail parents en V1
- **Persona / scénario** : une mère demande « est-ce que je peux voir ce que mon fils demande à l'IA ? »
- **Fonctionnalité** : décision de cadrage. Les parents disposent déjà d'École Directe pour les notes, absences et messagerie. IABNE ne propose pas de compte parent au départ. Les familles reçoivent l'information (DIR-03) et un guide (DIR-26). Les conversations du tuteur ne sont pas visibles des parents, comme elles ne le sont pas des professeurs.
- **Valeur** : évite de gérer des cas juridiques complexes (DIR-27) et protège l'espace d'apprentissage de l'élève, surtout au lycée.
- **Risques** : attente des parents de l'élémentaire, où un accès parent a davantage de sens. À réévaluer par niveau.
- **Existant** : de fait (aucun rôle parent) · **Priorité** : P0 (décision) · **Effort** : S

#### DIR-25 · Lettre hebdomadaire aux familles (optionnelle)
- **Persona / scénario** : le dimanche soir **[jour à confirmer]**, la famille d'un élève de 5e reçoit : « Cette semaine : 3 devoirs à rendre, contrôle d'anglais jeudi, planning prévu de 4 h. »
- **Fonctionnalité** : un résumé limité aux données organisationnelles (devoirs, échéances, planning prévu et réalisé). Opt-in de la famille. Au collège, l'élève voit exactement ce qui est envoyé ; au lycée, il peut s'y opposer **[à confirmer]**. Jamais de contenu du tuteur.
- **Valeur** : la famille accompagne sans contrôler.
- **Risques** : demande d'un envoi de mails (inexistant aujourd'hui). Parents séparés (DIR-27). Ne pas envoyer pendant Shabbat (DIR-40).
- **Existant** : non · **Priorité** : P2 · **Effort** : M

#### DIR-26 · Guide parents : « aider sans faire à la place »
- **Persona / scénario** : des parents veulent savoir comment l'IA aide leur enfant et comment éviter qu'il triche.
- **Fonctionnalité** : une page et un PDF qui expliquent l'aide progressive (indice, méthode, vérification), la règle « l'IA guide, elle ne fait pas à la place », comment demander à l'enfant de montrer son planning, et ce que l'IA ne fait pas (Internet, notes). Version en hébreu ou en anglais si utile **[à confirmer]**.
- **Valeur** : adhésion des familles à faible coût.
- **Risques** : aucun.
- **Existant** : non · **Priorité** : P1 · **Effort** : S

#### DIR-27 · Portail parents complet (si décidé plus tard)
- **Persona / scénario** : parents séparés, l'un des deux privé de l'exercice de l'autorité parentale ; élève majeur en Terminale.
- **Fonctionnalité** : comptes parents rattachés par le secrétariat à partir du dossier d'inscription. Chaque parent exerçant l'autorité parentale a le même droit à l'information sur la scolarité, quelle que soit la résidence de l'enfant (Code civil art. 371-1 et 372-2 et suivants). Un parent qui n'exerce pas l'autorité parentale garde en principe un droit d'être informé des choix importants, mais pas forcément un accès complet **[à vérifier juridiquement]**. Le blocage judiciaire d'un parent s'applique. Pas d'adresse d'un parent visible par l'autre. **Élève majeur** : il exerce lui-même ses droits ; les parents n'ont accès qu'avec son accord **[à vérifier juridiquement selon le règlement intérieur]**. Ce qui serait montré : planning, devoirs, annonces, ressources de classe, jamais les conversations.
- **Valeur** : utile surtout en primaire et au collège.
- **Risques** : élevés. Erreurs de rattachement, conflits familiaux, exposition de données, coût de support.
- **Existant** : non · **Priorité** : LT · **Effort** : L

#### DIR-28 · Annonces ciblées et traduites
- **Persona / scénario** : la directrice du collège annonce une journée banalisée aux 4e du site X. Une famille récemment arrivée d'Israël lit mieux l'hébreu **[à confirmer]**.
- **Fonctionnalité** : des annonces par périmètre (établissement, site, niveau, classe, rôle), avec date de publication et d'expiration et accusé de lecture agrégé. Traduction assistée par l'IA, relue avant envoi (français, hébreu, anglais). Programmation qui évite Shabbat et les fêtes.
- **Valeur** : une communication pédagogique ciblée.
- **Risques** : doublon avec la messagerie d'École Directe ; définir ce qui va où. Traduction erronée d'une information importante : relecture obligatoire. **Ne pas utiliser ce canal pour la sécurité** (alertes, plans d'évacuation), qui relève de canaux dédiés.
- **Existant** : non · **Priorité** : P1 · **Effort** : M

### G. Calendrier, événements, sorties et réunions

#### DIR-29 · Calendrier d'établissement unique
- **Persona / scénario** : le planificateur d'un élève lui propose de réviser pendant le voyage de classe et le jour de Kippour. C'est inacceptable.
- **Fonctionnalité** : un calendrier géré par la direction et les sites. Vacances scolaires (zone C pour Paris), fermetures propres à l'établissement (fêtes juives), journées banalisées, examens blancs, sorties, ponts, horaires réduits (par exemple le vendredi en hiver **[à confirmer]**). Import ICS possible. Il est consommé par le planificateur de chaque élève comme indisponibilité, et par le calendrier des évaluations.
- **Valeur** : un planning crédible. Aujourd'hui, une heure n'est exclue que si elle a été saisie.
- **Risques** : faibles. Il faut un responsable de la mise à jour.
- **Existant** : non (indisponibilités individuelles seulement) · **Priorité** : P0 · **Effort** : M

#### DIR-30 · Sorties et voyages : préparation pédagogique
- **Persona / scénario** : voyage de mémoire en Pologne en Terminale, ou voyage en Israël **[à confirmer]**. Les professeurs déposent un dossier, et les élèves préparent leurs exposés avec le tuteur.
- **Fonctionnalité** : un « espace événement » rattaché à des classes, avec documents publiés, IA fondée sur ce dossier, quiz de préparation et carnet de bord. Les autorisations parentales, paiements et listes médicales restent hors IABNE.
- **Valeur** : réutilise le moteur existant pour un temps fort pédagogique.
- **Risques** : sujets mémoriels sensibles (Shoah). L'IA doit rester sur le corpus des professeurs, sans source extérieure, conformément au principe du projet.
- **Existant** : partiel (un « cours » pourrait servir de support) · **Priorité** : P2 · **Effort** : S à M

#### DIR-31 · Réunions parents-professeurs : prise de rendez-vous
- **Persona / scénario** : réunion parents-professeurs de 3e. Les parents réservent des créneaux de 5 min avec chaque professeur, sans chevauchement.
- **Fonctionnalité** : grille de disponibilités des professeurs, réservation par les familles (lien sécurisé à usage unique, sans compte parent complet), planning optimisé pour les parents qui ont plusieurs enfants dans plusieurs classes ou sur plusieurs sites. Respect de Shabbat et des fêtes.
- **Valeur** : un irritant classique résolu.
- **Risques** : demande un accès parent, même minimal, et des envois. Vérifier d'abord si École Directe ou l'outil actuel le fait déjà.
- **Existant** : non · **Priorité** : P2 · **Effort** : M

#### DIR-32 · Annonces et calendrier dans le planning de l'élève
- **Persona / scénario** : l'élève voit dans sa semaine : sortie au musée mardi, office spécial jeudi, fin des cours à 13 h vendredi **[à confirmer]**.
- **Fonctionnalité** : fusion dans l'agenda de l'élève de son emploi du temps importé, du calendrier d'établissement (DIR-29), des annonces de sa classe (DIR-28) et de ses sessions de révision.
- **Valeur** : une seule vue de la semaine.
- **Risques** : faibles.
- **Existant** : partiel (agenda importé et planning) · **Priorité** : P1 · **Effort** : S à M

### H. Orientation

#### DIR-33 · Choix des spécialités en fin de seconde
- **Persona / scénario** : une élève de 2nde hésite entre SES, maths et HGGSP. Elle veut comprendre les attendus et ce que Yabné propose réellement.
- **Fonctionnalité** : un « cours » Orientation dont le corpus est déposé par l'équipe (offre de spécialités de Yabné **[à confirmer]**, documents ONISEP, présentations des professeurs). Un tuteur dédié qui répond seulement depuis ce corpus. Une activité de réflexion (goûts, projets) qui reste privée. Aucune recommandation automatique du type « tu devrais choisir ».
- **Valeur** : information disponible le soir, en famille.
- **Risques** : biais d'orientation, en particulier de genre. L'IA ne doit pas prescrire. L'orientation est une décision humaine, et l'AI Act considère l'accès et l'orientation comme des usages sensibles.
- **Existant** : partiel (mécanisme cours + RAG réutilisable) · **Priorité** : P2 · **Effort** : S à M

#### DIR-34 · Parcoursup : méthode et calendrier, sans rédaction à la place
- **Persona / scénario** : un élève de Terminale demande à l'IA « écris mon projet de formation motivé pour une prépa ».
- **Fonctionnalité** : le calendrier Parcoursup intégré au calendrier (DIR-29) avec rappels. Un accompagnement méthodologique : questions pour clarifier les motivations, relecture critique d'un brouillon **écrit par l'élève**, conformément à la règle « l'IA guide ». Refus explicite et pédagogique de rédiger à sa place. Le corpus vient de l'équipe d'orientation.
- **Valeur** : réduit le stress et les inégalités d'accompagnement.
- **Risques** : écrits standardisés ; les formations détectent les textes générés. Les fiches Avenir et appréciations des professeurs ne sont pas concernées et restent humaines.
- **Existant** : non · **Priorité** : P2 · **Effort** : M

### I. Spécificités Yabné

#### YAB-35 · Double cursus hol / kodesh dans le modèle de données
- **Persona / scénario** : en 1re, un élève a 30 h de matières générales et environ 8 à 10 h d'études juives par semaine **[volume à confirmer]** : Guemara, Houmach et Rachi, Navi, Halakha, Pensée juive, Hébreu, Histoire juive **[liste à confirmer]**.
- **Fonctionnalité** : une catégorie de matière (`hol`, `kodesh`, éventuellement `langue`) pour filtrer, afficher et faire des statistiques séparées. Les professeurs de kodesh (rabbanim, morot) sont des professeurs comme les autres dans IABNE, avec éventuellement un coordinateur de pôle (DIR-01). Le planificateur répartit la charge entre les deux cursus. Les dates d'examens de kodesh entrent dans le calendrier des évaluations.
- **Valeur** : refléter la réalité de la semaine de l'élève, souvent très chargée.
- **Risques** : si les matières de kodesh relèvent de la partie hors contrat de l'enseignement **[à confirmer]**, les responsabilités de traitement sont peut-être différentes : à préciser dans le registre.
- **Existant** : partiel (matières libres, sans catégorie) · **Priorité** : P0 · **Effort** : S

#### YAB-36 · Planning respectueux de Shabbat (horaires calculés, saisonniers)
- **Persona / scénario** : en décembre, l'allumage des bougies à Paris a lieu vers 16 h 40 ; en juin, vers 21 h 30 (ordres de grandeur à calculer précisément). Le planificateur ne doit rien placer le vendredi soir ni le samedi, et doit finir assez tôt le vendredi en hiver.
- **Fonctionnalité** : calcul **local, sans Internet**, des horaires du vendredi et du samedi avec une bibliothèque de calcul (par exemple `@hebcal/core`, licence et adéquation à vérifier), pour les coordonnées de Paris ou de chaque site et le fuseau `Europe/Paris` (heures d'été et d'hiver). Indisponibilité générée automatiquement de « vendredi, allumage − marge » jusqu'à « samedi, sortie de Shabbat + marge ». La convention de calcul (minutes avant le coucher du soleil, critère de sortie, horaires du Consistoire ou du rabbinat de l'établissement) et les marges sont paramétrées par l'établissement **[à confirmer]**. La règle s'applique à tous les élèves de l'établissement : c'est un choix d'établissement, sans recueil de la pratique de chaque famille. Le samedi soir en hiver est proposé comme créneau possible, jamais imposé. Le « temps de préparation » du vendredi après-midi est à décider.
- **Valeur** : condition d'acceptabilité du planificateur à Yabné. Sans elle, il est inutilisable.
- **Risques** : erreur d'heure (fuseau, heure d'été) ; tests nécessaires sur une année complète. Le code actuel n'a pas de fuseau : c'est à corriger pour ce calcul.
- **Existant** : non · **Priorité** : P0 · **Effort** : M

#### YAB-37 · Fêtes juives et jeûnes dans le planificateur et le calendrier
- **Persona / scénario** : Roch Hachana (2 jours), Kippour, premiers et derniers jours de Souccot (dont Chemini Atseret et Sim'hat Torah), Pessa'h (2 premiers et 2 derniers jours en diaspora), Chavouot (2 jours) sont des jours où l'on ne travaille pas (Yom Tov). Il faut aussi tenir compte des veilles de fêtes, de 'Hol Hamoèd, des jeûnes (Guedalia, 10 Tevet, Esther, 17 Tamouz), et des temps forts scolaires comme 'Hanouka, Pourim, Yom Hachoah, Yom Hazikaron et Yom Haatsmaout **[usages de l'établissement à confirmer]**.
- **Fonctionnalité** : génération automatique de ces dates (même bibliothèque, calendrier de diaspora), validée chaque année par la direction dans le calendrier d'établissement (DIR-29). Par type de jour : *bloqué* (Shabbat, Yom Tov), *allégé* (jeûne, veille de fête : plafond quotidien réduit), *normal* ('Hol Hamoèd selon décision **[à confirmer]**). Les révisions avant un contrôle placé juste après une fête de deux jours suivie de Shabbat (« trois jours d'affilée ») sont anticipées.
- **Valeur** : un planning juste, qui évite d'entasser le travail avant les fêtes.
- **Risques** : des usages qui diffèrent entre familles. L'établissement fixe la règle de l'outil ; l'élève peut ajouter ses propres indisponibilités.
- **Existant** : non · **Priorité** : P0 (Yom Tov) / P1 (allègements) · **Effort** : M

#### YAB-38 · Examens nationaux tombant un jour de fête ou un Shabbat
- **Persona / scénario** : une épreuve écrite ou orale du bac, ou du brevet, est fixée un jour de Chavouot.
- **Fonctionnalité** : comparaison automatique du calendrier des examens (saisi par l'établissement) avec les fêtes. Alerte à la direction et aux élèves concernés, avec la procédure officielle connue de l'établissement (demande d'aménagement ou de session de remplacement **[procédure à confirmer]**). Le planificateur avance les révisions en conséquence.
- **Valeur** : anticipation administrative et sérénité des élèves.
- **Risques** : donner une information procédurale erronée. Le texte doit venir de la direction, pas de l'IA.
- **Existant** : non · **Priorité** : P1 · **Effort** : S

#### YAB-39 · Mode Shabbat et Yom Tov : aucune notification, aucun envoi
- **Persona / scénario** : un rappel de révision ou une lettre aux familles part un samedi à 10 h. C'est un manquement aux valeurs de l'établissement.
- **Fonctionnalité** : tout envoi programmé (rappels, mails, annonces, lettres) est suspendu pendant Shabbat et Yom Tov, puis reporté à la sortie plus une marge. Les tâches planifiées (synchronisation École Directe, traitements) sont suspendues si la direction le souhaite **[à confirmer]**. Question à poser : l'accès au site doit-il rester ouvert (choix des familles) ou être fermé ? Recommandation : rester ouvert mais n'émettre aucune sollicitation, et afficher un bandeau « Chabbat Chalom » sans blocage **[à confirmer]**.
- **Valeur** : cohérence avec l'identité de l'établissement.
- **Risques** : bloquer l'accès d'un élève qui révise un samedi soir après la sortie de Shabbat, à cause d'un calcul erroné ; d'où l'usage de marges et de tests.
- **Existant** : non (aucun envoi aujourd'hui ; la règle doit exister avant le premier envoi) · **Priorité** : P0 · **Effort** : S

#### YAB-40 · Hébreu : affichage RTL, PDF, recherche et saisie
- **Persona / scénario** : le professeur de Navi dépose un texte vocalisé avec citations de Rachi. Un élève cherche « בראשית » avec ou sans voyelles, ou avec un préfixe (« ובראשית »).
- **Fonctionnalité** :
  - affichage bidirectionnel (`dir="auto"`, alignement, ponctuation mixte français-hébreu) dans les cours, le chat et les fiches ;
  - PDF : rendu RTL, nikoud, et éventuellement te'amim (signes de cantillation), avec des polices dédiées (par exemple Noto Sans/Serif Hebrew, SBL Hebrew, licences à vérifier) ;
  - recherche : normalisation Unicode, retrait optionnel du nikoud et des te'amim, gestion des lettres finales et des préfixes usuels (ו, ה, ב, ל, מ, ש, כ), pour la recherche lexicale actuelle ;
  - extraction DOCX et PDF en hébreu : ordre logique contre ordre visuel, à tester ;
  - clavier hébreu virtuel ;
  - araméen (Guemara) traité comme l'hébreu pour l'écriture.
- **Valeur** : sans cela, le pôle kodesh et l'hébreu ne peuvent pas utiliser l'outil.
- **Risques** : PDF illisibles ou inversés ; extraction de PDF hébreux dans le désordre, ce qui donne des réponses de l'IA fausses ou citant mal. Évaluation à prévoir sur de vrais documents.
- **Existant** : non · **Priorité** : P0 si le kodesh entre dans le pilote, sinon P1 · **Effort** : L

#### YAB-41 · Garde-fous de l'IA sur les textes d'études juives
- **Persona / scénario** : un élève demande au tuteur de Halakha « est-ce que j'ai le droit de faire X à Shabbat ? ».
- **Fonctionnalité** :
  - L'IA explique le contenu du cours (sources, raisonnement, avis présentés par le professeur) mais **ne rend pas de décision halakhique personnelle**. Elle renvoie vers le rav ou le professeur.
  - Elle cite précisément (livre, chapitre, verset, daf) à partir des documents du professeur, sans attribuer d'avis à une autorité qui n'est pas dans la source.
  - Elle reste fidèle à la ligne pédagogique et à la tradition d'interprétation de l'établissement, qu'elle n'élargit pas.
  - Option « contient des noms divins » sur un document ou une fiche : mention en pied de page invitant à un traitement respectueux de l'imprimé (gueniza), ou abréviation des noms dans les générations **[usage à confirmer]**.
  - En matières générales, l'IA suit strictement le cours et les programmes nationaux, sans commentaire religieux.
- **Valeur** : la confiance des rabbanim et des familles. Évite les réponses déplacées.
- **Risques** : hallucination sur des textes sacrés, donc une sensibilité forte. Validation prioritaire avec les professeurs de kodesh pendant le pilote (DIR-11).
- **Existant** : partiel (RAG limité au corpus du professeur, abstention, méthodes validées) · **Priorité** : P1 · **Effort** : S

#### YAB-42 · Havrouta : étude en binôme assistée
- **Persona / scénario** : en Guemara, le professeur forme des havroutot de deux élèves. Le binôme prépare une souguia et, le soir, chacun veut continuer.
- **Fonctionnalité** : des groupes de travail (cela rejoint la priorité de l'utilisateur sur les groupes d'élèves) de type « havrouta », formés par le professeur, ou par les élèves si le professeur l'autorise. Un espace partagé : texte, questions du binôme, notes communes. L'IA joue le rôle de « troisième partenaire » qui **pose des questions** (« Quelle est la question de la Guemara ? », « Quelle est la différence entre les deux avis ? ») au lieu de donner la réponse. Le professeur voit les questions que le binôme a choisi de lui remonter. La mémoire du tuteur de chaque élève reste privée et n'est pas mise en commun.
- **Valeur** : outille une méthode pédagogique propre à l'établissement. C'est un vrai différenciateur. Également applicable en matières générales (travail en binôme).
- **Risques** : contenus partagés entre mineurs (modération, signalement), mixité des binômes selon les usages **[à confirmer]**, confidentialité de l'espace commun.
- **Existant** : non (aucun groupe d'élèves aujourd'hui) · **Priorité** : P1 · **Effort** : M

#### YAB-43 · Hébreu moderne et biblique : entraînement spécifique
- **Persona / scénario** : un élève de 3e révise l'hébreu moderne (langue vivante, épreuve possible au bac **[filière à confirmer]**). Un élève de 6e apprend le vocabulaire du Houmach.
- **Fonctionnalité** : listes de vocabulaire extraites des cours, cartes à révisions espacées (déjà dans le reste à faire), quiz de conjugaison (binyanim, racines de trois lettres), lecture avec ou sans nikoud, rédaction guidée en hébreu moderne, glossaire araméen pour la Guemara, plus tard la prononciation.
- **Valeur** : la mémorisation du vocabulaire est un besoin récurrent et bien adapté à l'outil.
- **Risques** : qualité de l'IA en hébreu à évaluer, notamment sur le nikoud. Dépend de YAB-40.
- **Existant** : partiel (quiz QCM génériques) · **Priorité** : P1 · **Effort** : M

#### YAB-44 · Offices, temps de la journée et absence de suivi religieux individuel
- **Persona / scénario** : la journée commence par la tefila (office du matin) et inclut peut-être Min'ha **[horaires à confirmer]**. Le planificateur ne doit pas y placer de révision, et l'outil ne doit pas devenir un registre de présence aux offices.
- **Fonctionnalité** : les offices sont des créneaux de l'emploi du temps d'établissement (DIR-29), exclus du planning. **Pas de suivi individuel de présence aux offices, de pratique ni d'observance dans IABNE.** Si la vie scolaire le suit, c'est dans son outil officiel, sous sa responsabilité (donnée art. 9).
- **Valeur** : un planning juste, et un risque de données sensibles évité.
- **Risques** : une demande future de « suivre l'assiduité à l'office » dans IABNE est à refuser ou à cadrer strictement.
- **Existant** : non · **Priorité** : P1 · **Effort** : S

#### YAB-45 · Valeurs de l'établissement dans le ton de l'IA
- **Persona / scénario** : la direction veut que l'IA tutoie ou vouvoie selon le niveau, encourage, reste respectueuse (derekh erets) et refuse les contenus inappropriés, y compris dans les images ou les exemples des fiches.
- **Fonctionnalité** : une charte de ton paramétrable par la direction, injectée dans les consignes système de toutes les fonctions. Tests de non-régression (jeux de questions sensibles). Version de la charte journalisée. L'adaptation se fait par niveau (6e ou Terminale).
- **Valeur** : un outil qui ressemble à l'établissement.
- **Risques** : une charte trop vague (sans effet) ou trop prescriptive, qui empiète sur la liberté pédagogique des professeurs. Le contenu disciplinaire reste celui du professeur.
- **Existant** : partiel (consignes « vocabulaire du professeur ») · **Priorité** : P1 · **Effort** : S

#### YAB-46 · Multi-sites et périmètre par cycle (maternelle à lycée)
- **Persona / scénario** : Yabné compte plusieurs sites ou unités, de l'école au lycée **[liste et organisation à confirmer]**. Une famille a trois enfants sur deux sites. Les élèves de maternelle et d'élémentaire n'utilisent pas un tuteur conversationnel.
- **Fonctionnalité** :
  - un niveau `site` entre l'établissement et les classes, pour les rôles, les statistiques, le calendrier et les annonces ;
  - des professeurs intervenant sur plusieurs sites ;
  - fonctions activées par cycle. Exemple proposé : maternelle et élémentaire réservés aux enseignants (atelier de préparation, fiches pour la classe), sans compte élève ; collège avec tuteur et quiz, mémoire désactivée par défaut en 6e et 5e **[à décider]** ; lycée avec l'ensemble ;
  - un établissement juridique unique (si c'est un seul organisme gestionnaire) partageant la configuration, sans exposer les données d'un site aux autres.
- **Valeur** : colle à l'organisation réelle. Évite une instance par site.
- **Risques** : erreurs de périmètre. Pour les moins de 15 ans, la base légale ne doit pas reposer sur le consentement de l'enfant seul **[à vérifier juridiquement ; l'intérêt public ou légitime de l'établissement est probablement plus adapté]**.
- **Existant** : partiel (cloisonnement par `school_id`, pas de site) · **Priorité** : P1 · **Effort** : M à L

---

## 3. Synthèse

| ID | Cas | Existant | Prio | Effort |
| --- | --- | --- | --- | --- |
| DIR-01 | Rôles à périmètre | non | P0 | M |
| DIR-02 | Journal d'audit | non | P0 | M |
| DIR-03 | Charte et transparence | partiel | P0 | S |
| DIR-04 | Paramètres d'établissement | non | P1 | M |
| DIR-05 | Sécurité et minimisation | partiel | P0 | M |
| DIR-06 | Droits RGPD | partiel | P0 | M |
| DIR-07 | Tableau de bord d'adoption | partiel | P1 | M |
| DIR-08 | Coûts IA et budget | partiel | P0 | M |
| DIR-09 | Couverture et abstentions | non | P1 | M |
| DIR-10 | Notions difficiles inter-classes | partiel | P1 | S-M |
| DIR-11 | Revue des signalements IA | partiel | P0 | S-M |
| DIR-12 | « Où j'en suis » élève | partiel | P1 | S-M |
| DIR-13 | Signaux explicables | non | P2 | M |
| DIR-14 | Prédiction des résultats | non | LT | L |
| DIR-15 | Liens École Directe | non | P0 | S |
| DIR-16 | Rattrapage après absence | partiel | P1 | M |
| DIR-17 | Aménagements PAP/PPS | non | P1 | M |
| DIR-18 | Protocole de détresse | non | P0 | M |
| DIR-19 | Canal de signalement | non | P2 | M |
| DIR-20 | Calendrier des évaluations | partiel | P1 | M |
| DIR-21 | Espace PP | non | P1 | M |
| DIR-22 | Synthèse du conseil de classe | non | P2 | S-M |
| DIR-23 | Portfolio opt-in | non | P2 | S-M |
| DIR-24 | Pas de portail parents en V1 | de fait | P0 | S |
| DIR-25 | Lettre hebdo familles | non | P2 | M |
| DIR-26 | Guide parents | non | P1 | S |
| DIR-27 | Portail parents complet | non | LT | L |
| DIR-28 | Annonces ciblées et traduites | non | P1 | M |
| DIR-29 | Calendrier d'établissement | non | P0 | M |
| DIR-30 | Sorties et voyages | partiel | P2 | S-M |
| DIR-31 | Réunions parents-professeurs | non | P2 | M |
| DIR-32 | Agenda unifié élève | partiel | P1 | S-M |
| DIR-33 | Spécialités en seconde | partiel | P2 | S-M |
| DIR-34 | Parcoursup | non | P2 | M |
| YAB-35 | Double cursus hol/kodesh | partiel | P0 | S |
| YAB-36 | Planning et Shabbat | non | P0 | M |
| YAB-37 | Fêtes et jeûnes | non | P0/P1 | M |
| YAB-38 | Examens et fêtes | non | P1 | S |
| YAB-39 | Mode Shabbat (aucun envoi) | non | P0 | S |
| YAB-40 | Hébreu RTL, PDF, recherche | non | P0/P1 | L |
| YAB-41 | Garde-fous textes sacrés | partiel | P1 | S |
| YAB-42 | Havrouta | non | P1 | M |
| YAB-43 | Hébreu moderne et biblique | partiel | P1 | M |
| YAB-44 | Offices sans suivi religieux | non | P1 | S |
| YAB-45 | Valeurs et ton de l'IA | partiel | P1 | S |
| YAB-46 | Multi-sites et cycles | partiel | P1 | M-L |

Total : 46 cas, dont 16 en P0 (P0 et P0/P1 compris), 19 en P1, 9 en P2 et 2 en long terme.

---

## 4. Top 10 recommandé

1. **DIR-01 Rôles à périmètre** (direction, site, CPE, PP, coordinateur kodesh, DPO). C'est le socle de tout le reste et la priorité « administration » de l'utilisateur.
2. **YAB-36 et YAB-37 Planning respectueux de Shabbat et des fêtes**, avec horaires calculés localement selon la saison et le fuseau Europe/Paris. Sans cela, le planificateur est inacceptable à Yabné.
3. **DIR-29 Calendrier d'établissement unique** (vacances zone C, fêtes, journées banalisées, examens blancs), consommé par le planificateur.
4. **DIR-08 Suivi des coûts IA** (jetons, fonction, niveau, budget, plafonds), avant l'ouverture à tout l'établissement.
5. **DIR-18 Protocole de détresse dans le tuteur**, avec ressources et bouton « parler à un adulte », et une décision explicite de la direction sur l'alerte humaine.
6. **DIR-02, DIR-05 et DIR-06 Audit, sécurité et droits RGPD**, avant toute donnée réelle de mineurs.
7. **YAB-40 Hébreu RTL, PDF et recherche**, condition pour embarquer le pôle kodesh et l'hébreu dans le pilote.
8. **YAB-42 Havrouta et groupes de travail** : un différenciateur pédagogique propre à l'établissement, qui rejoint la demande de groupes d'élèves.
9. **DIR-07 et DIR-11 Tableau de bord d'adoption agrégé et revue des signalements IA**, pour piloter le pilote sans surveiller individuellement.
10. **DIR-03 et DIR-24 Charte, transparence et décision « pas de portail parents en V1 »**, avec la règle : les données du tuteur ne servent jamais à évaluer.

À **ne pas** faire maintenant : la prédiction des résultats (DIR-14), le portail parents complet (DIR-27), toute analyse de sentiment ou d'émotion, et tout suivi de la pratique religieuse.

---

## 5. Questions à poser à la direction de Yabné avant de développer

**Organisation et périmètre**
1. Quels sites, quels cycles (maternelle, élémentaire, collège, lycée) et combien d'élèves par site ? S'agit-il d'un seul organisme gestionnaire ou de plusieurs entités juridiques ?
2. Quels cycles doivent avoir des comptes élèves ? Faut-il réserver le primaire aux enseignants ?
3. Qui occupe quels rôles : chef d'établissement, directeurs de site, adjoints, CPE, PP, coordinateurs, responsable des études juives, DPO ? Une même personne peut-elle cumuler plusieurs rôles ?
4. Les classes sont-elles mixtes ou séparées selon les niveaux ? Cela a-t-il des conséquences sur les groupes et les havroutot ?

**Double cursus**
5. Liste et volume horaire des matières de kodesh par niveau. Sont-elles évaluées, et dans quel outil ? Relèvent-elles de la partie sous contrat ou hors contrat ?
6. Les professeurs de kodesh déposeront-ils des documents en hébreu ou en araméen, vocalisés ou non, scannés ou numériques ?
7. Quelle ligne pédagogique et quelles limites pour l'IA sur les textes sacrés et la Halakha (pas de décision personnelle, renvoi au rav) ? Qui valide ?
8. Faut-il un traitement particulier des imprimés contenant des noms divins (gueniza, abréviation) ?

**Calendrier, Shabbat et fêtes**
9. Quelle référence pour les horaires (Consistoire de Paris, rabbinat de l'établissement), quelle marge avant l'allumage et quel critère de sortie de Shabbat ?
10. Quels jours sont fermés (Yom Tov, veilles, 'Hol Hamoèd) et quels jours sont allégés (jeûnes) ? Quels horaires le vendredi selon la saison ? Y a-t-il cours le dimanche ou le mercredi après-midi ?
11. Pendant Shabbat et les fêtes, faut-il fermer l'accès au site, ou seulement suspendre toutes les notifications et tous les envois ?
12. Quelle procédure l'établissement suit-il lorsqu'un examen national tombe un jour de fête ?
13. Horaires des offices dans la journée, par site et par niveau ?

**Vie scolaire et bien-être**
14. Confirmez-vous qu'École Directe reste l'outil officiel des notes, absences, sanctions et messagerie ? Quels modules de vie scolaire et famille y sont activés ?
15. En cas de message de détresse d'un élève dans le tuteur, faut-il seulement afficher les ressources, ou aussi alerter un adulte ? Qui le recevrait, à quelles heures, et selon quel protocole ?
16. Existe-t-il des référents harcèlement (pHARe ou équivalent), une infirmière, un psychologue ? Comment les contacter depuis l'outil, sans qu'IABNE stocke de données de santé ?
17. Comment les PAP, PPS et PPRE sont-ils gérés aujourd'hui ? Qui peut activer une adaptation dans IABNE ?

**Pilotage et éthique**
18. Quels indicateurs la direction veut-elle réellement, et pour quelles décisions ? Acceptez-vous la règle « agrégé, seuil de 5, pas de classement nominatif des professeurs » ?
19. Les personnels et leurs représentants (s'il existe un CSE ou équivalent) ont-ils été informés, ou doivent-ils être consultés sur les statistiques d'usage ?
20. Acceptez-vous le principe « les données du tuteur ne servent jamais à l'évaluation, à l'orientation ni à la discipline » et de le publier ?
21. L'analyse prédictive est-elle un objectif réel ? Si oui, êtes-vous prêts à porter une AIPD et les obligations de l'AI Act ?
22. Quel budget mensuel pour l'IA ? Faut-il des plafonds par élève, par niveau ou pendant les périodes d'examens ?

**Familles**
23. Souhaitez-vous un accès parent à IABNE, et pour quels cycles ? Sinon, une simple lettre hebdomadaire optionnelle ?
24. Comment gérez-vous aujourd'hui les parents séparés, les décisions judiciaires et les élèves majeurs (règlement intérieur) ?
25. Dans quelles langues communiquez-vous avec les familles (français, hébreu, anglais) ?
26. Les réunions parents-professeurs utilisent-elles déjà un outil de rendez-vous ?

**Orientation et sorties**
27. Quelles spécialités et options sont proposées au lycée ? Qui porte l'orientation (PP, psychologue, conseiller) et pourra déposer le corpus d'orientation ?
28. Quels voyages et sorties récurrents (Pologne, Israël, autres) souhaitez-vous accompagner pédagogiquement ?

**Données, sécurité et conformité**
29. Qui est le DPO ? Un registre des traitements et une AIPD sont-ils prévus pour IABNE ? Quelle base légale (intérêt public, intérêt légitime, contrat de scolarisation) ?
30. Quelles exigences de sécurité propres à l'établissement (contexte sécuritaire, hébergement, localisation des données, fournisseur IA autorisé, double authentification) ?
31. Quelles durées de conservation pour les conversations, la mémoire du tuteur, les journaux et les comptes des élèves partis ?
32. Quels sont les valeurs et le ton attendus de l'IA (tutoiement ou vouvoiement par niveau, formules, limites) ? Qui valide la charte de ton ?

---

## 6. Repères réglementaires à faire vérifier (non exhaustif)

- **RGPD** : art. 5 (minimisation, limitation de conservation), art. 8 et l'âge de 15 ans en France pour le consentement aux services en ligne (probablement pas la base pertinente ici), art. 9 (données révélant les convictions religieuses et données de santé), art. 12 à 14 (information), art. 15 à 21 (droits), art. 22 (décision automatisée), art. 35 (AIPD : mineurs, profilage, technologie innovante).
- **CNIL** : recommandations sur les droits des mineurs en ligne, sur l'IA, et ressources « éducation numérique ». Liste des traitements soumis à AIPD.
- **AI Act (UE 2024/1689)** : art. 5(1)(f), interdiction de la reconnaissance des émotions dans l'enseignement ; annexe III point 3, systèmes d'éducation à haut risque (accès, évaluation des acquis, orientation, surveillance des examens) ; art. 50, transparence des systèmes conversationnels. Le calendrier d'application des obligations « haut risque » est à vérifier (reports discutés en 2025-2026).
- **Code civil** : art. 371-1 et suivants (autorité parentale) et art. 372-2 ; art. 414 (majorité).
- **Code du travail** : art. L1222-4 (information préalable sur les dispositifs de collecte) et L2312-38 (consultation du CSE sur les moyens de contrôle). Leur application aux maîtres contractuels du privé sous contrat est à vérifier.
- **Code de l'action sociale et des familles** : information préoccupante. Code pénal art. 434-3 (non-dénonciation de mauvais traitements sur mineur).
- Ressources d'aide à afficher : 3114, 119, 3018, 112 (à vérifier au moment du développement).
