# Tests terrain IABNE : utilisateurs novices (test réel dans un navigateur)

Date : 6 novembre 2026. Instance isolée : `SEED_DEMO=true PORT=4101`, interface compilée `dist/`, sans clé IA.
Outils : Playwright Chromium, iPhone SE (320×568), Galaxy S8 (360×740), Pixel 5, iPhone 12, PC 1366×768. deviceScaleFactor 1.
Scripts et captures : `/tmp/claude-0/-home-user-futur-IABNE/da3131c6-e25c-5c97-b283-65ef80c66c92/scratchpad/tests-terrain/novice/` (p1* secrétaire, p2* prof, p3* élève, p4* délégué, l* connexion, menu_* menu mobile).
Aucun fichier du dépôt n'a été modifié (`git status` vide).

Gravité : **BLOQUANT** (le novice ne peut pas finir ou se met en danger), **GÊNANT** (hésitation, erreur probable, aide extérieure nécessaire), **MINEUR** (finition).

---

## 0. Problèmes transverses, tous profils

| # | Écran | Constat | Gravité |
|---|---|---|---|
| T1 | Menu latéral (mobile, tous téléphones testés) | Le menu (`aside.sidebar`, `position: fixed`, `overflow: visible`) fait 790 à 888 px de haut et **ne défile pas**. Sur iPhone SE : l'admin ne voit jamais **« Administration »** (y=616-661 sur 568 px) et le prof ne voit pas **« Suivi pédagogique »**. **« Se déconnecter » est inaccessible sur TOUS les téléphones testés** (SE, Galaxy S8, Pixel 5, iPhone 12) et pour tous les rôles (menu2.js). | **BLOQUANT** |
| T2 | Menu latéral (PC 1366×768, portable scolaire courant) | Même cause : le bouton « Se déconnecter » est en y=857-893, hors écran, et la molette ne fait pas défiler le menu (desk.js). Sur un PC familial partagé, l'élève **ne peut pas se déconnecter**, ce qui expose ses données. | **BLOQUANT** (confidentialité, mineurs) |
| T3 | Bouton « retour » du navigateur ou d'Android | L'application ne crée aucune entrée d'historique. « Retour » **quitte IABNE** (about:blank) au lieu de revenir à l'écran précédent. Recharger la page renvoie à « Vue d'ensemble » et l'utilisateur perd sa position (cours ouvert, onglet admin). | **BLOQUANT** pour un novice sur Android, qui utilise le geste retour en permanence |
| T4 | Connexion, après 20 échecs en 15 min (même adresse et même IP) | Le bon mot de passe affiche ensuite **« La demande a échoué (429). »** (capture l5_bloque_bon_mdp.png). L'utilisateur ne sait pas qu'il doit attendre 15 minutes. L'API répond en anglais « Too many requests ». | **BLOQUANT** (prof âgé qui se trompe plusieurs fois) |
| T5 | Connexion | Pas de lien « Mot de passe oublié ? », pas d'œil pour afficher le mot de passe. Sur iPhone SE, le champ mot de passe et le bouton sont sous la ligne de flottaison. L'écran conserve son défilement après connexion : « Bonjour Noé » n'est pas visible (p3m_01). | GÊNANT |
| T6 | Tous les écrans | Sous-titres et textes génériques, souvent faux pour le rôle : « Votre espace pour apprendre et faire apprendre. » sur Administration, Atelier et Suivi ; un bandeau « L'ENVIE D'APPRENDRE, ENSEMBLE » partout. Le prof et l'admin voient des textes destinés aux élèves : « Les documents publiés par votre professeur apparaîtront ici », « Documents et ressources pédagogiques de votre professeur », « Votre professeur particulier IA », « Vos révisions commencent ici ». | GÊNANT |
| T7 | Listes de documents (accueil élève, page cours, tous rôles) | **Type technique non traduit** : « lesson · 6 nov. », « exercise · 6 nov. ». | GÊNANT (bug d'affichage) |
| T8 | Cartes de cours | « Votre professeur » s'affiche à la place du nom, même pour le prof lui-même (accueil de Mme Lévy, accueil de Noé). | MINEUR |
| T9 | Accueil | « Bonjour **Mme** » : le prénom est le premier mot du nom complet « Mme Rachel Lévy ». | MINEUR |
| T10 | Messages de succès | Message unique « Modifications enregistrées. », en haut de page et loin du bouton sur mobile. Il **reste affiché** après l'action suivante, même quand elle échoue ou ne fait rien. Il n'indique jamais ce qui a été fait (« Compte de Mme Lévy créé »). | GÊNANT |
| T11 | Messages d'erreur | Ils restent affichés après une action réussie : « Date, horaires ou type invalides. » est resté visible après l'ajout réussi de deux tâches et la génération du planning. | GÊNANT |
| T12 | Validation des formulaires | Elle repose sur les bulles natives du navigateur (« Veuillez renseigner ce champ ») et ne précise pas les règles avant l'envoi, par exemple les 12 caractères minimum du mot de passe initial. | MINEUR |
| T13 | Messages IA indisponible | « IA non configurée pour cet établissement. Contactez l'administration. » s'affiche en rouge comme une erreur. Pour un élève de 6e, « contacter l'administration » n'a pas de sens, et le bouton reste actif alors que l'application sait déjà que l'IA est coupée (l'écran Entraînement affiche « Votre établissement doit activer l'assistant… »). | GÊNANT |

---

## 1. Persona : Martine, 52 ans, secrétaire de vie scolaire (compte admin)

Profil : elle utilise Pronote et la messagerie, n'aime pas « les nouveaux logiciels », travaille sur le PC du secrétariat et parfois sur son Android. Mission : créer Mme Lévy (prof de français), Noé Cohen (élève de 6e), la classe 6e B, inscrire Noé et affecter Mme Lévy.

### Parcours réel
1. **iPhone SE** : menu ☰ ouvert, « Administration » absente de l'écran et menu impossible à faire défiler. **Abandon** (menu_mobile_admin_scroll.png).
2. **Galaxy S8 / PC** : il faut comprendre que « Administration » est le **dernier** des 9 items. Les 8 autres (Mes cours, Entraînement, Atelier IA, Mon organisation…) ne servent à rien à une secrétaire. L'accueil admin la pousse vers « Ouvrir mon atelier IA » et « Poser une question ».
3. Onglet « Comptes ». Elle commence logiquement par l'élève, mais le champ « Classe (élève) » ne propose que « Terminale A » : la 6e B n'existe pas encore. **L'ordre logique est caché** (année, puis matière, puis classe, puis comptes, puis inscription, puis cours).
4. Création du prof :
   - mot de passe « 1234 » refusé par une bulle native (« au moins 12 caractères ») ; la règle n'apparaît pas à côté du champ.
   - « bonjour2026 » (11 caractères) refusé de la même façon.
   - le 3e essai fonctionne.
   - Le champ « Classe (élève) » **reste affiché quand on choisit Professeur**, ce qui crée le doute.
5. Le formulaire **n'est pas vidé** après la création (p1a_05). Un deuxième clic donne **« Adresse indisponible. »**, qui ne veut rien dire : il faudrait « Un compte existe déjà avec cette adresse ».
6. Adresse « noe cohen » : bulle native correcte. Nom de 250 caractères : **« Nom, adresse valide, rôle et mot de passe de 12 à 128 caractères requis. »** Le message ne dit pas que c'est le **nom** qui est trop long.
7. Onglet « Classes » :
   - « 6e B », niveau « 6e », création **sans choisir d'année scolaire** : acceptée (l'année par défaut est prise en silence).
   - Le formulaire n'est pas vidé. Un second clic crée une **deuxième classe « 6e B » identique** (p1a_11). Ensuite, les listes « Classe » proposent deux « 6e B » indiscernables (l'année n'est pas affichée).
   - Noé a été inscrit dans l'une des deux, au hasard du clic.
