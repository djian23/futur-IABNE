# Personas 03 : professeurs qui comprennent peu ou sont réticents

Simulation d'usage d'IABNE (Yabné Paris) par 8 enseignants peu à l'aise ou hostiles. Les blocages s'appuient sur le code réel du dépôt `futur-IABNE` (état constaté le 6 novembre 2026), sans modification du dépôt.

## Rappel : ce que le professeur voit réellement

Je vérifie d'abord le parcours réel, parce que la plupart des blocages en découlent :

- **Menu** (`src/main.jsx` l. 202-214) : « Vue d'ensemble », « Mes cours », « Assistant pédagogique », « Entraînement », « Atelier IA », « Mon organisation », « Mon compte », « Suivi pédagogique ». Le professeur voit aussi « Entraînement » et « Mon organisation », qui sont des écrans pour les élèves.
- **Accueil prof** : bandeau « Préparer, adapter, faire apprendre. » avec le bouton « Ouvrir mon atelier IA ». Trois compteurs : « Cours accessibles », « Documents publiés », « Classes accessibles ».
- **Dépôt** (« Mes cours » > un cours > « Déposer un document ») :
  - champs Titre, Chapitre, Type (Cours / Exercice / Contrôle d'entraînement / Correction) et Fichier ;
  - formats acceptés : `.pdf,.docx,.txt` seulement (`main.jsx` l. 1147) ;
  - un fichier à la fois, 10 Mo maximum (`server/documents.mjs` l. 19) ; PDF de 100 pages maximum (`extraction-worker.mjs` l. 29) ;
  - pas d'OCR : « Un scan nécessite une extraction OCR externe » (`documents.mjs` l. 194) ;
  - **tout dépôt arrive en « Brouillon »** (`documents.mjs` l. 223) : il faut ensuite passer chaque document en « Publié » avec une liste déroulante. Tant que ce n'est pas fait, ni les élèves ni l'IA ne le voient.
- **Méthode du professeur** : un panneau replié « Personnaliser mon agent IA de professeur » (`src/TeacherMethod.jsx`). Il contient :
  - une zone de texte de consignes ;
  - le bouton « Analyser mes raisonnements et corrigés » ;
  - une case « J'ai vérifié ces méthodes et les valide… ».

  Relancer une analyse remet la validation à zéro (`setApproved(false)`). Les élèves voient en lecture seule « La méthode de [nom du professeur] », avec les consignes et l'analyse validée, dans leur « Assistant pédagogique » (`main.jsx` l. 1508).
- **Atelier IA** (`server/ai-recipes.mjs`) : « Préparer une séance de cours », « Différencier une activité », « Relire et améliorer un support », « Préparer une remédiation de classe », ainsi que des fiches et guides. Au-dessus se trouve l'agent « Mon assistant de préparation pédagogique » (sujet et corrigé séparés, « Déposer le sujet en brouillon »).
- **Suivi pédagogique** (`server/learning.mjs` l. 830) :
  - consultations, « Questions posées », « Participants IA », notions fréquentes et pistes issues des quiz ;
  - tout est masqué en dessous de 5 élèves ;
  - un professeur ne voit que les cours dont il est titulaire (`c.teacher_id === req.user.id`).
- **Côté élève** :
  - « Correction expliquée » est un mode toujours disponible (`learning.mjs` l. 500), et le professeur n'a aucun réglage pour le restreindre ;
  - l'élève peut générer lui-même des « Contrôle d'entraînement » « dans le style de votre professeur » (`PracticeAgent.jsx`) ;
  - le professeur ne voit jamais ces générations.
- **Signalement** : le bouton « Signaler cette réponse » envoie le message à `POST /api/ai/reports` (`learning.mjs` l. 793). **Aucune route ni aucun écran ne permet de relire ces signalements**, ni pour le professeur ni pour l'administrateur.
- **Recherche des sources (RAG)** : elle découpe les mots avec `/[a-z0-9]{3,}/` (`learning.mjs` l. 38) après suppression des diacritiques. **Un mot hébreu ou araméen produit zéro terme**. Une question en hébreu ne retrouve donc aucun fragment, même si le cours est en hébreu.
- **Un cours, un titulaire** : un seul professeur titulaire par cours (`server/auth.mjs` l. 24, `canManageCourse`). La méthode validée est liée à ce titulaire (`teacher-tutor.mjs` l. 36-39). L'écran d'administration ne permet pas de réaffecter un cours (`ajouts_equipe.md`, « Manque »).

---

## Persona 1 : Françoise, lettres, 61 ans, hostile à l'IA

### 1. Fiche

- **Matière** : Français, 3e et 1re (bac de français), 34 ans d'enseignement dont 19 à Yabné.
- **Numérique** :
  - Word 2010 sur un PC fixe à la maison, Outlook, École Directe pour les notes (qu'elle saisit le dimanche soir en râlant) ;
  - un iPhone offert par sa fille, utilisé pour les appels et WhatsApp.
- **Rapport à l'IA** :
  - « Ça va tuer la réflexion. On ne lit plus, on ne rédige plus. » ;
  - elle a vu des copies de commentaire « trop lisses », visiblement écrites par une IA, en 1re l'an dernier ;
  - elle est en colère qu'on lui demande de « nourrir la machine ».
- **Ce qu'elle veut vraiment** :
  - que ses élèves lisent les œuvres et apprennent à construire un paragraphe argumenté ;
  - que l'outil ne rédige jamais à leur place ;
  - ne pas passer pour une dinosaure en salle des profs.

### 2. Journal

**Première connexion (lundi de la rentrée de la Toussaint).**
> Le principal adjoint m'a donné un papier avec une adresse mail et un mot de passe de douze caractères impossible. Je l'ai tapé trois fois. Ensuite on me dit « Heureux de vous retrouver. » Je ne suis jamais venue. Sur l'accueil : « Préparer, adapter, faire apprendre », un livre dessiné, une petite étoile, « Un déclic, et tout s'éclaire. » On croirait une publicité de yaourt.
>
> « Ouvrir mon atelier IA » : je n'ai pas d'atelier, j'ai une salle 204. J'ai cliqué quand même. On me propose une « Fiche de révision », un « Guide de méthode pas à pas »… et un encadré « Mon assistant de préparation pédagogique » avec « Série d'exercices similaires », « Nombre de questions », « Total du barème proposé ». C'est fait pour les maths, ce truc.

**Semaine type.**
> Mardi, j'ai voulu voir ce que les élèves voient. Je suis allée dans « Assistant pédagogique ». Il y a quatre boutons : « Un indice », « La méthode », « Vérifier ma tentative », « Correction expliquée ». Correction expliquée ! Donc l'élève colle le sujet du commentaire de *La Princesse de Clèves* et la machine lui sort le commentaire. J'ai cherché où désactiver cela : rien. J'ai écrit au principal adjoint.
>
> Jeudi, ma collègue Myriam m'a montré qu'on peut écrire « ses consignes » dans « Personnaliser mon agent IA de professeur ». J'ai écrit : « Ne jamais rédiger de paragraphe à la place de l'élève. Ne jamais donner de plan tout fait. Poser des questions sur le texte. » Il a fallu cocher « J'ai vérifié ces méthodes et les valide ». Je ne sais pas si la machine obéira.

**Moment de crise : bac blanc de français, fin janvier.**
> Deux élèves de 1re me rendent la même problématique, mot pour mot, avec la même structure en trois axes. Ils me jurent que c'est « le tuteur du site » qui les a « aidés avec la méthode ». Je n'ai aucun moyen de voir ce que la machine leur a dit : « Pas d'accès général aux conversations individuelles. » Très bien pour la vie privée, mais alors à quoi je sers ? J'ai interdit le site en classe et je l'ai dit aux parents.

### 3. Blocages, agacements, contournements

- **Vocabulaire marketing et étranger au métier** : « Atelier IA », « Participants IA », « Un déclic », « VOTRE ESPACE POUR GRANDIR ». Ce ton infantilise une professeure expérimentée.
- **Formulaires pensés pour les sciences** : l'agent de préparation impose « Nombre de questions », « Durée prévue » et « Total du barème proposé ». Il n'existe ni format « commentaire », ni « dissertation », ni « oral du bac », ni « lecture analytique ».
- **Aucun réglage pédagogique sur l'aide** : le mode « Correction expliquée » est toujours là. Le prompt dit « Ne déroule pas tout le corrigé sauf demande explicite en mode solution » (`learning.mjs` l. 331), donc l'élève n'a qu'à choisir ce mode. Les consignes du professeur sont un simple texte, sans aucune garantie qu'elles l'emportent.
- **Ses consignes deviennent publiques** : ce qu'elle écrit apparaît chez les élèves sous « La méthode de Françoise L. ». Elle ne le savait pas et l'a découvert par un élève.
- **Dépôt** : ses vieux fichiers `.doc` (Word 97-2003) sont refusés sans explication claire (`accept=".pdf,.docx,.txt"`). Elle ne sait pas ce qu'est un « .docx ».
- **Brouillon par défaut** : elle a déposé un document et cru l'avoir publié. Rien n'est arrivé chez les élèves.
- **Ce qui la fait abandonner** : la copie identique au bac blanc, l'absence de contrôle sur la rédaction, et l'impression que l'outil est vendu contre son métier.

### 4. Ce qu'elle finirait par aimer

- Le bouton « Relire et améliorer un support » (`course_review`). Elle l'a testé, méfiante, sur sa fiche « Les registres ». Il a repéré une ambiguïté entre « registre » et « tonalité » et ne l'a jamais réécrite automatiquement (« Ne jamais modifier automatiquement un document publié »). « Comme un collègue pointilleux qui ne touche pas à ma copie. »
- La fiche de vocabulaire du commentaire générée à partir de *ses* cours, citée par source [S1] et [S2], sans rien d'extérieur.
- Des QCM de lecture cursive (« As-tu lu le chapitre 3 ? ») qu'elle n'a plus à fabriquer.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Je veux pouvoir dire : pas de rédaction à leur place, point. » | **Politique d'aide par cours** : le professeur active ou désactive chaque mode (indice, méthode, vérification, correction) ; option « interdire la production de paragraphes rédigés, de plans et de commentaires » appliquée côté serveur dans le prompt et vérifiée après génération. |
| « Mes consignes, ce ne sont pas leurs affaires. » | Séparer les **consignes privées à l'IA** des **consignes affichées aux élèves**, avec un aperçu « ce que voient vos élèves ». |
| « Où est la dissertation ? » | Des **formats littéraires** dans l'agent : commentaire, dissertation, contraction, essai, oral (lecture et grammaire), avec un barème par compétences plutôt qu'un nombre de questions. |
| « Mes .doc, mes .odt » | Accepter `.doc`, `.odt`, `.rtf` avec conversion automatique, et un message d'erreur qui dit quoi faire (« Enregistrez sous… Word .docx »). |
| « Montrez-moi au moins ce que la machine a dit sur MON sujet. » | **Journal d'usage anonymisé par devoir** : si un élève colle un énoncé correspondant à un devoir déclaré, le professeur voit un compteur (« 12 élèves ont demandé une correction expliquée sur ce sujet »), sans contenu nominatif. Il peut aussi déclarer un **sujet sensible** que l'IA refusera de traiter avant la date de remise. |
| « Un mode d'emploi papier » | Une **fiche A4 imprimable** « IABNE en 5 gestes » pour les professeurs. |

### Adoption la première semaine

- **Ce qui la ferait adopter** :
  - qu'on lui montre d'abord le **frein** avant l'accélérateur : « vous pouvez interdire la rédaction et la correction complète pour vos classes » ;
  - un seul usage concret et respectueux : « Relire et améliorer un support » et le QCM de lecture cursive.
- **Formation** :
  - un tête-à-tête de 30 minutes avec un collègue de lettres, pas avec le référent numérique ;
  - sur son propre cours ;
  - en commençant par « voici ce que voient vos élèves ».
- **Accompagnement** :
  - quelqu'un qui convertit ses `.doc` à sa place lors du premier dépôt ;
  - un passage de suivi après deux semaines.
- **Réglages de contrôle** : désactivation de « Correction expliquée », interdiction de la rédaction, consignes privées, sujets sensibles bloqués jusqu'à une date.

---

## Persona 2 : Gérard, histoire-géographie, 55 ans, tout sur papier

### 1. Fiche

- **Matière** : Histoire-géographie et EMC, 4e, 3e et 2nde.
- **Profil** :
  - 25 ans de classeurs ;
  - des cours manuscrits et photocopiés, des croquis de géographie au feutre ;
  - quelques documents « scannés » à la photocopieuse en 2014, de travers ;
  - des photos de pages prises au téléphone (Samsung A12) et envoyées par WhatsApp à lui-même.
- **Numérique** : PC portable de l'établissement en salle des profs ; à la maison, un PC partagé avec sa femme.
- **Rapport à l'IA** : curieux mais sceptique, « si elle sait lire mon écriture, chapeau ».
- **Ce qu'il veut** : que ses élèves de 3e révisent le brevet avec les repères chronologiques et les croquis qu'il attend.

### 2. Journal

**Première connexion.**
> J'ai voulu déposer mon cours sur la Première Guerre mondiale. « Fichier PDF, Word ou texte. » J'ai 47 photos JPG dans ma galerie. Le sélecteur de fichiers ne me les montre même pas. Mon fils m'a fait un PDF avec une appli. Je l'ai déposé : « Document illisible ou trop complexe. PDF : 100 pages maximum ; DOCX : 30 Mo décompressés. Un scan nécessite une extraction OCR externe. » OCR externe. Je fais quoi, je vais à la Fnac ?

**Semaine type.**
> J'ai retapé deux cours à la main dans Word le mercredi après-midi, trois heures. Je les ai déposés, un par un (pas moyen d'en mettre plusieurs). Le lendemain, mes élèves me disent qu'il n'y a rien. Ils étaient en « Brouillon ». Il faut changer une petite liste déroulante à droite de chaque document. Personne ne me l'avait dit.
>
> Pour le croquis « Les espaces productifs », l'assistant a répondu en recopiant la légende, sans le dessin. Normal, il n'y a pas de dessin dans un fichier texte. L'aperçu me prévient : « la mise en page originale n'est pas reproduite. »

**Moment de crise : la veille du brevet blanc.**
> Un élève me montre une fiche générée « Fiche de révision : la Guerre froide ». Elle est correcte mais elle s'arrête à 1962, parce que je n'ai retapé que la moitié du chapitre. L'élève croyait que c'était tout. Il y a bien une petite mention « non validées par le professeur », mais rien ne dit « ce chapitre est incomplet dans le logiciel ».

### 3. Blocages

- **Aucune image acceptée** : pas de JPG, de PNG ni de HEIC. Pas d'OCR intégré (`FEATURES.md`, « Limites connues »). Pour un professeur « papier », c'est **le** mur.
- **Pas de dépôt multiple** (`files: 1`) ni de dépôt depuis le téléphone pensé pour l'usage (« prendre en photo »).
- **Brouillon par défaut sans alerte** : aucun message « Ce document n'est pas encore visible par vos élèves. Publier maintenant ? ».
- **Message d'erreur technique** (« DOCX : 30 Mo décompressés ») sans solution proposée.
- **Croquis, cartes et frises** : pas d'analyse d'image. L'IA perd tout ce qui est visuel, alors que la géographie l'est.
- **Couverture du programme invisible** : aucun indicateur « ce chapitre contient 2 documents publiés sur environ 8 attendus ».
- **Contournement** : il demande à une élève déléguée de retaper ses cours. La délégation existe, l'élève dépose en brouillon (`main.jsx` l. 1164). Cela fait faire du travail de secrétariat à une élève de 3e.

### 4. Ce qu'il aime

- Les QCM sur les repères chronologiques, que les élèves font dans le bus.
- « Différencier une activité » sur l'étude de documents (soutien avec indices, standard, approfondissement) : « ça m'a fait gagner ma soirée ».
- Les sources [S1] cliquables : il voit de quel cours vient la réponse.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Je veux prendre mes pages en photo. » | **Dépôt photo multipage depuis le téléphone** : JPG, PNG, HEIC ; recadrage et redressement automatiques ; assemblage en un PDF ; ordre des pages modifiable. |
| « Qu'il lise mes scans. » | **OCR intégré** (texte imprimé, puis manuscrit) avec un écran « Vérifier le texte reconnu » à corriger avant publication ; indice de confiance par page. |
| « Mon croquis ! » | Conserver les **images d'un document** et les afficher dans l'aperçu et les fiches ; description assistée validée par le professeur. |
| « Pourquoi mes élèves ne voient rien ? » | Un choix explicite au dépôt : **« Publier tout de suite » ou « Garder en brouillon »** ; bandeau « 3 documents en brouillon, invisibles pour vos élèves ». |
| « Ils croient que c'est tout le chapitre. » | **Indicateur de couverture** par chapitre ; mention automatique sur les fiches : « Fondé sur 2 documents ; le chapitre peut être incomplet ». |
| « Mettez-en dix d'un coup. » | **Dépôt groupé** par glisser-déposer, avec chapitre et type affectés en lot. |

### Adoption la première semaine

- **Ce qui le ferait adopter** :
  - un service « on numérise pour vous » : une demi-journée avec un assistant d'éducation ou un stagiaire, son classeur et un scanner à chargeur ;
  - ensuite, pouvoir montrer aux 3e une fiche brevet de *ses* repères.
- **Formation** : 20 minutes sur « déposer, publier, vérifier ce que voit l'élève », les trois gestes, rien d'autre.
- **Accompagnement** :
  - un référent qui passe en revue les « Échec » du traitement ;
  - une permanence du mardi en salle des profs.
- **Réglages de contrôle** :
  - publication automatique par défaut (il préfère), avec possibilité de repasser en brouillon ;
  - avertissement de couverture incomplète sur les productions élèves.

---

## Persona 3 : Rivka, études juives (kodesh), 47 ans, soucieuse de la tradition

### 1. Fiche

- **Matière** : Guemara et Michna en 2nde et 1re (garçons et filles selon les groupes), Tanakh avec Rachi en 4e.
- **Profil** :
  - formation en séminaire puis licence d'hébreu ;
  - textes sources en hébreu et araméen, souvent vocalisés pour les collégiens ;
  - commentaires (Rachi, Tossafot, Ramban), polycopiés en écriture carrée et parfois en écriture Rachi.
- **Numérique** :
  - Word avec un clavier hébreu, Sefaria et Otzar HaHochma ;
  - à l'aise pour chercher un texte, pas pour « paramétrer ».
- **Rapport à l'IA** :
  - « Est-ce qu'elle va inventer un Rachi ? Mélanger les opinions ? Attribuer à Abayé ce que dit Rava ? » ;
  - inquiète de l'exactitude des sources et du respect de la tradition : une réponse halakhique tranchée par une machine, non ;
  - elle se demande ce que deviennent les noms divins sur des documents imprimés et jetés.
- **Ce qu'elle veut** :
  - que l'élève prépare la havrouta à la maison, retrouve le sens d'un mot araméen et la structure de la souguia ;
  - que l'outil dise « demande à ta professeure » sur toute question de halakha pratique.

### 2. Journal

**Première connexion.**
> J'ai déposé ma feuille de souguia de *Baba Metsia* en `.docx`, hébreu vocalisé avec ma traduction française en dessous. Dépôt passé, publié. Dans « Lire », le texte apparaît, mais l'hébreu est mal aligné : les parenthèses sont à l'envers et la ponctuation se retrouve au mauvais bout de la ligne.
>
> J'ai testé l'assistant comme une élève. Question en français : « Que veut dire *shnayim ohazin* ? » Il a trouvé ma traduction et cité [S1]. Bien. Question en hébreu : « מה פירוש שנים אוחזין » : « les sources ne suffisent pas ». Pourtant c'est la première ligne du document !

**Semaine type.**
> J'ai compris en faisant des essais : il ne « voit » que les mots français et les translittérations. J'ai donc ajouté à mes feuilles une ligne en lettres latines pour chaque terme. Absurde.
>
> J'ai généré un « Guide de méthode pas à pas » pour « comment lire une souguia » : correct, prudent. Une fiche de révision sur Rachi a mis entre guillemets une phrase « de Rachi » que je n'ai pas trouvée telle quelle dans mon document. C'était une reformulation de ma traduction, présentée comme une citation.

**Moment de crise : avant Pessah.**
> Un élève de 4e a demandé au tuteur si on peut manger telle chose pendant la fête. L'outil a répondu, prudemment, à partir de mon cours sur le Seder, mais il a répondu. Les parents m'ont appelée : « Depuis quand un logiciel donne des psakim ? » Et en imprimant la fiche PDF, l'hébreu est sorti à l'envers, et le Nom divin figurait en toutes lettres sur une feuille que l'élève a jetée à la poubelle.

### 3. Blocages

- **Recherche aveugle à l'hébreu et à l'araméen** : `words()` ne garde que `[a-z0-9]` (`server/learning.mjs` l. 38). Une question en hébreu ne produit aucun terme, donc aucun fragment, donc l'abstention ou une réponse sans source. Même cause pour les « Notions mentionnées fréquemment » des statistiques (l. 962). C'est **le blocage technique numéro un** pour toute la section kodesh. Point secondaire : la suppression des diacritiques (`\p{Diacritic}`) enlève aussi les voyelles (nikoud) et les signes de cantillation ; c'est sans gravité pour chercher, mais à ne pas appliquer à l'affichage.
- **Pas d'affichage bidirectionnel** : aucun `dir="auto"` ni gestion de droite à gauche dans `src/`. L'export PDF passe par PDFKit avec DejaVu Sans (`pdf-layout.mjs`), qui possède les glyphes hébreux mais ne réordonne pas le texte bidirectionnel : il est probable que l'hébreu sorte à l'envers dans les PDF (à tester en priorité).
- **Écriture Rachi, textes scannés de livres** : non lus, faute d'OCR.
- **Exactitude des citations** : le serveur vérifie les références techniquement (`USAGES_IA.md` : « Ces contrôles ne démontrent pas la justesse »). Rien n'empêche une paraphrase mise entre guillemets.
- **Halakha pratique** : aucune règle de domaine dans `ai-recipes.mjs` ni dans le prompt du tuteur. Seules les consignes libres du professeur peuvent l'imposer, sans garantie.
- **Noms divins et sainteté (sheimot)** : rien n'est prévu dans les PDF générés.
- **Confusion des opinions** : sans structure (michna, guemara, Rachi, Tossafot), l'IA risque d'attribuer un avis au mauvais maître. Les fragments de 1 800 caractères peuvent couper une souguia au milieu.

### 4. Ce qu'elle aime

- L'abstention : quand ça ne suffit pas, « l'assistant doit vous le signaler ». C'est la bonne posture.
- Le cloisonnement : l'IA n'utilise **que** ses documents, pas Internet (cahier des charges, § 4.3). « Au moins elle ne va pas chercher sur un forum. »
- Les QCM de vocabulaire araméen (une fois les termes translittérés) pour la préparation de la havrouta.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Qu'il comprenne l'hébreu ! » | **Recherche multilingue** : remplacer `[a-z0-9]` par une classe Unicode (`\p{L}\p{N}`) ; normaliser l'hébreu (retirer nikoud et teamim pour la recherche seulement, gérer les lettres finales et les préfixes ו ה ב ל מ ש כ) ; ensuite, recherche sémantique multilingue. |
| « L'hébreu à l'endroit » | **Prise en charge de l'hébreu de droite à gauche** dans l'aperçu, le chat, les fiches et les PDF (`dir="auto"`, police hébraïque comme Frank Ruehl ou David Libre, bidi dans le moteur PDF). |
| « Qu'il ne mette pas de guillemets à ce qu'il invente » | **Citation littérale vérifiée** : toute phrase entre guillemets ou attribuée doit exister mot à mot dans un fragment cité, sinon elle est reformulée en paraphrase signalée. |
| « Pas de psak » | **Règles de domaine par matière** réglées par l'administration ou le professeur : « Pour toute question de halakha pratique, ne pas trancher ; renvoyer vers le professeur ou le rav. » Ces règles sont prioritaires sur la demande de l'élève et suivies d'un journal agrégé. |
| « Respecter le Nom » | Option de **remplacement des noms divins** (ה׳, אלוקים…) dans les PDF générés, et mention « contient des textes saints » en pied de page. |
| « Michna, guemara, Rachi, ce n'est pas pareil » | **Typage des couches de texte** au dépôt (source primaire, commentaire, traduction, explication du professeur) pour que l'IA attribue correctement chaque opinion ; découpage par souguia et non par nombre de caractères. |

### Adoption la première semaine

- **Ce qui la ferait adopter** :
  - un engagement écrit de l'établissement : « l'IA ne tranche jamais la halakha, ne cite que vos textes, n'invente aucune attribution » ;
  - une démonstration en direct avec une question en hébreu qui **fonctionne** ;
  - tant que la recherche hébraïque ne marche pas, elle n'ira pas plus loin.
- **Formation** :
  - une séance dédiée au département kodesh (3 à 5 professeurs) avec un rav référent ;
  - on y valide ensemble un texte de « règles de domaine » commun.
- **Accompagnement** :
  - un test sur 3 souguiot avant ouverture aux élèves ;
  - une relecture des 20 premières réponses signalées, ce qui suppose que les signalements deviennent lisibles.
- **Réglages de contrôle** : règle « pas de psak » verrouillée, citation littérale obligatoire, remplacement des noms divins dans les PDF, désactivation de la génération de « contrôles » sur les textes saints si elle le souhaite.

---

## Persona 4 : Karim, EPS, 38 ans, « je ne vois pas à quoi ça me sert »

### 1. Fiche

- **Matière** : EPS, de la 6e à la Terminale, coordinateur de l'association sportive.
- **Profil** :
  - sur le terrain, au gymnase ou au stade Charléty ;
  - pas de documents de « cours » au sens classique ;
  - des fiches d'évaluation (grilles de compétences), le règlement du handball, des vidéos sur son téléphone, des barèmes de demi-fond pour le bac.
- **Numérique** : très à l'aise avec son smartphone (applis chrono, vidéo), pas du tout avec une plateforme « de bureau ».
- **Rapport à l'IA** : indifférent, « l'IA ne fera pas courir un élève ».
- **Ce qu'il veut** : que les Terminales connaissent les barèmes et les attendus du bac en EPS, et que les dispensés aient un vrai travail théorique.

### 2. Journal

**Première connexion.**
> On m'a créé un cours « EPS - 1re B ». « Votre espace attend ses premiers cours. » J'ai pas de cours, j'ai un gymnase. Le menu me propose « Mon organisation » et « Entraînement » : j'ai cru que c'était pour mes entraînements ! C'est des QCM pour les élèves.

**Semaine type.**
> Rien. Je ne me suis pas reconnecté.

**Moment de crise : bac, épreuve d'EPS en contrôle continu.**
> La CPE me dit que j'ai 6 dispensés longue durée en Terminale et qu'il faut « un travail écrit ». Une collègue me montre qu'on peut déposer le référentiel et les barèmes, puis générer un « Quiz avec corrigé ». J'ai déposé la grille du demi-fond en PDF. Le quiz sur « Quelle VMA pour 12/20 ? » était faux : le tableau du PDF a été extrait comme du texte en vrac, les colonnes mélangées.

### 3. Blocages

- **Le produit est pensé pour une matière à cours écrits** : les types au dépôt sont « Cours / Exercice / Contrôle d'entraînement / Correction » ; il n'y a ni « Règlement », ni « Grille d'évaluation », ni « Vidéo ».
- **Les tableaux sont perdus** à l'extraction (aperçu « Texte extrait ») : barèmes et grilles deviennent inutilisables par l'IA.
- **Pas de vidéo ni d'audio** (`USAGES_IA.md` : « l'audio… non implémentés »).
- **Menu ambigu** : « Entraînement » et « Mon organisation » sont affichés aux professeurs alors qu'ils concernent les élèves.
- **Aucun usage « terrain »** : pas de lien rapide, de QR code ou de mode tablette au bord du terrain.
- **Ce qui le fait abandonner** : il n'y a rien à faire pour lui au premier contact.

