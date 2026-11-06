# Personas 05 — Adultes hors professeurs : administration, direction, vie scolaire, parents, RGPD, informatique

Simulation d'usage d'IABNE (Yabné Paris, collège + lycée, élèves mineurs) par 8 adultes qui ne sont pas enseignants.
Accent : administration (comptes, classes, affectations, passage d'année, mots de passe, départs) et attentes sur les **groupes de travail entre élèves**.

## Ce que le code permet réellement aujourd'hui (base des blocages cités)

Constaté dans `server/auth.mjs`, `server/db.mjs`, `server/learning.mjs` et `src/main.jsx` (fonction `Administration`, l. 2869-3184) :

| Sujet | État réel |
| --- | --- |
| Rôles | Trois seulement : `admin`, `teacher`, `student` (contrainte `CHECK` dans `db.mjs`). Pas de parent, CPE, direction, secrétariat, technicien. La secrétaire, le directeur et l'informaticien doivent tous être « Administrateur » avec exactement les mêmes droits. |
| Créer un compte | Onglet **Administration > Comptes**, formulaire unitaire : « Nom complet », « Adresse e-mail » (obligatoire, regex `\S+@\S+\.\S+`), « Mot de passe initial » (masqué, 12 caractères min., **sans champ de confirmation ni bouton afficher/générer**), « Profil », « Classe (élève) ». Un compte à la fois. Pas d'import CSV/École Directe. |
| Unicité e-mail | `email ... COLLATE NOCASE UNIQUE` au niveau **global** : deux frères et sœurs ne peuvent pas partager l'adresse d'un parent → erreur « Adresse indisponible. » |
| Liste des comptes | « Comptes de l'établissement » : tous les comptes sur une seule liste, sans recherche, filtre, tri par classe, pagination ni export. Boutons « Réinitialiser » et « Désactiver/Réactiver ». |
| Désactiver | Un clic, **sans confirmation** (contrairement à « Retirer » une inscription). Le dernier admin et soi-même sont protégés. Les inscriptions en classe restent. |
| Modifier | L'API `PATCH /api/admin/users/:id` accepte nom, état, mot de passe ; **l'interface n'expose pas la modification du nom** ; l'adresse e-mail et le rôle ne sont modifiables nulle part. Aucune suppression de compte. |
| Mot de passe oublié | Aucun lien sur l'écran de connexion, seulement « Pas d'inscription libre. Besoin d'un accès ? Contactez l'administration. » L'admin tape lui-même un nouveau mot de passe (12 car. min.) ; les sessions sont invalidées. Aucune obligation de le changer à la première connexion. Pas de mail (FEATURES.md : « Pas d'envoi automatique de mails »). |
| Connexion | Par adresse e-mail uniquement. Message identique pour mauvais mot de passe et compte désactivé (« Adresse ou mot de passe incorrect. »). Limite 20 essais / 15 min par IP + adresse. Session de 8 h. |
| Classes | Onglet **Classes** : créer (Nom, Niveau en texte libre, Année facultative). Si l'année n'est pas choisie, le serveur prend `SELECT id FROM school_years ... LIMIT 1` **sans ORDER BY** : la classe peut tomber dans une année arbitraire. La liste n'affiche pas l'année. Ni modification, ni suppression, ni archivage. |
| Années | « Nouvelle année scolaire » crée seulement un nom. Aucun passage d'année, aucune promotion, aucune clôture. |
| Inscriptions | « Inscriptions actuelles » : liste plate de **toutes** les inscriptions de l'établissement + bouton « Retirer » (avec confirmation, révoque les délégations). « Inscrire un élève » : menu déroulant de tous les élèves, affichés par nom seul (homonymes indiscernables). Un élève peut être dans plusieurs classes, rien ne l'empêche. |
| Matières | « Créer une matière » est rangé dans l'onglet Classes. Ni renommer ni supprimer. |
| Cours & affectations | Deux formulaires : « Créer un espace de cours » (bouton « Créer et affecter ») qui **échoue** si l'affectation n'existe pas déjà (« Cours invalide : une affectation existante est requise. »), et « Affecter un professeur ». Aucune suppression d'affectation, aucun remplacement d'enseignant. « Cours existants » affiche `c.subject`, `c.className`, `c.teacherName` que `/api/bootstrap` ne fournit pas : la ligne s'affiche « · · » sans matière, classe ni professeur. |
| Indicateurs | **Suivi pédagogique** (`/api/stats`, `learning.mjs` l. 830) filtre `c.teacher_id === req.user.id` : un admin/directeur qui n'enseigne pas voit « Pas encore d'indicateur ». Pas de tableau de bord établissement. Seuil de 5 élèves sur les agrégats. |
| Navigation admin | L'admin voit aussi « Entraînement », « Mon organisation », « Assistant pédagogique », « Atelier IA » : inutiles pour la secrétaire. |
| Traçabilité | Aucun journal des actions d'administration (qui a créé, désactivé, réinitialisé quoi). Un admin peut fixer le mot de passe de n'importe qui, puis se connecter à sa place. |
| RGPD | FEATURES.md : « Pas de rétention automatique globale ni de suppression administrative complète d'une identité ». OPERATIONS.md : fournisseurs IA Anthropic/OpenAI, région Railway à choisir, responsabilités à définir avec le DPO. |
| Exploitation | Une seule instance SQLite (OPERATIONS.md). Sauvegarde `npm run backup` exigeant l'arrêt des écritures (`MAINTENANCE_CONFIRMED=true`), export hors Railway à faire à la main. Clé École Directe à conserver à part. |
| Groupes d'élèves | **Rien.** Aucune table, aucune route, aucun écran. Les seuls liens élève-élève sont la classe et la délégation (déposer un brouillon). |
| Langue | Interface uniquement en français (`<html lang="fr">`, dates `fr-FR`). |

---

## Persona 1 — Martine, secrétaire de direction

### 1. Fiche
- **Martine Sitbon**, 58 ans, secrétaire de direction depuis 22 ans à Yabné. Gère les inscriptions, les dossiers, les certificats de scolarité, le standard, et les comptes École Directe « parce que personne d'autre ne sait le faire ».
- Numérique : Excel (elle sait trier et faire un copier-coller, pas une RECHERCHEV), Outlook, le logiciel de vie scolaire. Peur de « casser quelque chose ». Écrit les mots de passe dans un cahier à spirale rangé dans son tiroir.
- IA : « C'est le truc de ChatGPT ? Mon petit-fils fait ses devoirs avec. »
- Matériel : PC fixe Windows du secrétariat, écran 19 pouces, Edge. Téléphone qui sonne toutes les 4 minutes.
- Ce qu'elle veut vraiment : que la rentrée se passe sans qu'elle reste jusqu'à 21 h, et ne plus être la personne qu'on appelle pour chaque mot de passe.

### 2. Journal d'usage
**Lundi 24 août — première connexion.** Karim m'a donné une adresse et un mot de passe sur un post-it. Je me connecte, je vois « Vue d'ensemble », « Mes cours », « Assistant pédagogique », « Entraînement »… Je ne suis pas élève, pourquoi j'ai « Entraînement » ? Je trouve « Administration » tout en bas. Trois onglets : Comptes, Classes, Cours & affectations. Bon.

**Mardi 25 août — les classes.** Je crée « 6e A ». Niveau : je mets « 6e ». Puis « 6ème B », niveau « 6ème »… je m'en rends compte à la 4e classe, il n'y a pas de bouton pour corriger. J'ai maintenant « 6e » et « 6ème » comme niveaux. Je n'ai pas choisi d'année scolaire parce que c'était marqué facultatif. Karim me dira plus tard qu'il avait créé une année « test » et que trois de mes classes sont peut-être rangées dedans, on ne voit pas l'année dans la liste.

**Mercredi 26 août — les 600 élèves.** J'ai le fichier Excel des inscrits. Je cherche un bouton « Importer ». Il n'y en a pas. Je commence un par un : nom, e-mail, mot de passe d'au moins 12 caractères, profil Élève, classe. Le mot de passe s'affiche en petits points, je ne vois pas ce que je tape, et il n'y a pas de deuxième case pour vérifier. Pour ne pas me tromper j'utilise le même pour tout le monde : `Yabne2026rentree`. Je sais que ce n'est pas bien.
Les 6e n'ont pas d'adresse e-mail. Je mets celle de la maman. Pour les jumeaux Cohen : « Adresse indisponible. » Je ne comprends pas. J'essaie avec le papa. Pour la troisième de la fratrie, j'invente `cohen.lea@yabne.local`. Personne ne recevra jamais rien à cette adresse, mais au moins ça passe.
En moyenne 1 min 30 par élève quand le téléphone ne sonne pas. 600 élèves = 15 heures. Plus 80 professeurs et personnels.

