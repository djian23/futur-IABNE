# 07 — Benchmark concurrentiel et idées de fonctionnalités pour IABNE

> Périmètre : ce que font les autres outils (vie scolaire, ENT, IA éducative, révision, motivation, groupes d'étude) et les idées concrètes à reprendre pour IABNE (Yabné Paris, collège/lycée, élèves mineurs).
> Date de rédaction : novembre 2026. Méthode : quelques recherches web ciblées pour vérifier les faits récents, le reste vient de connaissances générales. Les affirmations marquées **[à vérifier]** n'ont pas été confirmées par une source primaire pendant cette recherche. Les retours utilisateurs cités sont des tendances connues (avis stores, presse, forums enseignants), pas une enquête chiffrée.

## 0. Rappel : ce qu'IABNE a déjà (pour ne pas réinventer)

D'après le cahier des charges V3, `docs/FEATURES.md` et les ajouts de l'équipe :

- **Déjà là** : comptes créés par l'admin, classes, matières, affectations ; dépôt de documents avec versions ; délégués élèves qui déposent en brouillon ; assistant RAG par cours et professeur, avec citations et abstention ; profil pédagogique du professeur validé par lui ; tuteur personnel avec mémoire privée, suspendable et réinitialisable ; aide progressive (indice, méthode, vérification, correction) ; quiz QCM adaptatifs ; fiches, sujets et corrigés séparés en PDF ; atelier IA du professeur ; statistiques agrégées à partir de 5 élèves ; planificateur ; connecteur École Directe expérimental ; chronomètre.
- **Manque côté admin et social** (la priorité de l'utilisateur) : groupes de travail élèves, import CSV, modification et suppression de classes et d'affectations, passage d'année, tableau de bord admin, suppression RGPD complète, mails, rôles parent, CPE et direction.
- **Reste côté pédagogie** : révision espacée, diagnostic des erreurs de raisonnement, correction avec note indicative.

Ce benchmark sert surtout à combler ces manques, en s'appuyant sur ce qui marche ailleurs.

---

## 1. Fiches par outil

Chaque fiche suit le même plan : **Remarquable**, **Ce qui marche / ne marche pas**, **À reprendre pour IABNE**, **Ce qu'IABNE peut faire mieux**.

### A. Vie scolaire et ENT français (l'environnement déjà connu des familles)

#### Pronote (Index Éducation, groupe Docaposte)
- **Remarquable** : c'est la référence de la vie scolaire dans le secondaire (environ 18 M d'utilisateurs revendiqués). Il couvre notes, compétences, cahier de textes, absences, messagerie, conseils de classe, QCM, rendu de devoirs et appli mobile très utilisée. Pour la rentrée 2025, Index Éducation a mis en avant des fonctions de « droit à la déconnexion » (plages sans notifications, meilleur contrôle des envois). Aucune fonction d'IA générative grand public n'a été trouvée **[à vérifier sur index-education.com]**.
- **Marche** : tout est au même endroit et les parents comme les élèves ont le réflexe de l'ouvrir.
- **Ne marche pas** : les notifications de notes en temps réel génèrent de l'anxiété (« Pronote-stress », critique fréquente dans la presse et chez les syndicats) ; l'outil est purement administratif, sans aide à l'apprentissage ; l'ergonomie est dense ; les QCM intégrés sont peu utilisés.
- **À reprendre** : (1) les **plages de déconnexion** et l'envoi différé des notifications ; (2) un **cahier de textes structuré** avec le travail « à faire pour le… » ; (3) la vue **compétences** plutôt que seulement des notes ; (4) la **préparation du conseil de classe** (synthèse par élève).
- **IABNE peut faire mieux** : relier chaque devoir à « réviser ce chapitre avec l'IA de ton prof » ; garder une vue sereine, sans note qui tombe à 23 h.

#### École Directe (Aplim / Statim)
- **Remarquable** : très présent dans le privé sous contrat, dont probablement Yabné **[à vérifier]**. Il gère vie scolaire, notes, emploi du temps, cahier de textes, documents, messagerie et paiement de la cantine. L'API communautaire (EduWireApps) a permis de créer des clients tiers.
- **Marche** : socle unique côté établissement et familles.
- **Ne marche pas** : pas d'API officielle publique, la double authentification (QCM) et les changements de l'API cassent les clients tiers ; l'interface est datée ; il n'y a aucune aide pédagogique.
- **À reprendre** : la synchronisation de l'emploi du temps et des devoirs (déjà fait) ; signaler les **pièces jointes** des devoirs et proposer leur import vers le corpus du professeur, avec son accord.
- **IABNE peut faire mieux** : rester une couche **pédagogique** au-dessus d'École Directe, sans la dupliquer (pas de notes officielles, pas d'absences). C'est un choix de positionnement à assumer.

#### Skolengo (Kosmos) / ENT régionaux (Monlycée.net en Île-de-France, ex-Lycée connecté)
- **Remarquable** : ENT fournis par les régions et académies. Ils intègrent un **Médiacentre** (accès aux ressources numériques gratuites : MIA Seconde, manuels, Pix), des espaces de classe, des blogs, des groupes, une messagerie et un stockage. Monlycée.net (Île-de-France, solution Open ENT / Edifice **[à vérifier]**) est obligatoire dans les lycées publics franciliens. Kosmos signale dans sa rétrospective 2025-2026 des expérimentations IA sur la remédiation avec le laboratoire IRIT.
- **Marche** : un SSO unique, les **groupes de travail et communautés** (y compris inter-classes), le Médiacentre.
- **Ne marche pas** : faible adoption réelle (beaucoup d'élèves ne l'ouvrent que contraints), lenteurs, et un doublon avec Pronote pour les notes.
- **À reprendre** : (1) des **communautés et groupes** avec mur, documents partagés et modération ; (2) un **« Médiacentre » interne**, c'est-à-dire un catalogue de ressources externes validées par les profs (liens Lumni, Pix, MIA) ; (3) un SSO futur (ÉduConnect) **[long terme]**.
- **IABNE peut faire mieux** : des groupes **avec une IA qui connaît les cours du groupe**, ce qui donne une raison d'y revenir.

### B. Tuteurs IA et outils IA pour enseignants