### 4. Ce qu'il aimerait

- Un QCM « règles de l'arbitrage » pour les jeunes officiels de l'association sportive.
- « Différencier une activité » pour adapter une séance aux élèves à besoins particuliers ou blessés.
- Un travail théorique sourcé pour les dispensés, qu'il n'a pas à corriger lui-même.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « J'ai pas de cours, j'ai des règlements. » | **Types de documents configurables par matière** (règlement, grille, barème, protocole, vidéo). |
| « Mes barèmes en tableau » | **Extraction des tableaux** (PDF et DOCX) conservant lignes et colonnes ; affichage en tableau dans l'aperçu ; réponses de l'IA sur une ligne précise. |
| « Un truc pour les dispensés » | **Modèle « travail des dispensés »** dans l'Atelier : dossier théorique par activité, quiz et questions de réflexion fondés sur les documents ; remise et liste de suivi. |
| « Au bord du terrain » | **QR code par cours ou par quiz** ; mode « affichage en grand » sur tablette. |
| « Mettez une vidéo » | Dépôt de **vidéos courtes** ou de liens (consultation seulement, sans IA au départ). |
| « Cachez ce qui ne me sert pas » | **Menu adapté au rôle** : retirer « Entraînement » et « Mon organisation » pour les professeurs, ou les renommer « Aperçu élève ». |

