# Contrat API du socle

Les champs métier utilisent `snake_case`. Toutes les routes sauf connexion et `/api/health` exigent la session serveur `school.sid`. Les mutations navigateur exigent une origine autorisée ; aucune inscription publique. Les erreurs retournent `{ "error": "message" }`.

## Authentification et données initiales

- `POST /api/auth/login` : `{email,password}` → `{user}` et cookie HttpOnly/SameSite=Lax.
- `POST /api/auth/logout` : invalide la session.
- `GET /api/auth/me` : `{user}`.
- `POST /api/auth/password` : `{currentPassword,newPassword}` ; vérifie l'ancien secret, impose 12 à 128 caractères, révoque toutes les sessions et renouvelle celle du demandeur. Dix tentatives par utilisateur sur quinze minutes.
- `GET /api/bootstrap` : `{user,classes,subjects,courses,chapters,documents,delegations,users,years,assignments,memberships}`, filtrés par établissement et autorisations.
- `GET /api/health` : état minimal public sans données utilisateur.

Les élèves accèdent aux cours de leurs inscriptions. Les professeurs gèrent leurs propres cours ; les administrateurs gèrent leur établissement. Les corrections publiées sont consultables comme les autres documents publiés. Les brouillons et archives restent réservés à la gestion ; un délégué actif peut aussi voir ses propres dépôts.

## Administration

- `POST /api/admin/users` : `{name,email,password,role,class_id?}` ; `role` vaut `admin`, `teacher` ou `student`. Mot de passe de 12 à 128 caractères. `class_id` uniquement pour un élève.
- `PATCH /api/admin/users/:id` : `{name?,active?,password?}`. Désactivation et changement de mot de passe révoquent les sessions. La désactivation de son propre compte et du dernier administrateur est interdite.
- `POST /api/admin/years` : `{name}` → `{year}`.
- `POST /api/admin/subjects` : `{name}` → `{subject}`.
- `POST /api/admin/classes` : `{name,level,year_id?}` → `{class}`. Sans année, utilise la première année existante.
- `POST /api/admin/memberships` : `{user_id,class_id}` pour un élève.
- `DELETE /api/admin/memberships/:userId/:classId` : retire l'inscription et révoque les délégations des cours de cette classe.
- `POST /api/admin/assignments` : `{teacher_id,class_id,subject_id}`.

## Cours et délégations

- `POST /api/courses` : `{title,class_id,subject_id,teacher_id?}`. Affectation existante obligatoire ; professeur courant imposé pour un compte enseignant.
- `POST /api/chapters` : `{course_id,title,position?}`.
- `POST /api/delegations` : `{course_id,student_id}`. Seul le professeur propriétaire peut déléguer à un élève inscrit dans la classe du cours.
- `DELETE /api/delegations/:id` : révoque immédiatement la délégation.

Une délégation autorise uniquement le dépôt de brouillons et la suppression de ses propres brouillons. Elle n'autorise ni publication ni gestion des documents tiers. La révocation est revérifiée après les traitements asynchrones.

## Documents privés et historique

- `POST /api/documents` multipart : `file`, `title`, `course_id`, `chapter_id?`, `kind?` ; `kind` vaut `lesson`, `exercise`, `exam` ou `correction`. Un nouveau dépôt est toujours un brouillon.
- `GET /api/documents/:id/download` : téléchargement autorisé ; aucun chemin de stockage exposé.
- `GET /api/documents/:id/preview` : texte extrait et notice ; mêmes autorisations que le téléchargement.
- `GET /api/courses/:id/search?q=mot` : recherche dans titres et texte des documents autorisés ; résultat limité à 30 documents avec extraits.
- `PATCH /api/documents/:id` : `{status}` avec `draft`, `published` ou `archived` ; professeur propriétaire ou administrateur seulement.
- `POST /api/documents/:id/replace` multipart : `file` ; professeur propriétaire ou administrateur seulement. Conserve l'identifiant, remplace l'extraction et les fragments, archive l'ancien fichier dans l'historique et force le retour en brouillon. Une nouvelle publication est nécessaire.
- `GET /api/documents/:id/versions` : `{versions}` avec identifiants, noms, tailles et dates ; réservé au professeur propriétaire et à l'administrateur, sans chemin ni contenu des anciens fichiers.
- `DELETE /api/documents/:id` : supprime document, fragments, historique et fichiers associés. Un délégué ne peut supprimer que son propre brouillon tant que sa délégation reste active.