#### Khanmigo (Khan Academy)
- **Remarquable** : le pionnier du tuteur **socratique** (ne donne pas la réponse) pour les mineurs. Les professeurs voient l'historique des conversations de leurs élèves, avec des **alertes de modération** (contenus d'automutilation, etc.). Côté prof : générateur de leçons, rubriques, « class snapshot ». L'outil est gratuit pour les enseignants aux États-Unis (Microsoft a financé l'accès).
- **Marche** : le cadre éthique (« guide, ne fait pas à la place »), le ton bienveillant et la transparence envers l'adulte.
- **Ne marche pas** : des **erreurs de calcul** documentées (Khan Academy l'a reconnu, enquête du WSJ en 2024) ; des élèves frustrés par un socratisme rigide (« donne-moi juste la réponse ») ; un usage réel plus faible que prévu (« non-event » selon certains analystes) ; le contenu est générique, pas celui du prof.
- **À reprendre** : (1) **alertes de sécurité** vers un adulte référent (CPE, infirmière) en cas de détresse, sans exposer le reste de la conversation ; (2) un **calcul vérifié par un outil** (moteur symbolique ou code), jamais par le LLM seul ; (3) un **socratisme gradué**, c'est-à-dire que l'élève choisit l'intensité de l'aide (ce qu'IABNE a déjà amorcé avec l'aide progressive).
- **IABNE peut faire mieux** : ancrage dans les cours du professeur de l'élève, avec ses notations et ses méthodes ; confidentialité plus forte (Khanmigo montre tout au prof, IABNE ne montre que des agrégats et des alertes de sécurité).

#### MagicSchool AI
- **Remarquable** : plus de 80 « outils » enseignants en un clic (plan de séance, rubrique, différenciation, texte nivelé, IEP, mail aux parents, questions sur une vidéo YouTube). **MagicSchool for Students** propose des « rooms » que le prof configure et surveille.
- **Marche** : un gain de temps immédiat, très peu de friction et une adoption virale chez les profs.
- **Ne marche pas** : les sorties sont génériques et doivent être retravaillées ; l'outil est centré sur le programme américain ; la multiplication des outils ressemble à un catalogue ; il y a un risque de dépendance et une qualité inégale.
- **À reprendre** : (1) une **bibliothèque de « recettes » de l'atelier prof** (mail aux parents, texte adapté DYS, consignes reformulées, grille d'évaluation) ; (2) des **« salles IA » configurées par le prof** : une activité IA ciblée (ex. « interroge-moi sur la Révolution, chapitre 3 ») avec consignes, durée et ouverture ou fermeture.
- **IABNE peut faire mieux** : chaque recette part du corpus réel du prof et de son profil pédagogique validé, au lieu d'un prompt vide.