### Adoption la première semaine

- **Ce qui le ferait adopter** :
  - un cas d'usage préparé pour lui : « Jeunes officiels : quiz d'arbitrage » et « Dispensés : dossier théorique », déjà configurés avec le règlement fédéral déposé par le référent ;
  - il n'a qu'à publier.
- **Formation** : 10 minutes, sur son téléphone, au gymnase.
- **Accompagnement** : un collègue d'EPS d'un autre établissement qui l'utilise (témoignage), ou le coordonnateur EPS.
- **Réglages de contrôle** :
  - choisir quelles fonctions sont visibles pour ses classes (seulement le quiz, par exemple) ;
  - masquer le tuteur conversationnel pour l'EPS s'il le souhaite.

---

## Persona 5 : Sarah, mathématiques, 34 ans, peur des réponses fausses en son nom

### 1. Fiche

- **Matière** : mathématiques, 2nde et Terminale spécialité.
- **Profil** :
  - rigoureuse, cours en LaTeX exportés en PDF, corrigés manuscrits scannés ;
  - utilise GeoGebra et Pronote dans son ancien établissement.
- **Numérique** : à l'aise.
- **Rapport à l'IA** :
  - elle a testé ChatGPT ; il s'est trompé sur une limite et sur une démonstration par récurrence avec beaucoup d'aplomb ;
  - « Le pire, ce n'est pas qu'il se trompe, c'est qu'il se trompe **avec mon nom dessus**. »
