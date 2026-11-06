# Tests terrain : utilisateurs experts (instance locale isolée)

Instance : `dist/` + `server/index.mjs`, `SEED_DEMO=true`, port 4102, `DATA_DIR=.../tests-terrain/data-expert`, sans clé IA. Node 22.23 (le README demande 24.5+, le serveur a quand même démarré).
Scripts, journaux et captures : `/tmp/claude-0/-home-user-futur-IABNE/da3131c6-e25c-5c97-b283-65ef80c66c92/scratchpad/tests-terrain/expert/` (`admin.js`, `admin2.js`, `api_admin.mjs`, `api_prof.mjs`, `prof_ui.js`, `api_eleve.mjs`, `eleve_ui.js`, `api_misc.mjs`, `lib.mjs`, `files/`, captures `a*.png`, `p*.png`, `e*.png`).
Aucun fichier du dépôt n'a été modifié (`git status` vide). Le serveur a été arrêté à la fin.

Note sur le jeu de démonstration : il ne contient aucun document. Un élève de démo ne peut donc rien tester (quiz, fiche) tant qu'un professeur n'a rien publié, et même après, tout ce qui passe par l'IA renvoie « IA non configurée ».

---

## Persona 1 : Nathalie, administratrice, rentrée de 600 élèves

### Parcours et mesures

| Tâche | Ce qui existe | Mesure |
|---|---|---|
| Créer 1 élève (UI) | Formulaire « Créer un compte » | **6 actions** : nom, e-mail, mot de passe, profil, classe, valider. Environ 0,8 s par compte côté serveur |
| Créer 30 élèves (UI) | Même formulaire, 30 fois | **180 actions**, au moins 15 à 20 min de saisie. Pour 600 élèves : **3 600 actions** |
| Créer 30 élèves (API scriptée) | `POST /api/admin/users` en boucle | 10,9 s (hachage environ 360 ms par compte) |
| Import en masse CSV/ONDE/SIECLE | **Absent** (`/api/admin/users/import` et `/api/admin/import` → 404) | — |
| Rechercher un utilisateur | **Absent** : aucun champ de recherche ou de filtre dans l'onglet Comptes | 40 comptes = 2 931 px de liste. 600 comptes ≈ 40 000 px |
| Modifier une classe (nom, niveau, année) | **Absent** (`PATCH /api/admin/classes/:id` → 404) | — |
| Supprimer une classe | **Absent** (`DELETE` → 404) | — |
| Supprimer un compte | **Absent** : désactivation seulement (`DELETE /api/admin/users/:id` → 404) | 1 clic, **sans confirmation** |
| Modifier e-mail ou rôle | **Absent** : `PATCH` ignore `email` et `role` sans renvoyer d'erreur (200 OK, rien ne change) | — |
| Retirer un élève d'une classe | Onglet Classes, « Inscriptions actuelles », « Retirer » | 2 actions (clic + confirmation). Il faut parcourir **toute** la liste des inscriptions de l'établissement |
| Changer un élève de classe | **Pas d'action dédiée** : inscrire dans la nouvelle classe, puis retirer de l'ancienne | 5 actions. Entre-temps, l'élève est dans 2 classes à la fois |
| Passage d'année | « Nouvelle année scolaire » crée seulement un libellé. Rien pour dupliquer les classes, faire passer les élèves au niveau suivant, archiver l'année ou clore les cours | Pour 600 élèves : recréer chaque classe puis faire environ 1 200 opérations d'inscription et de retrait |
| Modifier ou supprimer matière, année, affectation, cours | **Absent** (toutes ces routes → 404) | — |

### Bugs et anomalies constatés (avec reproduction)

