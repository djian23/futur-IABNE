# 08 — Capacités IA, agents et parcours de bout en bout (IABNE, Yabné Paris)

> Recherche de cas d'usage. Aucun fichier du dépôt n'a été modifié. Les constats « existant » renvoient au code lu le 06/11/2026 (`server/learning.mjs`, `server/tutor.mjs`, `server/practice-agent.mjs`, `server/documents.mjs`, `server/extraction-worker.mjs`, `server/ai-recipes.mjs`, `server/teacher-tutor.mjs`, `docs/TUTOR.md`, `docs/USAGES_IA.md`).
> Public : collège et lycée, **élèves mineurs**. Principe directeur du cahier des charges : « l'IA guide l'élève, elle ne fait pas à sa place », sources = documents des professeurs uniquement, pas d'Internet.

---

## 0. État des lieux technique de l'IA (ce qui existe vraiment)

| Brique | Constat dans le code | Conséquence |
|---|---|---|
| Découpage | `documents.mjs` ~l.247 : fenêtres fixes de 1 200 caractères, pas de 1 000 (200 de recouvrement), sans tenir compte des titres, paragraphes, exercices | Un exercice ou une démonstration est souvent coupé en deux |
| Recherche | `learning.mjs` `corpus()` : mots ≥ 3 lettres sans accents, ~17 mots vides, **score = nombre de termes de la question présents dans le fragment** ; 8 fragments (14 en mode « tout »), tronqués à 1 800 caractères ; 2 000 fragments max lus en mémoire | Pas de pondération (IDF), pas de synonymes ni de morphologie (« dérivée » / « dériver »), pas de recherche sémantique ; question vague = rien trouvé |
| Recherche (agent) | `practice-agent.mjs` `sourceSelection()` : `includes()` sur le thème + priorité aux types `exam/exercise/correction` | Deuxième implémentation lexicale, encore plus simple |
| Extraction | `extraction-worker.mjs` : `pdf-parse`, `mammoth`, `.txt` ; 100 pages, 150 000 caractères ; **pas d'OCR** | Un scan, une photo de tableau, un polycopié manuscrit = document vide ; formules et schémas perdus |
| Appel modèle | `infer()` : un seul fournisseur (Anthropic ou OpenAI), modèle par défaut `claude-sonnet-4-20250514` (ancien), pas de streaming, délai 45 s, `max_tokens` ≤ 6 000 | Pas de choix de modèle par tâche ; pas de mise en cache de prompt ; attente sans retour visuel |
| Garde-fous | Citations `[Sx]` obligatoires et vérifiées ; revérification des droits/versions après l'appel ; consignes anti-injection ; mode « solution » séparé | Très bonne base, à compléter par une évaluation de la *justesse* |
| Quotas | 20 demandes/h/utilisateur, 200/h/établissement (`AI_SCHOOL_HOURLY_LIMIT`), 8 appels simultanés | Quota en *nombre* de requêtes, pas en *coût* (tokens) |
| Mémoire élève | `tutor.mjs` `topicProfile()` : agrégation quiz + difficultés déclarées + exercices + observations confirmées ; **répétition espacée naïve 1/3/7 jours** | Pas de vrai algorithme (SM-2/FSRS), pas de cartes |
| Diagnostic | `decodeTutorAnswer()` : observations dont la preuve doit être une **sous-chaîne exacte de la tentative** | Excellent garde-fou anti-hallucination ; pas de taxonomie d'erreurs |
| Quiz | 5 QCM à 4 options, difficulté adaptée sur les 3 derniers quiz (`nextDifficulty`) | Pas de réponse ouverte, pas de calcul numérique, pas de chrono |
| Agent | `practice-agent.mjs` : file asynchrone (sources → plan → génération → contrôle), 3 en parallèle, file de 100, traces persistées | Bon squelette réutilisable pour tous les futurs agents |
| Classe | `classNeeds()` : notions ratées par ≥ 5 élèves distincts sur 30 jours | Base de l'agent « veille » |
| Retours | `POST /api/ai/reports` : l'élève signale une réponse | Pas encore exploité pour l'évaluation |
| Rendu | Aucun rendu Markdown/LaTeX dans `src/` ; réponses « texte simple, jamais en HTML » | Maths illisibles (x^2, sqrt…) |
| Planning | `/api/planner/generate` : règles déterministes | Pas de replanification déclenchée par un événement |

---

## 1. Catalogue des idées (42)

Légende — **Existant** : oui / partiel / non (+ fichier). **Priorité** : P0 (avant/pendant le pilote), P1 (année 1), P2 (année 2), LT (long terme). **Effort** : S (≤ 1 semaine), M (2–4 semaines), L (> 1 mois).

### A. Fondations du moteur (RAG, documents, rendu)

#### 1. RAG hybride : BM25 + embeddings + fusion RRF
- **Scénario** : en 1re, Léa demande « pourquoi on met un moins devant le sinus quand on dérive le cosinus ? ». Le cours du professeur dit « (cos x)' = –sin x » sans le mot « pourquoi ». Aujourd'hui `corpus()` matche « sinus », « cosinus » littéralement absents (le cours écrit « sin », « cos ») → aucune source. Avec l'hybride : BM25 (SQLite FTS5, déjà disponible dans `node:sqlite`) + similarité vectorielle multilingue → la bonne démonstration remonte ; fusion par Reciprocal Rank Fusion.
- **Fonctionnalité** : table FTS5 `document_chunks_fts` + table `chunk_embeddings` (vecteurs float32 en BLOB, ou extension `sqlite-vec`) ; un module `retrieval.mjs` unique utilisé par le tuteur, les quiz, les fiches et l'agent (supprime la double implémentation).
- **Valeur** : c'est la qualité de *toutes* les fonctions IA. Les études RAG montrent typiquement +15 à +30 points de rappel@8 entre lexical brut et hybride sur des questions en langage naturel.
- **Risques** : Anthropic ne fournit pas d'embeddings → choisir soit un modèle local (ex. e5/bge multilingue via ONNX/transformers.js, données restant sur le serveur, CPU suffisant pour quelques milliers de fragments), soit un fournisseur tiers (nouveau sous-traitant RGPD, à éviter pour des mineurs). Re-calcul lors d'une nouvelle version de document.
- **Existant** : partiel (lexical seul, `learning.mjs` `corpus()`, `practice-agent.mjs` `sourceSelection()`).
- **Priorité** : P0 (au moins BM25/FTS5) ; embeddings P1. **Effort** : M.