- **Ce qu'elle veut** :
  - un outil qui ne dit jamais rien de faux sous son autorité ;
  - un moyen de corriger vite ce qui a été dit ;
  - que ses corrigés ne fuient pas avant le contrôle.

### 2. Journal

**Première connexion.**
> J'ai déposé mon cours « Suites » (PDF LaTeX). L'aperçu en texte extrait : les formules sont en bouillie, `u n+1 = 2 u n + 3` sans indices, les sommes ont disparu. L'IA travaillera donc sur ça.
>
> J'ai lancé « Analyser mes raisonnements et corrigés ». Le résultat était pertinent : « Initialisation, hérédité, conclusion » et mes notations. J'ai validé. Puis j'ai déposé un nouveau corrigé : « Les documents ont changé. L'analyse doit être revue. » C'est logique, mais il faut tout revalider à chaque dépôt.

**Semaine type.**
> Dans l'interface élève, je lis : « Des entraînements dans le style de votre professeur ». Les élèves génèrent des « Contrôle d'entraînement » avec « Corrigé expliqué et barème proposé ». Je ne les vois pas. Un élève m'a montré un corrigé généré : une erreur de signe dans la dérivée, et en haut « Mme Benhamou ». Le panneau « La méthode de Sarah B. » s'affiche juste à côté dans l'assistant.
>
> J'ai cliqué « Signaler cette réponse » sur une réponse fausse, depuis mon compte. Puis j'ai cherché où lire les signalements de mes élèves : nulle part.