Formats : PDF, DOCX, TXT UTF-8 ; 10 Mo par fichier, PDF limité à 100 pages, DOCX limité à 30 Mo déclarés décompressés et 2 000 entrées ZIP. Texte indexé plafonné à 150 000 caractères. Extraction dans un worker isolé : délai 15 secondes, heap V8 de 256 Mo, deux extractions concurrentes au maximum. Le heap V8 n'est pas une limite complète de mémoire native. Trente dépôts/remplacements par utilisateur et par tranche de quinze minutes. Aucun OCR intégré ; les scans sans texte ne sont pas indexables.

Le remplacement modifie `updated_at`, utilisé comme version par les contenus dérivés du module pédagogique. La conservation des versions n'inclut pas encore restauration ou téléchargement des anciens fichiers. Les statistiques de consultation comptent les aperçus élèves et les téléchargements élèves terminés avec succès. Le bootstrap présente le nom du déposant au personnel autorisé et à l'auteur, sans exposer son adresse aux autres élèves.

## Assistant, révisions et entraînement

- `POST /api/ai/chat` : `{courseId,question}` ; réponse avec citations, abstention hors corpus ou erreur explicite sans fournisseur. Historique du client ignoré ; contexte propriétaire du même cours uniquement.
- `GET /api/ai/history?courseId=...` et `DELETE /api/ai/history?courseId=...` : historique personnel et effacement. Suppression unitaire possible par `DELETE /api/ai/history/:id`.
- `POST /api/ai/generate` : `{courseId,kind,chapterId?,instructions?}` ; ressources sauvegardées. Catalogue par rôle via `GET /api/ai/capabilities` : `sheet`, `quiz`, `method_guide`, `revision_program` (élève), `lesson_plan`, `differentiation`, `course_review`, `class_remediation` (personnel). `instructions` est limité à 1 200 caractères. Le type historique `exam` reste accepté ; l’interface utilise désormais l’agent structuré pour les sujets.
- `GET /api/generations`, `GET /api/generations/:id`, `DELETE /api/generations/:id` et `GET /api/generations/:id/pdf` : ressources personnelles, sources, obsolescence et export.
- `POST /api/quizzes` : `{courseId,chapterId?}` ; cinq QCM interactifs, réponses retenues avant tentative.
- `GET /api/quizzes?courseId=...`, `GET /api/quizzes/:id`, `DELETE /api/quizzes/:id` : sessions personnelles et difficulté proposée.
- `POST /api/quizzes/:id/answer` : `{questionId,choiceIndex}` ; correction serveur, première tentative seule notée et sources vérifiées.
- `POST /api/ai/reports` : `{courseId,targetId,reason}` ; signalement d'une réponse ou génération appartenant à l'utilisateur.
- `GET /api/stats` : agrégats des cours du professeur, seuil de cinq participants pour les indicateurs concernés ; jamais de conversations individuelles.

Les générations emploient uniquement les extraits publiés et autorisés. Les contrôles de source et de compte sont répétés après l'appel distant. La vérification des citations est structurelle, pas une certification pédagogique. Quotas : 20 demandes par utilisateur et par heure, 200 par établissement et par heure par défaut (`AI_SCHOOL_HOURLY_LIMIT`, de 20 à 10 000), huit générations simultanées au maximum et une par utilisateur. Ces plafonds en nombre de demandes ne remplacent pas les plafonds de facturation du fournisseur.

## Planning personnel

- `GET /api/planner/availability` et `POST /api/planner/availability` : créneaux datés `{date,startTime,endTime,kind}` ; `kind` vaut `available`, `unavailable` ou `class`.
- `DELETE /api/planner/availability/:id` : retrait d'un créneau personnel.
- `GET /api/planner/tasks` et `POST /api/planner/tasks` : `{title,subject,dueDate,durationMinutes,difficulty}` ; difficulté de 1 à 5, durée de 15 à 1 200 minutes.
- `DELETE /api/planner/tasks/:id` : retrait d'une tâche personnelle et de ses séances calculées.
- `POST /api/planner/generate` : `{startDate,days,maxDailyMinutes}` ; période de 1 à 31 jours, plafond de 15 à 240 minutes ; répartition sans chevauchement des cours ou indisponibilités renseignés.
- `GET /api/planner/sessions` : programme personnel sauvegardé. Une nouvelle génération remplace les séances précédentes, pas les tâches ni les disponibilités.

## Connecteur École Directe expérimental

Désactivé par défaut. Il exige `ENABLE_ECOLEDIRECTE=true` et une `ECOLEDIRECTE_ENCRYPTION_KEY` distincte de la session, encodée en base64 et décodant exactement 32 octets. Les opérations distantes sont réservées aux utilisateurs locaux actifs de rôle élève. Aucun mot de passe distant n'est conservé. Seuls les comptes distants de type élève `E` sont acceptés, sans compte famille ou professeur. Aucune compatibilité réelle n'a été validée ; voir `ECOLEDIRECTE.md` pour les sources communautaires et les prérequis d'autorisation.