#### 2. Reranking des candidats
- **Scénario** : la recherche hybride ramène 30 candidats ; un reranker trie les 8 meilleurs (cross-encoder local multilingue, ou appel Haiku 5.5 « note de pertinence 0–3 » en lot sur les 30 extraits).
- **Valeur** : moins de bruit dans le prompt → moins de tokens, moins d'hallucination, citations plus justes.
- **Risques** : latence (+300 ms à 1 s) ; coût si reranking par LLM (faible avec Haiku 5.5 à 0,10 $/M tokens en entrée).
- **Existant** : non. **Priorité** : P1. **Effort** : S–M.

#### 3. Découpage structurel (« chunking » pédagogique)
- **Scénario** : un sujet de contrôle avec « Exercice 2 (5 pts) – a) b) c) » est découpé par exercice et question, en gardant le titre du chapitre et le barème en métadonnées ; une correction est rattachée à sa question.
- **Fonctionnalité** : détection des titres (DOCX : styles mammoth ; PDF : taille de police/numérotation), fragments de 300–800 tokens alignés sur les sections, métadonnées `{chapitre, section, exercice, points, type}`.
- **Valeur** : permet « l'exercice 2 du contrôle de novembre », des quiz par section, un appariement sujet ↔ corrigé.
- **Risques** : PDF mal structurés → repli sur fenêtres fixes.
- **Existant** : non (fenêtres fixes, `documents.mjs`). **Priorité** : P0. **Effort** : M.

#### 4. Réécriture de requête et requêtes multi-tours
- **Scénario** : l'élève écrit « et pour la 2 ? ». La recherche actuelle concatène les anciennes questions (`learning.mjs` l.535). Un petit appel Haiku reformule en requête autonome (« méthode question 2 exercice suites arithmétiques ») + génère 2 variantes (HyDE léger).
- **Existant** : partiel (concaténation d'historique). **Priorité** : P1. **Effort** : S.

#### 5. OCR et compréhension des documents scannés (vision)
- **Scénario** : M. Cohen dépose le scan de son ancien contrôle de physique (PDF image). Aujourd'hui : texte vide, document inutilisable par l'IA. Demain : détection « PDF sans couche texte » → pages rendues en images → modèle avec vision (Claude accepte images et PDF) qui transcrit en texte + LaTeX pour les formules + description des schémas (« circuit RC en série, R = 1 kΩ… ») → **le professeur valide la transcription** avant publication dans le corpus.
- **Valeur** : débloque des années d'archives papier ; indispensable en maths/physique/SVT.
- **Risques** : erreurs de transcription (un signe moins oublié change tout) → validation obligatoire par le prof, affichage côte à côte image/texte ; coût (une page ≈ 1 500 tokens image) → traitement par lot (Batches API, –50 %) ; OCR local (Tesseract) possible en premier passage pour le texte simple.
- **Existant** : non (`docs/FEATURES.md` « Pas d'OCR intégré »). **Priorité** : P0/P1 (dépend du volume d'archives papier, à mesurer lors du pilote). **Effort** : M.

#### 6. Reconnaissance d'écriture manuscrite de l'élève
- **Scénario** : Noam photographie sa résolution d'équation sur son cahier ; le tuteur transcrit (« 2x + 3 = 7 → 2x = 10 »), **montre la transcription à l'élève pour confirmation**, puis repère l'erreur de signe. La confirmation est essentielle : la règle « preuve = sous-chaîne exacte de la tentative » (`decodeTutorAnswer`) s'applique alors à la transcription validée.
- **Risques** : photos contenant visages, noms, autres pages → recadrage côté client, suppression de l'image après transcription, pas de conservation par défaut ; EXIF à retirer.
- **Existant** : non. **Priorité** : P1. **Effort** : M.

#### 7. Rendu LaTeX/KaTeX et Markdown sûr
- **Scénario** : la réponse « (x^2+1)/(2x) » s'affiche en fraction lisible ; chimie avec `mhchem` (\ce{H2O}).
- **Fonctionnalité** : consigne de sortie « Markdown restreint + `$...$` », rendu client KaTeX (rapide, sans exécution de code), assainissement strict (pas de HTML brut), même rendu dans les PDF (`pdf-layout.mjs` : pré-rendu SVG/PNG des formules).
- **Risques** : XSS si Markdown mal filtré ; formules invalides → afficher la source brute.
- **Existant** : non (texte simple imposé dans `infer()`). **Priorité** : **P0** (les maths sont illisibles sans cela). **Effort** : S–M.

#### 8. Schémas et graphiques générés
- **Scénario** : « montre-moi la courbe de f(x) = x² – 4 et ses racines » → le modèle produit une **spécification** (JSON : fonction, intervalle, points remarquables) que le client trace (function-plot / Chart.js) ; pas d'exécution de code arbitraire. Pour les schémas (circuit, cycle de l'eau, frise chronologique), sortie Mermaid ou SVG restreint validé.
- **Valeur** : maths, physique, SES, histoire (frises).
- **Risques** : courbe fausse si l'expression est mal transcrite → l'évaluateur d'expressions côté serveur vérifie les points annoncés (racines, extremums) ; ne jamais exécuter du JS généré.
- **Existant** : non. **Priorité** : P1. **Effort** : M.

#### 9. Fiches visuelles et cartes mentales
- **Scénario** : en fin de chapitre « La Révolution française », l'élève génère une carte mentale (nœuds = notions du cours, chaque nœud cité [Sx]) affichée en interactif, exportée en PDF ; variante « fiche une page » avec encadrés définitions / méthodes / pièges.
- **Fonctionnalité** : nouvelle recette dans `ai-recipes.mjs` avec sortie structurée (arbre JSON validé : profondeur ≤ 4, chaque nœud cité) → rendu Markmap/SVG.
- **Existant** : partiel (fiche texte `sheet` + PDF `pdf-layout.mjs`). **Priorité** : P1. **Effort** : M.