**Moment de crise : la veille d'un contrôle commun de Terminale.**
> J'avais publié la « Correction » du DS de l'an dernier pour que l'IA s'en serve comme modèle. Les élèves l'ont téléchargée directement. C'était voulu pour l'an dernier, mais j'avais réutilisé deux exercices. Je n'avais pas d'option « utilisable par l'IA mais non téléchargeable ».

### 3. Blocages

- **Pas de rendu mathématique** : `StudyContent` ne gère que les citations [S1] et le texte ; il n'existe ni KaTeX ni MathJax. L'extraction PDF perd indices et exposants (`FEATURES.md` : « pas de garantie de restitution des équations »).
- **Le nom du professeur est associé à des productions qu'elle n'a pas vues** : « dans le style de votre professeur », « La méthode de… ». La mention « non validées par le professeur » est petite et générale.
- **Signalements perdus** : enregistrés dans `learning_reports`, mais sans route de lecture. Le professeur ne peut ni voir, ni corriger, ni prévenir les autres élèves.
- **Pas de correction a posteriori** : aucun moyen d'ajouter « Attention, cette réponse était fausse » ni de fixer une **réponse de référence** sur une question fréquente.
- **Publié = téléchargeable** : un corrigé publié est à la fois accessible aux élèves et utilisé par l'IA (`FEATURES.md`, « Règles appliquées »). On ne peut pas avoir l'un sans l'autre.
- **Revalidation fréquente** : toute modification rend la méthode obsolète. C'est sûr, mais lassant sans résumé de ce qui a changé.
- **Contrôles du serveur** : sommes du barème et références, pas la justesse mathématique (`USAGES_IA.md`). Elle le lit et se dit : « donc personne ne vérifie les maths ».

### 4. Ce qu'elle aime

