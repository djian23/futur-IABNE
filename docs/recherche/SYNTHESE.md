# IABNE : synthèse de la recherche de cas d'usage

Novembre 2026. Synthèse de 15 rapports :
- 8 rapports de recherche par domaine ;
- 5 panels de personas, soit 41 utilisateurs simulés ;
- 2 tests réels de l'application dans un navigateur, sur mobile et sur ordinateur.

Les rapports complets sont dans `domaines/`, `personas/` et `tests-reels/`. Ils totalisent environ 400 cas d'usage.

> Ce que valent ces résultats : les personas sont des simulations, pas des entretiens réels. Les tests réels ont été faits sans clé IA, avec les comptes de démonstration. Les références juridiques citées sont à faire valider par un DPO. Les bugs marqués « vérifié » ont été confirmés dans le code.

---

## 1. Les trois enseignements principaux

1. **Les groupes de travail sont la demande n°1, sur tous les panels** : 8 collégiens sur 8, 6 lycéens sur 9, 8 adultes sur 8. Aujourd'hui, ils n'existent pas. En test, l'élève les a cherchés dans 5 menus, et le partage part sur WhatsApp et ChatGPT.
2. **L'administration n'est pas prête pour une vraie rentrée.** Il faut environ **3 600 actions** pour créer 600 élèves. Il n'y a ni import, ni modification ou suppression de classe, ni passage d'année, ni journal d'audit, ni rôle autre qu'admin, prof et élève.
3. **Le socle de sécurité tient**, et c'est le point fort du projet. Il n'y a aucune fuite de permissions en test : brouillons, autres classes, conversations et délégués révoqués sont bien protégés. Les citations sont vérifiées et les droits sont revérifiés après chaque appel IA.

---

## 2. Bugs et failles à corriger en premier