#### Brisk Teaching
- **Remarquable** : une **extension Chrome** qui agit là où le prof travaille déjà (Google Docs, Slides, sites). Elle donne un retour sur les copies, ajuste le niveau d'un texte, crée un quiz depuis une page et fait de l'« inspect writing » (rejoue la frappe d'un élève pour détecter le copier-coller IA).
- **Marche** : aucune nouvelle plateforme à apprendre ; le retour sur la rédaction fait gagner du temps.
- **Ne marche pas** : dépend de Google ; la détection d'IA reste fragile.
- **À reprendre** : (1) un **retour sur copie** (le prof dépose un scan ou un texte d'élève et obtient un brouillon d'annotations alignées sur *son* barème) ; (2) le principe **« là où il travaille »** : des boutons « transformer en quiz / fiche » sur n'importe quel document déjà déposé ; (3) un **historique de rédaction** en option pour les devoirs rédigés dans IABNE (processus plutôt que détection).
- **IABNE peut faire mieux** : un barème appris des corrigés de ce professeur, validé par lui (le « profil pédagogique » existe déjà).

#### SchoolAI
- **Remarquable** : des « Spaces » créés par le prof, un **tableau de bord en temps réel « Mission Control »** qui montre qui est bloqué pendant la séance, des alertes de sentiment et de sécurité, et **Sidekick**, un assistant par élève.
- **Marche** : la visibilité en direct en classe ; le prof garde la main.
- **Ne marche pas** : l'impression de surveillance ; la charge pour le prof qui doit surveiller.
- **À reprendre** : un **mode séance en classe** : le prof lance une activité IA de 15 minutes et voit en direct les indicateurs agrégés (« 8 élèves bloqués sur la question 3 »), sans lire les conversations.
- **IABNE peut faire mieux** : des agrégats anonymes par défaut, cohérents avec la règle des 5 élèves.

#### Google Classroom + Gemini for Education + NotebookLM
- **Remarquable** : Gemini et NotebookLM sont inclus dans toutes les éditions Workspace for Education. Le prof peut **assigner un « notebook » NotebookLM ou un « Gem »** (assistant personnalisé) à une classe. NotebookLM produit des réponses **strictement sourcées** sur les documents fournis, des **Audio Overviews** (podcast à deux voix), des Video Overviews, des cartes mentales, des guides d'étude et des flashcards. L'ouverture aux moins de 18 ans s'est faite progressivement en 2025 avec des garde-fous renforcés, certaines fonctions restant réservées aux 18 ans et plus. **Guided Learning** (août 2025) est le mode d'apprentissage pas à pas de Gemini.
- **Marche** : l'ancrage sur les sources avec citations cliquables est très apprécié ; le format audio plaît pour réviser dans les transports.
- **Ne marche pas** : la dépendance à l'écosystème Google ; des questions RGPD et de transfert hors UE pour des mineurs (débat récurrent en France, doctrine ministérielle défavorable à Google et Microsoft gratuits en établissement **[à vérifier : position DNE 2022-2023]**) ; le podcast peut simplifier à l'excès ou se tromper.
- **À reprendre** : (1) le **« notebook de cours » assigné par le prof**, c'est déjà le concept d'IABNE, et cela le valide ; (2) des **résumés audio** d'un chapitre (TTS à une voix, avec la voix du prof en option, sous consentement) ; (3) des **cartes mentales** générées depuis le chapitre ; (4) le **« Gem » prof** : un assistant spécialisé que le prof configure (« entraîneur de dissertation », « coach oral de langue »).
- **IABNE peut faire mieux** : un hébergement européen, un établissement unique, aucune donnée à un géant ; une mémoire de progression par élève (NotebookLM n'en a pas) ; un planning relié à École Directe.

#### Microsoft Teams Education / Copilot / Learning Accelerators / Learning Zone
- **Remarquable** : les **Learning Accelerators** (Reading Progress, Math Progress, Speaker Progress, Search Progress, Reflect) sont reliés à **Education Insights**. **Reflect** est un check-in émotionnel quotidien (émojis) avec agrégats pour le prof. « Teach in Microsoft 365 Copilot » (2025) regroupe plan de séance, différenciation et évaluation. **Learning Zone** est une appli sur PC Copilot+. Copilot académique facturé à 18 USD par utilisateur et par mois à partir de 13 ans (décembre 2025) **[à vérifier]**.
- **Marche** : Reading Progress (lecture à voix haute, l'IA repère les erreurs de fluence) est très apprécié ; Reflect est simple.
- **Ne marche pas** : la complexité, le poids de Teams et la dépendance aux licences.
- **À reprendre** : (1) **Reflect / météo de l'élève** (« comment te sens-tu avec ce chapitre ? »), avec seulement des agrégats côté prof et une option d'alerte au CPE ; (2) **Speaker Progress** : entraînement à l'**oral** (Grand oral, exposés, langues), l'IA mesure le rythme, les mots parasites et la structure ; (3) **Reading Progress** pour les 6e et 5e et les élèves DYS **[P2]**.
- **IABNE peut faire mieux** : un oral entraîné **sur la grille du professeur** (grille du Grand oral déposée).

#### Claude for Education (Learning mode) / ChatGPT Edu (Study mode) / Gemini Guided Learning
- **Remarquable** : les trois grands laboratoires ont lancé un mode d'apprentissage socratique : Claude Learning mode (avril 2025, Claude for Education, utilisable dans les Projects), ChatGPT Study mode (juillet 2025, gratuit sur tous les plans), Gemini Guided Learning (août 2025, avec schémas, vidéos et quiz). Ils procèdent par questions guidées et vérifications de compréhension, à des degrés de rigueur différents.
- **Marche** : cela légitime l'approche « guide, ne fait pas à la place ».
- **Ne marche pas** : l'élève **peut sortir du mode en un clic** et obtenir la réponse ; le mode n'est pas ancré dans le cours ; aucun adulte n'est impliqué ; la plupart de ces services grand public ne sont pas destinés aux moins de 13 à 18 ans.
- **À reprendre** : (1) les **vérifications de compréhension** en fin d'explication (« reformule avec tes mots ») ; (2) le principe de **« Projects »** : un espace par chapitre avec ses documents et l'historique ; (3) des **modes explicites et nommés** (Explique / Entraîne-moi / Vérifie ma réponse / Prépare le contrôle) affichés en haut du chat.
- **IABNE peut faire mieux** : le mode est **paramétré par le professeur** (ex. « pas de correction complète avant la date de rendu du devoir ») et lié au calendrier École Directe. C'est un différenciateur fort : l'IA sait qu'un devoir est à rendre demain et refuse de le faire, tout en aidant sur la méthode.

#### Century Tech (Royaume-Uni) / Squirrel AI (Chine)
- **Remarquable** : des **graphes de connaissances** très fins (Squirrel découpe les mathématiques en milliers de « knowledge points »). Un diagnostic initial, puis un **parcours adaptatif** qui remonte aux prérequis manquants. Century propose des « nuggets » (micro-leçons), un tableau de bord prof avec des groupes d'intervention suggérés.
- **Marche** : la remédiation sur les prérequis, avec des gains mesurés dans certaines études (Squirrel, études financées par l'entreprise **[prudence]**).
- **Ne marche pas** : le contenu est fermé et coûteux à produire ; l'expérience est très mécanique et l'élève est isolé ; Squirrel est critiqué pour une logique de « bachotage ».
- **À reprendre** : (1) un **graphe de notions par cours**, extrait par l'IA du découpage en chapitres puis **validé par le prof** ; (2) la **remontée aux prérequis** (« tu bloques sur les dérivées, vérifions d'abord les limites, vues au chapitre 2 ») ; (3) des **groupes de besoin suggérés au prof** (« 6 élèves ont des difficultés sur la notion X : proposer une séance de remédiation »).
- **IABNE peut faire mieux** : le graphe vient des cours réels de l'établissement, avec un coût de production quasi nul pour le prof.

### C. Révision, mémorisation, entraînement

#### Quizlet (Learn, Magic Notes ; Q-Chat retiré)
- **Remarquable** : des cartes mémoire massivement utilisées par les élèves ; **Magic Notes** transforme des notes en cartes, quiz et résumés ; le mode **Learn** est adaptatif ; le mode **Live** est un jeu en équipes en classe. **Q-Chat**, le tuteur conversationnel, a été **retiré fin juin 2025** (sans explication détaillée de Quizlet).
- **Marche** : la création de cartes en un clic, le partage entre élèves et les sets existants.
- **Ne marche pas** : de nombreuses fonctions sont devenues payantes (la colère des élèves en 2022-2023 a été très visible) ; les sets communautaires contiennent des erreurs ; le retrait de Q-Chat suggère que le chat générique ajoutait peu de valeur.
- **À reprendre** : (1) des **cartes mémoire générées depuis le chapitre**, éditables par l'élève ; (2) le **partage de sets dans un groupe de travail** ; (3) un **jeu « Live » en équipes** en classe.
- **IABNE peut faire mieux** : les cartes viennent des cours du prof, ce qui évite les erreurs communautaires, et l'outil est gratuit pour l'élève. **Leçon de Q-Chat** : un chat seul ne suffit pas, il faut des activités structurées autour.

#### Anki (révision espacée)
- **Remarquable** : les algorithmes SM-2 puis **FSRS** (intégré depuis 2023) optimisent les intervalles de répétition. C'est la référence des étudiants en médecine.
- **Marche** : une efficacité prouvée par la recherche sur la mémoire (effet d'espacement, récupération active).
- **Ne marche pas** : une interface austère, l'effet « tas de cartes en retard » qui décourage, et rien n'est fait pour les collégiens.
- **À reprendre** : (1) **FSRS** (code libre) pour les cartes et les notions ; (2) un **plafond quotidien** et un « mode rattrapage » pour éviter la montagne de retard ; (3) les révisions espacées **injectées dans le planificateur** (c'est déjà dans le « reste à faire »).
- **IABNE peut faire mieux** : un espacement **calé sur la date du contrôle** connue via École Directe (« réviser pour le 14 », pas seulement « pour toujours »).

#### Kahoot! / Blooket / Gimkit
- **Remarquable** : des quiz en direct très ludiques en classe ; Kahoot a ajouté un générateur IA de quiz depuis un PDF ou une URL.
- **Marche** : l'énergie en classe, l'ouverture ou la fin de séance.
- **Ne marche pas** : la vitesse prime sur la réflexion ; les élèves lents sont exclus ; le contenu est peu approfondi.
- **À reprendre** : un **quiz live en classe** généré depuis le chapitre, avec un **mode « précision » sans chrono** et des équipes ; le résultat alimente les agrégats « notions à revoir ».

#### Duolingo (mécaniques de motivation)
- **Remarquable** : séries (streaks), « gel de série », ligues, XP, objectifs quotidiens, notifications très efficaces, Duolingo Max (explications d'erreurs, appel vidéo IA).
- **Marche** : la rétention quotidienne est exceptionnelle.
- **Ne marche pas** : des mécaniques **addictives et culpabilisantes** (le hibou), une optimisation de la série plutôt que de l'apprentissage, des ligues stressantes pour certains. Pour des mineurs, c'est un risque éthique et un conflit avec le « droit à la déconnexion ».
- **À reprendre (version saine)** : (1) une **série hebdomadaire** plutôt que quotidienne (« 3 séances cette semaine »), avec **pause automatique** pendant les vacances et le shabbat et les fêtes (pertinent pour Yabné) ; (2) des **objectifs choisis par l'élève** ; (3) une **progression visible par notion** (barres de maîtrise) plutôt que des XP ; (4) des **défis de groupe coopératifs** (le groupe atteint un objectif commun) plutôt que des classements individuels.
- **IABNE peut faire mieux** : pas de classement public, pas de notifications culpabilisantes, aucune notification le soir et pendant le shabbat.

#### Kwyk (France)
- **Remarquable** : des exercices de mathématiques, français et physique **générés avec des valeurs aléatoires**, corrigés automatiquement, que le prof assigne en devoir. Très répandu dans les collèges et lycées français, avec un abonnement établissement.
- **Marche** : chaque élève a ses propres nombres (copier sur le voisin est inutile), l'entraînement est illimité et le suivi prof est clair.
- **Ne marche pas** : la saisie des réponses mathématiques est parfois pénible (format attendu) ; les retours sont peu explicatifs.
- **À reprendre** : (1) des **exercices paramétrés** (« même exercice que le n°4 du prof, autres valeurs »), avec une correction vérifiée par calcul ; (2) un **devoir d'entraînement assigné** par le prof dans IABNE, distinct du devoir officiel.
- **IABNE peut faire mieux** : les exercices viennent du style du prof et l'erreur est expliquée par l'IA.

#### Labomep (Sésamath)
- **Remarquable** : une plateforme **gratuite et associative** de Sésamath, des parcours d'exercices interactifs en mathématiques et un bilan par élève. Très utilisée au collège.
- **Marche** : gratuite, faite par des profs, alignée sur le programme français.
- **Ne marche pas** : une interface vieillissante.
- **À reprendre** : des **liens vers les ressources libres** (manuels Sésamath sous licence libre) dans le Médiacentre interne ; une logique de **parcours** (une suite d'activités) que le prof compose.

#### Lalilo (primaire, Renaissance)
- **Remarquable** : la lecture adaptative en CP-CE1, un tableau de bord prof avec des groupes de compétences, la reconnaissance vocale.
- **Marche** : des groupes de besoin automatiques pour le prof.
- **À reprendre** : des **groupes de besoin générés automatiquement** (voir Century). Lalilo étant au primaire, son apport pour IABNE se limite surtout à la 6e et aux élèves en difficulté de lecture.

#### MIA Seconde (Éducation nationale, avec EvidenceB)
- **Remarquable** : une IA de **remédiation** en français et en mathématiques pour les élèves de seconde, avec environ 20 000 exercices adaptatifs répartis sur 24 modules, accessibles via le Médiacentre de l'ENT, sur smartphone. Coût annoncé de 2,8 M EUR sur 3 ans (Next). Pas de bilan national chiffré trouvé ; une évaluation académique est prévue avec restitution en 2026 **[à vérifier]**. Le ministère pousse plus largement des outils d'IA « souverains » pour les enseignants (ex. assistant IA pour les profs annoncé pour 2025-2026 **[à vérifier]**).
- **Marche** : un cadre institutionnel, la conformité RGPD, la gratuité et un ciblage sur les fondamentaux.
- **Ne marche pas** : une adoption inégale (usage « à la maison » peu suivi), des exercices déconnectés de ce que fait le prof en classe, et il faut aller dans l'ENT.
- **À reprendre** : (1) un **test de positionnement** de rentrée par matière (court, 10 minutes) ; (2) un **lien direct** vers MIA depuis IABNE pour les élèves de seconde.
- **IABNE peut faire mieux** : la remédiation porte sur *le* cours du prof, au moment où il est enseigné.

#### Pix
- **Remarquable** : la certification nationale des compétences numériques (obligatoire en 3e et en terminale), des tests adaptatifs, des « campagnes » créées par le prof, et **Pix+ / modules IA** (sensibilisation à l'IA générative) **[à vérifier : modules IA 2024-2025]**.
- **À reprendre** : (1) un **parcours « bien utiliser l'IA »** dans IABNE (charte, limites, citation des sources, hallucinations) qui conditionne l'accès complet ; (2) une évaluation **adaptative** en début de chapitre.

### D. Aide aux devoirs « réponse immédiate » (les contre-modèles)

#### Photomath (Google) / Gauth (ByteDance) / Brainly / Socratic (Google)
- **Remarquable** : on photographie l'exercice et on obtient la solution pas à pas. Brainly est une communauté de questions-réponses avec une IA en complément. Socratic a été intégré à Google Lens et ses fonctions reprises par Gemini **[à vérifier : fin de l'appli autonome]**. Gauth est très populaire et en forte croissance chez les ados.
- **Marche** : l'élève bloqué le soir obtient une réponse immédiate ; la reconnaissance d'image est excellente ; les étapes détaillées sont utiles quand l'élève les lit vraiment.
- **Ne marche pas** : c'est massivement utilisé pour **copier les devoirs** ; l'apprentissage est nul si l'élève recopie ; Brainly contient des réponses fausses ; Gauth pose une question de données (ByteDance) ; les profs français s'en plaignent beaucoup.
- **À reprendre** : (1) la **photo d'un exercice** (OCR et vision) comme point d'entrée du tuteur. C'est indispensable, car c'est le geste naturel de l'élève ; (2) l'affichage **pas à pas** avec dévoilement progressif.
- **IABNE peut faire mieux** : même geste, mais avec l'aide progressive et en se reliant au cours (« c'est la méthode vue le 12 octobre, page 3 du cours de Mme X »). Si l'exercice est un devoir en cours, il propose indices et méthode, pas la solution.

### E. Organisation et groupes d'étude

#### Notion (étudiants) / Notion AI
- **Remarquable** : des templates d'étudiant (tableau de bord des matières, tracker de devoirs, Cornell notes), des bases de données, des pages partagées et une IA qui résume. Très populaire auprès des lycéens « productivité » sur TikTok.
- **Ne marche pas** : la page blanche intimide ; il faut du temps de configuration ; c'est surtout utilisé par les élèves déjà organisés.
- **À reprendre** : (1) des **notes personnelles de l'élève** attachées au chapitre (prise de notes Cornell guidée), que l'IA peut utiliser **avec son accord** ; (2) un **tableau de bord** « ma semaine » prêt à l'emploi, sans configuration.

#### Discord / StudyTogether / StudyStream / Fiveable
- **Remarquable** : **StudyTogether** est un énorme serveur Discord avec des salons vocaux « caméra allumée, micro coupé », des minuteurs Pomodoro et des classements d'heures. **StudyStream** propose des salles « focus » en vidéo et des statistiques. **Fiveable** (AP aux États-Unis) mise sur des guides par unité, des **lives de révision**, des cram sessions et une communauté par matière.
- **Marche** : la **co-présence** (« body doubling ») aide à se concentrer ; le sentiment de communauté ; les révisions collectives la veille de l'examen.
- **Ne marche pas** : pour des mineurs, **Discord n'est pas acceptable** (inconnus, modération, contenus) ; les classements d'heures poussent au surmenage ; c'est distrayant.
- **À reprendre (crucial pour la demande « groupes de travail »)** : (1) des **groupes de travail créés par les élèves**, limités à l'établissement, avec un nombre plafonné de membres ; (2) des **salles de travail silencieuses** avec un minuteur Pomodoro partagé (« 4 camarades révisent maintenant »), sans vidéo, ou avec vidéo seulement si l'établissement l'autorise ; (3) des **sessions de révision collectives** planifiées avant un contrôle (le groupe s'inscrit sur un créneau commun, et le planificateur le propose) ; (4) une **IA du groupe** qui génère un quiz commun, répartit les chapitres à résumer et anime un « quiz battle » coopératif.
- **IABNE peut faire mieux** : un espace fermé, modéré et relié aux cours : le groupe « Maths 1re B » partage les cours de Mme X et son IA.

---

## 2. Synthèse par thème : ce que le marché enseigne

| Thème | Ce que fait le marché | Lacune exploitable par IABNE |
|---|---|---|
| Ancrage sur les sources | NotebookLM, Gems et Projects le font, mais pour des documents isolés | Corpus officiel du prof, versionné, avec profil pédagogique validé |
| Socratisme | Les trois grands modes d'étude sont contournables en un clic | Mode paramétré par le prof et lié aux échéances École Directe |
| Exactitude | Khanmigo a fait des erreurs en mathématiques | Calcul vérifié par un outil, abstention, citations |
| Groupes | ENT trop administratifs, Discord dangereux | Groupes fermés, modérés, avec une IA commune ancrée dans les cours |
| Motivation | Duolingo addictif, Pronote anxiogène | Motivation saine : séries hebdomadaires, coopératives, pauses de shabbat et de vacances |
| Admin | Pronote et École Directe sont puissants mais lourds | Import CSV depuis École Directe, passage d'année en un assistant |
| Parents | Pronote : notifications de notes en temps réel | Synthèse hebdomadaire sobre, sans accès aux conversations |
| Remédiation | MIA, Century, Squirrel : contenu générique | Graphe de notions issu des cours du prof, groupes de besoin suggérés |

---

## 3. Liste consolidée : 46 idées de fonctionnalités

Légende de la cible : É = élève, P = professeur, A = administration, Pa = parent, G = groupe, D = direction, CPE = vie scolaire.
Priorité : **P0** = indispensable au déploiement pilote ; **P1** = première année ; **P2** = plus tard ; **LT** = long terme. Effort : **S** = quelques jours, **M** = 1 à 3 semaines, **L** = plus d'un mois.

### Administration (la priorité exprimée par l'utilisateur)

| # | Idée | Inspiration | Cible | Valeur | Prio | Effort |
|---|---|---|---|---|---|---|
| 1 | **Import CSV / tableur** des élèves, profs, classes et affectations, avec aperçu, détection des doublons et rapport d'erreurs | Pronote / École Directe (import de bases), ENT (annuaire) | A | Évite des centaines de saisies à la rentrée | P0 | M |
| 2 | **Import depuis École Directe** de la structure (classes, élèves, profs) par un compte admin, si l'API le permet **[à vérifier]** | École Directe | A | Une seule source de vérité | P1 | M |
| 3 | **Assistant de passage d'année** : archiver l'année, faire monter les élèves de niveau, recréer les classes, reconduire les affectations, garder les cours du prof réutilisables | Pronote (initialisation d'année) | A | Opération annuelle critique, sinon tout est à refaire | P0 | L |
| 4 | **Modifier, supprimer, transférer** classes, matières et affectations ; changer un élève de classe en cours d'année, avec historique | Tous les ENT | A | Comble un manque constaté dans le code | P0 | M |
| 5 | **Tableau de bord admin** : comptes actifs, jamais connectés, classes sans prof, cours sans document, coûts IA, santé de l'API École Directe | Google Admin, Microsoft Insights | A, D | Pilotage et repérage des trous | P0 | M |
| 6 | **Rôles additionnels** : direction (indicateurs globaux en lecture), CPE (alertes de sécurité, groupes), professeur principal (vue de sa classe), parent | Pronote (profils multiples) | A | Respecte l'organisation réelle d'un établissement | P1 | M |
| 7 | **Suppression et export RGPD complets** d'une identité (conversations, mémoire, fiches, tentatives), avec journal | Exigence RGPD, CNIL | A, É, Pa | Obligation légale pour des mineurs | P0 | M |
| 8 | **Politique de rétention** paramétrable (ex. conversations purgées après N mois, archives de fin d'année) | Google / Microsoft (rétention) | A | Minimisation des données | P1 | S |
| 9 | **Journal d'audit** des actions sensibles (création de comptes, changements de droits, exports) | Outils d'entreprise | A, D | Traçabilité et sécurité | P1 | S |
| 10 | **Mails transactionnels et premier accès** : lien d'activation et mot de passe oublié avec validation de l'admin, ou génération de **fiches de connexion imprimables** par classe | Pronote / ÉduConnect (courriers d'identifiants) | A | Rentrée sans file d'attente au secrétariat | P0 | S |
| 11 | **SSO** (Google ou Microsoft de l'établissement, ou ÉduConnect si possible) | ENT | A, É | Une connexion de moins | LT | L |
| 12 | **Charte IA à accepter** à la première connexion (élève et parent pour les mineurs), versionnée | Pix (sensibilisation IA), Khanmigo | A, É, Pa | Cadre éthique et consentement | P0 | S |
| 13 | **Quotas et coûts IA** par classe ou par élève, avec plafonds et alertes | MagicSchool / Copilot (licences) | A | Maîtrise budgétaire | P1 | S |

### Groupes de travail (la deuxième priorité exprimée)

| # | Idée | Inspiration | Cible | Valeur | Prio | Effort |
|---|---|---|---|---|---|---|
| 14 | **Groupes de travail créés par les élèves** : nom, matière, invitation de camarades de l'établissement, nombre plafonné de membres, règles de visibilité (même classe ou même niveau par défaut), politique de validation réglable par l'admin | ENT (communautés), Discord (serveurs) | É, G, A | Répond directement à la demande | P0 | M |
| 15 | **Mur ou fil du groupe** avec messages texte, partage de fiches, quiz et documents ; **modération** (signalement, filtre de contenus, droit de regard du CPE sur signalement uniquement) | ENT, Discord | G, CPE | Collaboration encadrée, adaptée aux mineurs | P0 | M |
| 16 | **IA du groupe** : elle connaît les cours des matières du groupe et peut générer un quiz commun, répartir les chapitres à résumer entre les membres ou expliquer à tous | NotebookLM (notebook partagé), Fiveable | G | Rend le groupe utile, pas seulement social | P1 | M |
| 17 | **Sessions de révision collectives** : proposer un créneau commun (calcul sur les emplois du temps École Directe), inscription, rappel | Fiveable (cram sessions), Doodle | G | Révision ensemble avant le contrôle | P1 | M |
| 18 | **Salle de travail silencieuse** : minuteur Pomodoro partagé, présence « 4 camarades travaillent », sans vidéo par défaut | StudyTogether, StudyStream | G, É | Co-présence motivante, sans risque | P1 | S |
| 19 | **Quiz battle coopératif** : le groupe affronte le quiz, avec un score collectif et des explications après chaque question | Kahoot, Quizlet Live | G | Ludique sans stigmatiser | P2 | M |
| 20 | **Groupes créés par le prof** (TP, exposés, groupes de besoin) avec un espace de rendu commun | Teams / Classroom | P, G | Projets et exposés | P1 | M |
| 21 | **Tutorat entre pairs** : un élève volontaire (ex. de terminale) aide un élève plus jeune ; le jumelage est validé par un adulte | Brainly (version encadrée), dispositifs de tutorat | É, CPE | Entraide et valorisation | P2 | M |

### Élève : apprentissage et révision

| # | Idée | Inspiration | Cible | Valeur | Prio | Effort |
|---|---|---|---|---|---|---|
| 22 | **Photo d'un exercice** (OCR et vision) comme point d'entrée du tuteur, avec rattachement automatique au chapitre | Photomath, Gauth | É | Geste naturel de l'élève ; capte l'usage qui partirait vers Gauth | P0 | M |
| 23 | **Garde-fou « devoir en cours »** : si l'exercice ressemble à un devoir École Directe non échu, l'IA donne indices et méthode, mais pas la solution (réglable par le prof) | Différenciateur propre ; constat sur Gauth et les modes d'étude | É, P | Intégrité scolaire crédible | P0 | M |
| 24 | **Modes explicites** affichés dans le chat : Explique / Entraîne-moi / Vérifie ma réponse / Prépare le contrôle | Claude Learning mode, ChatGPT Study mode, Gemini Guided Learning | É | L'élève sait ce qu'il obtient | P0 | S |
| 25 | **Vérification de compréhension** en fin d'explication (« reformule », mini-question) | Modes d'étude | É | Apprentissage actif | P1 | S |
| 26 | **Cartes mémoire avec révision espacée FSRS**, générées depuis le chapitre, avec un plafond quotidien et un mode rattrapage, calées sur la date du contrôle | Anki, Quizlet | É | Mémorisation prouvée par la recherche | P0 | M |
| 27 | **Barres de maîtrise par notion** : graphe de notions extrait du cours et validé par le prof | Century, Squirrel, Khan (mastery) | É, P | Progression visible et motivante | P1 | L |
| 28 | **Remontée aux prérequis** : quand l'élève bloque, l'IA vérifie une notion antérieure (chapitre ou niveau précédent) | Squirrel AI, Century | É | Remédiation profonde | P1 | M |
| 29 | **Exercices paramétrés** (« même exercice, autres valeurs »), avec une solution vérifiée par calcul (moteur symbolique) | Kwyk | É | Entraînement illimité et fiable | P1 | M |
| 30 | **Calcul vérifié par un outil** dans toutes les réponses chiffrées (sandbox Python / SymPy) | Leçon des erreurs de Khanmigo | É, P | Évite l'erreur qui détruit la confiance | P0 | M |
| 31 | **Résumé audio d'un chapitre** (TTS), à écouter dans les transports | NotebookLM Audio Overviews | É | Accessibilité, DYS, nomades | P2 | S |
| 32 | **Carte mentale** générée depuis le chapitre, exportable | NotebookLM Mind Map | É | Vue d'ensemble | P1 | S |
| 33 | **Entraînement à l'oral** (Grand oral, exposés, langues) : enregistrement, transcription, retour sur structure, rythme et mots parasites selon la grille du prof | Microsoft Speaker Progress | É | Épreuve du bac peu outillée | P2 | L |
| 34 | **Test de positionnement** de début d'année ou de chapitre (10 minutes, adaptatif) | MIA Seconde, Pix | É, P | Parcours adapté dès le départ | P2 | M |
| 35 | **Notes personnelles de l'élève** par chapitre (Cornell guidé), utilisables par l'IA si l'élève l'accepte | Notion | É | Appropriation, mémoire du tuteur | P2 | M |
| 36 | **Motivation saine** : série hebdomadaire, objectifs choisis, pause automatique pendant le shabbat, les fêtes et les vacances, aucun classement public, aucune notification le soir | Duolingo (version éthique), Pronote (déconnexion) | É | Régularité sans addiction | P1 | S |
| 37 | **Météo de l'élève** (check-in de ressenti sur un chapitre ou la semaine) : agrégats côté prof, alerte CPE seulement en cas de détresse | Microsoft Reflect, SchoolAI | É, P, CPE | Bien-être, signaux faibles | P2 | S |
| 38 | **Détection de détresse** dans les conversations, avec redirection vers un adulte référent et des numéros d'aide (3018, 3114), sans exposer le reste de l'échange | Khanmigo, SchoolAI (alertes de sécurité) | É, CPE | Devoir de protection des mineurs | P0 | M |

### Professeur

| # | Idée | Inspiration | Cible | Valeur | Prio | Effort |
|---|---|---|---|---|---|---|
| 39 | **Salles IA configurées par le prof** : activité ciblée (consignes, chapitre, niveau d'aide, durée, ouverture et fermeture) | MagicSchool Rooms, SchoolAI Spaces, Gems | P, É | Le prof oriente l'IA vers son objectif | P1 | M |
| 40 | **Mode séance en classe** : tableau de bord en direct des blocages agrégés pendant une activité | SchoolAI Mission Control | P | Pilotage en classe sans surveillance individuelle | P2 | M |
| 41 | **Groupes de besoin suggérés** à partir des agrégats de notions, avec une proposition de séance de remédiation (règle des 5 élèves respectée, liste nominative seulement si le cadre est validé) | Century, Lalilo | P | Différenciation concrète | P1 | M |
| 42 | **Brouillon d'annotation de copies** aligné sur le barème appris et validé du prof (le prof reste le correcteur) | Brisk, MagicSchool | P | Gain de temps majeur | P1 | L |
| 43 | **Recettes de l'atelier** : mail aux parents, adaptation DYS ou FALC, consignes reformulées, grille critériée, questions sur une vidéo, toujours depuis le corpus du prof | MagicSchool, Copilot Teach | P | Adoption rapide par les profs | P1 | S |
| 44 | **Quiz live en classe** généré depuis le chapitre, avec un mode « précision » sans chrono et des équipes | Kahoot, Quizlet Live | P, É | Engagement en classe, données de notions | P2 | M |
| 45 | **Bibliothèque de ressources externes validées** (Lumni, Sésamath, MIA, Pix) par chapitre | Médiacentre des ENT | P, É | Une porte d'entrée unique | P2 | S |

### Parents et direction

| # | Idée | Inspiration | Cible | Valeur | Prio | Effort |
|---|---|---|---|---|---|---|
| 46 | **Synthèse hebdomadaire parent** (temps de révision, régularité, chapitres travaillés), sans conversations ni notes, avec l'opt-in de l'élève au lycée | Pronote (l'inverse de ses notifications), Khanmigo parents | Pa | Implique sans surveiller | P2 | M |
| 47 | **Indicateurs de direction** : adoption par classe et par matière, notions difficiles à l'échelle d'un niveau, aucune donnée individuelle | Education Insights | D | Pilotage pédagogique (vision LT du cahier des charges) | P2 | M |
| 48 | **Préparation du conseil de classe** : synthèse agrégée de l'investissement sur IABNE, à valider par le prof principal **[à manier avec prudence : ne pas transformer l'usage de l'IA en note de comportement]** | Pronote (conseils) | P, D | Gain de temps | LT | M |

---

## 4. Positionnement différenciant d'IABNE (5 lignes)

1. **La seule IA qui parle comme *ton* prof** : ancrée dans les cours, corrigés et barèmes réels de l'établissement, avec citations, contrairement à Khanmigo, MagicSchool ou ChatGPT qui restent génériques.
2. **Un socratisme piloté par l'adulte et le calendrier** : l'IA sait via École Directe qu'un devoir est à rendre et aide sur la méthode sans faire à la place, alors que les modes d'étude grand public se contournent en un clic.
3. **Privée par conception, adaptée aux mineurs** : établissement unique, hébergement en Europe, mémoire contrôlée par l'élève, agrégats à partir de 5 élèves, alertes de sécurité seulement, et aucune dépendance à Google, Microsoft ou ByteDance.
4. **Apprendre ensemble, en sécurité** : des groupes de travail fermés et modérés avec une IA commune et des sessions de révision collectives, une version sûre de StudyTogether et Discord.
5. **Une couche pédagogique, pas un Pronote de plus** : pas de notes officielles ni d'absences, une motivation saine (déconnexion, respect du shabbat, aucun classement) et une administration qui tient en un import et un assistant de rentrée.

---

## 5. Pièges observés chez les concurrents, à éviter

1. **Erreurs factuelles et de calcul** (Khanmigo) : une seule erreur visible ruine la confiance des profs. Il faut un calcul par outil, l'abstention et des citations obligatoires.
2. **Socratisme rigide et frustrant** (critiques de Khanmigo) : l'élève fuit vers Gauth. Il faut une aide graduée que l'élève choisit, et une correction complète accessible après un effort ou après l'échéance.
3. **Chat seul, sans activités structurées** (Q-Chat retiré en 2025) : il faut des quiz, cartes, fiches, salles et groupes autour du chat.
4. **Gamification addictive ou culpabilisante** (séries quotidiennes, ligues, notifications à la Duolingo) : conflit avec le droit à la déconnexion et avec le shabbat.
5. **Anxiété liée aux notifications** (Pronote) : pas de push nocturne, et des synthèses plutôt que du temps réel.
6. **Surveillance perçue** (SchoolAI, Khanmigo avec historique visible par le prof, Brisk avec relecture de frappe) : la confiance des élèves s'effondre et ils n'osent plus poser de « questions bêtes ». IABNE doit garder les agrégats et les alertes de sécurité ciblées, et le dire clairement.
7. **Catalogue d'outils génériques** (MagicSchool) : quantité plutôt que qualité, avec des sorties à réécrire. Mieux vaut peu de recettes, toutes ancrées dans le corpus.
8. **Paywall progressif** (Quizlet) : il a provoqué la colère des élèves. Le modèle doit être payé par l'établissement et gratuit pour l'élève, sans fonction premium.
9. **Dépendance à une API non officielle** (clients tiers d'École Directe cassés) : prévoir un mode dégradé (saisie manuelle des devoirs, import iCal) et une surveillance de la synchronisation.
10. **Faible adoption des ENT** : un outil que l'on ouvre par obligation meurt. Il faut une valeur immédiate au premier usage (la photo d'un exercice, puis une aide dans le style du prof), une appli mobile rapide et des profs ambassadeurs.
11. **Contenu déconnecté de la classe** (MIA Seconde, Century) : la remédiation générique est ignorée. IABNE doit suivre la progression réelle du prof (chapitre en cours).
12. **Communautés non modérées** (Discord, Brainly) : harcèlement, inconnus, réponses fausses. Il faut des groupes intra-établissement, un signalement, l'intervention du CPE et des règles claires.
13. **Classements publics de temps de travail** (StudyTogether) : ils poussent au surmenage et stigmatisent. Il faut des objectifs coopératifs.
14. **Transferts de données hors UE et âge minimum** (Gemini, ChatGPT, Gauth) : vérifier les DPA du fournisseur de LLM (zéro rétention, région UE si possible) et documenter l'AIPD pour les mineurs.

---

## Sources consultées (recherches web de novembre 2026)

- MIA Seconde : [Eduscol](https://eduscol.education.gouv.fr/6693/mia-seconde-une-approche-personnalisee-de-la-remediation-en-francais-et-en-mathematiques), [Académie de Paris](https://www.ac-paris.fr/mia-seconde-un-service-numerique-de-remediation-en-francais-et-en-mathematiques-131013), [Next (coût)](https://next.ink/133921/mia-la-nouvelle-ia-de-leducation-nationale-coute-28-millions-deuros-sur-3-ans/), [Évaluation, académie de Martinique](https://site.ac-martinique.fr/drane/wp-content/uploads/sites/100/2024/09/Evaluation-MIA-Seconde-1.pdf)
- Pronote : [Acteurs publics, déconnexion rentrée 2025](https://acteurspublics.fr/articles/le-logiciel-pronote-mise-sur-la-deconnexion-numerique-pour-la-rentree-2025/), [Made in Marseille](https://madeinmarseille.net/168708-avec-18-millions-dutilisateurs-le-createur-marseillais-de-pronote-fleuron-du-numerique/)
- Skolengo : [Nouveautés rentrée 2026](https://www.skolengo.com/nouveautes-rentree-2026)
- Modes d'étude : [TechCrunch, Gemini Guided Learning](https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/), [Pearson](https://pearson.com/international-schools/international-schools-blog/2026/02/what-is-gemini_s-guided-learning-and-chatgpts-study-mode-.html), [Glasp, comparatif](https://glasp.ai/articles/ai-study-modes-compared)
- Khanmigo : [DEV Community](https://dev.to/max_quimby/khanmigo-was-a-non-event-whats-next-for-ai-tutors-376k), [Spokesman (tests en classe)](https://www.spokesman.com/stories/2023/jul/15/in-classrooms-teachers-put-ai-tutoring-bots-to-the)
- Google : [Guide admin Gemini/NotebookLM](https://services.google.com/fh/files/misc/gfe_gemini_notebooklm_admin_enablement_guide.pdf), [Workspace Admin Help](https://knowledge.workspace.google.com/admin/getting-started/editions/quickstart-guide-to-gemini-and-notebooklm-for-education?hl=en), [eWeek, study notebooks dans Classroom](https://www.eweek.com/news/gemini-study-notebooks-classroom/)
- Microsoft : [THE Journal](https://thejournal.com/articles/2025/07/01/microsoft-launches-ai-tools-for-educators.aspx?p=1), [Microsoft Tech Community, bilan de l'année](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/education-a-year-in-review-with-ai-powered-learning-tools/4476569)
- Quizlet Q-Chat : [Quizgecko (retrait)](https://quizgecko.com/fr/blog/best-q-chat-alternative), [AI Tools Atlas](https://aitoolsatlas.ai/tools/quizlet-ai)
- Les autres fiches (MagicSchool, Brisk, SchoolAI, Century, Squirrel, Anki/FSRS, Kahoot, Duolingo, Kwyk, Labomep, Lalilo, Pix, Photomath, Gauth, Brainly, Socratic, Notion, StudyTogether, StudyStream, Fiveable) reposent sur des connaissances générales. Les points précis marqués **[à vérifier]** sont à confirmer avant toute communication externe.