- L'abstention et les sources [S1] : elle vérifie en un clic.
- Les modes « Un indice » et « Vérifier ma tentative », bien plus utiles que la correction.
- La séparation sujet / corrigé et les exports PDF distincts : « Déposer le sujet en brouillon », puis elle relit avant de publier.
- La méthode validée, qui reprend vraiment ses notations.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Qu'on ne mette pas mon nom sur ce que je n'ai pas relu. » | **Étiquetage explicite** de toute production élève : « Généré par IA à partir des documents de Mme B., non relu par elle » ; retirer « dans le style de votre professeur » ou le compléter. |
| « Les signalements, je veux les voir. » | **Boîte de signalements** pour le professeur du cours : réponse, question (anonymisée si l'élève le souhaite), sources ; actions « confirmé faux / correct / ajouter une précision » ; information de l'élève. |
| « Fixer LA bonne réponse » | **Réponses de référence (épinglées)** : sur une notion ou une question type, le professeur écrit la réponse validée, que l'IA cite en priorité avec le badge « validé par le professeur ». |
| « Utilisable par l'IA, pas téléchargeable » | Nouvelle **visibilité de document** : « réservé à l'IA » (utilisé pour le style et la méthode, jamais montré ni cité textuellement). Option « publier à partir du [date] ». |
| « Des vraies formules » | **Rendu LaTeX/KaTeX** dans le chat, les fiches et les PDF ; extraction des formules à partir des sources `.tex` ou des PDF LaTeX ; dépôt `.tex` accepté. |
| « Vérifier les calculs » | **Vérification par calcul formel** des corrigés générés (valeurs numériques, dérivées, limites), avec signalement « non vérifiable » sinon. |
| « Tester avant les élèves » | **Mode aperçu élève** : le professeur pose des questions comme un élève sans compter dans les statistiques. Aujourd'hui, `learning_chats` compte tous les rôles dans « Participants IA ». |

### Adoption la première semaine

- **Ce qui la ferait adopter** :
  - la promesse vérifiable que **rien n'est présenté comme venant d'elle sans sa relecture** ;
  - une boîte de signalements fonctionnelle ;
  - le rendu des formules.
- **Formation** : un atelier entre professeurs de sciences sur « comment l'IA utilise vos documents, ce qui est vérifié et ce qui ne l'est pas », honnête sur les limites.
- **Accompagnement** : une phase pilote de 3 semaines avec une seule classe, puis une revue des signalements avec le référent.
- **Réglages de contrôle** :
  - désactiver la génération de « Contrôle d'entraînement » par les élèves ;
  - visibilité « réservé à l'IA » ;
  - modes d'aide choisis ;
  - bannière de non-validation obligatoire.

---

## Persona 6 : Julien, professeur remplaçant, 27 ans, arrivé en novembre pour 3 mois

### 1. Fiche

- **Matière** : sciences physiques, contractuel, remplace Mme Attal en congé maternité (4e, 3e, 2nde).
- **Profil** :
  - a eu quatre établissements en deux ans ;
  - arrivé un lundi, au courant le vendredi précédent ;
  - pas les cours de sa collègue, juste un mail : « tout est sur IABNE ».
- **Numérique** : très à l'aise, habitué à jongler entre ENT.
- **Rapport à l'IA** : pragmatique ; il veut gagner du temps, pas de discours.
- **Ce qu'il veut** :
  - savoir où en est chaque classe dans le programme, récupérer les documents de Mme Attal et continuer sans tout casser ;
  - ne pas investir trois heures dans un outil qu'il quittera en février.

### 2. Journal

**Première connexion (lundi 16 novembre).**
> Le secrétariat met deux jours à me créer un compte (« Tous les comptes sont créés manuellement par l'administration »). Mercredi, je me connecte : « Votre espace attend ses premiers cours. » L'admin m'a affecté aux classes, mais les cours de Mme Attal restent à elle. Un cours n'a qu'un titulaire. Je ne vois pas ses documents.
>
> L'administratrice a créé un nouveau cours « Physique-chimie 3e A (M. Julien) ». Résultat : les élèves ont deux cours « Physique-chimie » dans leur liste, l'ancien plein, le nouveau vide. Le tuteur personnel d'un élève est lié au cours : sa mémoire est restée dans l'ancien.

**Semaine type.**
> J'ai demandé à l'admin de me transmettre les documents : il les a téléchargés un par un depuis l'ancien cours et me les a envoyés par WeTransfer. Je les ai redéposés un par un, et republiés un par un. La méthode validée de Mme Attal n'a pas suivi : elle est liée à elle et à son cours.

**Moment de crise : le conseil de classe du 1er trimestre, début décembre.**
> On me demande une appréciation sur 28 élèves que je connais depuis trois semaines. J'espérais au moins des tendances : « Suivi pédagogique » de mon nouveau cours : « Statistiques IA masquées : moins de 5 participants. » Normal, personne n'utilise le cours vide. Les données de l'ancien cours ne me sont pas accessibles.
>
> En février, mon contrat finit. Que deviennent mes documents ? Mon compte sera désactivé, et mes cours avec ? Personne ne sait.

### 3. Blocages

- **Pas de transfert ni de cotitulaire de cours** : `canManageCourse` exige `c.teacher_id === user.id` (`auth.mjs` l. 24). Pas d'écran de modification des affectations (`ajouts_equipe.md`, « Manque »).
- **Méthode liée au titulaire** : une passation n'est pas prévue (`teacher-tutor.mjs` l. 36-39).
- **Doublons de cours** côté élèves et perte de la continuité de la mémoire du tuteur.
- **Délai de création du compte** et mot de passe transmis à la main, sans mail d'activation (`FEATURES.md` : « Pas d'envoi automatique de mails »).
- **Fin de contrat** : pas de procédure de passation retour ni d'archivage des cours à la désactivation.
- **Coût d'apprentissage** démesuré pour 3 mois s'il n'y a pas de guide express.

### 4. Ce qu'il aime

- « Préparer une séance de cours » à partir des documents de la titulaire (une fois récupérés) : « c'est exactement ce qu'il faut pour reprendre une progression ».
- Les fiches de révision déjà générées par les élèves : il voit que l'outil vit.
- L'agent de préparation : un contrôle d'entraînement en 5 minutes, déposé en brouillon.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Donnez-moi le cours de ma collègue. » | **Suppléance de cours** : l'administration ajoute un « professeur suppléant » à un cours existant pour une période (dates de début et de fin), avec des droits de dépôt et de publication ; la titulaire garde la propriété ; retour automatique à la fin. |
| « Où en est la classe ? » | **Fiche de passation** générée : chapitres traités, derniers documents publiés, devoirs importés d'École Directe, notions à reprendre (agrégées) ; consultable par le suppléant. |
| « Sa méthode, je la garde ? » | **Héritage de méthode** : le suppléant voit la méthode validée de la titulaire et peut la réutiliser telle quelle ou la compléter ; la titulaire est informée et la retrouve à son retour. |
| « Et en février ? » | **Fin de suppléance** : choix de laisser les documents dans le cours (propriété de l'établissement) ou de les archiver ; export ZIP de ses propres productions. |
| « Je veux commencer demain. » | **Guide express du remplaçant** (une page, cinq étapes) et un compte créé le jour même par un formulaire de l'administration avec lien d'activation. |

### Adoption la première semaine

- **Ce qui le ferait adopter** : accéder dès le premier jour au cours existant de la titulaire. Sans cela, il ne l'utilisera pas.
- **Formation** : pas de formation, un guide express de 1 page et une vidéo de 3 minutes.
- **Accompagnement** : un « parrain » collègue de la même matière, et l'administration formée à la procédure de suppléance.
- **Réglages de contrôle** :
  - droits temporaires à date de fin ;
  - possibilité pour la titulaire (si elle le souhaite) de verrouiller sa méthode ou d'autoriser sa modification.

---

## Persona 7 : Nathalie, SVT, 50 ans, peur d'être évaluée ou surveillée

### 1. Fiche

- **Matière** : SVT, 5e et 1re, déléguée syndicale (SNES) dans l'établissement.
- **Profil** :
  - excellente professeure, mais un conflit passé avec un ancien chef d'établissement sur des « indicateurs de performance » ;
  - elle lit les CGU ;
  - méfiante vis-à-vis de toute statistique remontant à la direction.
- **Numérique** : moyennement à l'aise, mais très attentive aux données.
- **Rapport à l'IA** : neutre sur la pédagogie, hostile à la surveillance. « Le jour où on comparera mes "Participants IA" à ceux de mon collègue en entretien professionnel… »
- **Ce qu'elle veut** :
  - savoir exactement **qui voit quoi** sur elle et sur ses élèves ;
  - avoir un engagement écrit que les données ne servent pas à l'évaluer ;
  - garder le droit de ne pas utiliser l'outil.

### 2. Journal

**Première connexion.**
> Dans « Suivi pédagogique » : « Consultations de documents », « Questions posées », « Participants IA ». Chiffres de mon cours. Rien n'indique si la direction voit ces chiffres. J'ai cherché une page « Confidentialité » : il n'y en a pas dans l'application. Dans les docs techniques du projet (qu'un collègue m'a transmis), je lis « supervision globale » pour l'administrateur.

**Semaine type.**
> J'ai posé la question au référent. Réponse technique : la page des statistiques ne montre à chacun que ses propres cours (`teacher_id`). Mais un compte « Administration » peut gérer **tous** les cours : il voit mes brouillons, ma méthode, il peut lancer la « remédiation de classe » sur mon cours et donc voir les notions où mes élèves se trompent. Il peut aussi voir combien de documents j'ai publiés. Et je n'ai aucun journal qui me dise qui a consulté mon cours côté admin.

**Moment de crise : l'entretien de rendez-vous de carrière (PPCOR).**
> Le principal me dit, de bonne foi : « J'ai vu que vous utilisiez peu IABNE. » Comment ? Il a regardé le nombre de documents publiés de mon cours en se connectant en admin. Fin de l'histoire : j'en ai fait un point en conseil d'administration.

### 3. Blocages

- **Aucune page « Qui voit quoi »** dans l'interface, et pas de charte d'usage des données affichée.
- **Le rôle administrateur est surpuissant et indifférencié** : `canManageCourse` donne à l'admin les droits sur tous les cours ; `classNeeds` (`ai-recipes.mjs`) donne les tendances de n'importe quel cours à l'admin. Il n'existe pas de rôle « direction » distinct d'un rôle « gestion technique des comptes » (`ajouts_equipe.md`, « Pas de rôle… direction distinct »).
- **Pas de journal d'accès** visible par le professeur (qui a ouvert mon cours, mes brouillons, ma méthode).
- **Vocabulaire quantitatif** (« Participants IA », compteurs du tableau de bord) qui suggère une mesure de performance.
- **La vision long terme** du cahier des charges (§ 9 : « Tableau de bord avancé pour la direction avec indicateurs pédagogiques globaux », « Analyse prédictive ») alimente l'inquiétude.
- **Ce qui la fait abandonner et mobiliser ses collègues** : l'usage d'un chiffre en entretien.

### 4. Ce qu'elle aime

- Le seuil de 5 élèves et l'absence d'accès aux conversations privées : c'est une vraie protection des élèves, elle le reconnaît.
- La mention « Pistes pédagogiques, pas diagnostic individuel ».
- La remédiation de classe agrégée : utile avant un contrôle sur la génétique.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Qui voit quoi, écrit noir sur blanc » | **Page « Confidentialité et transparence »** par rôle (professeur, élève, direction, administrateur technique), générée à partir des règles réelles du code, avec date de version. |
| « La direction ne doit pas mesurer mon usage. » | **Rôles séparés** : « administrateur technique » (comptes et classes, sans accès au contenu pédagogique) et « direction » (agrégats à l'échelle de l'établissement seulement, jamais par professeur). Option d'établissement « statistiques par professeur interdites », activée par défaut. |
| « Savoir qui a regardé » | **Journal d'accès** consultable par le professeur : accès d'un compte admin ou direction à ses brouillons, sa méthode, ses statistiques. |
| « Mes stats sont à moi » | Les statistiques d'un cours sont **privées au professeur** par défaut, avec partage volontaire possible (par exemple avec l'équipe disciplinaire). |
| « Droit de ne pas l'utiliser » | Charte d'établissement intégrée : usage volontaire, non pris en compte dans l'évaluation ; case « J'ai lu la charte » à la première connexion. |
| « Moins de compteurs » | Remplacer « Participants IA » et les compteurs par des formulations qualitatives (« Des élèves ont travaillé ces notions »). |

### Adoption la première semaine

- **Ce qui la ferait adopter** :
  - une **charte signée par la direction**, présentée en conseil pédagogique, qui exclut tout usage des statistiques dans l'évaluation des enseignants ;
  - la page « Qui voit quoi » ;
  - le rôle direction bridé.

  Elle deviendrait alors une alliée et le dirait en salle des profs.
- **Formation** : une séance collective « Données et vie privée », où le référent montre l'écran admin réel. La transparence vaut mieux qu'une promesse.
- **Accompagnement** : associer les représentants du personnel au comité de pilotage IABNE.
- **Réglages de contrôle** : statistiques privées au professeur, journal d'accès, refus explicite de tout classement entre professeurs.

---

## Persona 8 : David, anglais, 42 ans, surchargé, « pas le temps de déposer quoi que ce soit »

### 1. Fiche

- **Matière** : anglais, 7 classes, de la 6e à la Terminale (dont 2 groupes de LLCER), professeur principal de 3e.
- **Profil** :
  - trois enfants, une heure de transport ;
  - corrige dans le RER ;
  - ses supports sont dans Google Drive, sur une clé USB et dans des manuels numériques (Bordas, Hachette) ;
  - remplit déjà École Directe (cahier de textes, notes, absences).
- **Numérique** : à l'aise, mais allergique à la double saisie.
- **Rapport à l'IA** : il utilise déjà ChatGPT en douce pour préparer ses compréhensions orales. Le problème, ce n'est pas l'IA, c'est le temps.
- **Ce qu'il veut** :
  - zéro travail supplémentaire ;
  - que ce soit l'outil qui vienne chercher ses documents, pas lui qui les dépose.

### 2. Journal

**Première connexion.**
> Pour déposer un document : Titre, Chapitre, Type, Fichier. Puis passer en « Publié ». Puis recommencer. J'ai 7 classes, environ 15 documents chacune depuis septembre. Faites le calcul : une centaine de dépôts, chacun en 5 clics. Non.
>
> Et le même document pour mes deux 4e ? Il faut le déposer dans chaque cours : deux classes, deux cours, deux dépôts. Je n'ai pas vu de « copier vers un autre cours ».

**Semaine type.**
> Je mets déjà tout dans le cahier de textes d'École Directe, avec les pièces jointes. IABNE importe les devoirs, mais « Les pièces jointes sont signalées mais non téléchargées » et ça ne va que dans le cahier privé de l'élève, pas dans mon cours. Donc je ressaisis ailleurs ce que j'ai déjà saisi.

**Moment de crise : la semaine des conseils de classe.**
> J'ai 25 minutes entre deux conseils. Je voulais juste une remédiation pour ma 3e qui a raté le prétérit. « Préparer une remédiation de classe » : « données insuffisantes », puisque personne n'a fait de quiz, puisque je n'ai rien déposé. Cercle vicieux. J'ai refermé.

### 3. Blocages

- **Dépôt unitaire et manuel** : un fichier à la fois, puis publication séparée, cours par cours.
- **Pas de réutilisation entre classes** : il n'existe pas de partage multi-cours d'un document ; il faut le dupliquer.
- **Pas d'import depuis ses outils** : ni Google Drive, ni OneDrive, ni dossier ; aucune récupération des pièces jointes d'École Directe dans le cours (`ECOLEDIRECTE.md`, `FEATURES.md`).
- **Valeur conditionnée au dépôt** : sans corpus, l'IA s'abstient, la remédiation n'a pas de données et les statistiques sont masquées. Le professeur surchargé ne voit jamais le bénéfice.
- **Pas d'audio** pour la compréhension orale (`USAGES_IA.md`).
- **Contournement** : il continue d'utiliser ChatGPT hors de l'établissement, sans aucune des protections d'IABNE. Et il fait déposer ses documents par un délégué élève (brouillons à publier, ce qui revient au même pour lui).

### 4. Ce qu'il adorerait

- « Préparer une séance » et « Différencier une activité » en 2 minutes dans le RER, sur son téléphone, à partir de documents **déjà là**.
- Les quiz que les élèves font seuls : 0 correction pour lui.
- Un seul endroit : si IABNE lisait son cahier de textes, il serait conquis.

### 5. Demandes

| Ses mots | Fonctionnalité précise |
| --- | --- |
| « Allez chercher mes docs là où ils sont. » | **Import depuis Google Drive / OneDrive** (dossier synchronisé par cours) et **import des pièces jointes du cahier de textes d'École Directe** dans le cours, en brouillon groupé à valider. |
| « Glisser 30 fichiers d'un coup » | **Dépôt groupé** avec suggestion automatique du titre, du chapitre et du type, et une publication en un clic pour tout le lot. |
| « Même doc pour mes deux 4e » | **Partage d'un document vers plusieurs cours** du même professeur (une seule source, plusieurs publications) ; « Copier vers… ». |
| « Je ne veux pas cliquer "Publié" 100 fois » | **Publication par défaut réglable** par professeur ; publication en lot. |
| « Sur mon téléphone, en 2 minutes » | **Raccourcis mobiles** de l'Atelier : « Séance de demain » préremplie à partir de l'emploi du temps et du dernier chapitre. |
| « Une remédiation même sans quiz » | Remédiation fondée sur le programme et ses consignes quand les données manquent (déjà partiellement prévu par `class_remediation`, à rendre visible), et **quiz diagnostic express** à projeter en classe pour obtenir des données en 5 minutes. |
| « Des audios » | Dépôt **audio et vidéo** avec transcription, pour la compréhension orale. |

### Adoption la première semaine

- **Ce qui le ferait adopter** :
  - un import « en masse » réalisé **pour lui** : il donne l'accès à son dossier Drive, le référent ou l'outil importe tout en brouillon, il publie en un clic ;
  - un premier bénéfice immédiat : une séance différenciée générée pour le lendemain.
- **Formation** : aucune formation longue, une démonstration de 5 minutes en début de réunion d'équipe, et des « astuces de la semaine » par mail.
- **Accompagnement** : un délégué élève formé, plus le référent qui fait le premier import.
- **Réglages de contrôle** : publication par défaut, synchronisation automatique avec revue hebdomadaire des nouveautés en un écran.

---

## Synthèse

### Problèmes récurrents classés par gravité

**Critique** : ils bloquent l'adoption ou créent un risque réel.

1. **Les documents papier, scannés ou en photo n'entrent pas** : pas d'images, pas d'OCR, une erreur technique (Gérard, Rivka, Sarah pour ses corrigés manuscrits, Karim pour ses grilles). *Concerne 4 des 8 personas.*
2. **Le professeur n'a aucun contrôle sur l'aide apportée** (mode « Correction expliquée » imposé, génération de contrôles par les élèves) et rien ne garantit que ses consignes priment (Françoise, Sarah, Rivka, Karim). *4 sur 8.*
3. **Les signalements d'erreurs ne sont lisibles par personne** (`/api/ai/reports` sans lecture) et aucune correction ni réponse de référence n'est possible (Sarah, Rivka, Françoise). *3 sur 8.*
4. **La recherche ne comprend pas l'hébreu et l'araméen** (`[a-z0-9]`), et l'affichage de droite à gauche est absent, y compris dans les PDF. Cela rend toute la section kodesh inutilisable (Rivka, et tous ses collègues de kodesh et d'hébreu).
5. **Transparence et gouvernance des données** : l'administrateur a tous les droits sur tous les cours, il n'existe pas de rôle direction distinct, ni de page « qui voit quoi », ni de journal d'accès (Nathalie, Françoise). Le risque est social : rejet collectif.
6. **Pas de suppléance ni de transfert de cours** : un seul titulaire par cours, pas de modification des affectations, et la méthode est liée à la personne (Julien, et tout congé long).