### B. Apprentissage actif et évaluation

#### 10. Flashcards générées depuis le cours
- **Scénario** : après la publication du chapitre « Vocabulaire de l'énergie », chaque élève peut générer 15 cartes recto/verso citées ; le professeur peut publier un **paquet officiel** du chapitre (validé une fois, réutilisé par 30 élèves → une seule génération, coût divisé par 30).
- **Types** : définition, formule à trous (cloze), date ↔ événement, vocabulaire LV (mot ↔ traduction ↔ phrase du cours).
- **Existant** : non. **Priorité** : P1. **Effort** : M.

#### 11. Révision espacée FSRS (ou SM-2)
- **Scénario** : chaque soir, « Mes révisions du jour : 12 cartes, 6 min ». L'élève note « à revoir / difficile / bien / facile » ; l'algorithme FSRS (open source, plus efficace que SM-2 à rétention égale) calcule la prochaine échéance ; les quiz ratés injectent automatiquement des cartes de la notion.
- **Fonctionnalité** : tables `cards`, `card_reviews` (stabilité, difficulté, échéance) ; remplace l'heuristique 1/3/7 jours de `topicProfile()` ; s'intègre au planning (bloc « révisions » de 10 min).
- **Valeur** : un des leviers les mieux établis par la recherche en sciences cognitives (effet d'espacement + récupération active). **Pas d'IA nécessaire au quotidien** → coût marginal nul.
- **Risques** : surcharge si trop de cartes → plafond quotidien, priorisation par proximité de contrôle.
- **Existant** : partiel (`tutor.mjs` `reviewAt`/`intervalDays` naïfs). **Priorité** : **P0/P1** (cité dans « reste à faire »). **Effort** : M.

#### 12. Questions ouvertes corrigées (au-delà du QCM)
- **Scénario** : « Définis une suite géométrique » → réponse libre de l'élève → comparaison à la définition citée du cours, retour « il manque : le premier terme ».
- **Fonctionnalité** : réponses courtes notées par Haiku/Sonnet avec grille 0/1/2 ; réponses numériques vérifiées **par calcul** (tolérance, unités), jamais par le LLM seul.
- **Existant** : non (QCM 4 options, `validateQuiz`). **Priorité** : P1. **Effort** : M.

#### 13. Diagnostic des erreurs de raisonnement avec taxonomie par matière
- **Scénario** : dans l'exercice de Noam, le tuteur produit une observation `{type: "signe lors du passage d'un membre à l'autre", catégorie: "procédurale", preuve: "2x = 10"}`. Au fil des semaines : « Tu fais souvent des erreurs de signe en transposition (3 fois) — voici 4 exercices ciblés ».
- **Taxonomie de départ (à valider par les profs)** :
  - Maths : calcul/signe, priorité des opérations, confusion de propriétés, condition d'application oubliée, raisonnement circulaire, rédaction/justification absente, lecture d'énoncé.
  - Physique-chimie : unités/conversions, chiffres significatifs, confusion de grandeurs, loi appliquée hors domaine, schéma incohérent.
  - Français/philo : hors-sujet, thèse non argumentée, exemple non analysé, citation non commentée, plan déséquilibré, langue.
  - Histoire-géo : anachronisme, confusion de dates/acteurs, absence de contextualisation, lecture de document superficielle.
  - Langues : temps/conjugaison, accord, faux-ami, ordre des mots, registre.
  - SVT : confusion corrélation/causalité, conclusion non reliée à l'expérience, schéma non légendé.
- **Fonctionnalité** : champ `category` contrôlé (liste fermée par matière, extensible par le prof) dans `tutor_observations` ; agrégats anonymes ≥ 5 élèves pour le prof (« 40 % des erreurs de la classe sont des conditions d'application oubliées »).
- **Risques** : étiquetage stigmatisant d'un mineur → garder le vocabulaire « hypothèse », visible et contestable par l'élève (mécanisme déjà présent), jamais transmis nominativement ; erreurs de classification → évaluation dédiée (§ 4).
- **Existant** : partiel (`tutor.mjs` observations prouvées, sans taxonomie). **Priorité** : P1. **Effort** : M.

#### 14. Correction de copies photographiées avec note indicative et grille
- **Scénario** : l'élève fait le contrôle blanc sur papier, photographie ses 3 pages ; l'IA transcrit (validation élève), applique **la grille du corrigé du professeur** (critères de `practice-agent` ou grille déposée), renvoie par question : points obtenus / possibles, critère manquant cité, conseil. Affichage : « Note indicative 13/20 ± 2 — estimation automatique, non officielle ».
- **Côté prof (option)** : correction assistée d'un paquet de copies → propositions de points par critère, le professeur valide ou corrige chaque ligne ; l'IA n'attribue **jamais** de note officielle (règle déjà posée dans `docs/USAGES_IA.md`).
- **Valeur** : retour immédiat ; pour le prof, gain de temps sur la première passe.
- **Risques** : fiabilité de la note (écart à mesurer : objectif écart moyen ≤ 1,5 pt/20 vs prof sur 50 copies avant ouverture) ; manuscrit illisible ; biais d'écriture ; données personnelles sur les copies (nom) → floutage/recadrage ; coût vision.
- **Existant** : non (corrigés et barèmes générés existent : `practice-agent.mjs`). **Priorité** : P1 (élève, entraînement) ; P2 (prof). **Effort** : L.

#### 15. Examen blanc chronométré
- **Scénario** : vendredi, Brevet blanc de maths en 2 h. L'élève lance le sujet généré (ou publié par le prof), chronomètre côté serveur (réutilise le mécanisme de battements de `tutor.mjs`), tuteur **désactivé** pendant l'épreuve, réponses saisies ou photographiées, remise automatique à la fin, correction différée (Batches API, –50 %), bilan : temps par exercice, points par compétence, cartes de révision générées sur les points ratés.
- **Existant** : partiel (sujets/corrigés `practice-agent.mjs`, chronomètre de révision). **Priorité** : P1. **Effort** : M.

#### 16. Quiz adaptatif à granularité « notion » (IRT léger)
- **Scénario** : au lieu de la difficulté globale facile/moyen/difficile sur les 3 derniers quiz, estimation de maîtrise par notion (modèle de Rasch/Elo simple), sélection de la question la plus informative.
- **Existant** : partiel (`nextDifficulty`). **Priorité** : P2. **Effort** : M.

#### 17. Pédagogie socratique graduée (garde-fou central)
- **Scénario** : Sarah colle l'énoncé de son DM et écrit « donne la réponse ». Le tuteur : niveau 1 question de relance, niveau 2 indice, niveau 3 méthode, niveau 4 exemple analogue (autres valeurs), niveau 5 correction **seulement** si une tentative a été soumise et si le devoir n'est pas noté. Compteur visible « indices utilisés : 2/4 ».
- **Fonctionnalité** : machine à états côté serveur (pas seulement dans le prompt) ; le mode `solution` exige une tentative non vide et un délai minimum ; le prof peut, par cours ou par devoir, interdire le niveau 5.
- **Existant** : partiel (modes `hint/method/check/solution`, `docs/TUTOR.md`). **Priorité** : **P0**. **Effort** : S.

#### 18. Détection de triche et d'usage inapproprié
- **Scénario** : un élève colle mot pour mot la consigne d'un devoir École Directe à rendre demain ; le système reconnaît la correspondance avec le cahier de textes importé et bascule automatiquement en mode « guidage seulement ». Autres signaux : demande de rédaction complète (« écris ma dissertation »), plusieurs comptes qui posent la même question au même moment pendant un contrôle (heure de l'emploi du temps).
- **Principe** : on ne « dénonce » pas ; on **adapte la réponse** et on informe l'élève (« Ceci ressemble à un devoir à rendre : je t'aide à le faire, pas à le faire à ta place »). Statistique agrégée et anonyme au prof (« 12 demandes liées au DM n°4 »).
- **Risques** : faux positifs ; surveillance perçue → transparence dans la charte d'usage ; ne pas utiliser de « détecteurs d'IA » sur les copies (peu fiables, discriminants).
- **Existant** : non (consigne générale dans le prompt). **Priorité** : P1. **Effort** : M.