8. « Inscrire un élève » : Alex (Terminale A) a aussi été inscrit en 6e B **sans avertissement**, ce qui donne un élève dans deux classes.
9. « Créer une matière » est **caché tout en bas de l'onglet Classes**, alors qu'on en a besoin dans « Cours & affectations ». Une seconde matière « Mathématiques » a été créée sans avertissement (doublon).
10. « Cours & affectations » : deux formulaires concurrents, « Créer un espace de cours / Créer et affecter » et « Affecter un professeur / Enregistrer l'affectation ».
    - Martine a d'abord utilisé « Enregistrer l'affectation » : message « Modifications enregistrées. », mais **aucun cours n'apparaît** dans « Cours existants ». Elle croit avoir fini alors que Mme Lévy n'a aucun cours.
    - Il a fallu ensuite « Créer et affecter », avec un « Titre » à inventer.
11. « Réinitialiser » ouvre un champ en ligne, clair (« Nouveau mot de passe (12 à 128 caractères) »). En revanche, « Désactiver » agit **immédiatement, sans confirmation**, et le compte désactivé n'est signalé que par le bouton devenu « Réactiver » (pas de badge « Désactivé »).
12. « Retirer » une inscription : confirmation présente, bien.

### Frictions
| Écran | Libellé exact | Problème | Gravité |
|---|---|---|---|
| Menu mobile | « Administration » | Inaccessible sur iPhone SE | **BLOQUANT** |
| Comptes | « Mot de passe initial » | Règle des 12 caractères non affichée | GÊNANT |
| Comptes | « Adresse indisponible. » | Message obscur pour un doublon | GÊNANT |
| Comptes | « Classe (élève) » | Visible pour Professeur et Administrateur ; la classe doit exister avant | GÊNANT |
| Comptes | Formulaire non vidé après succès | Doublons, messages d'erreur | GÊNANT |
| Classes | « Créer la classe » | Doublons exacts autorisés, année non obligatoire, année absente des listes | **BLOQUANT** (données ambiguës) |
| Classes | « Créer une matière » | Mal placé, doublons autorisés | GÊNANT |
| Cours & affectations | « Enregistrer l'affectation » et « Créer et affecter » | Deux notions proches ; l'affectation seule ne crée pas de cours visible | **BLOQUANT** (le prof n'a pas de cours sans que la secrétaire le sache) |
| Comptes | « Désactiver » | Pas de confirmation, pas de statut visible | GÊNANT |
| Accueil admin | « Ouvrir mon atelier IA », « Reprendre le fil » | Contenu d'élève ou de prof, rien d'administratif (pas de « à faire ») | GÊNANT |

---

## 2. Persona : M. Bernard Lévy, alias « Mme Rachel Lévy », 60 ans, prof de français (compte prof)

Profil : imprime ses cours, écrit sous Word, a un smartphone Android de taille moyenne, a peur de « tout casser » et ne connaît pas le mot « brouillon » au sens logiciel. Mission : déposer un premier cours, le publier, désigner un délégué, trouver ses statistiques.

### Parcours réel
1. Connexion : « Bonjour Mme ». L'accueil propose « Ouvrir mon atelier IA » en gros. La carte de cours affiche « Votre professeur » et « Les documents publiés par votre professeur apparaîtront ici ».
2. « Mes cours », puis la carte « Français 6e B ». La page est longue (p2a_03) : bouton « Déposer un document », panneau « Personnaliser mon agent IA de professeur », recherche, « Organiser les chapitres », « Délégations élèves ».
3. « Déposer un document » :
   - Photo du cahier en .jpg et ancien .doc refusés : « Formats acceptés : PDF, DOCX et texte UTF-8 (10 Mo maximum). » Le message est clair, mais « UTF-8 » est du jargon, et rien n'explique comment convertir un .doc ni pourquoi une photo est refusée (pas d'OCR).
   - .txt puis .docx acceptés : « Document déposé. Son statut de traitement est indiqué dans la liste. »