**Majeur** : forte friction, abandon probable.

7. **Tout dépôt part en brouillon** sans le dire clairement, et la publication se fait document par document (Gérard, Françoise, David, Julien). *4 sur 8.*
8. **Le dépôt est unitaire**, sans lot, sans réutilisation entre cours et sans import Drive ni École Directe (David, Gérard, Julien). *3 sur 8.*
9. **Le nom du professeur est associé à des productions IA non relues** (« dans le style de votre professeur », « La méthode de… ») (Sarah, Françoise).
10. **Les formats et formulaires sont orientés vers les sciences** : nombre de questions et barème, sans dissertation, règlement, grille, audio ou vidéo (Françoise, Karim, David).
11. **La mise en forme est perdue** : formules, tableaux, croquis (Sarah, Karim, Gérard).
12. **Les fichiers `.doc` et `.odt` sont refusés** sans solution proposée (Françoise).

**Modéré** : gêne, confusion.

13. Le menu professeur contient des écrans élèves (« Entraînement », « Mon organisation »), et « Atelier IA » est un libellé opaque.
14. Le ton marketing de l'accueil (« Un déclic », « VOTRE ESPACE POUR GRANDIR ») agace les professeurs expérimentés.
15. Il n'existe pas d'aperçu « ce que voit l'élève », et les tests du professeur faussent « Participants IA » (le comptage dans `learning_chats` ne filtre pas le rôle).
16. La méthode devient obsolète à chaque nouveau dépôt, sans résumé de ce qui a changé.
17. Les consignes de méthode sont visibles par les élèves sans que le professeur le sache.