- `GET /api/integrations/ecoledirecte/status` : `{enabled,configured,connected,lastSync,error,status,experimental:true,account?}`. `enabled` et `configured` ne sont vrais que si activation et clé valide sont réunies.
- `POST /api/integrations/ecoledirecte/connect` : `{username,password,acceptCharter:true,accountId?}`. La confirmation de charte est obligatoire et doit être explicite. Réponse connectée `{connected:true,account:{id,name}}`, ou `{requiresChallenge:true,challengeId,question,options:[{id,label}]}`, ou `{requiresSelection:true,challengeId,accounts:[{id,name}]}`.
- `POST /api/integrations/ecoledirecte/challenge` : pour un QCM, `{challengeId,answer,username,password,accountId?}` ; `answer` est l'identifiant d'option reçu, pas une réponse devinée. Les identifiants sont redemandés. Pour une sélection déjà authentifiée, `{challengeId,accountId}` suffit. État temporaire chiffré, lié utilisateur/établissement, usage unique et expiration après dix minutes.
- `POST /api/integrations/ecoledirecte/sync` : `{startDate,days}` avec date `AAAA-MM-JJ` et période de 1 à 14 jours, défaut 7. Réponse `{synced:true,lastSync,imported:{classes,tasks},removed:{classes,tasks},startDate,endDate,warnings}`. Import manuel, idempotent et transactionnel des heures de cours et devoirs uniquement. Une lecture incomplète ne modifie pas le planning. Les éléments manuels sont conservés. Les séances calculées sont invalidées après import et doivent être régénérées. Durée initiale d'un devoir : 30 minutes ; difficulté : 2/5, sans estimation pédagogique automatique.
- `DELETE /api/integrations/ecoledirecte/disconnect` : `{purgeImported?:true}` ; retire tokens et vérifications en attente. Les imports sont conservés par défaut ; seule l'option explicite supprime les lignes importées. Les éléments manuels ne sont jamais supprimés.

Douze opérations connect/challenge/sync par utilisateur sur quinze minutes. Destination fixe `api.ecoledirecte.com`, TLS conservé, aucune redirection, délai de dix secondes et réponse limitée à 1 Mo par requête. Aucun renouvellement automatique avec mot de passe : une session distante expirée nécessite une reconnexion. Les dates et heures restent les heures locales transmises par École Directe ; aucune conversion de fuseau implicite. Les contenus HTML distants sont transformés en texte, sans téléchargement de pièces jointes ni action d'écriture chez École Directe. La version du protocole communautaire est fixée à `4.97.2` et peut devenir incompatible.

## Préparations structurées

- `POST /api/agents/practice` : `{courseId,kind,chapterId?,topic?,difficulty?,questionCount?,durationMinutes?,totalPoints?}` → 202. `kind` : `exercise` ou `exam` ; difficulté `adaptive`, `easy`, `medium`, `hard`. Une à huit questions, cinq à 180 minutes, au moins deux minutes par question, barème de 1 à 100 par quarts de point avec au moins un quart par question.
- `GET /api/agents/practice` : résumés personnels ; `GET /api/agents/practice/:id` : étapes, plan et sujet sans réponses.
- `DELETE /api/agents/practice/:id` : suppression personnelle et annulation ; ne supprime pas les brouillons déjà exportés.
- `GET /api/agents/practice/:id/correction` : corrigé séparé.
- `GET /api/agents/practice/:id/questions/:questionId/hint?level=1` : indice progressif, niveau 1 à 3.
- `GET /api/agents/practice/:id/pdf?part=subject` : PDF sujet ; `part=correction` pour le corrigé.
- `POST /api/agents/practice/:id/questions/:questionId/start` : ouvre ou retrouve un exercice privé du tuteur.
- `POST /api/agents/practice/:id/drafts` : `{parts:["subject","correction"]}` ; responsable du cours uniquement, création idempotente de documents en brouillon, sans publication.

Les résultats appartiennent au demandeur. Les sources et permissions sont revérifiées avant leur utilisation. Voir [USAGES_IA.md](USAGES_IA.md) pour le fonctionnement et les limites.

## Cahier de textes École Directe privé

`GET /api/integrations/ecoledirecte/data?startDate=AAAA-MM-JJ&days=14` retourne `{startDate,endDate,classes,tasks,lessons,source,lastSync}` pour le compte élève connecté uniquement. Les consignes complètes et les contenus de séance restent distincts des documents de classe. `/status` expose également le dernier essai, son étape et un code d’erreur sûr. Voir [ECOLEDIRECTE.md](ECOLEDIRECTE.md) pour le protocole et les limites.