1. **Doublons acceptés partout.** `POST /api/admin/classes {name:"Terminale A", level:"Terminale"}` deux fois → 2 classes identiques dans la même année. Même chose pour les années (`2027–2028` deux fois) et les matières (`Mathématiques` deux fois). La liste des classes n'affiche pas l'année : les deux « Terminale A » sont indiscernables dans l'UI, dans les listes déroulantes et dans les inscriptions (capture `a05_classes_after.png`, où « Eleve Test 1 · Terminale A » apparaît deux fois).
2. **Un élève peut être inscrit dans plusieurs classes** sans avertissement (c'est le « changement de classe » de fait).
3. **Désactivation sans confirmation** (« Désactiver » agit au premier clic). Avec 600 lignes côte à côte, le risque de mauvais clic est réel.
4. **Le formulaire de création ne se vide pas** après succès : nom, e-mail et **mot de passe initial** restent dans les champs. Recliquer provoque « Adresse indisponible. ». Le mot de passe reste visible dans le DOM.
5. **Politique de mot de passe faible.** `password:"            "` (12 espaces) et `"111111111111"` sont acceptés (201). Changer son mot de passe pour le même est aussi accepté (`/api/auth/password`, 200).
6. **Pas de changement de mot de passe obligatoire à la première connexion.** L'admin doit transmettre un mot de passe initial qui reste valide indéfiniment.
7. **Le bouton « Créer et affecter » (onglet Cours) n'affecte rien.** Sans affectation préalable, on obtient « Cours invalide : une affectation existante est requise ». Il faut d'abord remplir l'autre formulaire « Affecter un professeur ». L'ordre des panneaux suggère l'inverse.
8. Le tableau de bord admin reprend le texte élève ou prof (« Votre parcours IABNE : comprendre, pratiquer et progresser », « Ouvrir mon atelier IA ») et n'a **aucun indicateur d'administration** (élèves sans classe, comptes inactifs, classes sans professeur).
9. `PATCH /api/admin/users/:id {email, role}` renvoie 200 sans rien modifier (champs ignorés en silence) : c'est trompeur pour un script.
10. Points positifs vérifiés : un nom `<img onerror>` est bien échappé (pas d'exécution), la désactivation coupe bien la connexion, la réinitialisation par l'admin invalide bien les sessions, on ne peut pas désactiver son propre compte, un e-mail en double est refusé même avec des majuscules, un professeur ne peut pas être inscrit comme élève.

### Manques fonctionnels (admin), par gravité

- **Bloquant pour une rentrée :** import CSV (élèves, profs, classes, inscriptions) avec aperçu et rapport d'erreurs ; recherche et filtres (rôle, classe, actif) ; passage d'année (cloner la structure, promouvoir les élèves, archiver).
- **Majeur :** modifier ou supprimer une classe, une matière, une année, une affectation, un cours ; changer de classe en une action ; actions groupées (désactiver, inscrire, réinitialiser plusieurs comptes) ; vue « fiche élève » (classes, cours, délégations) ; unicité nom + année des classes.
- **Moyen :** export CSV des comptes et identifiants, génération de mots de passe temporaires et changement forcé à la première connexion, confirmation avant désactivation, journal d'audit admin, pagination.
- **Mineur :** afficher l'année à côté de chaque classe, réinitialiser le formulaire après création, tableau de bord admin dédié.

---

## Persona 2 : Karim, professeur de NSI, tests de permissions et de limites

### Permissions (API, cookie de session réel)

| Test | Résultat | Verdict |
|---|---|---|
| Élève : brouillon présent dans `/api/bootstrap` ? | Non | OK |
| Élève : aperçu ou téléchargement d'un brouillon | 404 / 404 | OK |
| Élève : recherche d'un mot présent seulement dans un brouillon | 0 résultat | OK |
| Élève : versions / publier / supprimer / déposer | 403 / 403 / 403 / 403 | OK |
| Élève de Terminale A : document publié d'un cours de 1re B (aperçu, téléchargement, recherche, chat, quiz) | 404 partout | OK |
| Conversation d'un autre (`/api/ai/history?userId=...`) | Paramètre ignoré, renvoie seulement l'historique de l'utilisateur connecté | OK |
| Délégué : suppression d'une difficulté du tuteur d'un autre élève | Réponse `200 {deleted:true}` **mais rien n'est supprimé** (filtre `user_id`) | Pas de faille, mais réponse trompeuse |
| Délégué : suppression d'une tâche de planning d'un autre élève | Idem : 200 `deleted:true`, la tâche reste | Idem |
| Délégué actif : dépôt | 201, toujours en brouillon | OK |
| Délégué : publier son dépôt / remplacer son fichier | 403 / 403 | OK |
| Délégué : lire ou supprimer le brouillon du prof | 404 / 403 | OK |
| Délégué : déposer dans un cours non délégué | 403 | OK |
| **Délégué révoqué** : déposer | 403 « Dépôt non autorisé » | OK |
| Délégué révoqué : supprimer son propre brouillon | 403, et il ne le voit plus | OK. Mais son dépôt reste orphelin dans le cours du prof |
| Délégation en double / à un élève hors classe | 409 / 400 | OK |
| Prof : créer un cours pour un autre prof | `teacher_id` ignoré, cours créé à son nom | OK |
| Prof ou élève : créer un compte admin | 403 | OK |
| Mutation avec `Origin: https://evil.example` | 403 | OK |
| **Mutation sans en-tête `Origin`** (`PATCH /api/documents/:id {status:"archived"}` avec le seul cookie) | **200, le document est archivé** | Risque faible (SameSite=Lax, CORS), mais la vérification d'origine ne s'applique qu'en présence de l'en-tête. À durcir (exiger Origin ou Referer, ou un jeton CSRF) |
| Élève retiré de sa classe | Perd tout de suite cours, documents et tuteur (404) | OK |

Conclusion : **aucune fuite de données entre élèves ou entre classes trouvée.** Le cloisonnement serveur est solide.

### Limites de fichiers

| Fichier | Résultat | Commentaire |
|---|---|---|
| TXT 11 Mo | 413 « Fichier trop volumineux (10 Mo maximum) » | OK. Mais l'UI envoie d'abord les 11 Mo au lieu de vérifier la taille côté client |
| TXT de 10 Mo moins 10 octets | 201 | OK |
| `.doc` (Word 97) | 400 « Formats acceptés : PDF, DOCX et texte UTF-8 » | OK, mais aucune piste de conversion proposée. Les profs ont beaucoup de `.doc`, `.odt` et `.pptx` |
| Faux PDF (texte renommé) | 422 « Document illisible… PDF 100 pages… OCR » | Message générique peu adapté |
| **PDF d'une page blanche** | **201, statut « Prêt »**, texte extrait = `-- 1 of 1 --` | **Bug** : il devrait passer en `empty`. Le marqueur de page compte comme du texte, donc le document est indexé et proposé à l'IA comme source |
| TXT encodé en Latin-1 | 422 avec le message PDF/DOCX/OCR | Message inadapté : il faudrait dire « Le fichier texte doit être encodé en UTF-8 » |
| TXT vide (0 octet) | 400 « Formats acceptés : PDF, DOCX… » | Message faux : le format est bon, c'est le contenu qui est vide |
| TXT contenant `<script>` | Accepté, aperçu échappé | OK |
| Titre vide / `kind` inconnu | 400 | OK |

### Versionnage

- `POST /replace` sur un document **publié** : 200, l'ancien fichier part dans l'historique et le document **repasse en brouillon**. Il disparaît donc tout de suite pour les élèves jusqu'à republication. C'est documenté, mais aucune alerte dans l'UI ne dit « vos élèves n'y ont plus accès ».
- `GET /versions` : liste noms, tailles et dates. Le téléchargement ou la restauration d'une ancienne version donne 404 (absents). L'UI affiche « Aucune version antérieure conservée » quand il n'y en a pas.
- **Impossible de renommer un document, de changer son type ou de le déplacer dans un chapitre après dépôt** (`PATCH {title}` → 400 « État invalide »). Chapitres : création seulement, ni renommer, ni supprimer, ni réordonner.

### Interface prof (Playwright)

- Déposer et publier un document depuis le cours ouvert : **5 actions** (Déposer un document, choisir le fichier, titre, Déposer, menu de statut « Publié »). C'est correct.
- Le titre n'est **pas prérempli** à partir du nom de fichier. Un seul fichier à la fois (pas d'attribut `multiple`), pas de glisser-déposer : 20 documents = 100 actions.
- Le type de document s'affiche en anglais brut dans les listes (`lesson`, `exercise`), y compris côté élève (capture `p04_after_upload.png`).
- Le menu de statut a une police nettement plus grande que le reste de la ligne (incohérence visuelle).
- Les cartes de cours affichent « Votre professeur » **au professeur lui-même**, et « 1 ressources » (accord).
- Aperçu d'un document : la notice est affichée deux fois (texte de l'UI et notice du serveur) ; **Échap ne ferme pas** l'aperçu.
- **Raccourcis clavier : aucun** (`/` et `Ctrl+K` sans effet). Pas d'actions groupées (publier ou archiver plusieurs documents), pas de tri ni de filtre par statut ou chapitre. Les documents ne sont pas regroupés par chapitre.
- Suivi pédagogique : les indicateurs sont masqués sous 5 participants (voulu). Avec la démo (2 élèves), l'écran est vide.