4. **Publication** : il n'y a **aucun bouton « Publier »**. Le document porte deux badges, « Brouillon » et « Prêt », puis une petite liste déroulante « Brouillon ▾ », une roue dentée et une croix rouge, sans texte sur mobile (p2a_07).
   - « Prêt » laisse croire que le document est prêt pour les élèves. C'est en réalité le statut de traitement.
   - Le prof a changé la **première** liste déroulante, qui correspondait à « Fiche vocabulaire », pas au cours « Le conte merveilleux » (ordre de dépôt inverse). Il croyait avoir publié son cours, qui restait en Brouillon et invisible pour les élèves.
   - Aucun aperçu « ce que voient les élèves ».
5. Délégation :
   - « Accorder la délégation » cliqué **sans élève choisi** : « Modifications enregistrées. » (message périmé, rien ne se passe).
   - Avec Noé : il apparaît avec « Révoquer ». Le mot « délégation » est compris, mais le prof ne sait pas ce que l'élève pourra faire : l'explication n'est visible que côté élève.
6. « Suivi pédagogique » (absent de l'écran sur iPhone SE) :
   - Les cartes affichent « Agrégats uniquement, sans conversations ni thèmes individuels », « Statistiques IA masquées : moins de 5 participants », et une carte « **Masqué** » pour les consultations.
   - Avec une classe de moins de 5 élèves, ou au début de l'année, le prof **ne voit rien**, même pas si ses élèves ont ouvert le document. Jargon : « agrégats », « participants IA ».
7. « Atelier IA » : **deux outils superposés** qui se ressemblent (« Mon assistant de préparation pédagogique / Préparer avec mon agent IA » et « Préparer et améliorer mes supports avec l'IA / Générer la ressource »). Sans IA :
   - un message rouge « IA non configurée pour cet établissement. Contactez l'administration. », affiché deux fois ;
   - le texte de « Ma bibliothèque » parle de « Vos révisions ».
8. Les menus « Entraînement », « Mon organisation » (École Directe « réservée aux comptes élèves ») et « Assistant pédagogique » (« Votre professeur particulier IA ») n'ont pas de sens pour un prof.
9. L'aperçu du document (icône livre) est lisible, mais avec deux avertissements redondants (« Texte extrait pour la lecture… » et « Aperçu du texte extrait… »).
10. Après un dépôt de délégué (persona 4), **aucune alerte** n'apparaît sur l'accueil du prof (« 1 document d'élève à valider »). Il faut ouvrir le cours pour voir le brouillon.

### Frictions
| Écran | Libellé exact | Problème | Gravité |
|---|---|---|---|
| Page cours | Liste déroulante « Brouillon / Publié / Archivé » | Pas de bouton « Publier », erreur de ligne probable | **BLOQUANT** (cours jamais publié) |
| Page cours | Badge « Prêt » à côté de « Brouillon » | Contradictoire pour un novice | GÊNANT |
| Page cours | « lesson », « exercise » | Non traduit | GÊNANT |
| Page cours (mobile) | Icônes livre, roue et croix sans texte | Le prof ne sait pas lequel ouvre, modifie ou supprime | GÊNANT |
| Dépôt | « texte UTF-8 », refus des .doc et .jpg | Pas d'aide à la conversion | GÊNANT |
| Délégations | « Accorder la délégation » sans élève choisi | Faux succès | GÊNANT |
| Suivi pédagogique | « Masqué », « Agrégats », « moins de 5 participants » | Écran vide et incompris | GÊNANT |
| Atelier IA | Deux générateurs | Confusion | GÊNANT |
| Accueil prof | Aucun « à valider » | Les brouillons des délégués restent oubliés | GÊNANT |
| Menu mobile | « Suivi pédagogique » | Hors écran sur iPhone SE | **BLOQUANT** (sur ce modèle) |

---

## 3. Persona : Noé, 11 ans, élève de 6e B (compte élève créé par la secrétaire)

Profil : vieux iPhone SE hérité de sa sœur, écrit en SMS (« c koi »), ne lit pas les paragraphes, veut « que l'IA lui explique l'exo ».

### Parcours réel
1. Connexion : bon accueil (« Bonjour Noé ☀ »), mais l'écran reste défilé après la connexion et la salutation est hors de vue.
2. Il touche la carte « Français 6e B » : deux documents, chacun avec « lesson · 6 nov. Publié Prêt » ou « exercise… ». La phrase « Votre délégation permet de déposer des brouillons… » apparaît (Noé est délégué) et il ne comprend pas. Lecture du cours par l'icône livre : correcte.
3. « Poser une question à l'assistant » ouvre une page très longue (2 900 px sur iPhone SE, 1 800 px sur PC) :
   - « Mémoire privée », « 0 min chronométrées sur 7 jours », « notions à retravailler » ;
   - un paragraphe juridique (« Les scores IA ne sont pas des notes officielles ; le chronomètre ne prouve pas l'attention… fournisseur IA configuré… ») ;
   - « La méthode de Mme Rachel Lévy… Une analyse IA devient utilisable après validation… ».
   - **La zone de saisie est tout en bas** : y=1 422 px sur PC, environ 2 700 px sur mobile. Il faut faire défiler 4 à 5 écrans pour trouver où écrire.
4. Question « c koi un adjuvant ?? jcomprend pas l'exo » : la bulle « Vous » s'affiche, puis un bandeau rouge « IA non configurée pour cet établissement. Contactez l'administration. ». Noé pense avoir « cassé un truc ».
   - Le vouvoiement des textes ne colle pas au tutoiement du champ (« Explique-moi cette notion… »).
   - Le bouton **« Correction expliquée »** est proposé d'emblée (risque de copier-coller des devoirs).
5. Texte trop long (2 700 caractères collés) : **tronqué en silence à 2 000** par `maxlength`, sans compteur. La bulle géante remplit l'écran (p3m_07).
6. « Entraînement », puis « Créer mon quiz » : bandeau rouge « IA non configurée… ». Le bouton reste actif alors que la carte du dessous dit déjà « Votre établissement doit activer l'assistant ».
7. « Mon organisation » :
   - l'écran commence par un bloc **École Directe** « Intégration expérimentale non certifiée », « Désactivée », avec des champs encore saisissables, « Période consultée : 2026-10-30 au 2026-11-12 » (dates au format informatique). Il faut défiler pour trouver « Mes disponibilités ».
   - Créneau 17:00-18:30 : ajouté **sans message**.
   - Créneau 19:00 → 18:00 : « Date, horaires ou type invalides. » (il faudrait : « L'heure de fin doit être après l'heure de début »).
   - Ce message d'erreur **ne disparaît plus**, même après les ajouts réussis.
   - Tâche avec une date limite **passée** (3 nov.) : acceptée sans remarque.
   - « Organiser mes révisions » produit une seule séance de 30 min et l'avertissement « Le temps disponible est insuffisant pour certaines tâches, ou leur échéance est passée. » sans dire laquelle.
   - Le champ « Matière » du formulaire Tâche ne se vide pas : « Contrôle de maths » s'est retrouvé rangé en « Français » dans « Mes devoirs dans cette matière ». Sur la page tuteur, on lit « Échéance : 2026-11-03 · Difficulté déclarée 1/5 ».
8. Bouton retour d'Android ou d'iOS : il **quitte le site**.
9. Pas de déconnexion possible sur téléphone (T1).

### Frictions
| Écran | Libellé exact | Problème | Gravité |
|---|---|---|---|
| Assistant | Zone « Votre question » en bas de page | Introuvable pour un enfant | **BLOQUANT** |
| Assistant | Paragraphes « Mémoire privée… chronomètre… fournisseur IA » | Illisible pour un enfant de 11 ans | GÊNANT |
| Assistant | « IA non configurée… Contactez l'administration. » | Culpabilisant, action impossible pour un élève | GÊNANT |
| Assistant | `maxlength 2000` | Troncature silencieuse | MINEUR |
| Assistant | « Correction expliquée » | Usage détourné : faire faire l'exercice | GÊNANT (pédagogie) |
| Entraînement | « Créer mon quiz » actif | Erreur prévisible | GÊNANT |
| Mon organisation | Bloc École Directe en premier | Bruit, jargon, dates ISO | GÊNANT |
| Mon organisation | « Date, horaires ou type invalides. » | Imprécis et persistant | GÊNANT |
| Mon organisation | Date limite passée acceptée, formulaire non vidé | Données fausses | MINEUR |
| Partout | « lesson », « exercise », « Prêt » | Jargon ou anglais | GÊNANT |

---

## 4. Persona : Lou, 17 ans, déléguée de Terminale A (compte délégué)

Profil : à l'aise avec Instagram, pas avec les fichiers. Elle a pris des notes sur Word pour un camarade absent.

### Parcours réel
1. Accueil : **rien n'indique qu'elle est déléguée** ni où déposer.
2. « Mes cours », puis « Mathématiques — Terminale A », puis « Déposer un document ». Sur iPhone SE, le formulaire s'ouvre **sous la ligne de flottaison** (titre « Nouveau document » à y=602 pour un écran de 568) et la page ne défile pas vers lui : **rien ne semble se passer** (p4m_04).
3. Sans titre : bulle native. Avec un titre de 350 caractères : « Fichier, titre et type valides requis. » Elle ne sait pas que c'est le titre qui pose problème.
4. Avec un titre court : « Document déposé. Son statut de traitement est indiqué dans la liste. » Son document affiche « lesson · Déposé par Lou Moreau · **Brouillon** · **Prêt** » et une croix rouge (p4m_05). Elle hésite : « c'est prêt ou c'est brouillon ? ».
   - Elle n'a pas de liste déroulante de publication (c'est correct, le serveur la refuse).
   - Rien ne lui dit « En attente de validation par M./Mme X ».
   - Le type par défaut « Cours » laisse une élève étiqueter ses notes comme un « Cours » officiel.
5. Côté prof (prof@demo) : aucune notification sur l'accueil. Le brouillon n'est visible que dans le cours.

### Frictions
| Écran | Libellé exact | Problème | Gravité |
|---|---|---|---|
| Accueil élève | (absence) | Délégation invisible | GÊNANT |
| Page cours mobile | « Déposer un document » | Le formulaire s'ouvre hors écran sans défilement | GÊNANT |
| Dépôt | « Fichier, titre et type valides requis. » | Imprécis (titre trop long) | MINEUR |
| Liste | « Brouillon » et « Prêt » | Contradictoire, pas d'« en attente de validation » | GÊNANT |
| Dépôt | Type « Cours » par défaut pour un élève | Confusion avec les documents officiels | MINEUR |

---

## 5. Bugs constatés (reproductibles)
1. **Menu latéral non défilable**, mobile et PC 1366×768 : « Se déconnecter » est inaccessible partout, « Administration » et « Suivi pédagogique » sont inaccessibles sur iPhone SE. Cause probable : `aside.sidebar { position: fixed }` sans `overflow-y: auto`, contenu de 790 à 893 px.
2. **Pas d'historique de navigation** : le bouton retour quitte l'application, le rechargement renvoie à l'accueil.
3. **Limitation des connexions** : après 20 échecs, le message « La demande a échoué (429). » s'affiche même avec le bon mot de passe ; message serveur en anglais.
4. **Types de documents non traduits** (« lesson », « exercise ») dans toutes les listes.
5. **Doublons acceptés** : classes homonymes de la même année, matières homonymes. Le formulaire non vidé après succès multiplie le risque.
6. **Faux succès** : « Accorder la délégation » sans élève, « Enregistrer l'affectation » sans création de cours visible. Le message de succès précédent reste affiché.
7. **Messages persistants** : l'ancien succès ou l'ancienne erreur reste affiché après l'action suivante (Administration, Mon organisation).
8. « Bonjour Mme » (prénom tiré du premier mot) ; « Votre professeur » au lieu du nom sur les cartes de cours.
9. Après connexion sur petit écran, la page reste défilée et la salutation est hors de vue.
10. Le champ « Classe (élève) » reste visible pour les profils Professeur et Administrateur.
11. Les champs du formulaire Tâche (Matière) ne se vident pas, ce qui classe le devoir suivant dans la mauvaise matière.

---

## 6. Recommandations concrètes

### Correctifs urgents
- **Menu** : ajouter `overflow-y: auto` (et `max-height: 100dvh`) sur `.sidebar` ; mettre « Se déconnecter » **en haut** du menu mobile ou dans un menu derrière l'avatar en haut à droite (aujourd'hui un simple `<span>`).
- **Navigation** : synchroniser l'onglet et le cours actif avec l'URL (`#/cours/123`, `#/admin/classes`) pour que retour et rechargement fonctionnent.
- **429** : afficher « Trop d'essais. Par sécurité, attendez 15 minutes ou demandez à la vie scolaire de réinitialiser votre mot de passe. »
- **Publication** : remplacer la liste déroulante par un bouton vert **« Publier pour les élèves »**, puis « Retirer des élèves » et « Archiver ». Badge « Visible par les élèves » ou « Pas encore visible ». Renommer « Prêt » en « Texte lu ✓ » ou le masquer.
- **Traduire les types** : Cours, Exercice, Contrôle d'entraînement, Correction.

### Vocabulaire et microcopie
| Actuel | Proposé |
|---|---|
| « Adresse indisponible. » | « Un compte existe déjà avec l'adresse X. » |
| « Modifications enregistrées. » | Message précis et éphémère près du bouton : « Compte de Noé Cohen créé. Identifiants à lui transmettre : … » |
| « Mot de passe initial » | « Mot de passe provisoire (12 caractères minimum) » + bouton « Générer » + « Imprimer la fiche de connexion » |
| « Enregistrer l'affectation » / « Créer et affecter » | Un seul assistant : « Créer le cours de [matière] de [classe] pour [prof] » |
| « Nom, adresse valide, rôle et mot de passe de 12 à 128 caractères requis. » | Une erreur par champ, sous le champ fautif |
| « Date, horaires ou type invalides. » | « L'heure de fin doit être après l'heure de début. » |
| « IA non configurée pour cet établissement. Contactez l'administration. » | Élève : « L'assistant n'est pas encore activé dans ton école. En attendant, relis ton cours ou pose ta question à ton professeur. » (bandeau neutre, bouton désactivé) |
| « Masqué » / « Agrégats » / « moins de 5 participants » | « Les statistiques s'afficheront quand au moins 5 élèves auront utilisé le cours (pour protéger leur vie privée). » |
| « Votre délégation permet… » | « Tu es délégué(e) de ce cours : tu peux envoyer des documents ; Mme Lévy les vérifie avant de les montrer à la classe. » |
| « Brouillon » (délégué) | « En attente de validation par Mme Lévy » |
| « Assistant pédagogique » (élève) | « Poser une question » ; « Atelier IA » (prof) en « Préparer un exercice avec l'IA » |
| « Mon organisation » | « Mon planning de devoirs » |
| Sous-titres génériques | Un sous-titre propre à chaque écran et à chaque rôle |

### Ergonomie
- **Menu par rôle** : l'admin ne voit qu'Administration (Comptes, Classes, Cours), Mon compte et Déconnexion. Le prof ne voit ni « Entraînement » ni « Mon organisation ». L'accueil admin devient un tableau de bord (« 3 élèves sans classe », « 1 prof sans cours »).
- **Admin guidé** : un assistant « Rentrée » en 5 étapes numérotées (Année, Matières, Classes, Comptes, Inscriptions et cours), avec une case cochée à chaque étape. Déplacer « Créer une matière » dans « Cours & affectations ». Afficher l'année à côté du nom de classe et refuser les doublons. Masquer « Classe (élève) » quand le profil n'est pas Élève. Confirmer avant « Désactiver » et afficher un badge « Compte désactivé ». Import CSV des élèves.
- **Assistant élève** : mettre la zone de question **en haut**, ou en zone fixe en bas d'écran. Replier les blocs « Mémoire privée » et « Méthode du professeur » derrière « En savoir plus ». Ajouter un compteur de caractères (« 1 850 / 2 000 »). Tutoyer de façon homogène au collège.
- **Formulaires** : vider après succès, désactiver le bouton pendant l'envoi, faire défiler vers le formulaire ouvert (« Déposer un document ») et vers le message.
- **Mon organisation** : mettre École Directe en bas ou le masquer quand le connecteur est désactivé, afficher les dates en format français (« 30 oct. 2026 »), avertir pour une date limite passée.
- **Prof** : un encadré « À valider : 1 document déposé par Lou Moreau » sur l'accueil, un bouton « Voir comme un élève », des libellés texte sous les icônes sur mobile.
- **Connexion** : lien « Mot de passe oublié ? » (vers une demande à la vie scolaire), œil pour afficher le mot de passe, remonter en haut de page après connexion.

---

## 7. Idées de fonctionnalités issues des tests
1. **Fiche de connexion imprimable ou PDF** par élève (identifiant, mot de passe provisoire, QR code), avec obligation de changer le mot de passe à la première connexion.
2. **Import CSV ou Excel** des élèves et des classes (export Pronote ou École Directe), avec détection des doublons.
3. **Assistant de rentrée** pour l'administration, avec un indicateur de complétude (« la 6e B n'a pas de prof de français »).
4. **Mode « Voir comme un élève »** pour le prof.
5. **Notifications** : prof (document de délégué à valider), élève (nouveau document publié), et compteur « Nouveau » sur les cartes de cours.
6. **Conversion d'un .doc ou d'une photo** (OCR) avec un message pédagogique : « Votre fichier Word est ancien : ouvrez-le et faites Fichier > Enregistrer sous > .docx ».
7. **Statistiques minimales non nominatives** dès 1 élève pour le prof (« document ouvert par 2 élèves sur 3 ») si la politique de confidentialité le permet, ou une explication claire de la limite à 5.
8. **Visite guidée de premier usage** (3 bulles par rôle), et page « Aide » avec des vidéos de 30 s (« Publier un cours », « Poser une question »).
9. **Mode « devoirs maison »** contrôlé par le prof, qui désactive « Correction expliquée » sur certains chapitres ou certaines périodes (anti-triche).
10. **Menu « compte » sur l'avatar** (Mon compte, Déconnexion, Taille du texte), et option « Grand texte » pour les enseignants âgés.
11. **Déconnexion automatique** après inactivité sur poste partagé, avec la case « Ordinateur partagé » à la connexion.
12. **Vue « Ma semaine »** du planning avec glisser-déposer, plutôt que des formulaires Date/De/À.