**Jeudi 27 août — les affectations.** Il faut affecter les professeurs. Je vais dans « Créer un espace de cours », je remplis tout, je clique « Créer et affecter » : « Cours invalide : une affectation existante est requise. » Mais je suis justement en train d'affecter ! Il faut d'abord remplir le formulaire de droite « Affecter un professeur », puis revenir à gauche. Dans « Cours existants », je vois les titres mais rien derrière, juste des petits points « · · ». Je ne sais pas quel cours appartient à quel prof.
Les menus déroulants « Professeur » et « Élève » font des kilomètres et il y a deux « Cohen David » (un 6e et un 1re) : je ne sais pas lequel choisir.

**Lundi 7 septembre, 8 h 05 — la crise du lundi matin.** 14 élèves au secrétariat, 6 coups de téléphone de parents, 3 profs par mail : « mot de passe oublié ». Il n'y a pas de lien « mot de passe oublié » sur la page de connexion, ça dit « Contactez l'administration ». L'administration, c'est moi. Pour chacun : je cherche le nom dans la liste de 680 comptes en faisant défiler (Ctrl+F dans Edge, merci mon neveu), « Réinitialiser », je tape un nouveau mot de passe de 12 caractères, je l'écris sur un papier. La petite Noa revient 10 minutes après : elle a tapé le mot de passe avec une majuscule de trop 20 fois, elle est bloquée 15 minutes.
Un élève me dit « ça marche pas » : en fait son compte était désactivé (j'avais cliqué « Désactiver » à côté de « Réinitialiser » la semaine d'avant, il n'y a pas eu de « Êtes-vous sûre ? »). Le message à l'écran disait juste « Adresse ou mot de passe incorrect. », donc on a cherché pendant 20 minutes.

**Novembre — départ d'un élève.** Ilan part à Lyon. Je clique « Désactiver ». Il reste dans « Inscriptions actuelles » de la 4e B. Faut-il aussi le retirer ? Le supprimer ? Il n'y a pas de bouton supprimer. Ses parents demandent « qu'on efface tout ce qui le concerne ». Je ne sais pas faire.

**Changement de classe en janvier.** Sarah passe de 2nde A en 2nde C. Je l'inscris en 2nde C : elle est maintenant dans les deux. Il faut que je retrouve la ligne « Sarah Lévy · 2nde A » dans une liste de 600 inscriptions pour cliquer « Retirer ».

### 3. Blocages, agacements, contournements
- **Pas d'import** : 15 à 20 heures de saisie (Administration > Comptes). Abandon probable : elle demandera à Karim de « faire un truc en base », ce qui court-circuite toutes les protections.
- **Mot de passe masqué sans confirmation ni générateur** : mots de passe identiques pour tous, écrits sur papier, envoyés par WhatsApp aux parents. Risque majeur de sécurité créé par l'interface.
- **E-mail obligatoire et unique globalement** : invention d'adresses `@yabne.local` ; les fratries cassent tout.
- **Vocabulaire** : « Profil », « espace de cours », « affectation », « inscription » : pour elle, un élève est « dans une classe », un prof « a une classe ». « Créer et affecter » qui n'affecte pas.
- **Désactiver sans confirmation**, juste à côté de « Réinitialiser ».
- **Aucune correction possible** d'une faute de frappe dans un nom, une classe, un niveau, un e-mail.
- **Listes interminables** sans recherche ni filtre par classe ; homonymes indiscernables dans les menus.
- **Pas d'impression** : elle veut une feuille par classe avec les identifiants à distribuer.
- Contournement : un tableau Excel parallèle « identifiants IABNE » avec tous les mots de passe en clair, sur le bureau partagé du secrétariat.

### 4. Ce qu'elle adorerait
- « Je mets mon fichier Excel, je clique, c'est fait, et ça m'imprime une feuille par classe. »
- Que les élèves puissent récupérer leur mot de passe eux-mêmes, ou que le professeur principal puisse le faire pour sa classe.
- Un écran simple qui n'affiche que ce dont elle a besoin.

### 5. Demandes (ses mots → fonctionnalités)
| Ses mots | Fonctionnalité |
| --- | --- |
| « Je veux mettre mon fichier Excel. » | Import CSV/XLSX (et/ou depuis l'export École Directe) avec modèle téléchargeable, aperçu, détection des doublons et homonymes, rapport d'erreurs ligne par ligne, mode « simulation » avant validation. |
| « Je ne veux pas inventer 600 mots de passe. » | Génération automatique de mots de passe temporaires lisibles (sans 0/O, 1/l), changement obligatoire à la première connexion. |
| « Une feuille par classe à distribuer. » | Export PDF « fiches de connexion » par classe (une étiquette découpable par élève, avec l'adresse du site et un QR code), et lettre aux familles. |
| « Les petits n'ont pas d'e-mail. » | Identifiant de connexion distinct de l'e-mail (ex. `prenom.nom` ou numéro), e-mail facultatif ; contacts parents séparés de l'identifiant élève. |
| « Je me suis trompée de nom. » | Modification du nom, de l'e-mail/identifiant, du rôle, de la classe, du niveau ; renommage et archivage des classes et matières. |
| « Ilan part à Lyon. » | Assistant « départ d'un élève » : date de sortie, retrait des classes, désactivation, export des données pour la famille, suppression programmée selon la politique de conservation. |
| « Sarah change de classe. » | Action « Changer de classe » (déplacer, avec date d'effet), au lieu d'inscrire puis retirer. |
| « Je ne trouve personne dans la liste. » | Recherche, filtres (rôle, classe, actif/inactif), tri, pagination ; affichage de la classe à côté du nom dans tous les menus déroulants. |
| « Êtes-vous sûre ? » | Confirmation sur Désactiver, annulation possible (« Annuler » pendant 10 s). |
| « Le lundi matin c'est l'enfer. » | « Mot de passe oublié » libre-service (code par e-mail à un parent ou au compte), et délégation de la réinitialisation au professeur principal / à la vie scolaire pour leurs classes. Message de connexion qui distingue « compte désactivé, contactez le secrétariat ». |
| « Je n'ai pas besoin de "Entraînement". » | Menu adapté au rôle (secrétariat : Comptes, Classes, Rentrée, Imprimer). |

### 6. Groupes de travail entre élèves
« Si les élèves font leurs groupes eux-mêmes, très bien, mais que ça ne passe pas par moi. Je ne vais pas créer 150 groupes. Et quand un élève part, il faut qu'il sorte des groupes tout seul. »
→ Groupes créés par les élèves ou les profs, jamais par le secrétariat ; nettoyage automatique au départ / changement de classe ; aucune administration manuelle des groupes côté secrétariat.

---

## Persona 2 — M. Benhamou, chef d'établissement

### 1. Fiche
- **David Benhamou**, 53 ans, directeur depuis 6 ans, ancien professeur d'histoire. Répond à un conseil d'administration (association gestionnaire), au rectorat (contrat d'association), au Consistoire / à la communauté, et à 450 familles très présentes.
- Numérique : iPad Pro en réunion, iPhone, lit tout en diagonale entre deux rendez-vous. Pense que l'IA est « inévitable, mais c'est moi qui serai au tribunal si ça dérape ».
- Ce qu'il veut vraiment : des chiffres simples pour le CA (combien utilisent, est-ce que ça aide, combien ça coûte), un discours rassurant et vrai pour les parents, et zéro scandale (triche, contenu inapproprié, fuite de données).

### 2. Journal d'usage
**Septembre — première connexion (iPad).** On m'a créé un compte « Administrateur ». J'ouvre « Vue d'ensemble » : c'est l'écran d'un élève ou d'un prof, avec « Mes cours ». Je clique « Suivi pédagogique », c'est ce que je veux montrer au CA : « Pas encore d'indicateur. Les données apparaissent pour les cours dont vous êtes responsable. » Je ne suis responsable d'aucun cours, je suis responsable de l'établissement ! Je n'ai aucun chiffre.

**Octobre — préparation du CA.** Le trésorier veut savoir : combien d'élèves se connectent, combien de questions, combien coûte l'IA par mois, et « est-ce que les notes montent ». Je demande à Karim, il me dit qu'il peut « faire une requête SQL ». Je reçois un tableau incompréhensible. Le coût IA, il faut aller sur la console du fournisseur.

**Novembre — la crise.** Un parent (M. Azoulay, voir persona 4) envoie un mail à tout le CA : « Nos enfants parlent à une IA américaine, qui lit leurs conversations ? ». Je dois répondre sous 48 h. Je ne sais pas : où sont les données ? qui y a accès ? combien de temps ? Est-ce que moi, en tant qu'administrateur, je peux lire les conversations ? (Je découvre que techniquement je peux réinitialiser le mot de passe d'un élève et me connecter à sa place, sans que cela laisse de trace. Ça me fait peur pour moi-même : si un jour on m'accuse, je ne peux pas prouver que je ne l'ai pas fait.)

**Décembre — conseil de classe.** J'aimerais voir pour la 3e B : qui utilise l'outil, qui ne l'a jamais ouvert, quelles notions coincent. Je n'ai rien. Le prof de maths a des stats sur son cours, mais je ne peux pas les voir, et je ne vois pas la vue d'ensemble du niveau.

**Juin — bilan.** Il faut décider si on renouvelle. Je n'ai pas de données pour décider.

### 3. Blocages
- **Suivi pédagogique vide pour lui** (`/api/stats` filtre sur `teacher_id`). Aucun tableau de bord direction, contrairement au cahier des charges (§9 « Tableau de bord avancé pour la direction »).
- **Même rôle que la secrétaire et l'informaticien** : il a trop de droits techniques et pas les bons droits de pilotage.
- **Aucun journal d'audit** : il ne peut ni contrôler son équipe ni se protéger.
- **Pas de document « à quoi sert l'IA / ce qu'elle ne fait pas » prêt à envoyer aux familles**, ni de charte d'usage signable.
- Coût IA : plafonds par utilisateur seulement (OPERATIONS.md), aucun budget établissement visible dans l'application.
- Détournement envisagé : demander à Karim d'extraire des données individuelles (« qui triche ? ») — exactement ce que la règle des 5 élèves voulait éviter.

### 4. Ce qu'il adorerait
- Une page « Établissement » avec 6 chiffres et une courbe, exportable en PDF pour le CA.
- Une phrase prouvée : « Aucune conversation d'élève n'est lue par un adulte de l'établissement, et voici le journal qui le prouve. »
- Une « mise en pause » globale de l'IA (en période d'examen blanc, ou en cas d'incident).

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Des chiffres pour le CA. » | Tableau de bord direction : comptes actifs/activés (%), connexions hebdo par niveau et par classe, questions IA, fiches/quiz générés, documents publiés par matière, profs actifs, évolution mensuelle ; export PDF/CSV ; agrégats seulement, seuil ≥ 5. |
| « Combien ça coûte ? » | Suivi de consommation IA (jetons, coût estimé) par mois, par niveau, par fonction ; budget mensuel établissement avec alerte et coupure douce. |
| « Est-ce que ça aide ? » | Indicateurs d'usage croisables avec les résultats (import de moyennes agrégées par classe), sans profilage individuel ; enquête de satisfaction intégrée (élèves, profs, parents). |
| « Je ne veux pas être soupçonné. » | Journal d'audit infalsifiable des actions admin (création, désactivation, réinitialisation, export, connexion en tant que) consultable par la direction et le DPO ; interdiction de « se connecter à la place de » sans procédure tracée. |
| « Je veux voir la 3e B. » | Vue par classe pour direction / professeur principal : taux d'activation, élèves jamais connectés, notions difficiles agrégées. |
| « Il faut un texte pour les parents. » | Page publique « IABNE et vos données » + charte d'usage IA (élève/parent) avec accusé de lecture numérique. |
| « Coupez l'IA pendant le brevet blanc. » | Interrupteur établissement / niveau / classe / matière avec plage horaire (mode examen). |
| « Je ne fais pas de technique. » | Rôles distincts : Direction (pilotage, lecture), Secrétariat (comptes), Vie scolaire, Technique, Admin principal. |

### 6. Groupes de travail
« Les groupes, oui, c'est pédagogiquement formidable. Mais si un groupe devient un lieu de harcèlement ou de partage de photos, c'est ma responsabilité. Je veux qu'on puisse fermer un groupe, que les profs y aient un regard, et qu'il n'y ait pas de messagerie privée cachée entre élèves. »
→ Groupes rattachés à un cours/projet, visibles par le professeur responsable ; pas de messagerie libre non modérée par défaut ; bouton signaler ; possibilité pour la direction/vie scolaire de suspendre un groupe ; statistiques agrégées sur l'usage des groupes pour le CA ; charte spécifique aux groupes.

---

## Persona 3 — Sarah, conseillère principale d'éducation (CPE)

### 1. Fiche
- **Sarah Attal**, 39 ans, CPE du collège (360 élèves), avec 3 AED. Suit les absences, le décrochage, les situations familiales difficiles, le harcèlement, le bien-être, les PAP/PPS/PAI.
- Numérique : à l'aise, utilise École Directe et Pronote dans son ancien établissement, beaucoup de tableaux partagés. Méfiante envers « les outils qui transforment les enfants en indicateurs ».
- Ce qu'elle veut vraiment : repérer tôt les élèves qui décrochent ou vont mal, sans espionner ; que l'outil ne devienne pas un lieu de harcèlement ; aider les élèves à besoins particuliers.

### 2. Journal d'usage
**Septembre.** Je n'ai pas de rôle CPE. On m'a mise « Professeur » pour que je puisse voir quelque chose, mais sans affectation je ne vois aucun cours. Ensuite « Administrateur » : là je vois tout, y compris des choses que je ne devrais pas (je peux réinitialiser les comptes des profs), mais je n'ai toujours aucun indicateur, « Suivi pédagogique » est vide.

**Octobre — un élève en difficulté.** Nathan (5e C) ne rend plus rien. J'aimerais savoir s'il se connecte, s'il utilise le tuteur. Je ne veux pas lire ses conversations (et l'outil a raison de les protéger), mais un simple « dernière connexion : il y a 23 jours » m'aiderait. Je ne l'ai pas. Je finis par demander à Nathan lui-même.

**Novembre — semaine du harcèlement.** Une élève de 4e me dit qu'on se moque d'elle « sur l'appli des devoirs ». Vérification : il n'y a pas d'espace d'échange entre élèves dans IABNE, c'était un groupe WhatsApp créé « pour le projet d'histoire ». C'est justement ce qu'on aurait évité avec des groupes encadrés.

**Décembre — élèves à besoins particuliers.** Deux élèves dyslexiques bénéficient d'un PAP : police adaptée, consignes courtes, lecture audio. Rien n'existe pour ça dans IABNE ; la mère d'Eden me demande si l'IA « peut lui faire des fiches plus aérées ». Je ne sais pas comment le paramétrer pour lui sans que tout le monde le sache.

**Février — un élève évoque des idées noires au tuteur.** Hypothèse que je redoute : un élève écrit à 23 h au tuteur « de toute façon je veux disparaître ». Que fait l'IA ? Est-ce que quelqu'un est prévenu ? La conversation est privée… Je n'ai trouvé aucune règle documentée là-dessus (TUTOR.md parle de mémoire privée et de suspension, pas de situation de détresse).

### 3. Blocages
- **Aucun rôle Vie scolaire / CPE** ; obligée d'être admin (trop de droits) ou prof (rien à voir).
- **Aucun signal d'engagement non intrusif** (dernière connexion, activité oui/non par semaine).
- **Pas de protocole de détresse** dans le tuteur : ni message de ressources (3114, 119, Net Écoute 3018), ni orientation vers un adulte référent.
- **Pas d'adaptations** (PAP/PPS : police, taille, lecture vocale, consignes simplifiées).
- Groupes inexistants → les élèves vont sur WhatsApp/Snapchat, hors de tout cadre.
- Risque détourné inverse : un admin peut se faire passer pour un élève (reset mot de passe) pour « vérifier » ce qu'il écrit — elle refuse, mais quelqu'un d'autre pourrait.

### 4. Ce qu'elle adorerait
- Une liste « élèves inactifs depuis 15 jours » par classe, à croiser avec ses propres signaux.
- Que le tuteur sache dire « parle-en à un adulte, voici qui » et qu'elle soit identifiée comme ressource.
- Des groupes de travail où les profs voient ce qui s'y passe et où un élève isolé est placé avec bienveillance.

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Un rôle à moi. » | Rôle Vie scolaire / CPE : lecture des comptes, classes, activité agrégée et dernière connexion ; réinitialisation de mot de passe des élèves de son périmètre (collège) ; pas d'accès aux documents brouillons ni aux comptes adultes. |
| « Je veux savoir s'il décroche, pas ce qu'il dit. » | Indicateur d'engagement minimal (dernière connexion, semaines actives) visible des CPE/PP, documenté et annoncé aux familles, sans contenu. |
| « Si un élève va mal… » | Protocole de détresse dans le tuteur : détection de propos à risque, réponse empathique avec numéros d'aide et personnes référentes de l'établissement ; procédure d'alerte vers la CPE décidée avec le DPO et la direction et expliquée aux élèves (pas de surveillance cachée). |
| « Les élèves dys. » | Préférences d'accessibilité par élève (police OpenDyslexic/Luciole, taille, interlignage, lecture audio, consignes courtes) activables par l'élève ou sur PAP, appliquées aux fiches PDF. |
| « Le harcèlement. » | Groupes encadrés : bouton « signaler », modération, historique conservé pour enquête, suspension par la vie scolaire. |
| « Les AED. » | Délégation aux AED : réinitialiser les mots de passe des élèves sans voir le reste. |

### 6. Groupes de travail
« Je veux que personne ne reste tout seul quand le prof dit "mettez-vous en groupes". Je veux pouvoir dire : ces deux-là ne doivent pas être ensemble (il y a une procédure en cours). Et je veux que les messages des groupes restent visibles, pas éphémères. »
→ Composition des groupes par le prof, ou par les élèves avec validation du prof ; règles d'incompatibilité confidentielles (visibles uniquement par vie scolaire/prof : « ne pas associer ») ; détection des élèves sans groupe ; pas de messages éphémères ; signalement et modération ; possibilité de groupes « tutorat entre pairs » (un élève de 3e aide un 6e) encadrés.

---

## Persona 4 — Philippe, parent très inquiet de l'IA et des données

### 1. Fiche
- **Philippe Azoulay**, 48 ans, avocat en droit des affaires, père de Maya (4e) et Tom (CM2, futur 6e). A lu des articles sur les données d'enfants revendues, sur les IA qui « inventent » et sur les chatbots compagnons.
- Numérique : très à l'aise, lit les CGU, sait ce qu'est un sous-traitant au sens de l'article 28 RGPD.
- Ce qu'il veut vraiment : savoir exactement quelles données de sa fille sont traitées, par qui, où, combien de temps ; pouvoir refuser ; être sûr que l'IA ne remplace pas l'effort et ne dit pas n'importe quoi.

### 2. Journal d'usage
**Septembre.** Maya rentre avec un papier : un identifiant `azoulay.maya@yabne.local` (inventé par le secrétariat) et `Yabne2026rentree`. Tous ses camarades ont le même mot de passe, Maya me l'a dit en riant. Première réaction : mail à la direction.
Je me connecte avec le compte de Maya (il n'existe aucun compte parent). Je vais dans « Mon compte » : nom, adresse, « Changer mon mot de passe ». Rien sur la confidentialité, pas de mentions légales, pas de politique de données, pas de bouton « télécharger mes données ».
Je vais dans « Assistant pédagogique » > « Mon tuteur personnel ». Je découvre une « mémoire privée » : erreurs de quiz, difficultés déclarées, « observations pédagogiques de l'IA ». L'IA écrit donc un profil de ma fille. Il y a un bouton pour suspendre et un pour réinitialiser, c'est bien, mais c'est Maya qui décide, pas moi.

**Octobre.** Je demande par écrit : (1) quel fournisseur IA, (2) où sont hébergées les données, (3) durée de conservation des conversations, (4) qui y a accès, (5) les conversations servent-elles à entraîner un modèle ? La direction transmet au DPO. Réponse 5 semaines plus tard, partielle.

**Novembre — la crise.** Maya me montre que le tuteur lui a donné une « correction expliquée » complète d'un exercice de maths pour le lendemain. Pour moi, c'est faire les devoirs à sa place. J'écris au CA (voir persona 2).

**Décembre.** Je demande l'effacement de toutes les données de Maya. Le secrétariat ne sait pas faire (aucune suppression de compte dans l'interface ; FEATURES.md le reconnaît).

### 3. Blocages
- **Aucune information intégrée** : ni politique de confidentialité, ni registre, ni mention du fournisseur IA dans l'interface.
- **Mot de passe initial commun** (conséquence de l'interface de création).
- **Pas de compte parent** : il utilise le compte de sa fille, ce qui fausse le tuteur personnel (ses propres questions entrent dans la « mémoire » de Maya).
- **Pas de consentement / opposition** paramétrable par famille (ex. « pas de mémoire du tuteur », « pas d'IA pour mon enfant »).
- **Suppression impossible** et absence de procédure de droit d'accès (export).
- **Correction complète accessible** la veille du devoir : contradiction perçue avec « l'IA guide l'élève, elle ne fait pas à sa place » (cahier des charges §1.3).

### 4. Ce qui le ferait changer d'avis
- Une page claire et datée « Données et IA » avec le nom des sous-traitants, la région, les durées, et l'engagement « pas d'entraînement sur les données » (avec référence contractuelle).
- Un tableau de bord parent qui montre **ce que l'IA sait de son enfant** (la même mémoire que l'élève voit), avec export.
- La preuve que la correction complète n'est donnée qu'après une vraie tentative et peut être désactivée par le prof pour les devoirs notés.

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Qui, où, combien de temps ? » | Page « Confidentialité & IA » intégrée et versionnée (fournisseurs, région, durées, finalités, base légale, contact DPO), affichée à la première connexion. |
| « Je veux voir ce que l'IA sait de ma fille. » | Compte parent lié (responsable légal), lecture de la mémoire du tuteur et des paramètres de confidentialité de l'enfant (pas des conversations mot à mot, selon la politique arrêtée avec le DPO, et avec information de l'élève). |
| « Je veux pouvoir refuser. » | Paramètres famille : désactiver la mémoire, désactiver le tuteur, limiter les horaires ; consentements traçés et révocables. |
| « Envoyez-moi ses données. » | Export droit d'accès (JSON + PDF lisible) par personne, depuis l'admin et depuis l'espace parent. |
| « Effacez tout. » | Suppression complète d'une identité et de ses dépendances (conversations, mémoire, quiz, fichiers déposés, sessions, journaux), avec certificat et délai pour les sauvegardes. |
| « Pas de devoirs faits par l'IA. » | Réglage par devoir/cours « mode évaluation » : pas de correction complète avant la date de rendu, ou seulement après tentative argumentée. |
| « Le même mot de passe pour toute la classe ! » | Mots de passe initiaux uniques générés + changement obligatoire à la première connexion. |
| « L'IA se trompe parfois. » | Mention visible « réponse générée, à vérifier », bouton « signaler une erreur » envoyé au prof. |

### 6. Groupes de travail
« Qui peut parler à ma fille ? Avec quelles personnes est-elle dans un groupe ? Est-ce qu'un élève de Terminale peut lui écrire ? Est-ce que l'IA lit les discussions de groupe ? »
→ Groupes limités aux élèves d'une même classe ou d'un même cours (pas de contact inter-niveaux sans cadre prof) ; liste des membres visible par l'élève et, si compte parent, par le parent ; IA du groupe séparée de la mémoire privée individuelle ; durée de conservation des échanges de groupe affichée ; pas de partage de photos/fichiers personnels hors documents de travail ; pas d'annuaire des élèves.

---

## Persona 5 — Julien, père séparé qui veut voir les devoirs de son fils

### 1. Fiche
- **Julien Bensoussan**, 41 ans, chef de projet dans une banque, séparé, garde alternée une semaine sur deux de Raphaël (6e B). Habite le 17e, la mère dans le 12e.
- Numérique : à l'aise, iPhone, Mac. Le compte École Directe « famille » a été créé avec l'adresse de la mère, qui ne lui transmet pas toujours les infos.
- Ce qu'il veut vraiment : savoir, le lundi de sa semaine, ce que Raphaël a à faire et ce qui coince, sans dépendre de son ex-femme ; aider son fils sans tout faire à sa place.

### 2. Journal d'usage
**Septembre.** Raphaël a un compte IABNE créé avec l'adresse de sa mère (le secrétariat a mis l'adresse du dossier d'inscription). Je n'ai aucun accès. Je demande un compte parent : « ça n'existe pas, utilisez celui de votre fils ».
Raphaël me donne son mot de passe. Je vais dans « Mon organisation » : son planning et ses devoirs, mais seulement ceux qu'il a saisis ou synchronisés depuis École Directe — et la synchronisation est faite par lui, sur la période choisie, avec l'identifiant… de sa mère.

**Octobre — semaine chez moi.** Lundi soir, Raphaël a un contrôle jeudi en SVT. « Mon organisation » affiche un planning qu'il avait préparé chez sa mère. Je modifie ses disponibilités (il est chez moi, horaires différents : judo le mercredi) : la semaine suivante sa mère trouve un planning qui ne correspond plus à chez elle. Dispute par SMS.

**Novembre.** La mère change le mot de passe de Raphaël (elle trouve que je « surveille »). Raphaël arrive chez moi sans pouvoir se connecter. Lundi 8 h, il va voir Martine au secrétariat.

**Décembre.** Je reçois le bulletin par courrier un mois après. Je voudrais au moins une notification « devoir à rendre demain » sur mon téléphone.

### 3. Blocages
- **Pas de rôle parent, et encore moins deux responsables légaux** distincts et égaux en droits (autorité parentale conjointe).
- **Compte élève partagé** = mot de passe en circulation, changements unilatéraux, profil du tuteur pollué.
- **Planning unique** alors que l'enfant vit dans deux maisons : pas de « semaine A / semaine B ».
- **Pas de notifications** (pas de mail, pas de push).
- Contournement : capture d'écran du planning envoyée par WhatsApp ; ou il demande à Raphaël de lui faire suivre ses fiches PDF.

### 4. Ce qu'il adorerait
- Son propre accès lecture : devoirs, échéances, temps de travail fait cette semaine, fiches de révision, en un écran sur iPhone.
- Un résumé hebdomadaire par mail le dimanche soir : « Cette semaine : 3 devoirs, 1 contrôle, révisé 2 h 10 ».

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Mon propre compte. » | Compte parent par responsable légal (plusieurs parents par enfant, plusieurs enfants par parent), créé par import ou invitation, indépendant du compte élève. |
| « Voir ses devoirs. » | Vue parent en lecture : devoirs et échéances, contrôles à venir, temps de révision réalisé, fiches générées (titres), sans accès aux conversations. |
| « Il vit chez moi une semaine sur deux. » | Disponibilités multiples dans « Mon organisation » (profils de semaine A/B ou « chez papa / chez maman ») ; le planning choisit selon le calendrier de garde. |
| « Prévenez-moi. » | Notifications parent (mail / push PWA) : devoir à rendre demain, contrôle dans 3 jours, résumé hebdomadaire ; préférences par parent. |
| « Pas de bagarre de mot de passe. » | Le mot de passe de l'élève n'est changeable que par l'élève (et l'établissement) ; les parents ont leurs propres identifiants. |
| « Situations particulières. » | Champ administratif « restriction d'accès d'un responsable » (décision de justice) géré uniquement par la direction. |

### 6. Groupes de travail
« Si Raphaël a un exposé en groupe, je veux savoir avec qui, pour quand, et qui fait quoi, pour pouvoir l'aider la semaine où il est chez moi. Et je veux pouvoir organiser une séance chez moi avec un copain, il me faut savoir qui sont les parents. »
→ Projet de groupe visible dans la vue parent (titre, échéance, répartition des tâches de l'enfant) ; liste des tâches « qui fait quoi » ; pas d'échange de coordonnées parents automatique (opt-in explicite si un jour « contacter les parents du groupe »).

---

## Persona 6 — Yulia, mère qui ne parle pas bien français

### 1. Fiche
- **Yulia Katz**, 37 ans, arrivée de Haïfa il y a 18 mois (mutation de son mari, ingénieur). Langue maternelle russe, parle hébreu et un anglais correct, français niveau A2. Deux enfants : Daniel (6e A) et Mila (2nde B).
- Numérique : se débrouille sur téléphone (vieux Samsung Galaxy A10, Android 11, écran fissuré, Chrome), utilise beaucoup Google Traduction par photo. Pas d'ordinateur à la maison, Mila utilise le PC du père le soir.
- Ce qu'elle veut vraiment : comprendre ce que l'école attend, aider Daniel qui a du mal en français et en histoire, ne pas se sentir humiliée de ne pas comprendre.

### 2. Journal d'usage (traduit de ce qu'elle dicte à Google Traduction)
**Septembre.** Le papier de l'école avec l'identifiant. Je ne comprends pas « Adresse e-mail » : c'est l'adresse de Daniel ? La mienne ? (C'est la mienne, mise par le secrétariat… mais pour Mila, la secrétaire a dû inventer `katz.mila@yabne.local` parce que « Adresse indisponible ».) Je me trompe trois fois, l'écran dit « Adresse ou mot de passe incorrect ». Je ne sais pas si c'est l'adresse ou le mot de passe qui est faux.
L'application est toute en français. Je mets la traduction automatique de Chrome : les menus deviennent « Aperçu », « Mes cours », « Mon organisation » → « Mon organisme » ; le bouton « Préparer avec mon tuteur » devient « Préparer avec mon gardien ». Les PDF de fiches ne se traduisent pas du tout.

**Octobre — veille de contrôle.** Daniel a un contrôle d'histoire. Il me demande d'expliquer « les Hébreux et le monothéisme » (ironie). Je voudrais que le tuteur m'explique en russe ce que Daniel doit savoir, pour que je l'aide, puis qu'il lui explique en français à lui. Je tape en russe dans l'assistant : la réponse arrive en français (le tuteur s'appuie sur les documents du professeur, en français). Daniel est perdu entre les deux.

**Novembre — le lundi matin.** Daniel a oublié son mot de passe. Il n'y a pas de bouton « mot de passe oublié ». Il faut appeler le secrétariat : je n'ose pas téléphoner en français. J'envoie un message WhatsApp à une autre maman qui appelle pour moi.

**Décembre.** L'école envoie une note sur « la charte IA ». Je signe sans comprendre.

### 3. Blocages
- **Interface 100 % français**, la traduction automatique du navigateur casse les libellés et ne touche pas les PDF ni les messages d'erreur.
- **Écran de connexion ambigu** (adresse ou mot de passe ?) et identifiants inventés différents d'un enfant à l'autre.
- **Pas de récupération de mot de passe autonome** ; le seul recours est un appel téléphonique en français.
- **Téléphone ancien** : la liste « Mes cours » et l'assistant sont lourds ; le texte petit ; les PDF à télécharger remplissent le stockage.
- **Consentement non éclairé** : charte en français uniquement.
- Contournement : Mila (2nde) devient l'interprète de toute la famille et se connecte au compte de Daniel pour « l'aider » — elle finit par faire ses exercices à sa place via le tuteur.

### 4. Ce qu'elle adorerait
- Choisir « Русский / עברית / English » en haut de l'écran.
- Que le tuteur puisse expliquer à un parent dans sa langue, avec les mots-clés français à côté (« le monothéisme — монотеизм »).
- Un message vocal plutôt que du texte.

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Je veux l'application en russe. » | Internationalisation de l'interface (fichiers de traduction ; priorité EN, HE avec mise en page RTL, RU) pour les comptes parents d'abord ; documents officiels (charte, confidentialité) traduits. |
| « Explique-moi en russe, et à mon fils en français. » | Mode « explication bilingue » pour l'espace parent : résumé de ce qu'il faut savoir pour un contrôle dans la langue du parent, avec glossaire des termes du professeur en français. Pour les élèves allophones (FLE), aide en langue maternelle avec retour progressif vers le français. |
| « Je ne sais pas si c'est l'adresse ou le mot de passe. » | Identifiant simple imprimé (ex. `daniel.katz`), aide visuelle à la connexion (afficher le mot de passe, majuscules activées), lien « Je n'arrive pas à me connecter » avec pictogrammes. |
| « Je n'ose pas téléphoner. » | Récupération autonome par code envoyé au parent (SMS/mail), formulaire de demande au secrétariat dans l'application. |
| « Un message vocal. » | Lecture audio des consignes et réponses (synthèse vocale) ; dictée vocale pour poser une question. |
| « Mon vieux téléphone. » | Mode léger (PWA, cache, images réduites), texte agrandissable, PDF consultables sans téléchargement. |

### 6. Groupes de travail
« Pour Daniel, un groupe avec un enfant qui parle russe ou hébreu au début, ça l'aiderait. Mais je ne veux pas qu'il reste seulement avec eux. Et s'il y a des messages dans le groupe, il faut que je puisse comprendre si c'est méchant. »
→ Binômes de tutorat linguistique proposés par le prof (élève FLE + élève bilingue) ; traduction à la demande des consignes du groupe ; bouton signaler accessible avec pictogramme ; aucune exposition publique du niveau de français de l'élève.

---

## Persona 7 — Claire, référente RGPD / DPO externe

### 1. Fiche
- **Claire Delmas**, 46 ans, juriste, DPO mutualisée pour 7 établissements privés sous contrat (via un cabinet). Vient à Yabné une demi-journée par trimestre, répond par mail sous une semaine.
- Numérique : outils de conformité (registre, AIPD), lit les DPA, ne code pas mais sait lire une architecture et poser les bonnes questions.
- Ce qu'elle veut vraiment : un registre de traitement complet, une AIPD (analyse d'impact) défendable — l'outil traite des **données de mineurs** avec de l'**IA** et du **profilage pédagogique** : l'AIPD est quasi certaine —, des sous-traitants encadrés, et des outils pour exercer les droits sans bricolage.

### 2. Journal d'usage
**Septembre — découverte (tardive).** On me prévient deux semaines après la rentrée. Je demande un compte : on me crée un compte « Administrateur » (le seul rôle non élève/prof qui voit quelque chose). Premier constat : je peux réinitialiser le mot de passe de n'importe quel élève et me connecter comme lui. C'est exactement ce que je ne devrais pas pouvoir faire. Je demande un rôle lecture seule « contrôle » : il n'existe pas.

**Octobre — cartographie.** Je lis OPERATIONS.md (fourni par Karim) : « L'établissement doit définir ses responsabilités avec son DPO » ; « Aucun label de conformité n'est revendiqué » ; « La rétention automatique et l'effacement complet ne doivent pas être supposés opérationnels ». C'est honnête, mais ça veut dire que rien n'est fait. Points relevés :
- Fournisseur IA Anthropic ou OpenAI : transferts hors UE potentiels, DPA à signer, option « zero data retention » à vérifier, garantie de non-entraînement à obtenir contractuellement.
- Hébergement Railway : région à choisir explicitement ; le cahier des charges parlait d'Infomaniak/Suisse comme option RGPD.
- École Directe : connecteur « communautaire expérimental », jetons stockés chiffrés ; il faut l'accord de l'éditeur et l'information des familles.
- Mémoire du tuteur et « observations pédagogiques de l'IA » : profilage d'un mineur ; transparence, droit d'opposition, minimisation.
- Pas de durée de conservation des conversations, sessions, journaux, sauvegardes.

**Novembre — demande de M. Azoulay (droit d'accès et d'effacement).** Délai légal : 1 mois. La secrétaire ne trouve pas d'export ; Karim propose d'extraire en SQL ; l'effacement n'existe pas (« pas de suppression administrative complète d'une identité et de toutes ses dépendances »). Et les sauvegardes ? Elles contiennent les données de Maya pendant une durée non définie.

**Janvier — incident.** Une feuille Excel avec 600 identifiants et le mot de passe commun traîne sur le bureau partagé du secrétariat (persona 1). Violation de données potentielle à évaluer, notification CNIL sous 72 h si risque. Aucun journal ne permet de savoir si des comptes ont été utilisés par un tiers.

### 3. Blocages
- **Pas de rôle DPO/audit** en lecture seule ; rôle admin trop puissant et non tracé.
- **Pas de journal d'audit** ni de journal des connexions consultable (IP, date, échecs).
- **Pas d'export droit d'accès ni d'effacement complet**, pas de purge programmée, pas d'articulation avec les sauvegardes.
- **Pas d'écran d'information** (mentions, politique, consentements, cookies de session).
- **Pas de registre des sous-traitants** visible ni de paramètre « fournisseur IA / région ».
- **Pratiques induites par l'interface** : mots de passe partagés, adresses inventées, comptes élèves utilisés par les parents (mélange des données de plusieurs personnes dans un même profil).

### 4. Ce qu'elle adorerait
- Une page « Conformité » dans l'admin : sous-traitants, régions, durées configurées, dernière purge, dernières demandes d'exercice de droits, journal exportable.
- Un « paquet DPO » généré (fiche de registre pré-remplie, description des flux, mesures de sécurité) qu'elle complète.

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Un accès contrôle, pas admin. » | Rôle Auditeur/DPO : lecture du journal d'audit, des paramètres de conservation et des demandes ; aucun accès au contenu pédagogique ni aux conversations ; aucune action sur les comptes. |
| « Qui a fait quoi ? » | Journal d'audit horodaté, non modifiable par les admins : connexions (réussies/échouées), créations, modifications, désactivations, réinitialisations, exports, changements de paramètres, accès aux données sensibles ; export CSV ; durée de conservation dédiée. |
| « Droit d'accès sous un mois. » | Export complet d'une personne (compte, classes, conversations, mémoire tuteur, quiz, fiches, documents déposés, planning, journaux la concernant) en format lisible + machine. |
| « Droit à l'effacement. » | Suppression complète en cascade avec rapport, anonymisation des contributions à conserver (documents déposés par un délégué, statistiques), gestion des sauvegardes (purge à expiration, liste d'effacements rejouée à la restauration). |
| « Durées de conservation. » | Paramètres de rétention par catégorie (conversations, mémoire, quiz, sessions, journaux, comptes inactifs, élèves sortis) avec purge automatique et rapport. |
| « Information des personnes. » | Mentions d'information intégrées (élève en langage adapté à l'âge, parent), versionnées, avec acceptation tracée ; consentements spécifiques (mémoire du tuteur, École Directe). |
| « Sous-traitants. » | Page de paramètres affichant fournisseur IA, modèle, région, statut DPA ; possibilité de choisir un fournisseur/hébergement UE ; minimisation des données envoyées à l'IA (pas de nom, pseudonyme). |
| « Mots de passe partagés. » | Politique : mots de passe initiaux uniques, changement obligatoire, expiration des mots de passe temporaires, détection des mots de passe identiques. |
| « Violation de données. » | Écran « incident » : révoquer toutes les sessions, forcer le changement de mot de passe d'un groupe de comptes, exporter les journaux de la période. |

### 6. Groupes de travail
« Un espace d'échange entre mineurs, c'est un nouveau traitement : finalité, durée, modération, accès des adultes, et information des élèves sur qui peut lire. Je veux que la règle soit claire avant l'ouverture, pas après le premier incident. »
→ Groupes documentés dans le registre ; conservation limitée (ex. fin d'année scolaire + délai) avec purge automatique ; lecture par le professeur responsable annoncée aux élèves ; modération et signalement tracés ; pas de données de groupe dans la mémoire privée individuelle ; pas de partage de fichiers personnels ; pas d'appel IA avec les données de plusieurs élèves sans nécessité ; minimisation (pas de photo de profil, pas de numéro de téléphone).

---

## Persona 8 — Karim, informaticien prestataire à mi-temps

### 1. Fiche
- **Karim Haddad**, 35 ans, technicien/administrateur systèmes indépendant, présent à Yabné le mardi et le jeudi, joignable « en cas d'urgence » le reste du temps. Gère le réseau, le Wi-Fi, les 120 PC, les imprimantes, Microsoft 365 Éducation, les vidéoprojecteurs.
- Numérique : Linux correct, Docker basique, a déjà déployé un WordPress et un Nextcloud ; n'est pas développeur Node.js. Découvre Railway.
- Ce qu'il veut vraiment : un déploiement reproductible, des sauvegardes automatiques qui marchent sans lui, des mises à jour sans casse, et ne plus être appelé pour des mots de passe.

### 2. Journal d'usage
**Août — déploiement.** Je suis OPERATIONS.md : service Railway, volume `/data`, variables (`DATA_DIR`, `NODE_ENV`, `SESSION_SECRET`…). Pour le premier admin, je prends l'option `PROVISION_ON_START=true` + `PROVISION_ADMIN_PASSWORD`, puis je dois penser à retirer la variable et remettre à `false`. L'identifiant par défaut est `admin@iabne.local`. Ok. La doc est rigoureuse, mais elle me dit surtout ce que je dois vérifier moi-même.
Je dois générer la clé `ECOLEDIRECTE_ENCRYPTION_KEY` et « la conserver séparée de la base ». Je la mets dans mon gestionnaire de mots de passe personnel. Si je tombe malade, personne ne l'a.

**Août — comptes.** Martine me demande d'importer les 600 élèves. Pas d'import. J'écris un script qui appelle `POST /api/admin/users` en boucle avec un cookie admin (bcrypt coût 12 : 600 hachages, ça prend du temps mais ça passe). Je génère des mots de passe aléatoires dans un CSV. Ce CSV, avec 600 mots de passe en clair, je l'envoie à Martine par mail… Je sais.
La deuxième année, il faudra recommencer et gérer les doublons d'adresse (contrainte `UNIQUE` globale).

**Septembre — sauvegardes.** `npm run backup` exige d'arrêter les écritures (`MAINTENANCE_CONFIRMED=true` est « une confirmation de l'opérateur, pas un mécanisme qui arrête l'application »). Donc chaque sauvegarde = couper le service. Je ne peux pas le faire en journée. Je la fais le jeudi soir à la main, en `railway ssh`, puis je copie le dossier vers le NAS de l'école. Deux semaines, j'oublie. Il n'y a pas de sauvegarde planifiée, pas d'alerte « dernière sauvegarde il y a 15 jours ».

**Octobre — panne.** « L'IA ne répond plus » : la clé Anthropic a atteint sa limite de dépense. Rien dans l'interface admin ne l'indique ; les élèves voient une erreur. Je n'ai pas de page de santé détaillée (seulement `/api/health`).

**Novembre — mise à jour.** Nouvelle version du code. Les tables sont créées au démarrage, mais il n'y a ni numéro de version visible, ni note de version, ni procédure de retour arrière. Une seule instance SQLite : pendant le redéploiement, coupure de quelques minutes, un mardi à 10 h, en plein cours.

**Lundi matin — les mots de passe.** Martine est absente. Le directeur m'appelle : 20 élèves bloqués. Je me connecte en admin depuis mon téléphone dans le métro, la liste des comptes est interminable, pas de recherche.

**Juin — passage d'année.** Le directeur me demande de « passer tout le monde dans la classe supérieure ». Il n'existe rien : il faut créer les classes 2027-2028, inscrire 600 élèves un par un, retirer les anciennes inscriptions (sinon ils sont dans les deux), désactiver les Terminales sortantes, créer les nouvelles affectations, recréer les cours (les cours sont liés à une classe ; les documents des profs restent dans les anciens cours). Je fais un script SQL directement sur la base. Aucun outil ne garantit la cohérence.

### 3. Blocages
- **Pas d'import / export / API d'administration documentée pour le provisioning en masse** → scripts maison fragiles, fichiers de mots de passe en clair.
- **Sauvegarde manuelle, avec coupure**, pas de planification, pas d'alerte, pas de test de restauration guidé.
- **Pas de passage d'année**, pas de duplication des cours/chapitres vers la nouvelle année.
- **Pas d'écran d'état** : version, espace disque du volume, files de traitement IA, erreurs d'indexation, consommation IA, statut École Directe.
- **Secrets dépendants d'une personne** (clé École Directe, accès Railway).
- **Mono-instance SQLite** : coupure à chaque déploiement.
- **Rôle admin unique** : il a accès aux contenus pédagogiques alors qu'il n'en a pas besoin, et n'a pas d'outil technique dans l'application.
- Détourné : il garde un compte admin « de secours » avec un mot de passe simple ; il modifie la base à la main.

### 4. Ce qu'il adorerait
- Une page « Technique » : version, santé, disque, dernière sauvegarde, IA OK/KO, quotas, jobs en erreur.
- Sauvegarde automatique nocturne cohérente (sans arrêter le service) vers un stockage S3 européen, chiffrée, avec rotation et alerte.
- Un assistant de rentrée qui fait tout le passage d'année en 5 étapes avec aperçu.
- Ne plus jamais réinitialiser un mot de passe d'élève.

### 5. Demandes
| Ses mots | Fonctionnalité |
| --- | --- |
| « Un import propre. » | Import CSV/XLSX idempotent (identifiant externe stable, ex. INE ou numéro École Directe), mise à jour vs création, rapport ; export CSV des comptes/classes/inscriptions ; API admin documentée. |
| « Passage d'année. » | Assistant de rentrée : créer l'année N+1, dupliquer la structure des classes, promotion par lot (6e A → 5e ?, avec répartition modifiable), sortants (3e/Terminale) désactivés et programmés pour suppression, reprise des affectations, duplication des cours et chapitres avec option de reprise des documents publiés, archivage en lecture seule de l'année N. |
| « Sauvegardes automatiques. » | Sauvegarde planifiée à chaud (API SQLite `backup` + verrou applicatif court sur les fichiers ou mode maintenance automatique), chiffrée, vers stockage externe, rétention configurable, alerte d'échec, test de restauration trimestriel guidé. |
| « Je veux voir l'état. » | Page Technique : version déployée, migrations, disque, taille base, travaux IA en file/erreur, erreurs d'extraction, dernière sauvegarde, état fournisseur IA, consommation, statut École Directe. |
| « Mise en maintenance. » | Mode maintenance avec message aux utilisateurs et plage programmée ; notes de version. |
| « Les secrets. » | Documentation de passation + coffre partagé de l'établissement ; procédure de rotation de `SESSION_SECRET` et de la clé École Directe avec migration. |
| « SSO. » | Connexion via Microsoft 365 Éducation (OIDC) ou fédération ÉduConnect pour éviter des mots de passe supplémentaires ; à défaut, LDAP/CSV. |
| « Pas d'appel pour les mots de passe. » | Libre-service + délégation (PP, CPE, AED) + réinitialisation en masse d'une classe avec génération et impression. |
| « Pas besoin de voir les cours. » | Rôle Technique : accès aux pages d'exploitation et aux journaux techniques, sans contenu pédagogique ni conversations. |

### 6. Groupes de travail
« Si vous ajoutez du chat de groupe, je ne veux pas gérer du temps réel, des WebSockets qui tombent, ni du stockage qui explose avec des photos. Et il faudra que la modération ne repose pas sur moi. »
→ Groupes sans temps réel obligatoire (fil asynchrone, rafraîchissement simple), limite de taille de fichiers et de quotas par groupe, pas de médias personnels, purge automatique en fin d'année, appels IA de groupe comptés dans les quotas, modération par les profs/vie scolaire (pas par le technicien), groupes inclus dans les sauvegardes et dans l'export/effacement RGPD.

---

## Synthèse

### A. Problèmes récurrents classés par gravité

**Critique (bloquant pour une rentrée réelle ou risque légal/sécurité)**
1. **Aucun import de masse ni génération d'identifiants** (Administration > Comptes, création unitaire) → 15-20 h de saisie, scripts SQL improvisés, mots de passe communs ou en clair dans des fichiers. Cité par : secrétaire, informaticien, DPO, parent inquiet, mère allophone (6/8).
2. **Pas de passage d'année ni de changement de classe** (aucune route ; classes sans modification ; inscriptions multiples non contrôlées ; `LIMIT 1` sans `ORDER BY` pour l'année par défaut) → incohérences dès la deuxième année. (secrétaire, informaticien, directeur : 3/8)
3. **Pas de suppression complète, d'export droit d'accès ni de durées de conservation** (reconnu dans FEATURES.md). (DPO, parent inquiet, secrétaire, informaticien : 4/8)
4. **Rôle admin unique, trop puissant, non tracé** : secrétaire, directeur, CPE, DPO et technicien ont les mêmes droits ; un admin peut fixer le mot de passe d'un élève et se connecter à sa place sans trace. (directeur, CPE, DPO, informaticien, secrétaire : 5/8)
5. **Mot de passe oublié = intervention humaine** (aucun lien sur l'écran de connexion, pas de mail) → crise du lundi matin. (secrétaire, mère allophone, père séparé, informaticien, CPE : 5/8)
6. **Aucun rôle parent** → partage du compte élève, mémoire du tuteur polluée, conflits entre parents séparés, données de plusieurs personnes mélangées. (parent inquiet, père séparé, mère allophone, DPO : 4/8)
7. **Absence de protocole de détresse dans le tuteur** pour des mineurs. (CPE, directeur, DPO : 3/8)

**Majeur**
8. **Pas de tableau de bord direction** : `/api/stats` réservé aux cours dont on est l'enseignant → le directeur voit « Pas encore d'indicateur ». (directeur, CPE, DPO pour les agrégats : 3/8)
9. **E-mail obligatoire et unique globalement** comme identifiant → adresses inventées, fratries impossibles (« Adresse indisponible. »). (secrétaire, mère allophone, père séparé, informaticien : 4/8)
10. **Aucune modification / suppression** de nom, e-mail, rôle, classe, niveau, matière, affectation. (secrétaire, informaticien : 2/8, mais impact quotidien)
11. **Sauvegardes manuelles avec arrêt du service, sans planification ni alerte.** (informaticien, DPO, directeur : 3/8)
12. **Interface uniquement en français**, PDF non traduisibles. (mère allophone, CPE pour élèves allophones : 2/8)
13. **Aucune information intégrée sur les données et l'IA** (fournisseur, région, durées). (parent inquiet, DPO, directeur : 3/8)
14. **Pas de notifications** (mail/push). (père séparé, mère allophone, directeur : 3/8)

**Modéré (ergonomie)**
15. Listes sans recherche/filtre/pagination ; homonymes indiscernables dans les menus `Select` (nom seul). 
16. « Désactiver » sans confirmation, à côté de « Réinitialiser » ; message de connexion identique pour compte désactivé.
17. « Créer et affecter » qui n'affecte pas ; ordre imposé affectation → cours non expliqué.
18. « Cours existants » affiche « · · » (matière, classe, prof absents : champs non fournis par `/api/bootstrap`).
19. Niveau en texte libre (« 6e » / « 6ème ») ; année non affichée dans la liste des classes ; « Créer une matière » rangé dans l'onglet Classes.
20. Menu admin encombré de fonctions élèves (« Entraînement », « Mon organisation »).
21. Mot de passe initial masqué, sans confirmation ni bouton afficher.

### B. Top 15 des fonctionnalités demandées (nombre de personas sur 8)

| # | Fonctionnalité | Personas |
| --- | --- | --- |
| 1 | **Groupes de travail encadrés** (rattachés à un cours/classe, visibles du prof, signalement, modération, purge annuelle, pas de messagerie privée cachée) | 8/8 |
| 2 | **Rôles distincts** : Direction, Secrétariat, Vie scolaire/CPE/AED, Parent, DPO/Auditeur, Technique | 7/8 |
| 3 | **Récupération de mot de passe autonome + délégation de la réinitialisation** (PP, CPE, AED) + changement obligatoire à la 1re connexion | 6/8 |
| 4 | **Import CSV/XLSX/École Directe** avec génération de mots de passe et **impression des fiches de connexion par classe** | 6/8 |
| 5 | **Journal d'audit** des actions admin et des connexions | 5/8 |
| 6 | **Comptes parents** (plusieurs responsables par enfant, vue lecture devoirs/échéances/temps, sans conversations) | 5/8 |
| 7 | **Export droit d'accès + suppression complète + durées de conservation avec purge** | 4/8 |
| 8 | **Assistant de passage d'année** (promotion par lot, sortants, archivage, reprise des affectations et cours) | 4/8 |
| 9 | **Page « Confidentialité & IA »** intégrée, versionnée, avec consentements tracés | 4/8 |
| 10 | **Tableau de bord direction / par classe** (activation, activité agrégée, coût IA, export PDF CA) | 4/8 |
| 11 | **Identifiant de connexion distinct de l'e-mail** (e-mail facultatif, fratries) | 4/8 |
| 12 | **Notifications** (devoirs, contrôles, résumé hebdo ; mail/push PWA) | 3/8 |
| 13 | **Gestion du cycle de vie** : modifier/renommer/archiver comptes, classes, matières, affectations ; changer de classe ; assistant de départ d'élève | 3/8 |
| 14 | **Sauvegarde automatique planifiée + page Technique** (version, santé, disque, IA, quotas) | 3/8 |
| 15 | **Multilinguisme et accessibilité** (EN/HE/RU, lecture audio, préférences dys, mode léger mobile) — ex aequo avec **protocole de détresse** du tuteur et **mode examen / pause IA** (3/8 chacun) | 3/8 |

### C. Attentes consolidées sur les groupes de travail entre élèves (inexistants aujourd'hui)

1. **Création** : par le professeur (par tirage, par niveau, manuel) ou par les élèves avec validation du professeur ; jamais à la charge du secrétariat.
2. **Périmètre** : membres d'une même classe ou d'un même cours ; tutorat inter-niveaux uniquement s'il est encadré par un adulte.
3. **Contenu** : projet (titre, consigne, échéance), répartition des tâches « qui fait quoi », dépôt de documents de travail, fil d'échange asynchrone, assistant IA de groupe distinct de la mémoire privée de chacun.
4. **Sécurité** : professeur responsable lecteur (annoncé aux élèves), bouton signaler, suspension par vie scolaire/direction, règles d'incompatibilité confidentielles, pas de messages éphémères, pas de médias personnels, pas d'annuaire.
5. **Cycle de vie** : sortie automatique au départ / changement de classe, archivage en fin de projet, purge en fin d'année, inclusion dans l'export et l'effacement RGPD.
6. **Visibilité adulte** : parent (titre, échéance, membres), CPE (élèves sans groupe), direction (agrégats d'usage).
7. **Technique** : sans temps réel obligatoire, quotas de stockage et d'IA par groupe.

### D. Quick wins d'interface et de vocabulaire (faible coût, fort effet)

1. Ajouter **« Mot de passe oublié ? »** sur l'écran de connexion, même s'il mène d'abord à un texte « Adressez-vous au secrétariat ou à votre professeur principal » avec horaires.
2. **Bouton « Générer »** + **« Afficher »** sur les champs mot de passe de l'admin ; afficher le mot de passe généré une fois, avec « Copier » et « Imprimer ».
3. **Confirmation** sur « Désactiver » (« Bloquer l'accès de X ? Il ne pourra plus se connecter. ») et message de connexion distinct pour compte désactivé (au moins « Compte inaccessible : contactez le secrétariat »).
4. **Champ de recherche + filtres rôle/classe/actif** au-dessus de « Comptes de l'établissement » et « Inscriptions actuelles ».
5. Afficher la **classe à côté du nom** dans tous les menus « Élève », et la **matière** à côté des professeurs.
6. Corriger « Cours existants » : afficher matière, classe et professeur (jointure dans `/api/bootstrap` ou résolution côté client via `subjects`, `classes`, `users`).
7. Renommer **« Créer et affecter » → « Créer le cours »** et afficher « Ce professeur doit d'abord être affecté à cette classe pour cette matière » ; ou faire l'affectation automatiquement.
8. **Niveau en liste fermée** (6e, 5e, 4e, 3e, 2nde, 1re, Terminale) ; **année obligatoire, présélectionnée sur l'année en cours** ; afficher l'année dans la liste des classes ; trier les années.
9. Déplacer **« Créer une matière »** dans « Cours & affectations ».
10. **Menu admin épuré** : masquer « Entraînement », « Mon organisation » pour les comptes administratifs.
11. Bouton **« Modifier le nom »** (l'API `PATCH` le permet déjà).
12. Vocabulaire : « Profil » → « Type de compte » ; « Inscrire dans la classe » → « Ajouter à une classe » ; « Espace de cours » → « Cours » ; « Réinitialiser » → « Nouveau mot de passe ».
13. Dans « Suivi pédagogique », pour un admin sans cours : texte explicite (« Le tableau de bord établissement n'est pas encore disponible ») au lieu de « Pas encore d'indicateur ».
14. Lien permanent **« Vos données »** dans « Mon compte » (même statique au début).
15. Bouton **« Changer de classe »** qui enchaîne inscription + retrait.

### E. Risques d'usage détourné observés dans les journaux

| Risque | Origine dans l'outil | Parade |
| --- | --- | --- |
| Mot de passe commun à toute une classe / fichier Excel de mots de passe en clair | Création unitaire, champ masqué, aucun générateur ni impression | Génération, impression, changement obligatoire, expiration des mots de passe temporaires |
| Adresses e-mail inventées / partagées | E-mail obligatoire et unique globalement | Identifiant distinct, e-mail facultatif, contacts parents séparés |
| Parents utilisant le compte de l'enfant (et fratrie : la grande sœur fait les exercices du petit via le tuteur) | Pas de rôle parent | Comptes parents, avertissement « compte personnel », détection de sessions simultanées |
| Admin se connectant à la place d'un élève pour lire sa mémoire / ses conversations | Réinitialisation libre + absence d'audit | Journal d'audit, procédure tracée, notification à l'élève quand un adulte change son mot de passe |
| Demande d'extraction SQL individuelle par la direction (« qui triche ? ») | Pas de tableau de bord légitime | Tableau de bord agrégé officiel, règles écrites, rôle Technique sans accès aux contenus |
| Modifications directes de la base par le prestataire (passage d'année, imports) | Absence d'outils d'administration | Assistant de rentrée, import idempotent, API admin documentée |
| Groupes WhatsApp/Snapchat hors cadre (harcèlement) | Pas de groupes dans IABNE | Groupes encadrés avec modération |
| Correction complète utilisée pour rendre un devoir noté | Correction disponible sur demande | « Mode évaluation » par devoir, correction après tentative/échéance |
| Parent séparé contre parent : changement de mot de passe de l'enfant pour couper l'autre | Compte unique partagé | Identifiants propres à chaque responsable légal |
| Comptes admin « de secours » à mot de passe faible | Rôle unique, pas de MFA | MFA pour les rôles administratifs, revue périodique des comptes admin |