---

## Persona 3 : Inès, Terminale, élève experte (habituée à ChatGPT et Quizlet)

### Parcours

- **Tuteur (Assistant pédagogique)** : la page empile un bloc « Un tuteur qui suit votre chemin » (onglets Mes priorités, Mes exercices, Ma mémoire), un bloc « Votre professeur particulier IA » et le chat. Sans clé IA, chaque envoi affiche « IA non configurée pour cet établissement ». La question reste visible en bulle « Vous » sans réponse.
  - **Entrée n'envoie pas** la question (textarea sans gestion de touche, il faut cliquer sur l'icône). Pour une utilisatrice de ChatGPT, c'est le premier agacement.
  - Les modes « Un indice / La méthode / Vérifier ma tentative / Correction expliquée » sont une bonne idée.
  - Une « Révision en cours 1 min 30 s » apparaît avec « Terminer la séance » alors que l'élève n'a rien lancé depuis l'UI (séance ouverte via l'API). À côté, le compteur dit « 0 min chronométrées ». C'est incohérent.
- **Quiz (Entraînement)** : 2 actions (choisir le cours, Créer mon quiz), puis erreur IA. Sans document publié, l'état vide explique bien qu'il faut que l'établissement active l'assistant.
- **Mes révisions** : formulaire riche (format, difficulté, nombre de questions, durée, barème). Rien n'est réalisable sans IA.
- **Mémoire privée**
  - Suspendre : case « Adapter les réponses à mon parcours » puis « Enregistrer mes préférences ». Ça fonctionne.
  - **Bug ou ambiguïté** : quand la mémoire est suspendue, « Mémoriser cette difficulté » (`POST /api/tutor/mistakes`) **continue d'enregistrer** les difficultés, et le profil les renvoie. « Suspendre » n'arrête donc pas la collecte, seulement l'usage. Le libellé ne le dit pas.
  - Réinitialiser : confirmation claire. Profil, exercices et séances sont effacés, mais **conversations et quiz restent**. L'élève doit aussi cliquer sur « Effacer mes échanges », cours par cours. Il n'y a pas de « tout effacer » global ni d'export de ses données.
  - Le style se limite à `step_by_step` ou `brief` (`socratic` → 400).