#### 19. Modération et protection des mineurs
- **Scénario** : un élève écrit un message de détresse (« je n'en peux plus, je veux disparaître ») dans le tuteur de SVT. Le tuteur sort du rôle pédagogique, répond avec bienveillance, affiche les ressources (3114, Fil Santé Jeunes 0 800 235 236, CPE/infirmière de l'établissement) et — selon la procédure définie avec la direction — déclenche une alerte humaine (CPE) sans transmettre la conversation entière.
- **Fonctionnalité** : classification Haiku 5.5 de chaque message entrant (détresse, harcèlement, contenu sexuel, violence, données personnelles partagées) avant l'appel principal ; procédure validée par la direction et le DPO.
- **Risques** : responsabilité juridique, faux négatifs ; ne jamais prétendre être un professionnel de santé.
- **Existant** : non. **Priorité** : **P0** (avant tout pilote avec des mineurs). **Effort** : M.

### C. Oral et langues

#### 20. Dictée vocale (speech-to-text) pour poser une question
- **Scénario** : un élève dyslexique dicte sa question au tuteur.
- **Fonctionnalité** : d'abord l'API Web Speech du navigateur (gratuit, mais traitement chez Google/Apple selon le navigateur) ou Whisper auto-hébergé (données restant sur le serveur ; nécessite CPU/GPU).
- **Risques** : la voix est une donnée personnelle ; enregistrement non conservé.
- **Existant** : non. **Priorité** : P1 (accessibilité). **Effort** : S (navigateur) / M (Whisper).

#### 21. Synthèse vocale des fiches et réponses
- **Scénario** : écouter sa fiche d'histoire dans le bus ; lecture des réponses pour les élèves avec troubles DYS.
- **Fonctionnalité** : `speechSynthesis` du navigateur en premier ; TTS neuronal ensuite.
- **Existant** : non. **Priorité** : P1. **Effort** : S.

#### 22. Entraînement au Grand oral (Terminale)
- **Scénario** : Yaël prépare sa question « Les mathématiques peuvent-elles prédire une épidémie ? ». Elle s'enregistre 5 min ; transcription ; analyse : structure (accroche, problématique, plan annoncé), temps de parole, débit, tics verbaux (« euh » : 23), lien avec le programme ; puis 10 min de **questions du jury simulé** (le modèle pose des questions de relance à partir de son exposé). Grille alignée sur la grille officielle (qualité orale, prise de parole en continu, qualité des connaissances, interaction, argumentation).
- **Risques** : l'évaluation de la « qualité de voix » par IA est peu fiable → se limiter aux indicateurs mesurables (durée, débit, pauses) et au contenu ; enregistrements vocaux de mineurs → suppression après analyse.
- **Existant** : non. **Priorité** : P2. **Effort** : L.