| # | Problème | Où | Gravité |
|---|---|---|---|
| 1 | **Élève en détresse sans réponse.** Toute réponse sans citation du cours est rejetée, donc l'IA ne peut pas répondre « je ne veux plus vivre » par du soutien. | `server/learning.mjs:394-403` (vérifié) | Critique |
| 2 | **Hébreu et araméen invisibles.** La recherche ne garde que `[a-z0-9]{3,}`, donc les études juives sont inutilisables. Les sigles (pH) sont perdus aussi. | `server/learning.mjs:38` (vérifié) | Critique pour Yabné |
| 3 | **Tuteur toujours en français.** Le prompt est figé, et l'écriture de droite à gauche n'est gérée ni dans l'interface ni dans les PDF. | `learning.mjs:317` | Majeur |
| 4 | **Correction complète sans tentative.** Le mode `solution` est accepté d'emblée, et rien ne distingue un devoir noté. | `learning.mjs:500` (vérifié) | Critique (triche) |
| 5 | **« Se déconnecter » inaccessible.** Le menu ne défile pas, sur tous les mobiles testés et sur un PC 1366×768. Sur iPhone SE, l'admin ne voit pas « Administration ». | interface, test réel | Bloquant |
| 6 | **Le bouton retour quitte l'application**, et un rechargement ramène à l'accueil. | interface, test réel | Bloquant |
| 7 | **Compte impossible à supprimer.** Les clés étrangères vers `users` n'ont pas de cascade, ce qui bloque le RGPD. | `server/db.mjs` (vérifié) | Critique (légal) |
| 8 | **Signalements d'erreurs IA jamais lus.** Ils sont enregistrés, mais aucune route ni aucun écran ne permet de les consulter. | `learning.mjs:793` | Majeur |
| 9 | **Un admin peut se connecter à la place d'un élève sans trace**, car il n'y a pas de journal d'audit. | `auth.mjs` | Critique (confiance) |
| 10 | **Une classe créée sans année reçoit une année au hasard** (`LIMIT 1` sans tri). | `auth.mjs:490` (vérifié) | Majeur dès l'an 2 |
| 11 | **Doublons acceptés** (classes, années, matières), et la liste des classes n'affiche pas l'année. | test réel | Majeur |
| 12 | **Mots de passe faibles acceptés** (12 espaces, `111111111111`). Pas de changement à la 1re connexion ni de « mot de passe oublié ». Après 20 échecs, même le bon mot de passe est bloqué (erreur 429). | test réel | Majeur |
| 13 | **Remplacer un document publié le remet en brouillon.** Les élèves le perdent sans avertissement. | test réel | Majeur |
| 14 | **Un PDF blanc est indexé comme « Prêt »** (`-- 1 of 1 --`), ce qui crée une source fantôme pour l'IA. | test réel | Moyen |
| 15 | **La méthode validée du prof se désactive sans prévenir** si l'analyse est relancée. | `teacher-tutor.mjs` | Majeur |
| 16 | **Quota saturé par une seule classe** (200 demandes/h et 8 appels simultanés pour tout l'établissement), sans compteur affiché. | config | Majeur |
| 17 | **Le planning efface les séances à chaque recalcul**, ignore Shabbat, et le programme IA a proposé un samedi. | `learning.mjs` | Majeur pour Yabné |
| 18 | **Mémoire suspendue mais difficultés encore enregistrées.** | test réel | Moyen (vie privée) |
| 19 | **« Cours existants » affiche « · · »**, et le suivi est vide pour un directeur. | `/api/bootstrap`, `/api/stats` | Moyen |
| 20 | **Supprimer la tâche d'un autre élève répond `deleted:true`** sans rien faire. Une mutation sans `Origin` est acceptée. | test réel | Faible |

Défauts d'interface fréquents :
- types de documents non traduits (`lesson`, `exercise`) et « Votre professeur » affiché au prof lui-même ;
- la touche Entrée n'envoie pas le chat ;
- les messages restent affichés et les formulaires ne se vident pas ;
- la zone de question de l'élève se trouve 4 à 5 écrans plus bas, après des textes juridiques ;
- « IA non configurée… Contactez l'administration » est incompréhensible pour un enfant.

---

## 3. Administration (priorité n°1)

### Constat
- **3 rôles figés.** L'e-mail sert d'identifiant et doit être unique, donc des frères et sœurs qui partagent l'adresse des parents sont bloqués.
- **L'admin tape et connaît tous les mots de passe initiaux.** En pratique, ça mène à un mot de passe commun et à un fichier Excel en clair.
- **Rien ne se modifie ni ne se supprime** (classes, matières, affectations, cours). Changer un élève de classe veut dire l'inscrire ailleurs puis le retirer.
- **Un cours n'a qu'un prof et qu'une classe**, ce qui bloque les remplaçants, le co-enseignement, les spécialités du lycée et la reprise d'année.

### Fonctionnalités, dans l'ordre

| Priorité | Fonctionnalité |
|---|---|
| P0 | **Import CSV** des élèves, des profs et des services, avec un identifiant externe, un aperçu, la détection des doublons et un rapport d'erreurs. Formats exacts à confirmer avec le secrétariat (exports École Directe, SIECLE). |
| P0 | **Activation par code** et **fiches de connexion imprimables** par classe. Un identifiant indépendant de l'e-mail (prenom.nom) permet aux collégiens sans e-mail de se connecter. |
| P0 | **Mot de passe** : générateur, changement obligatoire à la 1re connexion, réinitialisation par le prof principal ou la vie scolaire, et des règles adaptées à l'âge. |
| P0 | **Modification, archivage et suppression** des classes, matières, années, affectations et cours, avec confirmations et refus des doublons. |
| P0 | **Changement de classe** en une action, et **départ d'un élève** en cours d'année. |
| P0 | **Recherche de comptes avec filtres** : actif, jamais connecté, désactivé, par classe. |
| P0 | **Journal d'audit**, consultable, des actions admin (création, mot de passe, droits, suppression). |
| P0 | **Double authentification** pour les admins et la direction. |
| P0 | **Suppression RGPD complète** d'un compte, et **export** de ses données. |
| P0 | **File des signalements IA**, visible du prof concerné et de l'admin. |
| P1 | **Nouveau modèle de rôles** : plusieurs rôles par compte, chacun limité à un périmètre et éventuellement daté. Exemples : prof principal de la 2nde B, CPE d'un site, coordinateur kodesh, remplaçant jusqu'au 15/02, DPO, technicien. Les droits sont vérifiés par une seule fonction `can()` côté serveur. **Aucun rôle du personnel ne lit les conversations des élèves.** |
| P1 | **Groupes d'enseignement** (spécialités, langues, demi-groupes, options) qui mélangent plusieurs classes. **Plusieurs profs par cours.** |
| P1 | **Assistant de passage d'année** : dupliquer la structure, faire monter les élèves, gérer les redoublants, archiver l'année précédente et reprendre les cours des profs. |
| P1 | **Tableau de bord admin** : comptes, adoption agrégée, coûts IA en euros, quotas par classe, signalements. |
| P1 | **Paramètres de l'établissement** : sites, calendrier, vacances, **Shabbat et fêtes**, plages silencieuses, politique d'aide IA par défaut. |
| P2 | Comptes parents (attention aux parents séparés et aux élèves majeurs), envoi d'e-mails, assistant admin en langage naturel (« crée les comptes de la 2nde B à partir de ce fichier », avec validation humaine), multi-établissement. |

---

## 4. Groupes de travail entre élèves (priorité n°2)

### Principes
- **Un espace de travail, pas un réseau social.** Pas de messages privés entre élèves.
- **On entre sur invitation**, que l'invité accepte. Il existe aussi des groupes créés par les profs.
- **Les adultes peuvent consulter les groupes.** Chaque consultation est journalisée et visible des élèves. Il y a un bouton de signalement, et le circuit passe par le 3018 et le dispositif pHARe.
- **Heures calmes** : nuit, Shabbat, fêtes. Pas de classement individuel.
- **Anti-triche** : pas de corrigé partagé avant l'échéance. Les contenus des groupes ne servent pas de source à l'IA.
- **Le partage n'élargit jamais les droits** : un lien vers un cours ne donne pas accès à ce cours à quelqu'un qui ne l'avait pas.

### Version 1 (environ 4 à 5 semaines)
- Groupes de révision créés par les élèves, groupes de projet créés par les profs.
- Partage de fiches et de liens vers les documents du cours.
- Tableau de tâches.
- **Créneaux communs** calculés à partir des plannings des élèves qui acceptent de partager leurs disponibilités.
- Commentaires courts et modérés, dissolution automatique en fin d'année.
- Technique : environ 12 tables (`study_groups`, `group_members`, `group_invitations`, `group_tasks`, `group_resources`, `group_reports`, `group_audit`, `school_closures`…), environ 35 routes et 5 écrans. Le schéma détaillé est dans `domaines/02_groupes.md` ; il n'est pas encore testé.

### Version 2
- Quiz de groupe, défis coopératifs, **tuteur IA du groupe**, « explique à ton camarade ».
- **Binôme havrouta** : phases minutées, rôles qui alternent, l'IA pose des questions sans donner les réponses. La mixité est un réglage de l'établissement.
- Salle d'étude silencieuse avec minuteur partagé.
- Rendus de groupe au prof, suivi des contributions, préparation du grand oral.

### Version 3
- Mentorat Terminale → Seconde, évaluation par les pairs, clubs, BDE.
- Modération assistée par IA.
- Messagerie libre seulement si l'établissement la demande, et après une analyse d'impact (AIPD).

---

## 5. Élèves

**Les 3 fonctionnalités qui distingueraient IABNE**
1. **« Le prof de ma classe, disponible à 21 h »** : fidèle à sa méthode, avec un niveau d'aide que le prof règle devoir par devoir.
2. **« Le fil de l'année »** : absence → rattrapage → révision espacée → contrôle → analyse de la copie, relié au cahier de textes.
3. **« Pensé pour Yabné »** : Shabbat et fêtes respectés, hébreu avec voyelles, études juives fondées sur les sources du prof et **sans avis halakhique de l'IA**, élèves franco-israéliens allophones.

**À construire**
- P0 : **aide graduée verrouillable**. Indice, puis méthode, puis vérification, puis correction **seulement après une tentative**. Un mode « devoir noté » ne donne que des indices. Avec un exercice jumeau.
- P0 : écrans **« Ce soir »** et **« Veille de contrôle »** sur l'accueil.
- P0 : **formules de maths affichées correctement** (KaTeX), et **calculs vérifiés par un outil**.
- P0 : **réponse sûre en cas de détresse** : numéros 3114, 119, 3018, 3020, et un bouton « parler à un adulte ».
- P1 : **photo d'un énoncé** (OCR), **retour d'absence**, **cartes mémoire avec révision espacée** (FSRS) calée sur la date du contrôle.
- P1 : **planning repensé** : créneaux récurrents (« tous les lundis 17h-19h »), horizon et durées réglables, tâches non placées affichées, tâche cochée « faite », pas de réécriture des séances.
- P1 : **accessibilité DYS** (police, espacement, lecture audio), dictée vocale, interface en plusieurs langues.
- P1 : quiz plus variés (pas seulement 5 QCM), **examen blanc chronométré**.
- P2 : correction d'une copie photographiée avec **note indicative**. Attention : c'est potentiellement « à haut risque » au sens de l'AI Act. Oral, grand oral, conversation en langue vivante, Parcoursup (aide à la réflexion, jamais de rédaction).
- Mobile : vrai bouton « Se déconnecter », déconnexion après inactivité, mode hors connexion pour les fiches.

---

## 6. Professeurs

- P0 : **réglages par cours**. IA désactivable, mode « indices seulement », correction autorisée ou non, générateur de contrôles autorisé ou non.
- P0 : **« Voir comme un élève »**, pour tester son propre agent.
- P0 : **écran des signalements**.
- P0 : un **vrai bouton « Publier »**, des statuts clairs, un avertissement avant qu'un remplacement ne retire un document aux élèves.
- P0 : **import en masse** (plusieurs fichiers, PPTX, images, scans avec OCR). C'est le premier frein à l'adoption : sans corpus, l'IA est vide.
- P1 : **corrigé verrouillé jusqu'à une date**, avec une distinction entre vrais contrôles et entraînements.
- P1 : **assigner un quiz ou un entraînement à toute la classe** ; modifier et exporter les sujets générés (DOCX).
- P1 : **banque de questions partagée**, équipes disciplinaires, **remplaçants et co-enseignement**, duplication d'un cours pour l'année suivante.
- P1 : appréciations de conseil de classe, avec pseudonymisation avant l'appel IA. **La note reste celle du prof.**
- P1 : grilles critériées, versions adaptées PAP et DYS, sujets A/B.
- P2 : correction assistée de copies (pilote), schémas et TP, classe inversée.

**Pour faire adopter l'outil en semaine 1**
- **Pré-rentrée** : une démo sur les vrais cours d'un collègue volontaire.
- **Atelier** : un import assisté « apporte ta clé USB ».
- **Jour 3** : un premier support utilisé en classe.
- **Mode « indices seulement »** par défaut.
- **Une charte co-écrite avec les profs**, qui garantit trois choses :
  - les profs restent propriétaires de leurs cours ;
  - les statistiques ne servent jamais à évaluer un prof ;
  - refuser l'IA est respecté.

---

## 7. Direction, vie scolaire, parents, Yabné

**Principes à adopter dès maintenant**
- Les données du tuteur ne servent jamais à **noter, orienter ou sanctionner**.
- **Pas de doublon d'École Directe** pour les absences, les notes et les sanctions.
- **Pas de détection d'émotions.** Elle est interdite à l'école par l'AI Act (art. 5.1.f, à vérifier).
- **Aucun suivi de la pratique religieuse**, qui est une donnée sensible (RGPD art. 9).

**À construire**
- Calendrier d'établissement unique, avec Shabbat et fêtes et des horaires qui suivent la saison.
- Tableau de bord d'adoption, qui ne montre que des chiffres globaux.
- Suivi des coûts IA.
- Hébreu : affichage, PDF, recherche.
- Charte et page de transparence « qui voit quoi ».

**À ne pas faire maintenant** : la prédiction des résultats, un portail parents complet, l'analyse de sentiment.

**32 questions à poser à la direction** (liste complète dans `domaines/05_direction_parents_yabne.md`) : nombre de sites et de niveaux, organisation des études juives, horaires de Shabbat et des fêtes, mixité, qui alerter en cas de détresse, statistiques sur les profs, familles, DPO.

---

## 8. Sécurité, RGPD, AI Act : bloquant avant un pilote avec de vrais élèves

**Documents à produire**
- Analyse d'impact RGPD (**AIPD**), obligatoire avec des mineurs et de l'IA.
- Registre des traitements.
- **Charte IA** élève et prof, signée.
- Mentions d'information : version collège, version lycée, version parents.
- Procédure « propos inquiétants ».
- Politique de conservation.
- Plan de reprise après incident.
- Procédure de violation de données (72 h).
- Fiche de qualification AI Act.

**Prestataires**
- Contrats de traitement des données (DPA) avec l'hébergeur et le fournisseur IA, et région UE.
- Options IA : Claude via un cloud européen (Bedrock ou Vertex), rétention zéro, ou Mistral.
- Options hébergement : Scalingo, Clever Cloud ou Infomaniak, comme le prévoit le cahier des charges.

**Technique**
- Circuit de détresse.
- Suppression et export des comptes.
- Purge automatique.
- Journal d'audit.
- Double authentification pour les admins.
- Déconnexion après inactivité (aujourd'hui une session dure 8 h).
- Sauvegarde chiffrée hors de l'hébergeur, avec une restauration testée.
- Tests de jailbreak et d'**injection d'instructions** cachées dans un document déposé par un délégué, sur le vrai modèle.

**AI Act** : rester hors du « haut risque » pendant le pilote. Ça veut dire pas de note, pas d'orientation automatisée et pas de détection de triche.

**Mémoire du tuteur** : elle est activée par défaut (`tutor.mjs:35`). C'est à aligner avec la base légale retenue et avec la règle des 15 ans.

---

## 9. IA : moteur et agents

- **Recherche** : remplacer le comptage de mots par un découpage par exercice et une recherche plein texte BM25 (FTS5 de SQLite), qui accepte toutes les écritures. Ensuite, un système hybride avec embeddings calculés localement, pour ne pas ajouter de sous-traitant.
- **Modèles** : utiliser le modèle selon la tâche (Haiku 5.5 pour classer et contrôler, Sonnet 5.5 pour générer, Opus 5.5 pour les sujets complexes), activer le **cache de prompt**, et suivre le **coût en euros** par établissement. Le modèle actuel (`claude-sonnet-4-20250514`) est ancien.
- **Coût estimé** : environ 1 500 à 2 500 $/an pour 400 élèves une fois ces économies en place. C'est une hypothèse à mesurer pendant le pilote.
- **Agents**, tous sur le principe « l'agent propose, un humain valide » : planificateur qui réorganise la semaine quand un contrôle est annoncé, veille de classe pour le prof, rattrapage d'absence, préparation du conseil de classe, animateur de groupe, import administratif, passage d'année.
- **n8n** : pas pour les données des élèves. Le code direct est préférable.
- **Évaluation avant le pilote** : jeux d'essai par matière construits avec les profs, seuils chiffrés, juge IA étalonné sur les notes des profs, tests d'attaque, tests de non-régression.

---

## 10. Ce que font les concurrents

- **Quizlet a retiré son chat IA** (juin 2025) : un chat seul ne suffit pas, il faut des activités autour.
- **Khanmigo a fait des erreurs de calcul** : il faut un outil de calcul vérifié.
- **Les modes « étude » de ChatGPT, Claude et Gemini se contournent en un clic.** Le verrou doit être côté serveur et réglé par le prof.
- **Pronote et École Directe n'aident pas à apprendre** : IABNE doit être une couche pédagogique, pas un Pronote de plus.
- **Pièges à éviter** : gamification addictive, notifications anxiogènes, impression de surveillance, communautés sans modération, données hors de l'UE, dépendance à l'API non officielle d'École Directe.

---

## 11. Roadmap proposée

**Sprint 0 : corrections rapides (environ 1 semaine)**
- Bugs 1 à 6 du tableau :
  - circuit de détresse ;
  - recherche en Unicode (hébreu) ;
  - langue du tuteur ;
  - correction seulement après une tentative ;
  - menu qui défile et vrai bouton « Se déconnecter » ;
  - bouton retour.
- Bugs 10 à 14, 17 à 20.
- Interface : traductions, touche Entrée, « Publier », `dir="auto"`.

**Phase A : fondations de l'administration (3 à 4 semaines)**
- Modèle de rôles à périmètre.
- Plusieurs profs par cours, groupes d'enseignement.
- Modification et suppression avec confirmations.
- Import CSV avec fiches de connexion.
- Identifiant sans e-mail, mots de passe.
- Journal d'audit, double authentification pour les admins.
- Suppression et export RGPD.
- File des signalements.

**Phase B : groupes V1 (4 à 5 semaines)**
- Voir le §4. Elle s'appuie sur la phase A (rôles, audit, calendrier des fermetures).

**Phase C : avant le pilote**
- Réglages d'aide par cours, « voir comme un élève ».
- KaTeX, recherche BM25.
- Routage des modèles, coûts en euros.
- Planning récurrent qui respecte Shabbat et les fêtes.
- Documents RGPD et AIPD, hébergement UE, jeux d'évaluation IA avec les profs.

**Pilote (phase 4 du cahier des charges)** : un petit groupe de profs volontaires et 2 ou 3 classes.

**Après le pilote** : groupes V2 (havrouta, tuteur de groupe), OCR, cartes mémoire, passage d'année, tableau de bord direction, puis les éléments à plus long terme.