- **Planning (Mon organisation)**
  - Les créneaux sont **datés un par un** : pas de récurrence (« tous les mardis 17 h à 19 h »). Pour une année, c'est intenable.
  - Le planificateur ne place des séances **que dans les créneaux « Disponible » saisis**. Sans créneau, rien n'est planifié.
  - L'UI fixe en dur `days:14` et `maxDailyMinutes:120` (l'API accepte 1 à 31 jours et 15 à 240 min). Aucun réglage n'est proposé.
  - Les **tâches non planifiées** (`unscheduled`, avec `overdue`) **ne sont pas affichées**. Seul le message générique « Le temps disponible est insuffisant pour certaines tâches, ou leur échéance est passée » apparaît. Ex. : « Grand oral 1 200 min » et « Passé (échéance dépassée) » disparaissent sans explication, et « Réviser récursivité » n'a reçu que 60 min sur 120.
  - On ne peut **pas cocher une tâche comme faite** : le champ `completed` existe en base mais n'a ni route ni bouton (`PATCH /api/planner/tasks/:id` → 404). On ne peut pas non plus modifier une tâche ou un créneau, seulement les supprimer.
  - Un créneau en 2020 est accepté et s'affiche « 1 janv. », sans l'année. Un créneau « Cours » chevauchant un créneau « Disponible » est accepté sans avertissement.
  - La difficulté va de 1 à 5 côté API mais l'UI propose 3 niveaux.
  - La date par défaut vient de `toISOString()` (UTC) : entre minuit et 1 h ou 2 h à Paris, elle propose la veille.
  - Pas d'export iCal ni de synchronisation agenda (`/api/planner/export.ics` → 404).
- **Groupe de travail avec des amies** : **n'existe pas** (`/api/groups` → 404, aucune occurrence « groupe » dans l'UI). Inès l'a cherché successivement :
  1. dans « Mes cours » (un bouton « Inviter » ou « Créer un groupe » sur la carte du cours) ;
  2. dans « Mes révisions » (partager une fiche ou un quiz généré) ;
  3. dans « Mon organisation » (planifier une séance commune) ;
  4. dans « Mon compte » ;
  5. dans le chat (« partager cette conversation »).

  Rien nulle part, et aucun message n'explique que c'est volontaire (protection des mineurs).

### Ce qui manque par rapport à ChatGPT et Quizlet (son avis)