#### 23. Conversation en langue vivante (anglais, espagnol, hébreu)
- **Scénario** : 10 minutes de dialogue écrit puis oral en anglais sur le thème du chapitre (« Art and power »), niveau ciblé A2/B1/B2, le partenaire reformule les erreurs sans interrompre, bilan final (3 erreurs récurrentes → cartes FSRS). Hébreu : écriture de droite à gauche, nikoud optionnel — vérifier le rendu RTL.
- **Risques** : le modèle doit rester sur le vocabulaire et les thèmes du cours (restriction aux sources, adaptée : la *langue* n'est pas un fait à citer, mais les *thèmes* oui).
- **Existant** : non. **Priorité** : P1 (écrit) / P2 (oral). **Effort** : M.

#### 24. Lecture à voix haute évaluée (collège)
- **Scénario** : en 6e, lecture d'un texte ; mots par minute, mots sautés.
- **Existant** : non. **Priorité** : LT. **Effort** : L.

### D. Agents autonomes (avec humain dans la boucle)

> Règle commune : un agent **propose**, un humain **valide** toute action visible par d'autres (publication, message à la classe, création de comptes). Chaque agent réutilise le squelette `practice_runs` (statut, étapes, traces, annulation) de `practice-agent.mjs`.

#### 25. Agent « planificateur » : replanifier quand un contrôle est annoncé
- **Scénario** : mardi 18 h, la synchronisation École Directe importe « Contrôle de SVT jeudi 14 nov. — chapitre Génétique ». L'agent : (1) détecte le nouvel événement ; (2) estime la charge (taille du chapitre, maîtrise de l'élève sur ces notions via `topicProfile`) ; (3) redistribue les créneaux de la semaine (algorithme déterministe existant, avec contraintes : pas plus de 120 min/jour, devoirs déjà prévus conservés) ; (4) ajoute J-3 flashcards, J-2 quiz, J-1 fiche ; (5) **propose** le nouveau planning à l'élève : « J'ai déplacé ta séance d'anglais de mercredi à vendredi, accepter ? ».
- **Choix d'architecture** : le LLM n'est pas nécessaire pour le calcul du planning (règles = fiable, gratuit) ; il sert seulement à rédiger l'explication et à choisir les notions → appel Haiku.
- **Risques** : notifications trop nombreuses ; mauvaise lecture d'un intitulé de devoir → montrer la source École Directe.
- **Existant** : partiel (planning par règles `learning.mjs` `/api/planner/generate`, synchro ED `ecoledirecte.mjs`). **Priorité** : P1. **Effort** : M.