### Top 15 des fonctionnalités demandées

| # | Fonctionnalité | Personas (nombre) |
| --- | --- | --- |
| 1 | **Politique d'aide par cours** : modes d'aide activables, interdiction de rédiger ou de donner la correction complète, désactivation des contrôles générés par les élèves, règles de domaine prioritaires | Françoise, Sarah, Rivka, Karim, Nathalie (indirectement) : **5** |
| 2 | **Dépôt photo et OCR** avec écran de vérification du texte reconnu | Gérard, Rivka, Sarah, Karim : **4** |
| 3 | **Publication claire** : choix au dépôt, publication en lot, bandeau « invisibles pour vos élèves » | Gérard, Françoise, David, Julien : **4** |
| 4 | **Dépôt groupé et import** (Drive, OneDrive, pièces jointes d'École Directe), copie vers plusieurs cours | David, Gérard, Julien : **3** |
| 5 | **Boîte de signalements** pour le professeur, avec actions de correction | Sarah, Rivka, Françoise : **3** |
| 6 | **Réponses de référence épinglées** et citations littérales vérifiées | Sarah, Rivka, Françoise : **3** |
| 7 | **Aperçu « ce que voient vos élèves »** et mode test exclu des statistiques | Françoise, Sarah, Karim : **3** |
| 8 | **Rendu fidèle** : formules (KaTeX), tableaux, images et croquis | Sarah, Karim, Gérard : **3** |
| 9 | **Formats de documents et d'évaluation par matière** (dissertation, commentaire, règlement, grille, oral) | Françoise, Karim, David : **3** |
| 10 | **Transparence** : page « qui voit quoi », charte, journal d'accès, rôle direction distinct, statistiques privées au professeur | Nathalie, Françoise, Julien (fin de contrat) : **3** |
| 11 | **Étiquetage « non relu par le professeur »** sur toutes les productions élèves | Sarah, Françoise : **2** |
| 12 | **Recherche et affichage hébreu et araméen** (Unicode, droite à gauche, PDF bidi, noms divins) | Rivka : **1**, mais tout le département kodesh, critique |
| 13 | **Suppléance et passation de cours** (cotitulaire daté, héritage de méthode, fiche de passation) | Julien, Nathalie (congés) : **2** |
| 14 | **Visibilité « réservé à l'IA »** et publication programmée | Sarah, Françoise (sujets sensibles) : **2** |
| 15 | **Audio et vidéo** (compréhension orale, gestes sportifs) | David, Karim : **2** |

### Quick wins d'interface et de vocabulaire

Changements faibles en code, fort effet sur l'adoption :

1. **Formulaire de dépôt** : case « Publier immédiatement pour mes élèves » (cochée par défaut) ; badge rouge « Invisible pour les élèves » sur les brouillons ; compteur sur l'accueil « 3 documents en brouillon ».
2. **Message d'erreur de scan** : remplacer « Un scan nécessite une extraction OCR externe » par « Ce fichier est une image scannée : IABNE ne sait pas encore la lire. Envoyez-le au référent numérique ou déposez la version Word. »
3. **Refus `.doc`** : message « Ouvrez le fichier dans Word, puis Fichier > Enregistrer sous > Document Word (.docx) ».
4. **Menu professeur** : masquer « Entraînement » et « Mon organisation », ou les regrouper sous « Voir comme un élève » ; renommer « Atelier IA » en « Préparer mes cours » ; renommer « Suivi pédagogique » en « Ce que travaillent mes élèves » ; renommer « Participants IA » en « Élèves ayant utilisé l'assistant ».
5. **Accueil professeur** : retirer « Un déclic, et tout s'éclaire » et « VOTRE ESPACE POUR GRANDIR » ; afficher à la place 3 actions concrètes : « Déposer un cours », « Préparer la séance de demain », « Voir ce que voient mes élèves ».
6. **Panneau de méthode** : ajouter « Ces consignes sont visibles par vos élèves dans l'assistant » au-dessus de la zone de texte, et un résumé « Ce qui a changé depuis votre dernière validation » quand l'analyse est obsolète.
7. **Côté élève** : remplacer « Des entraînements dans le style de votre professeur » par « Entraînement généré par IA à partir des documents de votre professeur, non relu par lui » ; rendre la mention visible sur chaque production et chaque PDF.
8. **Type de document** : « Contrôle d'entraînement » est ambigu au dépôt ; proposer « Ancien contrôle (sert de modèle) ».
9. **Aide contextuelle** : un lien « ? » vers une fiche A4 « IABNE en 5 gestes » imprimable et une page « Qui voit quoi ».
10. **Correctif technique immédiat** : remplacer `/[a-z0-9]{3,}/` par `/[\p{L}\p{N}]{2,}/gu` dans `learning.mjs` (recherche et statistiques) et ajouter `dir="auto"` sur les messages, l'aperçu et les fiches. Cela débloque l'hébreu à moindre coût, à tester sur un vrai corpus.

### Risques d'usage détourné

- **Élèves**
  - **Rédaction déléguée** : le mode « Correction expliquée » et les fiches servent à produire commentaires, dissertations et réponses de devoirs maison (Françoise). Risque de copies identiques.
  - **Fuite de corrigés** : un corrigé publié pour nourrir l'IA est téléchargeable (Sarah). Un élève peut aussi coller un sujet de contrôle à venir et obtenir le corrigé.
  - **Autorité usurpée** : les productions élèves portent implicitement le nom du professeur (« dans le style de… », « La méthode de… ») et circulent comme « le corrigé de Mme B. ».
  - **Pseudo-avis religieux** : le tuteur répond à des questions de halakha pratique à partir d'un cours (Rivka). Risque de conflit avec les familles et de perte de confiance.
- **Direction et administration**
  - **Statistiques détournées en évaluation** des professeurs par un compte administrateur qui a tous les droits (Nathalie). Risque social majeur, possible blocage syndical.
- **Professeurs**
  - **Contournement vers l'IA grand public** : les professeurs découragés par le dépôt utilisent ChatGPT avec des données d'élèves, hors de tout cadre RGPD (David).
  - **Délégués transformés en secrétaires** : des élèves retapent ou déposent les cours à la place du professeur (Gérard, David). Cela pose une question d'équité et de charge pour l'élève, et d'accès des délégués à des documents non publiés.
  - **Statistiques faussées** par les tests du professeur (comptés comme participants) ou par un seul élève très actif : le seuil de 5 élèves distincts protège l'identité, pas la représentativité.
- **Continuité**
  - **Perte de continuité lors d'une suppléance** : cours dupliqués, mémoire du tuteur des élèves scindée, documents transmis hors de l'outil (WeTransfer).
