# IABNE — Recherche de cas d'usage : administration complète de l'établissement

*Domaine : cycle de vie des comptes, structure, rôles, rentrée, supervision, IA/coûts, RGPD.*
*Contexte : Yabné Paris, établissement privé (collège + lycée, éventuellement école), élèves mineurs, de 11 à 18 ans environ. Document de travail : aucun fichier du dépôt n'a été modifié.*

---

## 0. Ce que fait vraiment le code aujourd'hui (constat)

Sources lues : `server/db.mjs`, `server/auth.mjs`, `server/index.mjs`, `server/learning.mjs` (tables et quotas), `scripts/provision.mjs`, `src/main.jsx` (composant `Administration`, l. 2869-3183), `docs/*.md`.

| Domaine | État réel | Fichier |
|---|---|---|
| Rôles | 3 rôles figés par contrainte SQL : `CHECK(role IN ('admin','teacher','student'))`. Un utilisateur = un seul rôle. | `server/db.mjs` l.16 |
| Création de compte | Un par un, par un admin : nom, e-mail, **mot de passe saisi par l'admin**, rôle, classe facultative. | `auth.mjs` `POST /api/admin/users` ; `main.jsx` l.2890 |
| Modification de compte | Nom, actif/inactif, mot de passe. **Pas** de changement d'e-mail ni de rôle. Désactivation : révocation des sessions, protection du dernier admin et de son propre compte. | `auth.mjs` `PATCH /api/admin/users/:id` |
| Identifiant | L'e-mail sert d'identifiant ; il est **UNIQUE pour toute la base** (pas seulement par établissement). | `db.mjs` l.16 |
| Premier admin | `npm run provision` ou `PROVISION_ON_START=true` ; établissement « Yabné Paris » + une année « 2026–2027 ». | `scripts/provision.mjs`, `docs/OPERATIONS.md` |
| Années scolaires | Création seulement (nom). Pas de notion d'« année en cours », pas de clôture. Une classe sans `year_id` prend `LIMIT 1` (année **arbitraire**). | `auth.mjs` l.485-491 |
| Classes | Création (nom, niveau, année). Pas de renommage, suppression ni archivage. | `auth.mjs` `POST /api/admin/classes` |
| Inscriptions | Ajout et retrait d'un élève dans une classe (le retrait révoque les délégations). Un élève **peut** avoir plusieurs classes (clé `(user_id,class_id)`) : techniquement de quoi bricoler des groupes. | `auth.mjs` l.401-435 |
| Matières | Création seulement. | `auth.mjs` l.385 |
| Affectations | Création (prof, classe, matière). **Pas de suppression.** | `auth.mjs` `POST /api/admin/assignments` |
| Cours | Un cours a **un seul** `teacher_id` : pas de co-enseignement ni de remplaçant possible sans transfert. | `db.mjs` l.21 ; `canManageCourse` dans `auth.mjs` |
| Pouvoir de l'admin | `canManageCourse` est vrai pour tout admin sur tout cours, y compris les brouillons et les évaluations non publiées. L'admin est un super-utilisateur unique. | `auth.mjs` l.24-34 |
| Liste des comptes | `/api/bootstrap` renvoie **tous** les utilisateurs à l'admin, sans pagination, recherche ni filtre dans l'interface. | `auth.mjs` l.268 ; `main.jsx` l.2938 |
| Mot de passe oublié | Rien d'automatique : l'admin saisit un nouveau mot de passe et doit le transmettre. Pas d'obligation de le changer à la première connexion. Pas d'envoi d'e-mail. | `FEATURES.md` « Limites connues » |
| 2FA | Absente. Sessions de 8 h, limitation des tentatives de connexion (20 / 15 min par IP+e-mail). | `index.mjs`, `auth.mjs` |
| Journal d'audit | Aucun. Seules les `learning_usage` (horodatage par utilisateur) et les `ed_sync_runs` existent. | `learning.mjs` l.71 |
| Quotas IA | 20 requêtes/h par utilisateur (codé en dur), 200/h par établissement (`AI_SCHOOL_HOURLY_LIMIT`). **Aucun suivi des tokens ni des coûts**, aucun tableau de bord. | `learning.mjs` l.280-300 |
| Signalements IA | Les élèves peuvent signaler (`POST /api/ai/reports`), mais **aucune route ni écran ne permet de les lire**. | `learning.mjs` l.793 |
| Suppression RGPD | Impossible proprement : la plupart des tables référencent `users(id)` **sans** `ON DELETE CASCADE`, avec `foreign_keys=ON`. Un `DELETE FROM users` échouerait. Il faut une purge ordonnée. | `db.mjs`, `practice-agent.mjs`, `ecoledirecte.mjs` |
| Import en masse | Aucun (ni CSV, ni export École Directe/SIECLE). | — |
| École Directe | Connecteur **par élève** (ses identifiants), lecture seule, expérimental et désactivé par défaut. Il n'alimente pas la structure de l'établissement. | `server/ecoledirecte.mjs`, `docs/ECOLEDIRECTE.md` |
| Sauvegarde/restauration | Scripts solides (intégrité, SHA-256, refus d'écraser, purge des sessions). | `scripts/backup.mjs`, `scripts/restore.mjs` |
| Interface admin | 3 onglets : Comptes, Classes, Cours & affectations. Pas de tableau de bord. | `main.jsx` l.2869 |

**Conséquences directes pour un pilote réel :** la rentrée d'un établissement de plusieurs centaines d'élèves est impossible à la main ; l'admin connaît tous les mots de passe initiaux ; une erreur d'affectation ne peut pas être corrigée ; le départ d'un professeur bloque ses cours ; aucune trace ne permet de savoir qui a fait quoi ; un effacement RGPD est techniquement impossible sans intervention en base.

---

## 1. Mise en place et paramètres de l'établissement

### UC-01 — Assistant de mise en service (« jour zéro »)
- **Persona / scénario :** En juin, le directeur adjoint chargé du numérique reçoit l'instance vide et doit la configurer avant la rentrée sans aide d'un développeur.
- **Fonctionnalité :** assistant guidé en étapes : identité de l'établissement, unités (collège, lycée, école ?), année en cours et ses dates, niveaux proposés, matières types (modèle Éducation nationale + matières propres à Yabné : hébreu, Kodech/études juives, etc.), premiers comptes du personnel, import des élèves, contrôle final (« 14 classes, 412 élèves, 3 classes sans professeur principal »).
- **Pourquoi :** aujourd'hui la mise en service passe par des variables d'environnement Railway puis par des formulaires unitaires. C'est la première impression de la direction.
- **Vigilance :** ne jamais afficher ni journaliser le mot de passe de provisionnement ; forcer son changement et l'activation de la 2FA à la première connexion.
- **Existant :** partiel (`scripts/provision.mjs` crée établissement + année + admin).
- **Priorité :** P1 · **Effort :** M

### UC-02 — Paramètres de l'établissement
- **Persona / scénario :** La directrice veut afficher le logo Yabné, le nom officiel, l'adresse du DPO et la charte d'usage de l'IA sur l'écran de connexion.
- **Fonctionnalité :** page « Établissement » : nom, logo, couleurs, coordonnées, contact DPO, mentions d'information RGPD (élèves et responsables légaux), charte IA à accepter, langue des messages, fuseau Europe/Paris, durée des sessions, politique de mot de passe, fonctions activées (IA, École Directe, délégués, groupes élèves).
- **Pourquoi :** tout est en variables d'environnement ou codé en dur (20 requêtes/h, 8 h de session). La direction doit pouvoir décider sans redéployer.
- **Vigilance :** séparer les réglages « métier » (direction) des réglages « techniques » (clés API, chiffrement), qui restent hors de l'interface.
- **Existant :** non (table `schools` = `id,name`).
- **Priorité :** P1 · **Effort :** M

### UC-03 — Calendrier de l'établissement (vacances, fêtes, Chabbat)
- **Persona / scénario :** La vie scolaire saisit en septembre les vacances de la zone C, les jours fériés et les fêtes juives où l'établissement est fermé (Roch Hachana, Kippour, Souccot, Pessa'h, Chavouot), ainsi que la sortie anticipée du vendredi en hiver.
- **Fonctionnalité :** calendrier annuel avec jours fermés et demi-journées. Il sert au planificateur (pas de révisions programmées ces jours-là, ou seulement si l'élève le choisit), aux échéances, et en option à la mise en pause des notifications et des rappels pendant le Chabbat et les fêtes.
- **Pourquoi :** spécificité forte d'un établissement juif ; un planning qui place des révisions pendant Kippour serait perçu comme un manque de respect.
- **Vigilance :** respect des pratiques de chaque famille. Rendre le comportement configurable (désactiver les rappels ou seulement prévenir), ne pas bloquer l'accès.
- **Existant :** non (le planificateur ne connaît que les disponibilités saisies, `learning.mjs`).
- **Priorité :** P1 · **Effort :** M

### UC-04 — Référentiel des niveaux et des matières
- **Persona / scénario :** Le secrétariat veut que les niveaux soient choisis dans une liste (6e…Terminale) et non tapés à la main (« Term », « Tle », « Terminale »).
- **Fonctionnalité :** référentiel des niveaux (ordre, cycle, unité collège ou lycée) et des matières (code, nom court, couleur, matière « spécialité » ou « option », famille Kodech/profane). Modification et fusion des doublons ; désactivation d'une matière plutôt que suppression.
- **Pourquoi :** `classes.level` est un texte libre. Les statistiques, le passage d'année et les filtres dépendent d'un référentiel propre.
- **Vigilance :** la fusion de matières doit déplacer cours et affectations dans une transaction.
- **Existant :** partiel (création de matière seule ; `level` en texte libre).
- **Priorité :** P0 (référentiel des niveaux, nécessaire au passage d'année) · **Effort :** S

---

## 2. Cycle de vie des comptes

### UC-05 — Activation de compte sans mot de passe connu de l'admin
- **Persona / scénario :** Le 1er septembre, la secrétaire crée 420 comptes élèves. Elle ne doit pas inventer 420 mots de passe ni les connaître.
- **Fonctionnalité :** à la création, le compte est « en attente d'activation » ; le système génère un **code d'activation à usage unique** (expiration de 7 à 14 jours), à remettre par e-mail (personnel), sur une fiche papier imprimable par classe (élèves), ou par lien. Lors de l'activation, l'utilisateur choisit son mot de passe et accepte la charte.
- **Pourquoi :** aujourd'hui l'admin connaît tous les mots de passe initiaux, ce qui contredit le cahier des charges (« identifiants personnels »). C'est aussi le premier risque si une fiche circule.
- **Vigilance :** codes courts mais à forte entropie, limités en tentatives ; une fiche papier égarée ne doit ouvrir qu'un compte non activé ; renouvellement en masse si nécessaire.
- **Existant :** non (mot de passe obligatoire saisi par l'admin, `auth.mjs` l.443-455).
- **Priorité :** P0 · **Effort :** M

### UC-06 — Fiches de connexion imprimables par classe
- **Persona / scénario :** Le professeur principal de 6e B distribue en heure de vie de classe une fiche individuelle par élève (identifiant, code d'activation, QR code, consignes, charte en langage simple).
- **Fonctionnalité :** génération d'un PDF par classe, une page découpable par élève (le moteur PDF existe : `server/pdf-layout.mjs`). Statut « distribué » et « activé » visible par classe.
- **Pourquoi :** les élèves de 11 ans n'ont souvent ni e-mail personnel ni téléphone. Le papier en classe est le canal le plus fiable.
- **Vigilance :** régénérer le code invalide l'ancien ; ne pas mettre de mot de passe en clair sur la fiche.
- **Existant :** non (mais moteur PDF réutilisable).
- **Priorité :** P0 · **Effort :** S

### UC-07 — Identifiant indépendant de l'e-mail
- **Persona / scénario :** Un élève de 6e n'a pas d'adresse e-mail ; deux frères partagent l'adresse de leur mère ; un professeur enseigne aussi dans un autre établissement utilisant IABNE.
- **Fonctionnalité :** identifiant de connexion distinct (ex. `prenom.nom` ou `p.nom2`), unique **par établissement** ; e-mail facultatif et non unique pour les élèves ; génération automatique avec gestion des homonymes.
- **Pourquoi :** l'e-mail est obligatoire et unique pour toute la base (`db.mjs` l.16) : c'est bloquant pour les élèves et pour le multi-établissement.
- **Vigilance :** ne pas fabriquer d'adresses factices ; minimisation des données (pas d'e-mail élève s'il n'est pas nécessaire) ; garder les identifiants stables après un changement de nom (UC-15).
- **Existant :** non.
- **Priorité :** P0 · **Effort :** M (migration du schéma et de la connexion)

### UC-08 — Mot de passe oublié en libre-service (personnel) et assisté (élèves)
- **Persona / scénario :** Un dimanche soir, une professeure a oublié son mot de passe et veut déposer son cours pour lundi. Un élève de 5e a oublié le sien en pleine séance.
- **Fonctionnalité :** personnel : lien de réinitialisation par e-mail (jeton à usage unique de 30 minutes, message identique que le compte existe ou non). Élèves : réinitialisation par le professeur principal, la vie scolaire ou le documentaliste, avec un **code temporaire** que l'élève doit remplacer à la connexion. Option : code de secours imprimé à l'activation.
- **Pourquoi :** aujourd'hui tout passe par l'admin, qui devient un goulot d'étranglement et connaît les mots de passe.
- **Vigilance :** l'envoi d'e-mails passe par un sous-traitant (localisation UE, contrat) ; journaliser chaque réinitialisation ; limiter le débit.
- **Existant :** partiel (réinitialisation par l'admin, révocation des sessions ; pas de mails selon `FEATURES.md`).
- **Priorité :** P0 (réinitialisation déléguée avec changement forcé) / P1 (lien par e-mail) · **Effort :** M

### UC-09 — Changement de mot de passe obligatoire et politique de mot de passe
- **Persona / scénario :** Après une réinitialisation, l'élève doit choisir son propre mot de passe avant d'accéder à quoi que ce soit.
- **Fonctionnalité :** indicateur `must_change_password` ; politique par rôle (élève de collège : phrase de passe d'au moins 10 caractères, avec un indicateur de robustesse adapté à l'âge ; personnel : 12 caractères minimum et contrôle contre les mots de passe compromis).
- **Pourquoi :** 12 caractères imposés à un enfant de 11 ans, c'est des mots de passe notés dans la trousse.
- **Vigilance :** pas de règles de composition absurdes (recommandations ANSSI/CNIL) ; ne pas dégrader la sécurité du personnel.
- **Existant :** partiel (12 à 128 caractères pour tous, `auth.mjs`).
- **Priorité :** P0 · **Effort :** S

### UC-10 — Double authentification pour le personnel
- **Persona / scénario :** Le compte de la CPE donne accès aux listes de toutes les classes ; le compte de la direction peut supprimer des données. Un mot de passe réutilisé et fuité suffirait aujourd'hui.
- **Fonctionnalité :** TOTP (application d'authentification) obligatoire pour les rôles admin et direction, recommandée pour les professeurs ; codes de secours ; réinitialisation de la 2FA par un second admin (principe des quatre yeux) ; « appareil de confiance » de 30 jours en option.
- **Pourquoi :** les données concernent des mineurs ; les comptes à privilèges sont la cible principale. La CNIL recommande l'authentification forte pour les accès étendus.
- **Vigilance :** prévoir la procédure de perte du téléphone ; ne pas imposer la 2FA aux élèves (accès et équipement inégaux).
- **Existant :** non.
- **Priorité :** P0 pour les admins (avant données réelles) / P1 pour les professeurs · **Effort :** M

### UC-11 — Recherche, filtres et fiche détaillée d'un compte
- **Persona / scénario :** Un parent appelle : « mon fils n'arrive pas à se connecter ». La secrétaire doit trouver « Cohen » parmi 15 homonymes et voir sa classe, son statut d'activation et sa dernière connexion.
- **Fonctionnalité :** liste paginée avec recherche (nom, identifiant), filtres (rôle, classe, statut : actif, en attente, désactivé, archivé), fiche compte (classes, groupes, affectations, dernière connexion, sessions ouvertes, historique admin) et actions rapides (réinitialiser, désactiver, déconnecter partout).
- **Pourquoi :** la liste actuelle affiche tous les comptes en vrac (`main.jsx` l.2938) ; inutilisable à partir de 100 comptes. `bootstrap` envoie tout au navigateur.
- **Vigilance :** la fiche admin ne doit **pas** donner accès aux conversations IA privées ni à la mémoire du tuteur.
- **Existant :** non (liste brute).
- **Priorité :** P0 · **Effort :** M

### UC-12 — Modifier l'e-mail, l'identifiant ou le rôle d'un compte
- **Persona / scénario :** Une surveillante devient professeure d'hébreu à la Toussaint ; une professeure change d'adresse e-mail.
- **Fonctionnalité :** modification de l'e-mail ou de l'identifiant (avec révocation des sessions et notification à l'ancienne adresse) ; ajout ou retrait de rôles (voir modèle multi-rôle, section 9) plutôt que changement destructif.
- **Pourquoi :** aujourd'hui, la seule solution est de créer un second compte, ce qui fait perdre l'historique et crée des doublons.
- **Vigilance :** un passage d'élève à personnel (ancien élève devenu assistant d'éducation) doit **séparer** les comptes : les données d'élève ne suivent pas.
- **Existant :** non (`PATCH` limité au nom, à l'état et au mot de passe).
- **Priorité :** P1 · **Effort :** S

### UC-13 — Désactivation, archivage et suppression : trois états distincts
- **Persona / scénario :** Un professeur part en congé maternité (suspendre), un élève quitte l'établissement en mars (archiver puis purger après le délai), un compte créé par erreur la veille (supprimer immédiatement).
- **Fonctionnalité :** états `en attente`, `actif`, `suspendu` (réactivable, données conservées), `archivé` (lecture seule ou invisible, conservation limitée dans le temps), `supprimé` (purge). Motif obligatoire et date de fin facultative pour la suspension.
- **Pourquoi :** `active=0` est aujourd'hui le seul levier. Un compte désactivé garde ses inscriptions, sa connexion École Directe et toutes ses données sans limite de durée.
- **Vigilance :** la durée d'archivage est fixée par l'établissement et son DPO, pas par le logiciel ; afficher clairement ce qui sera effacé.
- **Existant :** partiel (`active` 0/1).
- **Priorité :** P0 · **Effort :** M

### UC-14 — Comptes temporaires et à durée limitée
- **Persona / scénario :** Un professeur remplaçant arrive pour 6 semaines ; un intervenant extérieur anime un atelier ; un stagiaire INSPE observe des cours ; un inspecteur veut une démonstration.
- **Fonctionnalité :** date d'expiration sur tout compte (désactivation automatique et e-mail d'alerte à J-7 à l'admin), rôle « invité » en lecture seule sur des cours choisis, sans accès aux noms des élèves.
- **Pourquoi :** les comptes oubliés après le départ d'un intervenant sont une source classique de fuite.
- **Vigilance :** un invité ne doit jamais voir de données nominatives d'élèves ; journaliser ses accès.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** S

### UC-15 — Changement de nom d'un élève ou d'un membre du personnel
- **Persona / scénario :** Après un mariage, une professeure prend le nom de son époux ; un élève change de nom d'usage à la suite d'une décision familiale ou d'une adoption ; un élève demande l'usage d'un autre prénom.
- **Fonctionnalité :** modification du nom affiché avec historique visible par les seuls admins ; option de mise à jour de l'identifiant (ancien identifiant redirigé pendant une période) ; mise à jour partout (listes, documents « déposé par »).
- **Pourquoi :** la cohérence des listes évite les erreurs ; des situations familiales sensibles (protection de l'enfance, ordonnance) imposent de **ne plus afficher** l'ancien nom.
- **Vigilance :** une situation de protection de l'enfant peut exiger la confidentialité de l'ancien nom et de la classe : prévoir un indicateur « dossier sensible » limitant l'affichage.
- **Existant :** partiel (le nom est modifiable par `PATCH`, sans historique).
- **Priorité :** P1 · **Effort :** S

### UC-16 — Détection et fusion des doublons
- **Persona / scénario :** Après un import, « David Lévy » existe deux fois : l'un créé à la main en juin, l'autre importé en septembre.
- **Fonctionnalité :** détection (nom normalisé sans accents ni tirets, date de naissance, identifiant externe) ; écran de fusion qui choisit le compte maître et déplace inscriptions et données.
- **Pourquoi :** les noms et translittérations (Lévy/Levi/Halevi, Cohen/Kohen) se prêtent particulièrement aux doublons.
- **Vigilance :** ne jamais fusionner automatiquement ; deux homonymes réels peuvent exister (cousins dans la même classe).
- **Existant :** non.
- **Priorité :** P1 · **Effort :** M

---

## 3. Import en masse et synchronisation

### UC-17 — Import CSV/XLSX des élèves avec prévisualisation
- **Persona / scénario :** Fin août, la secrétaire exporte depuis le logiciel de vie scolaire la liste « Nom, Prénom, Date de naissance, Classe, Sexe, Options, INE » et veut l'importer en une fois.
- **Fonctionnalité :** dépôt d'un CSV ou XLSX, correspondance des colonnes (mémorisée), **prévisualisation en simulation** (créations, mises à jour, inchangés, erreurs ligne par ligne), création des classes manquantes en option, import transactionnel (tout ou rien) et rapport téléchargeable. Mode « mise à jour » : rapprochement par identifiant externe, sans recréer.
- **Pourquoi :** c'est le cas d'usage n°1 de la rentrée ; sans lui, le pilote est irréaliste.
- **Vigilance :** encodages (UTF-8, Windows-1252 d'Excel, séparateur `;`), accents et noms composés ; ne pas importer de colonnes inutiles (minimisation : la date de naissance sert seulement au dédoublonnage) ; fichier supprimé après import ; journal d'audit.
- **Existant :** non.
- **Priorité :** P0 · **Effort :** M

### UC-18 — Import du personnel et des services (affectations)
- **Persona / scénario :** Le directeur adjoint possède le tableau des services : « M. Benhamou, Mathématiques, 3e A, 3e B, 2nde 1 ».
- **Fonctionnalité :** import CSV des enseignants avec leurs affectations (prof, classe ou groupe, matière), création automatique des espaces de cours, détection des classes sans professeur dans une matière du tronc commun.
- **Pourquoi :** une centaine d'affectations à saisir une à une dans trois listes déroulantes n'est pas faisable.
- **Vigilance :** les professeurs à temps partagé ou intervenant sur plusieurs unités ; ne pas créer deux cours pour la même affectation.
- **Existant :** non (affectation unitaire uniquement).
- **Priorité :** P0 · **Effort :** M

### UC-19 — Connecteurs d'export du logiciel de vie scolaire (École Directe, SIECLE/STSWeb, ONDE)
- **Persona / scénario :** Yabné utilise École Directe (Aplim) pour notes, absences et emploi du temps ; l'établissement veut éviter la double saisie.
- **Fonctionnalité :** modèles d'import prêts à l'emploi pour les exports usuels : export élèves/classes d'École Directe (CSV/XLSX), XML SIECLE/BEE (élèves, structures, options) et STSWeb (services) si l'établissement y a accès, ONDE pour une éventuelle école primaire. À terme : synchronisation planifiée par une API officielle si Aplim en propose une sous contrat.
- **Pourquoi :** la source de vérité administrative est le logiciel de vie scolaire ; IABNE doit s'aligner sur lui.
- **Vigilance :** **à vérifier avec le secrétariat** : quels exports Yabné peut réellement produire (les établissements privés n'ont pas toujours l'accès SIECLE complet). Le connecteur actuel est un connecteur **élève** non officiel, à ne pas utiliser pour la structure. Pas d'accès automatisé non autorisé au compte d'établissement.
- **Existant :** non (connecteur élève seulement, `server/ecoledirecte.mjs`).
- **Priorité :** P1 (modèle École Directe CSV) / P2 (SIECLE, STSWeb, synchronisation) · **Effort :** M à L

### UC-20 — Identifiant externe stable
- **Persona / scénario :** Lors de la réimportation de novembre, « Yaël Attal » est devenue « Yaël Attal-Sebbag » : il faut la reconnaître et non créer un nouveau compte.
- **Fonctionnalité :** champ `external_id` (identifiant du logiciel de vie scolaire ou numéro interne ; INE si nécessaire) par utilisateur, classe et groupe ; clé de rapprochement des imports.
- **Pourquoi :** c'est la condition pour que les imports successifs soient idempotents.
- **Vigilance :** l'INE est une donnée personnelle réglementée : ne pas l'afficher, envisager de ne stocker qu'une empreinte si le rapprochement suffit.
- **Existant :** non.
- **Priorité :** P0 (avec UC-17) · **Effort :** S

---

## 4. Structure pédagogique

### UC-21 — Modifier, renommer, archiver une classe
- **Persona / scénario :** La « 4e C » est créée par erreur en « 4e c » ; une classe de 2nde est fermée à la rentrée faute d'effectif.
- **Fonctionnalité :** renommer, changer le niveau ou l'année, archiver (et non supprimer) ; supprimer uniquement si elle est vide.
- **Pourquoi :** sans cela, chaque coquille est définitive.
- **Vigilance :** archiver une classe ne doit pas effacer les cours des professeurs (ils peuvent les réutiliser).
- **Existant :** non.
- **Priorité :** P0 · **Effort :** S

### UC-22 — Groupes transversaux : langues, options, spécialités du lycée, demi-groupes
- **Persona / scénario :** En Première, les élèves de 1re 1 et 1re 2 se répartissent en spécialités (Maths, SES, HGGSP, Physique-Chimie…) ; au collège, les LV2 (espagnol, hébreu moderne) mélangent deux classes ; les TP de SVT se font en demi-groupes.
- **Fonctionnalité :** entité **Groupe** distincte de la classe : type (spécialité, option, LV, demi-groupe, groupe de besoin, Kodech par niveau), classes d'origine, élèves membres. Un cours est rattaché à une classe **ou** à un groupe. Composition en masse (cocher dans la liste de classe, import CSV « élève ; groupe »).
- **Pourquoi :** le lycée réformé repose sur les groupes de spécialité. Sans eux, un professeur de SES de Première ne peut pas cibler ses 24 élèves venus de trois classes. Les groupes de niveau en hébreu et en études juives sont aussi fréquents.
- **Vigilance :** appliquer les mêmes contrôles d'accès que pour les classes (`canAccessCourse` passe aujourd'hui par `memberships`) ; préciser le seuil de 5 élèves pour les statistiques dans les petits groupes (option rare à 3 élèves).
- **Existant :** partiel et détourné : un élève peut être inscrit dans plusieurs « classes », ce qui permet de simuler un groupe, sans distinction de type ni de classe de rattachement.
- **Priorité :** P0 pour le lycée (spécialités) · **Effort :** M

### UC-23 — Groupes de travail créés par les élèves
- **Persona / scénario :** Quatre élèves de Terminale veulent un groupe « Révisions bac de philo » pour partager des fiches générées et réviser ensemble.
- **Fonctionnalité :** groupe créé par un élève dans le périmètre de sa classe ou de son niveau (pas de groupe entre établissements ni avec des inconnus), invitation et acceptation, taille maximale, ressources partagées (fiches, quiz), fermeture automatique en fin d'année. Côté admin : activation de la fonction par niveau (par exemple, non autorisée en 6e et 5e), liste des groupes, modération, signalement, dissolution.
- **Pourquoi :** c'est une demande explicite de l'utilisateur. Le travail entre pairs est très efficace pour les révisions.
- **Vigilance :** **zone de risque la plus élevée du domaine** : harcèlement, exclusion (« groupe des populaires »), contenus inappropriés, mineurs. Si une messagerie est ajoutée : modération, signalement, conservation encadrée, interdiction de la messagerie privée en tête-à-tête au collège, et rappel que les échanges sont visibles par la vie scolaire en cas de signalement. Commencer **sans chat** (partage de ressources uniquement). L'IA du groupe ne doit pas mélanger les mémoires privées des tuteurs.
- **Existant :** non.
- **Priorité :** P1 (partage de ressources sans messagerie) / P2 (messagerie modérée) · **Effort :** M à L

### UC-24 — Gestion complète des affectations
- **Persona / scénario :** Le directeur adjoint s'est trompé : M. Azoulay n'enseigne pas la physique en 2nde 3, c'est Mme Dahan.
- **Fonctionnalité :** liste des affectations filtrable (par prof, classe ou matière), suppression, **transfert** (changer le professeur d'une affectation en conservant le cours et ses documents), vue en grille classe × matière avec les cases vides en rouge.
- **Pourquoi :** il n'existe aucune route de suppression ni de modification des affectations, et un cours reste lié à son `teacher_id` d'origine.
- **Vigilance :** que deviennent les documents du professeur retiré ? Ils restent sa propriété intellectuelle : proposer « transférer », « copier » ou « archiver », jamais d'effacement silencieux.
- **Existant :** partiel (création uniquement).
- **Priorité :** P0 · **Effort :** M

### UC-25 — Co-enseignement et cours partagés
- **Persona / scénario :** En 3e, deux professeures se partagent l'histoire-géographie (l'une l'histoire, l'autre la géographie) ; un professeur de sciences et un professeur de technologie mènent un EPI commun.
- **Fonctionnalité :** plusieurs enseignants par cours avec rôle (titulaire, co-enseignant, remplaçant, lecteur) ; chaque document reste attribué à son auteur ; l'IA d'un cours peut puiser dans les documents de tous les co-enseignants **si** ceux-ci l'acceptent.
- **Pourquoi :** le cahier des charges isole l'agent par professeur ; la réalité impose des cours à plusieurs mains.
- **Vigilance :** consentement explicite de chaque professeur pour que ses documents nourrissent l'agent commun ; statistiques visibles par tous les co-enseignants seulement si chacun y consent.
- **Existant :** non (`courses.teacher_id` unique).
- **Priorité :** P1 · **Effort :** M

### UC-26 — Professeur principal
- **Persona / scénario :** Mme Sitbon, professeure principale de 3e A, veut voir qui n'a pas activé son compte, réinitialiser le mot de passe d'un élève et voir l'usage global de l'IA dans sa classe, sans lire de conversations.
- **Fonctionnalité :** attribut « professeur principal » sur une classe (un ou deux par classe), donnant des droits limités : liste et statut d'activation des élèves, réinitialisation par code temporaire, fiches de connexion, indicateurs agrégés de la classe, rappel aux élèves inactifs.
- **Pourquoi :** décharge le secrétariat ; c'est l'interlocuteur naturel des élèves et des familles.
- **Vigilance :** pas d'accès aux données privées du tuteur ni aux conversations ; respecter le seuil d'agrégation.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** S

---

## 5. Événements de l'année scolaire

### UC-27 — Rentrée scolaire, jour J
- **Persona / scénario :** Le 1er septembre à 8 h, 400 élèves doivent se connecter en salle informatique ou sur tablette pendant l'heure de vie de classe ; le réseau de l'établissement n'a qu'une seule IP publique.
- **Fonctionnalité :** « mode rentrée » : tableau de bord en temps réel (comptes activés par classe), assouplissement temporaire de la limite de connexions par IP (déjà en partie traité par la clé IP + e-mail, `auth.mjs` l.97), page d'aide affichable au tableau, liste des élèves bloqués à traiter par la vie scolaire.
- **Pourquoi :** la première expérience conditionne l'adoption ; une limite de débit mal calibrée peut bloquer une classe entière.
- **Vigilance :** pas de mot de passe commun « pour aller plus vite » ; un seul serveur SQLite : tester la charge (40 activations simultanées) avant la rentrée.
- **Existant :** partiel (limitation de débit adaptée à une IP partagée).
- **Priorité :** P1 · **Effort :** S à M

### UC-28 — Passage d'année et archivage
- **Persona / scénario :** Le 10 juillet, le directeur adjoint prépare 2027-2028 : les 6e A deviennent des 5e, les Terminales partent, les redoublants restent, les nouvelles classes sont créées et les professeurs veulent réutiliser leurs cours.
- **Fonctionnalité :** assistant de bascule : (1) créer l'année N+1 ; (2) dupliquer la structure (classes du niveau supérieur, groupes) ; (3) proposer une promotion par défaut niveau → niveau supérieur, ajustable élève par élève ou par import de la décision du conseil de classe ; (4) les élèves de Terminale et les départs passent en « archivé » ; (5) **les professeurs gardent leurs documents** et peuvent les rattacher aux nouveaux cours (copie de cours, de chapitres et de profil pédagogique) ; (6) l'année N passe en lecture seule ; (7) les données de l'année N sont purgées selon la politique de conservation.
- **Pourquoi :** sans passage d'année, l'application est jetable au bout d'un an. La table `school_years` existe, mais rien ne l'exploite.
- **Vigilance :** que deviennent la mémoire du tuteur, les fiches et les conversations d'un élève qui passe de 4e en 3e ? Il faut une règle claire (proposition : l'élève garde ses fiches et peut exporter son historique ; la mémoire fine liée au cours de l'an passé est archivée puis purgée) ; le cahier de textes École Directe importé doit être purgé ; répétition à blanc sur une copie restaurée.
- **Existant :** non (années créables, sans « année courante »).
- **Priorité :** P1 (nécessaire avant juillet 2027, pas avant le pilote) · **Effort :** L

### UC-29 — Élève redoublant
- **Persona / scénario :** Noam redouble sa Seconde : il reste au même niveau, dans une autre classe, avec parfois les mêmes professeurs.
- **Fonctionnalité :** dans l'assistant de passage, action « maintenir au niveau » ; choix de conserver sa mémoire du tuteur et ses fiches de l'an passé (utile pour la remédiation) ou de repartir de zéro ; indicateur visible par l'admin seulement.
- **Pourquoi :** cas courant qu'un passage automatique traiterait mal (promotion forcée).
- **Vigilance :** ne pas afficher « redoublant » aux professeurs par défaut (stigmatisation) ; l'information appartient au dossier scolaire et non à l'outil d'IA. Le choix de conserver la mémoire revient à l'élève.
- **Existant :** non.
- **Priorité :** P1 (avec UC-28) · **Effort :** S

### UC-30 — Changement de classe en cours d'année
- **Persona / scénario :** En novembre, à la suite d'un conflit, Léa passe de 4e B en 4e C ; elle change de groupe d'anglais mais garde son groupe d'hébreu.
- **Fonctionnalité :** action unique « changer de classe » : retrait et inscription dans une transaction, mise à jour des groupes avec proposition, transfert de la mémoire du tuteur par matière si le cours de destination est de la même matière (en option, avec l'accord de l'élève), révocation des délégations, date d'effet et journal.
- **Pourquoi :** aujourd'hui il faut retirer puis inscrire : entre les deux, l'élève perd l'accès et ses données restent attachées aux anciens cours.
- **Vigilance :** situation souvent sensible (harcèlement) : ne pas notifier l'ancienne classe ; ne pas laisser de trace visible des anciens camarades.
- **Existant :** partiel (retrait et inscription séparés, `auth.mjs` l.401-435).
- **Priorité :** P1 · **Effort :** S

### UC-31 — Départ d'un élève en cours d'année
- **Persona / scénario :** En février, la famille Elbaz déménage en Israël (alya) ; l'élève quitte l'établissement à la fin de la semaine.
- **Fonctionnalité :** procédure « départ » : date de sortie, désactivation à cette date, proposition à l'élève ou à sa famille d'**exporter ses données** (fiches PDF, historique), déconnexion École Directe et suppression des jetons, archivage, puis purge automatique après le délai défini. Les documents déposés comme délégué restent attachés au cours, avec un auteur anonymisé.
- **Pourquoi :** fréquent dans un établissement parisien de ce type (déménagements, départs à l'étranger) ; c'est un moment clé du RGPD (droit à la portabilité, limitation de la conservation).
- **Vigilance :** la famille peut demander l'effacement immédiat (UC-45) ; l'élève peut revenir (réintégration dans le délai d'archivage).
- **Existant :** non (désactivation seule).
- **Priorité :** P1 · **Effort :** M

### UC-32 — Arrivée d'un élève en cours d'année
- **Persona / scénario :** Un élève arrive de Marseille le 15 janvier en 5e A.
- **Fonctionnalité :** création rapide avec classe, groupes « par défaut de la classe » proposés, fiche de connexion imprimée immédiatement, notification au professeur principal.
- **Pourquoi :** cas fréquent ; il ne doit pas attendre trois jours.
- **Vigilance :** les statistiques des professeurs ne doivent pas permettre de repérer le « nouveau » à partir d'un seuil franchi (5 → 6 élèves).
- **Existant :** partiel (création avec classe).
- **Priorité :** P1 · **Effort :** S

### UC-33 — Départ ou absence longue d'un professeur et remplaçant
- **Persona / scénario :** M. Taieb part en congé maladie pour 3 mois ; Mme Ohayon le remplace. Elle doit voir les cours, publier et adapter, sans hériter de tout son espace ni de son profil pédagogique validé.
- **Fonctionnalité :** « remplacement » daté : le remplaçant obtient le rôle de co-enseignant sur les cours choisis (lecture des documents publiés, dépôt et publication de ses propres documents, statistiques), fin automatique à la date prévue, le titulaire retrouve ses cours intacts. Option « départ définitif » : transfert de propriété des cours, avec l'accord du professeur sortant pour ses documents.
- **Pourquoi :** sans cela, les cours d'un professeur absent sont gelés (seuls lui et l'admin peuvent les gérer).
- **Vigilance :** propriété intellectuelle des supports du professeur : ne pas transférer sans accord ; l'IA du cours ne doit pas mélanger le profil validé du titulaire et le style du remplaçant sans le dire.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** M

### UC-34 — Fratries
- **Persona / scénario :** La famille Benichou a trois enfants en 6e, 4e et 1re ; les parents ont une seule adresse e-mail ; les frères et sœurs utilisent parfois le même ordinateur familial.
- **Fonctionnalité :** lien « fratrie » facultatif visible par l'admin (utile pour les imports, les responsables légaux communs et les fiches envoyées aux familles) ; e-mail de contact non unique ; bouton « changer d'utilisateur » qui vide complètement la session et le cache local.
- **Pourquoi :** évite les collisions d'e-mail et le risque qu'un enfant voie la mémoire privée du tuteur de son frère sur l'appareil familial.
- **Vigilance :** ne jamais créer de compte « famille » partagé ; aucune donnée d'un enfant visible depuis le compte d'un autre.
- **Existant :** non.
- **Priorité :** P2 (lien) / P1 (déconnexion propre sur appareil partagé) · **Effort :** S

---

## 6. Rôles supplémentaires

### UC-35 — Direction (chef d'établissement, adjoints)
- **Persona / scénario :** La directrice du lycée veut le taux d'adoption par niveau et par matière, le coût IA du mois et les signalements en cours, sans gérer les comptes elle-même.
- **Fonctionnalité :** rôle « direction » : tableau de bord global (lecture), validation des opérations sensibles (purge, passage d'année, export massif), accès au journal d'audit, paramètres de l'établissement. Sans accès aux conversations ni aux brouillons des professeurs par défaut.
- **Pourquoi :** le « super admin » actuel mélange technique, secrétariat et pilotage.
- **Vigilance :** les indicateurs de pilotage ne doivent pas devenir des outils d'évaluation des enseignants (point sensible avec les professeurs et leurs représentants) ; le présenter et le paramétrer en conséquence.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** S (si le modèle de permissions est fait)

### UC-36 — CPE et vie scolaire
- **Persona / scénario :** La CPE reçoit un signalement : un élève a posé à l'IA des questions qui font penser à du mal-être ; un groupe de travail élèves est le lieu de moqueries.
- **Fonctionnalité :** rôle « vie scolaire » : comptes élèves (statut, réinitialisation, suspension temporaire), modération des groupes élèves, file des signalements (IA et groupes), procédure d'alerte. Droits nominatifs sur les élèves, sans les contenus pédagogiques privés.
- **Pourquoi :** la protection des élèves passe par la vie scolaire, pas par le secrétariat ni l'informatique.
- **Vigilance :** la **détection automatique de mal-être** dans les conversations IA est une question délicate (surveillance de mineurs, AIPD, AI Act) : si elle existe, elle doit être annoncée, minimale (signal plutôt que transcription), et décidée par la direction avec le DPO. Par défaut : l'IA oriente l'élève vers un adulte et vers les numéros d'aide (3018, 3114, 119), et l'élève peut choisir d'alerter la vie scolaire.
- **Existant :** non (signalements stockés dans `learning_reports` mais illisibles).
- **Priorité :** P1 (rôle et file des signalements) · **Effort :** M

### UC-37 — Secrétariat
- **Persona / scénario :** La secrétaire de direction gère inscriptions, départs et changements de nom, mais ne doit pas voir les brouillons des professeurs, la configuration IA ni les journaux de sécurité.
- **Fonctionnalité :** rôle « secrétariat » : comptes, imports, classes, groupes et affectations ; pas d'accès aux contenus pédagogiques ; les suppressions définitives demandent la validation de la direction.
- **Pourquoi :** c'est l'utilisateur administratif quotidien ; le moindre privilège limite l'impact d'une erreur ou d'un compte compromis.
- **Vigilance :** séparer « créer et modifier » de « purger ».
- **Existant :** non (un seul rôle `admin`, qui peut tout gérer, y compris les cours : `canManageCourse`).
- **Priorité :** P1 · **Effort :** S

### UC-38 — Documentaliste (CDI)
- **Persona / scénario :** La documentaliste anime l'éducation aux médias et à l'IA et voudrait publier des ressources transversales (méthodologie, « bien utiliser l'IA ») visibles par tout un niveau.
- **Fonctionnalité :** rôle « documentaliste » : espaces de ressources transversaux par niveau, aide à l'activation des comptes au CDI (réinitialisation par code temporaire).
- **Pourquoi :** le CDI est souvent le lieu de première utilisation et de formation des élèves.
- **Vigilance :** ses ressources doivent aussi passer par la publication (brouillon, puis publication).
- **Existant :** non.
- **Priorité :** P2 · **Effort :** S

### UC-39 — AESH et aménagements (PAP, PPS)
- **Persona / scénario :** L'AESH de Samuel, élève dyslexique en 5e, l'accompagne dans plusieurs cours et voudrait voir les mêmes documents que lui pour l'aider.
- **Fonctionnalité :** rôle « accompagnant » rattaché à un ou plusieurs élèves : lecture des documents publiés de leurs cours, sans accès aux conversations et à la mémoire privée, sauf si l'élève partage explicitement une session. Côté admin : indicateur d'aménagement (police adaptée, temps majoré dans les sujets générés, lecture à voix haute) appliqué automatiquement, **sans** afficher le diagnostic.
- **Pourquoi :** inclusion ; les besoins d'accessibilité sont fréquents ; l'IA peut adapter les supports.
- **Vigilance :** les informations médicales ou de handicap sont des **données sensibles** : ne stocker que l'aménagement utile, jamais le diagnostic ; accès très restreint.
- **Existant :** non.
- **Priorité :** P2 · **Effort :** M

### UC-40 — Parents et responsables légaux ?
- **Persona / scénario :** Un père demande à voir « ce que mon fils fait avec l'IA » ; une mère séparée, sans autorité parentale limitée, demande les mêmes accès que l'autre parent.
- **Fonctionnalité recommandée :** **pas de portail parent au pilote** (cohérent avec `OPERATIONS.md` : « Aucun portail parent n'est exigé »). Prévoir plutôt : (a) information des familles (notice, charte) ; (b) gestion des demandes RGPD des responsables légaux par l'admin (export, effacement) ; (c) plus tard, éventuellement, un résumé hebdomadaire agrégé (temps de révision, matières travaillées) **sans** contenu des conversations, avec l'accord de l'élève à partir du lycée.
- **Pourquoi :** École Directe joue déjà le rôle de portail familles. Un accès parent aux conversations casserait la confiance de l'élève et l'intérêt pédagogique du tuteur privé.
- **Vigilance :** autorité parentale partagée, ordonnances, droits d'un parent sans garde ; majorité numérique fixée à 15 ans en France pour le consentement ; données d'élèves majeurs en Terminale (à 18 ans, l'élève exerce seul ses droits).
- **Existant :** non (choix volontaire).
- **Priorité :** idée long terme (sauf procédure RGPD, P0) · **Effort :** L

### UC-41 — Délégation fine de droits d'administration
- **Persona / scénario :** La directrice veut confier au responsable du collège la gestion des seules classes de collège, et au professeur référent numérique la gestion des quotas IA.
- **Fonctionnalité :** attribution de permissions par **périmètre** (établissement, unité collège ou lycée, niveau, classe) ; journal des attributions ; date d'expiration possible ; principe des quatre yeux pour l'attribution du rôle admin.
- **Pourquoi :** un établissement qui va de la 6e à la Terminale a des responsables différents par unité.
- **Vigilance :** empêcher l'élévation de privilèges (on ne peut pas accorder plus que ce qu'on possède) ; conserver au moins deux admins actifs (aujourd'hui : protection du seul « dernier admin »).
- **Existant :** non.
- **Priorité :** P2 · **Effort :** M

---

## 7. Sécurité, audit, supervision

### UC-42 — Journal d'audit des actions sensibles
- **Persona / scénario :** Un élève prétend qu'« un prof a réinitialisé mon mot de passe et lu mes conversations ». La direction doit pouvoir vérifier ce qui s'est passé.
- **Fonctionnalité :** journal append-only : qui, quoi, quand, sur quel objet, depuis quelle IP tronquée. Il couvre la création, modification, désactivation et suppression de comptes, les réinitialisations, les changements de rôle et de périmètre, les imports, les exports, les purges, les changements de paramètres, les connexions admin, les échecs de 2FA et les publications de documents. Consultation filtrable par la direction ; export ; conservation limitée (par exemple 1 an, à fixer avec le DPO).
- **Pourquoi :** exigence de redevabilité RGPD (art. 5.2 et 32) ; indispensable en cas d'incident ; protège aussi les personnels.
- **Vigilance :** **ne jamais** journaliser mots de passe, codes d'activation, contenus de conversations ou de documents ; le journal est lui-même une donnée personnelle.
- **Existant :** non.
- **Priorité :** P0 · **Effort :** M

### UC-43 — Tableau de bord administrateur
- **Persona / scénario :** Le lundi matin, le référent numérique ouvre IABNE et voit : 37 comptes non activés en 6e, 2 classes sans professeur en SVT, 4 documents en échec d'extraction, 85 % du quota IA mensuel consommé, 3 signalements en attente.
- **Fonctionnalité :** tuiles « à traiter » (comptes en attente, affectations manquantes, échecs d'indexation, signalements, comptes temporaires qui expirent, élèves sans classe), adoption (connexions actives par niveau et par semaine), santé (espace disque du volume, dernière sauvegarde réussie, statut du fournisseur IA, statut École Directe).
- **Pourquoi :** cité comme manquant dans l'état des lieux ; c'est l'outil de pilotage du pilote.
- **Vigilance :** agrégats uniquement ; ne pas classer les professeurs ; la « dernière sauvegarde » doit refléter une vraie sauvegarde externe, pas une déclaration.
- **Existant :** non.
- **Priorité :** P1 (version minimale P0 : comptes non activés et affectations manquantes) · **Effort :** M

### UC-44 — Sessions actives et déconnexion forcée
- **Persona / scénario :** Un élève a laissé sa session ouverte sur un ordinateur du CDI ; un téléphone de professeur a été volé.
- **Fonctionnalité :** liste des sessions par compte (appareil, date), « déconnecter partout », session plus courte sur les postes partagés (option « ordinateur public »), verrouillage après X échecs avec notification.
- **Pourquoi :** les postes partagés des établissements sont un risque majeur pour la mémoire privée du tuteur.
- **Vigilance :** pas de géolocalisation fine.
- **Existant :** partiel (révocation des sessions lors d'une désactivation ou d'un changement de mot de passe, `auth.mjs` l.376-379).
- **Priorité :** P1 · **Effort :** S

### UC-45 — Supervision technique et alertes
- **Persona / scénario :** Un vendredi, le fournisseur IA renvoie des erreurs ; personne ne s'en aperçoit avant que des élèves se plaignent le dimanche.
- **Fonctionnalité :** alertes par e-mail aux admins techniques : taux d'erreur IA, quota proche, échecs d'extraction, disque plein à 80 %, échec ou absence de sauvegarde depuis plus de 24 h, pics de connexions échouées (possible attaque).
- **Pourquoi :** `OPERATIONS.md` demande de « surveiller » mais rien n'est outillé.
- **Vigilance :** les alertes ne contiennent aucune donnée nominative.
- **Existant :** non (`/api/health` minimal).
- **Priorité :** P1 · **Effort :** M

### UC-46 — Mode « connexion en tant que » (assistance), à proscrire ou à encadrer
- **Persona / scénario :** Le support veut « voir ce que voit l'élève » pour comprendre un bogue.
- **Fonctionnalité recommandée :** **pas d'usurpation d'identité**. À la place, un aperçu « vue élève de la classe X » avec un compte fictif, ou un partage d'écran consenti. Si une usurpation devient nécessaire, elle doit passer par la double validation, être limitée dans le temps, exclure la mémoire privée et les conversations, apparaître dans le journal d'audit et être notifiée à l'utilisateur.
- **Pourquoi :** la promesse « vos conversations ne sont jamais partagées » doit être techniquement vraie, y compris vis-à-vis des admins.
- **Vigilance :** confiance des élèves et des professeurs.
- **Existant :** non (c'est bien ainsi). Remarque : l'admin peut déjà gérer tous les cours et leurs brouillons.
- **Priorité :** P1 (aperçu « vue élève ») · **Effort :** S

---

## 8. IA : quotas, coûts, contrôle

### UC-47 — Budget IA et suivi des coûts
- **Persona / scénario :** L'économe veut savoir combien coûte l'IA par mois et par niveau, et fixer un plafond de 300 € par mois sans risque de dépassement pendant le bac blanc.
- **Fonctionnalité :** enregistrement des tokens d'entrée et de sortie, du modèle et du type de demande pour chaque appel (dans `learning_usage`, sans contenu) ; coût estimé selon un barème configurable ; tableau par mois, niveau, matière et fonction (chat, quiz, sujets) ; budget mensuel avec alertes à 50, 80 et 100 % ; comportement en cas de dépassement choisi par la direction (dégradation vers un modèle moins cher, priorité aux Terminales en période d'examens, ou blocage).
- **Pourquoi :** les limites actuelles comptent des requêtes, pas des coûts ; un sujet complet coûte bien plus qu'une question. `OPERATIONS.md` reconnaît que ce n'est « pas un budget global garanti ».
- **Vigilance :** pas de suivi individuel nominatif des coûts visible par la direction (ce serait un outil de surveillance des élèves) ; plafonds côté fournisseur comme filet de sécurité.
- **Existant :** partiel (comptage horaire par utilisateur et par établissement, `learning.mjs` l.280-300).
- **Priorité :** P1 (suivi des tokens P0, sinon aucune visibilité pendant le pilote) · **Effort :** M

### UC-48 — Quotas différenciés et périodes
- **Persona / scénario :** Pendant les révisions du bac, la direction veut doubler le quota des Terminales ; en 6e, elle veut limiter l'usage du soir après 21 h.
- **Fonctionnalité :** quotas par rôle, niveau ou groupe, par heure, jour ou mois ; plages horaires d'accès à l'IA par niveau (par exemple pas d'IA après 22 h au collège, sans bloquer la consultation des cours) ; dérogations temporaires ; pause pendant les épreuves (UC-49).
- **Pourquoi :** la limite de 20 requêtes/h est codée en dur et identique pour tous.
- **Vigilance :** les plages horaires relèvent d'un choix éducatif à concerter avec les familles ; les annoncer clairement aux élèves.
- **Existant :** partiel (valeurs fixes).
- **Priorité :** P1 · **Effort :** M

### UC-49 — Mode examen : suspension de l'IA
- **Persona / scénario :** Pendant le brevet blanc dans la salle informatique, ou un devoir surveillé sur tablette, l'IA ne doit pas être utilisable par les 3e.
- **Fonctionnalité :** l'admin, la vie scolaire ou le professeur programme une suspension de l'IA pour une classe ou un groupe sur un créneau ; les documents restent consultables ou sont masqués selon le choix.
- **Pourquoi :** intégrité des évaluations ; c'est une demande fréquente des professeurs dès qu'un outil IA arrive.
- **Vigilance :** ne pas surveiller les élèves (pas de capture d'activité) ; ce mode limite seulement l'accès.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** S

### UC-50 — File des signalements IA et contrôle qualité
- **Persona / scénario :** Un élève signale une réponse fausse sur la Shoah en histoire ; un autre signale une génération inappropriée.
- **Fonctionnalité :** file des signalements visible par le professeur du cours (erreur pédagogique) et par la vie scolaire (contenu inapproprié), avec statut (nouveau, en cours, traité), réponse à l'élève et statistiques par cours.
- **Pourquoi :** les signalements sont stockés (`learning_reports`) mais personne ne peut les lire : la boucle de qualité promise est cassée.
- **Vigilance :** donner accès à l'échange signalé **uniquement** (et non à toute la conversation) ; prévenir l'élève à l'envoi que le passage signalé sera lu par un adulte.
- **Existant :** partiel (création du signalement seulement, `learning.mjs` l.793).
- **Priorité :** P0 (avant le pilote : un signalement sans traitement engage la responsabilité de l'établissement) · **Effort :** S

### UC-51 — Choix du fournisseur et du lieu de traitement IA
- **Persona / scénario :** Le DPO demande où partent les extraits de cours et les questions des élèves, et sous quel contrat.
- **Fonctionnalité :** page « Sous-traitants » (lecture) : fournisseur IA actif, modèle, région, conservation chez le fournisseur, contrat de sous-traitance, date de validation par le DPO ; bascule globale « IA désactivée » sans redéploiement.
- **Pourquoi :** transparence ; une question de la CNIL ou d'un parent doit trouver sa réponse en une minute.
- **Vigilance :** transferts hors UE ; garanties « zero data retention » à vérifier contractuellement.
- **Existant :** non (variables d'environnement).
- **Priorité :** P1 · **Effort :** S

---

## 9. RGPD, exports, conservation

### UC-52 — Effacement complet d'une personne (droit à l'effacement)
- **Persona / scénario :** La mère d'un élève parti en décembre demande par courrier l'effacement de toutes ses données ; le DPO a un mois pour répondre.
- **Fonctionnalité :** assistant de purge : inventaire de ce qui sera supprimé (compte, inscriptions, conversations, générations, quiz, mémoire du tuteur, planning, données École Directe, journaux de consultation, signalements) et de ce qui sera **anonymisé** (documents déposés comme délégué, gardés dans le cours avec un auteur « ancien élève » ; entrées d'audit pseudonymisées) ; validation à deux (secrétariat puis direction) ; purge transactionnelle et ordonnée ; certificat d'effacement (PDF horodaté sans données) ; note sur les sauvegardes (effacées au terme de leur rotation).
- **Pourquoi :** `FEATURES.md` le signale comme manquant. Techniquement, un `DELETE FROM users` **échoue** aujourd'hui à cause des clés étrangères sans `ON DELETE CASCADE` (`practice_runs`, `ed_*`, `delegations`, `documents.uploaded_by`, etc.).
- **Vigilance :** effacer réellement les fichiers du disque ; tests automatisés couvrant toutes les tables (et à maintenir à chaque nouvelle table) ; certaines données peuvent devoir être conservées si une obligation légale l'exige (rare ici).
- **Existant :** non (seules des réinitialisations partielles côté élève, comme la mémoire du tuteur ou l'historique IA).
- **Priorité :** P0 · **Effort :** M à L

### UC-53 — Export des données d'une personne (accès et portabilité)
- **Persona / scénario :** Un élève de Terminale qui part en prépa veut récupérer ses fiches, ses quiz et son historique ; un parent exerce le droit d'accès de son enfant de 12 ans.
- **Fonctionnalité :** export ZIP (JSON lisible et PDF des fiches) généré par l'admin sur demande, ou en libre-service par l'élève ; lien de téléchargement à durée limitée.
- **Pourquoi :** droit d'accès (art. 15) et de portabilité (art. 20) ; argument de valeur pour l'élève qui part.
- **Vigilance :** vérifier l'identité et la qualité du demandeur (responsable légal) ; exclure les données de tiers (documents des professeurs).
- **Existant :** partiel (PDF des générations, unitaire).
- **Priorité :** P1 · **Effort :** M

### UC-54 — Politique de conservation automatique
- **Persona / scénario :** Le DPO fixe : conversations IA conservées 12 mois, comptes archivés supprimés 1 an après le départ, journaux de connexion conservés 6 mois, cahier de textes École Directe 1 an.
- **Fonctionnalité :** écran de règles de conservation par type de donnée, tâche planifiée de purge quotidienne avec rapport, simulation (« 1 240 conversations seront supprimées le 1er août »).
- **Pourquoi :** « La rétention automatique n'est pas à considérer comme réglée » (`README.md`). Le principe de limitation de la conservation est obligatoire.
- **Vigilance :** aucune durée universelle ; les valeurs par défaut doivent être prudentes et validées par le DPO.
- **Existant :** non.
- **Priorité :** P1 (règles minimales P0 avant données réelles) · **Effort :** M

### UC-55 — Registre, AIPD et information des personnes
- **Persona / scénario :** Avant le pilote, le DPO doit réaliser une analyse d'impact (mineurs, IA, traitement innovant : critères de la CNIL réunis) et informer élèves et familles.
- **Fonctionnalité :** génération d'une **fiche descriptive des traitements** à partir de la configuration réelle (données, durées, sous-traitants, rôles), notice d'information adaptée à l'âge (version collège en langage simple), suivi de l'acceptation de la charte par compte et par version.
- **Pourquoi :** l'AIPD est très probablement obligatoire ; l'AI Act classe certains usages éducatifs comme « à haut risque » (orientation, évaluation des acquis, surveillance pendant les épreuves). Les fonctions d'analyse prédictive de la vision long terme y entreraient : à vérifier avec un juriste, le calendrier d'application étant susceptible d'évoluer.
- **Vigilance :** IABNE fournit les éléments ; la qualification juridique reste celle de l'établissement.
- **Existant :** non.
- **Priorité :** P0 (charte et notice) / P1 (fiche générée) · **Effort :** S à M

### UC-56 — Exports administratifs
- **Persona / scénario :** La direction veut la liste des comptes non activés par classe pour la réunion des professeurs principaux ; le référent veut un export des affectations à comparer avec le tableau des services.
- **Fonctionnalité :** exports CSV ou XLSX : comptes (sans secrets), classes et effectifs, groupes, affectations, statistiques d'adoption agrégées, journal d'audit filtré. Chaque export est journalisé.
- **Pourquoi :** les fichiers Excel restent la langue commune des secrétariats.
- **Vigilance :** un export nominatif est un fichier à risque : avertissement, minimisation des colonnes, filigrane facultatif.
- **Existant :** non.
- **Priorité :** P1 · **Effort :** S

### UC-57 — Sauvegardes visibles et restauration d'une erreur d'administration
- **Persona / scénario :** Une secrétaire archive par erreur toute la 4e B au lieu d'un élève.
- **Fonctionnalité :** (a) corbeille de 30 jours pour les suppressions de classes, cours et comptes (hors effacement RGPD demandé) ; (b) annulation d'un import (« rollback » du lot) ; (c) état des sauvegardes visible dans le tableau de bord.
- **Pourquoi :** la restauration complète (`scripts/restore.mjs`) est une opération lourde qui fait perdre tout ce qui a été fait depuis.
- **Vigilance :** la corbeille ne doit pas contourner une demande d'effacement : les purges RGPD sont exclues de la corbeille.
- **Existant :** partiel (scripts de sauvegarde et restauration complets).
- **Priorité :** P1 · **Effort :** M

---

## 10. Vision long terme

### UC-58 — Multi-établissement et groupe scolaire
- **Persona / scénario :** Le groupe Yabné (école, collège, lycée) ou un réseau d'établissements partenaires veut une instance commune avec cloisonnement strict.
- **Fonctionnalité :** console « opérateur » au-dessus des établissements, identifiants uniques par établissement, paramètres et fournisseurs IA par établissement, facturation et quotas séparés, aucun partage de données (cahier des charges §7). Option : bibliothèque de ressources partagées entre établissements, avec consentement explicite des professeurs auteurs.
- **Pourquoi :** `school_id` est déjà présent partout (bonne base), mais l'e-mail unique global, les variables d'environnement globales et SQLite sur une seule instance limitent l'évolution.
- **Vigilance :** chaque établissement est responsable de traitement ; l'opérateur est sous-traitant ; cloisonnement à tester systématiquement (tests d'accès entre établissements).
- **Existant :** partiel (`school_id` sur les tables, contrôles `scoped()` dans `auth.mjs`).
- **Priorité :** idée long terme · **Effort :** L

### UC-59 — Authentification unique (SSO) avec l'environnement existant
- **Persona / scénario :** Si Yabné utilise Google Workspace for Education ou Microsoft 365, les professeurs veulent « se connecter avec Google » ; à terme, ÉduConnect pour certains établissements.
- **Fonctionnalité :** OpenID Connect pour le personnel (puis les élèves si un compte établissement existe), rattachement au compte local créé par l'admin (pas de création automatique), désactivation dans IABNE indépendante du fournisseur d'identité.
- **Pourquoi :** moins de mots de passe, plus de sécurité (la 2FA du fournisseur s'applique).
- **Vigilance :** ne pas permettre l'inscription libre par SSO ; vérifier le contrat et la localisation des données du fournisseur.
- **Existant :** non.
- **Priorité :** P2 · **Effort :** M

### UC-60 — Calendrier administratif automatisé (rappels de l'admin)
- **Persona / scénario :** Le référent numérique change ; son successeur ne sait pas qu'il faut préparer le passage d'année en juin et purger les comptes en septembre.
- **Fonctionnalité :** « check-list annuelle » intégrée avec rappels datés : import de rentrée (fin août), fiches de connexion (1er septembre), contrôle des affectations (mi-septembre), revue des comptes temporaires (chaque trimestre), contrôle de la restauration (chaque trimestre), préparation du passage d'année (juin), purge de conservation (août).
- **Pourquoi :** la continuité de service dans une petite équipe administrative repose souvent sur une seule personne.
- **Vigilance :** aucune.
- **Existant :** non.
- **Priorité :** P2 · **Effort :** S

---

## 11. Top 10 priorisé

| # | Cas d'usage | Pourquoi en premier | Priorité / effort |
|---|---|---|---|
| 1 | **UC-17 + UC-18 + UC-20** Import CSV des élèves et des services, avec identifiant externe et prévisualisation | Sans import, la rentrée d'un vrai établissement est impossible. | P0 · M |
| 2 | **UC-05 + UC-06 + UC-07** Activation par code, fiches imprimables, identifiant sans e-mail | L'admin ne doit plus connaître les mots de passe ; les élèves de 11 ans n'ont pas d'e-mail ; l'e-mail est unique pour toute la base. | P0 · M |
| 3 | **UC-52** Effacement RGPD complet et ordonné (+ export minimal) | Obligation légale ; c'est aujourd'hui techniquement impossible (clés étrangères). | P0 · M-L |
| 4 | **UC-42** Journal d'audit | Redevabilité, gestion d'incidents, protection des personnels. | P0 · M |
| 5 | **UC-10 + UC-09** 2FA admin, changement de mot de passe forcé, politique adaptée à l'âge | Comptes à privilèges sur des données de mineurs. | P0 · M |
| 6 | **UC-21 + UC-24 + UC-04** Modifier, archiver les classes ; gérer et transférer les affectations ; référentiel des niveaux | Aucune erreur de saisie n'est corrigeable aujourd'hui. | P0 · S-M |
| 7 | **UC-22** Groupes (spécialités, LV, options, demi-groupes) | Le lycée réformé ne fonctionne pas sans eux. | P0 (lycée) · M |
| 8 | **UC-11 + UC-13** Recherche de comptes, fiche détaillée, états suspendu/archivé/supprimé | Utilisabilité au-delà de 100 comptes ; départs et suspensions. | P0 · M |
| 9 | **UC-50** File des signalements IA (prof et vie scolaire) | Un signalement d'élève qui n'est lu par personne engage la responsabilité de l'établissement. | P0 · S |
| 10 | **Modèle de rôles (section 12), avec UC-26, UC-36, UC-37 et UC-33** | Sortir du super-admin unique ; décharger le secrétariat ; gérer les remplacements. | P1 · M |

Juste après : UC-47 (suivi des tokens et du budget IA), UC-28 (passage d'année, impératif avant juillet 2027), UC-23 (groupes de travail élèves sans messagerie, demande explicite de l'utilisateur, mais après le cadre de modération), UC-43 (tableau de bord).

---

## 12. Proposition de modèle de rôles et de permissions

### 12.1 Principes
1. **Un compte = une personne**, avec **plusieurs rôles possibles** (une professeure peut aussi être professeure principale et référente numérique). Remplacer la colonne `users.role` (contrainte CHECK) par une table `role_assignments(user_id, role, scope_type, scope_id, starts_at, ends_at, granted_by)`.
2. **Permissions atomiques** regroupées en rôles, vérifiées côté serveur par une fonction unique `can(user, permission, resource)` à la place des tests `role === "admin"` dispersés.
3. **Périmètre** : établissement, unité (collège, lycée), niveau, classe, groupe, cours.
4. **Moindre privilège** et **séparation des tâches** : celui qui crée ne purge pas seul ; l'attribution du rôle admin et les purges demandent une double validation.
5. **Les données privées de l'élève (conversations, mémoire du tuteur, planning) n'appartiennent à aucun rôle du personnel.** Seule exception : l'extrait explicitement signalé par l'élève.
6. **Temporalité** : tout rôle peut avoir une date de fin (remplaçants, intervenants).

### 12.2 Rôles proposés

| Rôle | Périmètre | Pour qui |
|---|---|---|
| `owner` / super-admin technique | Établissement | 1 ou 2 personnes (référent numérique, prestataire). 2FA obligatoire. |
| `direction` | Établissement ou unité | Chef d'établissement, adjoints. |
| `secretariat` | Établissement ou unité | Secrétariat de direction et de scolarité. |
| `vie_scolaire` | Unité ou niveaux | CPE, assistants d'éducation. |
| `teacher` | Cours (via affectations) | Professeurs. |
| `head_teacher` (PP) | Classe | Professeur principal. |
| `substitute` | Cours, daté | Remplaçant. |
| `documentalist` | Niveaux | Documentaliste du CDI. |
| `aesh` | Élèves désignés | Accompagnant d'élève en situation de handicap. |
| `student` | Classe et groupes | Élèves. |
| `delegate` (existant) | Cours, accordé par le professeur | Élève délégué : dépôt en brouillon. |
| `guest` | Cours choisis, daté | Intervenant, stagiaire, inspection (lecture, sans données nominatives). |
| `guardian` | Élèves liés | *Long terme seulement*, sans accès aux contenus privés. |

### 12.3 Matrice des permissions (O = oui, P = sur son périmètre, — = non, S = seulement les signalements, V = soumis à validation par la direction)

| Permission | owner | direction | secrétariat | vie scol. | PP | prof | rempl. | doc. | AESH | élève |
|---|---|---|---|---|---|---|---|---|---|---|
| Paramètres établissement, fournisseurs IA | O | lecture | — | — | — | — | — | — | — | — |
| Budget et quotas IA | O | O | — | — | — | — | — | — | — | — |
| Créer / importer des comptes | O | O | O | — | — | — | — | — | — | — |
| Activer, réinitialiser un élève (code temporaire) | O | O | O | P | P | — | — | P | — | — |
| Réinitialiser un membre du personnel | O | O | V | — | — | — | — | — | — | — |
| Suspendre un compte | O | O | O | P (élèves) | — | — | — | — | — | — |
| Attribuer des rôles du personnel | O + V | O + V | — | — | — | — | — | — | — | — |
| Structure (classes, groupes, matières, affectations) | O | O | O | — | — | — | — | — | — | — |
| Passage d'année | O | V | préparation | — | — | — | — | — | — | — |
| Effacement RGPD, purge | O + V | V | demande | — | — | — | — | — | — | — |
| Export nominatif | O | O | O | P | P (sa classe) | — | — | — | — | données personnelles |
| Journal d'audit | O | O | — | — | — | — | — | — | — | — |
| Tableau de bord global (agrégats) | O | O | comptes | P | P (sa classe) | ses cours | ses cours | — | — | — |
| Gérer les documents d'un cours | Urgence + audit* | — | — | — | — | P (ses cours) | P (ses documents) | ressources transversales | — | délégué : brouillons |
| Lire les documents publiés | O | O | — | — | P | P | P | P | élèves suivis | P |
| Lire les conversations et la mémoire d'un élève | — | — | — | — | — | — | — | — | — | les siennes |
| Traiter les signalements | — | lecture | — | contenus inappropriés | — | erreurs pédagogiques (ses cours) | idem | — | — | créer |
| Modérer les groupes élèves | — | O | — | O | P | — | — | — | — | créateur : sa propre gestion |
| Suspendre l'IA (mode examen) | O | O | — | P | P | ses classes | ses classes | — | — | — |

\* Aujourd'hui `canManageCourse` accorde à tout admin la gestion des cours, brouillons compris. Proposition : retirer ce droit par défaut et le réserver à une action « accès d'urgence » journalisée et motivée (par exemple un document inapproprié publié à retirer d'urgence).

### 12.4 Migration depuis l'existant (ordre conseillé)
1. Introduire `can()` et la table `role_assignments` en conservant `users.role` comme rôle principal (compatibilité), puis migrer `admin` vers `owner` + `direction`.
2. Ajouter `courses_staff(course_id, user_id, role, starts_at, ends_at)` pour le co-enseignement et les remplaçants, et déplacer `courses.teacher_id` vers « titulaire ».
3. Ajouter `groups` et `group_members` (avec `type` et `class_id` de rattachement) et faire passer `canAccessCourse` par « classe OU groupe ».
4. Ajouter `login` (unique par établissement), `external_id`, `status` (`pending`/`active`/`suspended`/`archived`), `must_change_password`, `expires_at`, ainsi que les tables `audit_log` et `activation_codes`.
5. Écrire la purge RGPD comme **une seule fonction testée** qui connaît toutes les tables liées à `users(id)`, avec un test qui échoue si une nouvelle table référence `users` sans être prise en compte.