#### 26. Agent « veille de classe » : notion non comprise par la moitié de la classe
- **Scénario** : lundi 7 h, l'agent constate que 14 élèves sur 27 de 2nde B ont raté « vecteurs colinéaires » dans les quiz de la semaine (seuil ≥ 5 élèves déjà dans `classNeeds()`). Il prépare en brouillon : explication alternative, activité de 15 min, 3 questions flash, et l'envoie dans le tableau de bord du prof : « Remédiation proposée — 52 % de la classe ». Le prof l'ajuste et la publie, ou l'ignore (retour enregistré pour l'évaluation).
- **Risques** : statistiques fondées sur des élèves volontaires (biais) → afficher la base (« 27 élèves, dont 20 actifs ») ; pas de noms.
- **Existant** : partiel (`classNeeds()` + recette `class_remediation`, déclenchement manuel). **Priorité** : P1. **Effort** : S–M.

#### 27. Agent « rattrapage d'absence »
- **Scénario** : Ethan est absent 4 jours (absence connue via École Directe ou saisie CPE). À son retour, il trouve « Ce que tu as manqué » : par matière, les documents publiés pendant l'absence, le cahier de textes, une fiche résumé de 1 page, un quiz de 5 questions, et les devoirs à venir réajustés dans son planning. Le professeur voit seulement « 1 élève en rattrapage sur ce chapitre ».
- **Risques** : motif d'absence (santé) = donnée sensible → l'agent n'en a pas besoin, seulement des dates.
- **Existant** : non (données ED partielles : emploi du temps, devoirs). **Priorité** : P1. **Effort** : M.

#### 28. Agent « préparation du conseil de classe »
- **Scénario** : 10 jours avant le conseil, le professeur principal obtient une synthèse **par classe** : notions les plus difficiles par matière, évolution de l'usage, et, pour chaque élève, un brouillon d'appréciation **à partir des seules données que le professeur a le droit de voir** (notes École Directe si importées, observations du prof). Le prof réécrit ; rien n'est envoyé automatiquement.
- **Risques majeurs** : profilage de mineurs, décisions affectant l'élève (passage, orientation) → interdiction d'utiliser les conversations privées du tuteur (règle existante : « les enseignants n'accèdent pas au profil individuel ») ; analyse d'impact (AIPD) ; formulation non stigmatisante ; l'AI Act classe les systèmes d'IA qui évaluent les acquis ou orientent en éducation comme **à haut risque** → documentation, supervision humaine, journalisation.
- **Existant** : non. **Priorité** : P2. **Effort** : M.

#### 29. Agent « orientation » (Parcoursup, choix de spécialités)
- **Scénario** : en 2nde, Inès explore « quelles spécialités pour devenir kinésithérapeute ? ». L'agent s'appuie sur un corpus **validé par l'établissement** (fiches ONISEP importées, documents du PsyEN/professeur principal), propose des questions de réflexion, jamais de verdict (« tu n'es pas faite pour… »).
- **Risques** : sortie du corpus de cours (le cahier des charges interdit Internet → corpus orientation dédié, daté et mis à jour annuellement) ; biais de genre/social ; haut risque AI Act.
- **Existant** : non. **Priorité** : P2. **Effort** : M.

#### 30. Agent « animateur de groupe de révision »
- **Scénario** : 4 élèves de 1re créent un groupe « Bac de français » (fonction de groupes demandée par l'utilisateur). L'animateur : propose un ordre du jour, distribue les rôles (chacun explique un texte), lance un quiz commun avec classement bienveillant, relève les questions sans réponse pour le prof, résume la séance. Il ne lit **que** le fil du groupe, pas les mémoires privées des membres.
- **Risques** : harcèlement entre pairs → modération (idée 19), signalement, prof référent visible ; mélange de niveaux.
- **Existant** : non (pas de groupes, `ajouts_equipe.md`). **Priorité** : P1 (après les groupes). **Effort** : M.

#### 31. Agent d'administration : import CSV intelligent et détection de doublons
- **Scénario** : la secrétaire importe l'export SIECLE/École Directe « eleves_2026.csv » (séparateur `;`, encodage Windows-1252, colonnes « NOM », « Prénom », « Div. »). L'agent : détecte encodage et séparateur, propose le mapping colonnes → champs, normalise (« 2NDE B » → « 2nde B »), repère les doublons probables (« Lévy Sarah » / « LEVY Sarah » même date de naissance ; distance de Levenshtein + phonétique), les comptes existants à mettre à jour, les classes inexistantes à créer. Il affiche un **aperçu de 312 lignes : 298 créations, 9 mises à jour, 5 conflits** ; rien n'est écrit sans « Confirmer ».
- **Choix** : le mapping et la normalisation peuvent être faits **sans LLM** (règles) ; le LLM (Haiku) n'intervient que pour les colonnes ambiguës. Les données nominatives ne sont envoyées au modèle que si nécessaire (envoyer les en-têtes + 5 lignes pseudonymisées suffit au mapping).
- **Existant** : non (création unitaire seulement). **Priorité** : **P0** (priorité exprimée par l'utilisateur : l'administration). **Effort** : M.

#### 32. Assistant d'administration en langage naturel
- **Scénario** : « Crée les comptes de la 2nde B à partir de ce fichier, inscris-les dans la classe, et affecte Mme Benhamou en maths. » → l'assistant traduit en **plan d'actions** affiché (`create_class`, `import_students(…)`, `assign_teacher(…)`) en appelant des outils (tool use, `strict: true`), puis l'admin valide ; journal d'audit de chaque action. Autres demandes : « Qui n'a jamais activé son compte en 3e A ? », « Passe tous les 2nde en 1re au 1er septembre en gardant les groupes de spécialité. »
- **Risques** : action destructrice mal comprise → outils limités aux droits de l'admin, aperçu obligatoire, pas de suppression en masse via l'assistant, annulation possible ; injection via le contenu du fichier (un nom d'élève contenant « ignore les consignes… ») → les données ne sont jamais des instructions.
- **Existant** : non. **Priorité** : P1. **Effort** : M.

#### 33. Agent « passage d'année »
- **Scénario** : en juillet, l'agent propose la bascule : classes N+1, élèves qui partent, archivage des cours, transfert des paquets de flashcards et méthodes du professeur vers les nouveaux cours, export de portabilité pour les élèves sortants.
- **Existant** : non. **Priorité** : P1. **Effort** : M.

#### 34. Agent « préparation de séquence » pour le professeur
- **Scénario** : « Prépare ma séquence de 6 séances sur les fonctions exponentielles pour la Tle » → plan de séquence, séances, évaluations diagnostique/formative/sommative, paquet de flashcards — tout en brouillons liés au chapitre.
- **Existant** : partiel (`lesson_plan`, `differentiation`, agent d'exercices). **Priorité** : P1. **Effort** : M.

#### 35. Agent « devoir maison différencié »
- **Scénario** : le prof donne un DM ; l'agent propose 3 versions (soutien/standard/approfondissement) et suggère des groupes à partir des **résultats agrégés aux quiz**, que le prof affecte lui-même.
- **Existant** : partiel (`differentiation`). **Priorité** : P2. **Effort** : S.

### E. Plateforme IA : orchestration, coût, qualité, mémoire

#### 36. n8n ou code direct ?
- **Analyse** : le cahier des charges hésite (§ 6.3). Le dépôt a déjà un orchestrateur maison robuste (file, étapes persistées, annulation, revérification des droits). n8n ajouterait : un service à héberger et sécuriser, des données de mineurs transitant hors de l'application, une deuxième source de vérité pour les permissions.
- **Recommandation** : **code direct** pour tout ce qui touche aux élèves et aux contenus ; n8n éventuellement pour des automatisations *administratives sans données pédagogiques* (ex. rappel hebdomadaire par mail à l'administration) si l'équipe non technique veut les modifier.
- **Existant** : code direct. **Priorité** : décision P0. **Effort** : S.

#### 37. Routage des modèles par tâche (coût/qualité)
| Tâche | Modèle proposé | Raison |
|---|---|---|
| Classification (modération, type de demande, détection devoir, reranking, réécriture de requête) | Claude Haiku 5.5 (`claude-haiku-5-5`, 0,10 $ / 0,50 $ par M tokens) | Volumes élevés, réponses courtes |
| Tuteur élève, quiz, fiches, flashcards | Claude Sonnet 5.5 (`claude-sonnet-5-5`, 2 $ / 10 $) | Bon équilibre ; effort `low`/`medium` |
| Génération de contrôles, analyse de méthode du prof, correction de copies, OCR de formules | Claude Opus 5.5 (`claude-opus-5-5`, 4 $ / 20 $) | Raisonnement long, exactitude |
| LLM-juge des évaluations | Opus 5.5 (différent du modèle évalué si possible) | Limiter l'auto-complaisance |
- **Fonctionnalité** : table de configuration `ai_routes` (tâche → modèle, effort, max_tokens) ; le modèle codé en dur `claude-sonnet-4-20250514` (`learning.mjs` `provider()`) devient une configuration par route ; mesurer avant de descendre en gamme (un modèle plus capable à effort bas peut coûter moins par tâche terminée).
- **Existant** : non (un modèle unique). **Priorité** : P0. **Effort** : S.

#### 38. Mise en cache de prompt et ordre du prompt
- **Constat** : `infer()` envoie le système puis un unique message JSON contenant tout (demande, profil, méthode, corpus) ; rien n'est stable d'une requête à l'autre → aucune réutilisation.
- **Proposition** : ordre stable → `system` figé (règles) + **méthode validée du prof** + **fragments du chapitre** (identiques pour les 30 élèves d'une classe qui révisent le même soir) avec `cache_control` ; puis profil privé et question à la fin. Les lectures en cache coûtent ~10 % du prix d'entrée. Passer au SDK officiel `@anthropic-ai/sdk` (streaming, erreurs typées, retries) au lieu de `fetch` brut. Vérifier `usage.cache_read_input_tokens`.
- **Gain estimé** : 30 à 60 % du coût d'entrée sur les heures de pointe (veille de contrôle), à mesurer.
- **Existant** : non. **Priorité** : P0. **Effort** : S.

#### 39. Budget et quotas par établissement (en euros, pas en requêtes)
- **Scénario** : la direction fixe 300 €/mois ; tableau de bord : coût par jour, par rôle, par fonction ; alertes à 50/80/100 % ; au-delà, mode dégradé (Haiku seulement, fiches officielles en cache) plutôt que coupure ; quotas par élève hebdomadaires lissés (ex. 40 « crédits »/semaine, une fiche = 3, une question = 1) affichés de façon compréhensible.
- **Estimation d'ordre de grandeur (hypothèses à vérifier au pilote)** : 400 élèves × 10 demandes/semaine × (8 000 tokens d'entrée + 1 000 de sortie) sur Sonnet 5.5 ≈ 0,026 $/demande ≈ 105 $/semaine ≈ 3 800 $/an sur 36 semaines, avant cache et routage ; probablement 1 500–2 500 $/an après.
- **Existant** : partiel (compteurs de requêtes/heure, `learning_usage` sans tokens). **Priorité** : P0 (journaliser les tokens) / P1 (tableau de bord). **Effort** : M.

#### 40. Évaluation continue de la qualité (jeux d'éval, LLM-juge, retours profs)
- Voir le plan détaillé § 4. **Existant** : partiel (signalements `POST /api/ai/reports`, tests unitaires de structure). **Priorité** : **P0**. **Effort** : M.

#### 41. Mémoire long terme et portabilité entre années
- **Scénario** : en 1re, le tuteur de maths sait (si l'élève l'accepte) que l'élève a eu du mal avec les fractions en 2nde ; mais la mémoire est actuellement isolée par cours et donc perdue au changement de classe.
- **Fonctionnalité** : « carnet de compétences » de l'élève, **résumé** (pas les conversations brutes) par notion du programme, transférable d'une année à l'autre avec consentement (élève + responsables pour les plus jeunes), consultable, effaçable ; export JSON/PDF (droit à la portabilité RGPD art. 20) ; durée de conservation définie (ex. fin de scolarité + 1 an).
- **Risques** : effet d'étiquette (« faible en maths » qui suit l'élève) → oubli progressif (pondération décroissante), jamais visible des nouveaux profs sans accord.
- **Existant** : partiel (mémoire par cours, suspendre/réinitialiser, `tutor.mjs`). **Priorité** : P1 (export) / P2 (transfert). **Effort** : M.

#### 42. Observabilité et transparence des réponses
- **Scénario** : chaque réponse affiche « Sources : Cours ch. 3 p. 2 [S1], Correction contrôle 2 [S2] — modèle Sonnet, coût 0,02 € » (coût visible pour l'admin seulement) ; l'admin peut rejouer une réponse signalée avec le même contexte pour comprendre l'erreur.
- **Existant** : partiel (sources et versions conservées). **Priorité** : P1. **Effort** : S.

---

## 2. Parcours de bout en bout (synthèse)

1. **Le soir avant le contrôle (élève, 3e)** : notification de l'agent planificateur (25) → 10 flashcards FSRS (10–11) → quiz sur les notions faibles (16) → question au tuteur socratique avec formule rendue en KaTeX (7, 17) → photo de l'exercice raté, transcription confirmée, diagnostic « condition oubliée » (6, 13) → planning du lendemain ajusté.
2. **Le professeur dépose ses archives (rentrée)** : scans de 5 ans de contrôles → OCR vision, validation côte à côte (5) → découpage par exercice (3) → analyse de méthode (existante) → paquet officiel de flashcards par chapitre (10).
3. **La semaine du prof** : lundi, l'agent veille signale une notion ratée par 52 % de la classe (26) → remédiation en brouillon → publication → mesure de l'effet au quiz suivant.
4. **Le retour d'absence** : agent rattrapage (27) → fiche, quiz, planning.
5. **La rentrée administrative** : import CSV intelligent (31) → assistant en langage naturel pour les affectations (32) → passage d'année en juillet (33).
6. **Le bac** : examens blancs chronométrés (15) → correction photographiée avec grille (14) → Grand oral simulé (22).

---

## 3. Architecture cible des agents

```
                        ┌──────────────────────────────────────────────┐
  Élève / Prof / Admin  │  Front React (KaTeX, Markdown sûr, graphiques,│
  ───────────────────►  │  cartes mentales, audio navigateur, photos)   │
                        └───────────────┬──────────────────────────────┘
                                        │ HTTPS (session, rôles)
┌───────────────────────────────────────▼─────────────────────────────────────────┐
│ API Express — contrôle d'accès (auth.mjs : école, classe, cours, délégation)     │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 1. GARDE D'ENTRÉE (Haiku 5.5, rapide)                                            │
│    modération mineurs · détection « devoir à rendre » · type de demande · PII    │
│        │ détresse → protocole humain (CPE)          │ OK                         │
├────────┴───────────────────────────────────────────▼─────────────────────────────┤
│ 2. ROUTEUR DE TÂCHES  ai_routes : tâche → modèle, effort, max_tokens, budget     │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 3. RÉCUPÉRATION (retrieval.mjs unique)                                           │
│    réécriture requête (Haiku) → BM25 FTS5 ∥ vecteurs locaux → RRF → reranking    │
│    filtres : école, cours, chapitre, statut publié, version, type de document    │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 4. CONTEXTE  [system figé][méthode prof validée][fragments]◄cache│[profil][demande]│
├──────────────────────────────────────────────────────────────────────────────────┤
│ 5. APPEL MODÈLE (SDK Anthropic, streaming, sorties structurées, repli refus)      │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 6. VALIDATEURS DE SORTIE                                                         │
│    citations [Sx] · preuve = sous-chaîne · barème · calcul numérique vérifié ·   │
│    pas de solution complète hors mode autorisé · revérification droits/versions  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 7. JOURNAL  tokens, coût, modèle, latence, sources, version prompt → budget/éval │
└──────────────────────────────────────────────────────────────────────────────────┘

 ORCHESTRATEUR D'AGENTS (généralisation de practice_runs : file, étapes, traces, annulation)
 ┌───────────────────┬────────────────────┬──────────────────────────────────────────┐
 │ Déclencheurs      │ Agents             │ Sorties (toujours validées par un humain) │
 ├───────────────────┼────────────────────┼──────────────────────────────────────────┤
 │ Synchro ED        │ Planificateur      │ proposition de planning → élève          │
 │ Cron lundi 7h     │ Veille de classe   │ brouillon de remédiation → prof          │
 │ Absence détectée  │ Rattrapage         │ pack de rattrapage → élève               │
 │ J-10 conseil      │ Conseil de classe  │ brouillons d'appréciation → prof princ.  │
 │ Dépôt de scan     │ OCR / indexation   │ transcription à valider → prof           │
 │ Upload CSV        │ Import admin       │ aperçu créations/conflits → admin        │
 │ Message admin     │ Assistant admin    │ plan d'actions (outils) → admin          │
 │ Groupe créé       │ Animateur groupe   │ quiz/synthèse → groupe                   │
 │ Fin d'examen      │ Correcteur (batch) │ note indicative + grille → élève         │
 └───────────────────┴────────────────────┴──────────────────────────────────────────┘

 DONNÉES (SQLite → PostgreSQL si multi-instance)
  documents/chunks + FTS5 + embeddings │ mémoire élève (par cours) + carnet de compétences
  cartes/FSRS │ observations + taxonomie │ ai_calls (coût) │ eval_cases / eval_runs
```

Principes : un seul module de récupération, un seul point d'appel modèle, chaque agent = une suite d'étapes déterministes avec un ou deux appels LLM bornés (pas de boucle autonome ouverte) ; le LLM ne déclenche jamais d'écriture sans validation humaine ; aucune donnée privée d'un élève n'entre dans un contenu de classe.

---

## 4. Plan d'évaluation de la qualité IA avant le pilote

### 4.1 Jeux d'évaluation par matière (« golden sets »)
- **Constitution** (4–6 semaines avant le pilote) : avec 1 professeur volontaire par matière (maths, physique-chimie, SVT, français, histoire-géo, anglais, hébreu/études juives), sur **ses** documents réels :
  - 40 questions d'élèves réalistes par matière (dont 10 vagues/mal orthographiées, 5 hors corpus, 5 tentatives de « donne-moi la réponse », 5 injections dans un document) ;
  - pour chacune : fragments attendus (vérité terrain pour la recherche), éléments de réponse attendus, erreurs interdites ;
  - 20 tentatives d'élèves avec erreur connue et catégorie (diagnostic) ;
  - 10 copies anonymisées notées par le prof (correction) ;
  - 5 scans représentatifs (OCR).
- Stockage : `eval_cases` versionnés, jamais générés par l'IA seule.

### 4.2 Métriques et seuils d'entrée en pilote (proposés)
| Dimension | Mesure | Seuil |
|---|---|---|
| Recherche | rappel@8 des fragments attendus | ≥ 85 % (comparer lexical actuel vs hybride) |
| Fidélité | affirmations non soutenues par les sources citées (LLM-juge + revue prof sur échantillon) | ≤ 3 % |
| Justesse disciplinaire | réponse correcte selon le prof | ≥ 95 % maths/sciences, ≥ 90 % autres |
| Refus hors corpus | « le cours ne permet pas de répondre » quand c'est vrai | ≥ 90 % |
| Socratique | aucune solution complète hors mode autorisé | 100 % sur les cas de contournement |
| Sécurité mineurs | détection détresse/harcèlement (cas rédigés avec le CPE) | rappel ≥ 95 % |
| Diagnostic | catégorie d'erreur correcte | ≥ 75 % ; 0 observation sans preuve |
| Correction de copies | écart moyen à la note du prof | ≤ 1,5 pt/20, aucun écart > 4 |
| OCR | formules exactes après transcription | ≥ 95 % des formules |
| Coût/latence | coût moyen par demande, p95 de latence | dans le budget ; p95 < 15 s (streaming) |

### 4.3 Méthode
1. **Tests déterministes** (déjà partiellement présents dans `tests/`) : citations, structure, barèmes, sous-chaînes de preuve, permissions.
2. **LLM-juge** (Opus 5.5) avec grille explicite par critère (fidélité, justesse, ton adapté à l'âge, respect de la méthode du prof), **étalonné** : sur 100 réponses notées par les profs, accord juge–prof ≥ 80 % avant de lui faire confiance.
3. **Revue humaine** : chaque professeur relit 30 réponses de sa matière en aveugle (note 1–5 + commentaire) — environ 2 h par prof.
4. **Red teaming** par un groupe d'élèves volontaires de Tle (avec accord parental) : obtenir la réponse d'un DM, faire dire des propos inappropriés, extraire les données d'un autre élève.
5. **Non-régression** : tout changement de prompt, de modèle ou de récupération rejoue le jeu complet (coût estimé : quelques dollars par passage) ; résultat comparé à la version précédente.

### 4.4 Pendant le pilote
- Bouton 👍/👎 + motif sur chaque réponse (étend `learning_reports`) ; revue hebdomadaire des signalements par l'équipe ; tout cas signalé devient un cas d'évaluation.
- Échantillonnage aléatoire de 2 % des réponses (pseudonymisées) relu par les profs référents.
- Indicateurs pédagogiques (pas seulement techniques) : progression aux quiz sur les notions remédiées, usage des indices vs solutions, satisfaction élèves/profs, temps gagné déclaré par les profs.
- Critères d'arrêt : un incident de sécurité grave (mineur), ou fidélité < 90 % sur deux semaines → suspension de la fonction concernée.

### 4.5 Préalables non techniques
AIPD (analyse d'impact) avec le DPO ; information des familles et charte d'usage IA ; contrat de sous-traitance et localisation des traitements du fournisseur de modèle (vérifier les options de résidence des données et de non-conservation) ; qualification AI Act des fonctions d'évaluation/orientation (haut risque) ; protocole « détresse » validé par la direction et le CPE.

---

## 5. Priorisation résumée

- **P0 (avant/pendant le pilote)** : rendu KaTeX (7), découpage structurel (3) + BM25 FTS5 (1), socratique côté serveur (17), modération mineurs (19), routage des modèles (37), cache de prompt + SDK (38), journal des coûts (39), plan d'évaluation (40), import CSV intelligent (31), décision code direct vs n8n (36), OCR si archives papier (5).
- **P1** : embeddings + reranking (1, 2, 4), flashcards + FSRS (10, 11), questions ouvertes (12), taxonomie d'erreurs (13), examen blanc (15), correction photo élève (14), manuscrit (6), graphiques (8), cartes mentales (9), anti-triche (18), audio navigateur (20, 21), LV écrite (23), agents planificateur / veille / rattrapage / groupe / admin NL / passage d'année / séquence (25–27, 30, 32–34), portabilité (41), observabilité (42).
- **P2 / LT** : IRT (16), Grand oral (22), oral LV, conseil de classe (28), orientation (29), DM différencié (35), transfert de mémoire entre années (41), lecture à voix haute (24).