- Chat : Entrée pour envoyer, plusieurs conversations nommées (ici un seul fil par cours), recherche dans l'historique, copier ou exporter une réponse, LaTeX et code (NSI), envoi d'une photo d'exercice.
- Quizlet : flashcards, répétition espacée, mode « apprendre » ou « écrire », quiz personnels saisis à la main sans IA, partage de sets, défis entre amies. Ici, tout entraînement dépend de l'IA et des documents publiés : sans clé, il ne reste rien.
- Planning : récurrence, cocher « fait », glisser une séance, notifications ou rappels, vue semaine.

---

## Synthèse des bugs et failles (par gravité)

**Élevée**
1. PDF vide (page blanche) indexé comme « Prêt » avec le texte `-- 1 of 1 --` (source fantôme pour l'IA).
2. Politique de mot de passe : 12 espaces ou `111111111111` acceptés, réutilisation du même mot de passe acceptée, aucun changement forcé à la première connexion.
3. Doublons de classes, années et matières, et année absente de l'affichage : risque d'inscrire des élèves dans la mauvaise classe.

**Moyenne**
4. Mémoire « suspendue » qui continue d'enregistrer les difficultés.
5. Mutation acceptée sans en-tête `Origin` (protection CSRF incomplète).
6. Tâches non planifiées ou en retard invisibles dans l'UI ; réglages du planificateur fixés en dur.
7. `PATCH /api/admin/users` ignore en silence `email` et `role` ; `DELETE` d'objets d'autrui (difficultés, tâches) répond `deleted:true`.
8. Désactivation de compte sans confirmation ; formulaire de création qui garde le mot de passe.
9. Remplacement d'un document publié qui le retire aux élèves sans avertissement dans l'UI.

**Faible**
10. Messages d'erreur d'upload inadaptés (Latin-1, TXT vide, faux PDF).
11. `lesson` et `exercise` non traduits ; « Votre professeur » affiché au prof ; « 1 ressources ».
12. Entrée n'envoie pas le chat ; Échap ne ferme pas l'aperçu ; notice d'aperçu en double ; date par défaut en UTC ; dates sans année.
13. Libellé « Créer et affecter » trompeur ; tableau de bord admin générique.

## Manques fonctionnels (par gravité)

- **Bloquant :** import en masse (CSV/SIECLE), recherche et filtres de comptes, passage d'année, modification et suppression des classes, cours, matières et affectations.
- **Majeur :** changer un élève de classe en une action ; actions groupées admin et prof ; renommer, déplacer ou retyper un document ; gérer les chapitres ; téléchargement et restauration des anciennes versions ; dépôt multiple ; récurrence des disponibilités ; tâche « faite » ; entraînement sans IA (flashcards et quiz manuels).
- **Moyen :** export des comptes et mots de passe temporaires, journal d'audit, vue fiche élève, export iCal, plusieurs conversations par cours, effacement global de ses données et export RGPD, raccourcis clavier.
- **Mineur :** préremplissage du titre, vérification de la taille côté client, affichage de l'année des classes, tableau de bord admin.

## Idées de fonctionnalités

1. Assistant de rentrée : import CSV avec mapping de colonnes, aperçu, détection des doublons, rapport ; puis « promouvoir l'année » (Seconde → Première → Terminale, archivage de l'ancienne année).
2. Fiche élève : classes, cours, délégations, état du compte, réinitialisation, changement de classe en un clic.
3. Palette de commandes `Ctrl+K` (aller à un cours, rechercher un élève, déposer un document).
4. Dépôt multiple par glisser-déposer, avec titre déduit du nom de fichier et chapitre ou type appliqués au lot.
5. Pour le prof : « Remplacer et republier » en une action, et comparaison texte entre versions.
6. Pour l'élève : flashcards et répétition espacée tirées des documents publiés, fonctionnant aussi sans IA.
7. Planning : créneaux hebdomadaires récurrents, case « fait », liste explicite « non planifié / en retard », réglage du plafond quotidien, export iCal.
8. Groupes de travail **encadrés** : groupe créé ou validé par le prof, partage de fiches et quiz, séance commune planifiée, sans messagerie libre entre mineurs (ou avec modération). Sinon, un message clair expliquant pourquoi ce n'est pas proposé.
9. Mémoire : distinguer « suspendre l'usage » et « suspendre la collecte » ; bouton « tout effacer » multi-cours ; export de ses données.
10. Tableau de bord admin : élèves sans classe, classes sans prof, comptes jamais connectés, quotas IA consommés.
