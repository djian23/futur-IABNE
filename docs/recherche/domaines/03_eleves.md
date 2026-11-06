# 03 — L'élève au quotidien et sur l'année : cas d'usage en profondeur

> Périmètre : expérience élève (collège 6e-3e et lycée 2nde-Tle) à Yabné Paris, élèves mineurs.
> Base de comparaison : cahier des charges V3, ajouts de l'équipe, code du dépôt `futur-IABNE` au 6 novembre 2026 (lecture seule, rien n'a été modifié).
> Légende — **Existant** : Oui / Partiel / Non (+ fichier). **Priorité** : P0 (à faire avant/pendant le pilote), P1 (année 1), P2 (année 2), LT (long terme). **Effort** : S (< 1 semaine), M (1-4 semaines), L (> 1 mois ou dépendance externe).

---

## 0. Ce que l'existant couvre déjà (côté élève)

| Brique | Où dans le code | Ce qu'elle fait | Limite pour les cas ci-dessous |
| --- | --- | --- | --- |
| Assistant RAG par cours | `server/learning.mjs` (`infer`, `corpus`, prompt système l.317) | Réponses citées [S#], abstention, vocabulaire du prof, pas d'Internet | Recherche lexicale, texte seul (pas d'image, pas d'audio, pas de formules rendues) |
| Tuteur personnel | `server/tutor.mjs`, `src/PersonalTutor.jsx` | Profil par notion, erreurs déclarées, exercices suivis, tentatives, observations avec preuve citée, objectif/style, suspension/réinitialisation | Pas de diagnostic d'erreur typé, pas de vue transversale multi-matières |
| Aide progressive | `tutor.mjs` + `learning.mjs` l.499 (`helpMode` hint/method/check/solution) | 4 niveaux d'aide | Le mode `solution` est accessible sans tentative préalable ni palier : faille anti-triche |
| Révisions espacées | `tutor.mjs` `topicProfile` (intervalles 1/3/7 jours) | « À revoir », date de rappel par notion | Pas de cartes mémoire, pas d'algorithme type SM-2/FSRS, pas de notification |
| Quiz adaptatifs | `learning.mjs` `registerQuizzes` | 5 QCM, correction serveur, difficulté selon les 3 derniers quiz | QCM uniquement (pas de réponse ouverte, calcul, rédaction) |
| Générations | `ai-recipes.mjs`, `learning.mjs` | Fiche, quiz PDF, programme de révision, guide de méthode | Pas de fiche « adaptée DYS », pas de carte mentale, pas d'audio |
| Agent d'entraînement | `server/practice-agent.mjs`, `src/PracticeAgent.jsx` | Exercice/sujet avec durée, barème, indices, corrigé séparé, PDF | Durée indicative : pas de mode examen chronométré ni de rendu de copie |
| Planificateur | `learning.mjs` l.1334-1600 | Disponibilités, tâches, difficulté perçue, plafond quotidien, travail non plaçable signalé | Pas de replanification après imprévu, pas de calendrier juif (Chabbat/fêtes) |
| Chronomètre | `tutor.mjs` (`study/start`, heartbeat) | Temps réel déclaré, distinct du prévu | Pas de bilan hebdo, pas de séries |
| École Directe | `server/ecoledirecte*.mjs`, `src/ImportedAgenda.jsx` | Emploi du temps + cahier de textes | Pas de notes, absences, bulletins, pièces jointes |

**Absents** : OCR/photo de copie, audio (TTS/STT), mode hors connexion (PWA), accessibilité DYS/TDAH, bien-être, examens nationaux (brevet, EAF, grand oral), orientation, cartes mémoire, rôle parent, rendu LaTeX/schémas.

---

## A. Le soir à la maison

### 1. Bloqué à 21 h sur un exercice de maths
- **Persona / scénario** : Noa, 4e, exercice de Pythagore réciproque dans le cahier de textes. Elle a écrit trois lignes, ne sait pas conclure. Parents pas disponibles, pas de professeur particulier.
- **Fonctionnalité** : « Je suis bloqué » depuis le devoir importé → le tuteur demande l'énoncé (photo ou saisie) et la tentative, puis applique une **échelle d'aide graduée obligatoire** : (1) question de relance socratique, (2) indice ciblé, (3) méthode du prof (guide validé), (4) vérification de la tentative, (5) correction expliquée **uniquement sur un exercice analogue**, jamais sur l'exercice noté.
- **Valeur** : l'élève progresse sans recopier ; la méthode et les notations du professeur sont respectées (« on écrit *d'après la réciproque du théorème de Pythagore* »).
- **Risques** : l'élève saute à la solution ; erreur de calcul de l'IA ; énoncé d'un devoir noté. Garde-fous : palier minimal avant `solution`, « exercice jumeau » au lieu du corrigé, vérification symbolique côté serveur (calcul formel) pour les maths, rappel « réponse non validée par le professeur ».
- **Existant** : **Partiel** — `helpMode` (tutor.mjs, learning.mjs l.499), bouton « Préparer avec mon tuteur » (PersonalTutor.jsx). Pas de paliers imposés, pas d'exercice jumeau.
- **Priorité** : P0 — **Effort** : M

### 2. Devoir maison (DM) noté : l'IA ne doit pas le faire
- **Persona / scénario** : Ethan, 1re spé maths, DM noté à rendre vendredi. Il colle l'énoncé entier et écrit « fais-le ».
- **Fonctionnalité** : **Statut « devoir évalué »** posé par le professeur (ou détecté via École Directe « à rendre / noté ») → le tuteur bascule en mode *coach* : reformule la consigne, rappelle le cours, propose un exercice parallèle, vérifie des étapes rédigées par l'élève, mais refuse de produire la rédaction. Le professeur peut choisir le niveau d'aide autorisé par devoir (aucune / indices / méthode / vérification).
- **Valeur** : rend l'IA acceptable pour les enseignants ; aligne sur la valeur n° 1 du cahier des charges (« guide, ne fait pas à sa place »).
- **Risques** : contournement (reformuler l'énoncé, le découper) ; frustration. Garde-fous : détection de similarité avec les énoncés de devoirs publiés, mode coach transparent (« ton prof a choisi ce niveau d'aide »), aucune délation automatique.
- **Existant** : **Non** (le prompt système dit « guide sans faire les devoirs », learning.mjs l.317, mais aucune règle par devoir).
- **Priorité** : P0 — **Effort** : M

### 3. « Explique-moi comme si… »
- **Persona / scénario** : Sarah, 2nde, ne comprend pas la notion de mole en physique-chimie. L'explication du cours est trop abstraite.
- **Fonctionnalité** : sélecteur de registre : « comme si j'avais 10 ans », « avec une analogie de la vie quotidienne », « en 3 phrases », « avec un exemple chiffré », « en schéma », « comme mon prof l'a dit ». L'IA garde toujours une ligne « Dans le cours de M. X : … [S2] » pour relier l'analogie au vocabulaire officiel.
- **Valeur** : différenciation à la demande ; déblocage rapide.
- **Risques** : analogie fausse ou simplification trompeuse ; dérive hors corpus. Garde-fous : marquer l'analogie comme « image pour comprendre, pas définition », obligation de revenir à la définition sourcée, question de vérification finale.
- **Existant** : **Partiel** — préférence `style` (étapes/concision/exemples) dans le profil tuteur (tutor.mjs, PersonalTutor.jsx « Ma façon préférée d'apprendre »). Pas de sélecteur par question.
- **Priorité** : P1 — **Effort** : S

### 4. Comprendre la consigne avant de commencer
- **Persona / scénario** : Yonathan, 6e, lit « Justifie ta réponse » et ne sait pas ce qu'on attend.
- **Fonctionnalité** : bouton « Décoder la consigne » : surligne les verbes de consigne (justifier, démontrer, analyser, commenter), explique ce qu'ils attendent **chez ce professeur** (méthode validée), propose une checklist de réussite avant que l'élève ne commence.
- **Valeur** : compétence transversale, très utile au collège et pour les élèves allophones/DYS.
- **Risques** : faible ; risque de réponse implicite dans l'explication. Garde-fou : ne jamais traiter la question, seulement la consigne.
- **Existant** : **Non** (méthode prof disponible via teacher-tutor.mjs, réutilisable).
- **Priorité** : P1 — **Effort** : S

### 5. Le soir : « Qu'est-ce que je fais maintenant ? »
- **Persona / scénario** : Léa, 3e, rentre à 18 h, a 4 devoirs et un contrôle jeudi ; elle ne sait pas par où commencer et procrastine.
- **Fonctionnalité** : écran d'accueil **« Ce soir »** : 3 tâches maximum, ordonnées (échéance, durée estimée, difficulté perçue, notions « à revoir »), avec bouton « Commencer » qui lance le chronomètre et ouvre le bon outil (tuteur, quiz, fiche). Bouton « Je n'ai que 20 min ».
- **Valeur** : réduit la charge cognitive d'organisation ; transforme le planning en action.
- **Risques** : sur-prescription, culpabilisation. Garde-fous : ton neutre, l'élève peut réordonner, pas de compteur de retard rouge.
- **Existant** : **Partiel** — planificateur (learning.mjs), « Mes prochaines étapes » et devoirs dans PersonalTutor.jsx, chronomètre. Pas de vue agrégée multi-matières « ce soir ».
- **Priorité** : P0 — **Effort** : M

### 6. Imprévu : replanifier sa semaine
- **Persona / scénario** : Gabriel, Tle, malade mardi soir ; ses sessions de révision sautent. Le planning reste figé.
- **Fonctionnalité** : « J'ai raté une session » / « je suis indisponible ce soir » → replanification automatique des sessions restantes avec visualisation de ce qui glisse et alerte si une échéance devient intenable (« il manque 1 h 30 avant le contrôle de SES : réduire, demander un délai, ou accepter »).
- **Valeur** : un planning qui ne s'adapte pas est abandonné en deux semaines.
- **Risques** : surcharge des jours suivants. Garde-fou : respect des plafonds quotidiens existants, proposition de priorisation plutôt que bourrage.
- **Existant** : **Partiel** — génération et plafonds (learning.mjs `/api/planner/generate`), signalement du travail non plaçable. Pas de notion de session manquée ni de replanification incrémentale.
- **Priorité** : P1 — **Effort** : M

### 7. Calendrier juif dans le planning (spécifique Yabné)
- **Persona / scénario** : Déborah, 1re, famille pratiquante : pas d'écran du vendredi soir au samedi soir, ni pendant Pessah, Chavouot, Soukkot. Le planner lui place une révision samedi matin.
- **Fonctionnalité** : profil « Chabbat et fêtes » (optionnel, réglé par l'élève/la famille) : blocage automatique des créneaux selon les horaires de Paris (entrée/sortie de Chabbat), jours de yom tov, **aucune notification** pendant ces périodes, avertissement avant une longue période de fêtes (« 3 jours sans révision avant le contrôle de lundi : avance 2 sessions »).
- **Valeur** : différenciation forte et respectueuse de l'identité de l'établissement ; évite des plannings irréalistes.
- **Risques** : donnée sensible (pratique religieuse = donnée de catégorie particulière RGPD). Garde-fous : réglage local, non partagé, formulé « jours sans travail récurrents », jamais exploité statistiquement.
- **Existant** : **Non** (disponibilités/indisponibilités manuelles seulement).
- **Priorité** : P1 — **Effort** : S (table de dates + règles)

### 8. Recherche « où le prof a parlé de ça ? »
- **Persona / scénario** : Avi, 5e, se souvient vaguement d'une règle d'accord du participe passé vue « il y a un mois ».
- **Fonctionnalité** : recherche en langage naturel dans tous ses cours, résultats regroupés par matière/chapitre, avec ouverture au passage exact et bouton « explique-moi ce passage ».
- **Valeur** : retrouve vite, évite d'aller chercher sur Internet des règles qui ne collent pas au cours.
- **Risques** : recherche lexicale qui rate les synonymes. Garde-fou : embeddings plus tard, indication « rien trouvé dans tes cours ».
- **Existant** : **Partiel** — recherche par mot-clé dans les cours (documents.mjs) ; la recherche est lexicale (FEATURES.md).
- **Priorité** : P1 — **Effort** : M (embeddings)

---

## B. Contrôles, examens et oraux

### 9. La veille d'un contrôle
- **Persona / scénario** : Tom, 2nde, contrôle d'histoire demain sur la Révolution, il a 1 h ce soir.
- **Fonctionnalité** : **Mode « Veille de contrôle »** détecté depuis le cahier de textes : diagnostic express (5 questions sur le chapitre), puis plan 60 min généré (20 min sur les 2 notions les plus faibles, 15 min de fiche, 15 min de sujet type, 10 min de rappel des pièges), et message de fin « va dormir » (le sommeil consolide).
- **Valeur** : maximise une heure contrainte ; message pédagogique sur le sommeil.
- **Risques** : bachotage valorisé au détriment de l'étalement. Garde-fou : bilan après coup « la prochaine fois, commencer J-5 » + proposition d'anticiper.
- **Existant** : **Partiel** — quiz, fiche, sujet (learning.mjs, practice-agent.mjs), devoirs datés. Pas d'orchestration « veille ».
- **Priorité** : P0 — **Effort** : S (orchestration de briques existantes)

### 10. Examen blanc chronométré en conditions réelles
- **Persona / scénario** : Rachel, 3e, veut s'entraîner au sujet de sciences du brevet (1 h) sans regarder le corrigé.
- **Fonctionnalité** : **mode examen** : sujet généré ou ancien sujet publié, compte à rebours plein écran, tuteur et cours désactivés pendant l'épreuve, rendu par saisie ou photo de copie, puis correction (cas 22) et analyse du temps passé par exercice.
- **Valeur** : gestion du temps et du stress, apprentissage de l'autonomie.
- **Risques** : note indicative prise pour une vraie note ; reprise de la fenêtre pour tricher (sans enjeu, mais fausse le diagnostic). Garde-fou : libellé « note indicative d'entraînement ».
- **Existant** : **Partiel** — `practice-agent.mjs` gère `durationMinutes` et barème, corrigé séparé ; pas de minuteur, pas de verrouillage, pas de rendu.
- **Priorité** : P1 — **Effort** : M

### 11. Brevet (3e) : écrits et oral
- **Persona / scénario** : promotion de 3e, brevet en juin ; oral de soutenance (projet d'EPI, parcours avenir, histoire des arts ou citoyen).
- **Fonctionnalité** : **Parcours Brevet** : calendrier rétro-planifié depuis la date nationale, banque d'anciens sujets publiés par les profs, épreuve de français (dictée, réécriture, rédaction), maths (automatismes), sciences, histoire-géo-EMC ; module oral : choix du sujet, plan, entraînement chronométré 5 min + 10 min d'entretien simulé, grille d'évaluation officielle.
- **Valeur** : événement structurant de l'année de 3e, forte attente des familles.
- **Risques** : sujets nationaux hors corpus (droits, fiabilité). Garde-fou : uniquement les sujets déposés par les profs ; l'IA ne garantit pas la conformité au programme.
- **Existant** : **Non** (briques réutilisables : practice-agent, quiz).
- **Priorité** : P1 — **Effort** : L

### 12. Bac de français (EAF, 1re) : commentaire, dissertation et oral
- **Persona / scénario** : Inès, 1re générale, oral de l'EAF : explication linéaire d'un des textes de sa liste + présentation d'une œuvre et entretien.
- **Fonctionnalité** : **liste de textes de la classe** (déposée par le prof) ; pour chaque texte : rappel du mouvement, plan d'explication linéaire guidé (l'élève propose, l'IA questionne), entraînement oral enregistré (cas 30), question de grammaire tirée au sort, entretien simulé sur l'œuvre choisie ; à l'écrit : construction de problématique et de plan de dissertation/commentaire à partir de la méthode du prof.
- **Valeur** : épreuve à fort coefficient, très méthodologique, pour laquelle les élèves manquent d'entraînement oral.
- **Risques** : l'IA rédige les explications linéaires que l'élève apprend par cœur (récitation repérée par le jury). Garde-fou : l'IA ne produit jamais une explication complète, uniquement des questions et des retours sur le travail de l'élève.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : L

### 13. Grand oral (Terminale)
- **Persona / scénario** : David, Tle spé SES/HGGSP : deux questions à préparer, 20 min (5 min d'exposé, 10 min d'échange, 5 min sur le projet d'orientation).
- **Fonctionnalité** : atelier en 4 étapes : (1) affiner la question (problématisation), (2) structurer l'exposé, (3) **répétition orale chronométrée** avec retours sur le débit, les tics de langage et la structure (transcription STT), (4) **jury simulé** qui pose des questions de relance à partir du contenu de l'exposé et du programme de spécialité.
- **Valeur** : l'oral est la compétence la moins entraînée ; l'outil peut répéter sans limite.
- **Risques** : l'IA écrit l'exposé ; évaluation de la voix stigmatisante (accent, bégaiement). Garde-fous : retours sur la structure et le contenu, pas sur la voix ; enregistrements conservés localement et supprimables.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : L

### 14. Épreuve anticipée de mathématiques (1re) et automatismes
- **Persona / scénario** : élèves de 1re concernés par l'épreuve anticipée de maths (partie automatismes en QCM sans calculatrice).
- **Fonctionnalité** : « 10 automatismes par jour » : séries courtes chronométrées (fractions, pourcentages, puissances, lecture graphique), progression mesurée, rappel espacé des automatismes ratés.
- **Valeur** : la régularité courte est la seule méthode efficace pour les automatismes.
- **Risques** : erreurs de l'IA dans les calculs. Garde-fou : générateurs paramétriques déterministes (pas de LLM) pour le calcul, LLM seulement pour l'explication.
- **Existant** : **Partiel** — quiz QCM (learning.mjs), mais générés par LLM et limités à 5.
- **Priorité** : P1 — **Effort** : M

### 15. Oraux de langues vivantes (bac, contrôle continu)
- **Persona / scénario** : Maya, 2nde, oral d'anglais sur l'axe « Identités et échanges » ; elle n'ose pas parler en classe.
- **Fonctionnalité** : **partenaire de conversation** vocal ou écrit, sur les axes/thèmes du cours, niveau CECRL réglé (A2-B2), corrections différées (pas d'interruption), lexique du chapitre réinvesti, compte rendu final : 3 erreurs récurrentes, 5 mots nouveaux.
- **Valeur** : temps de parole individuel multiplié ; baisse de l'anxiété.
- **Risques** : conversation hors sujet ou inappropriée ; mineurs et voix (donnée biométrique si identification). Garde-fous : thèmes bornés par le cours, pas de persona « ami », pas de stockage de la voix brute au-delà de la séance.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : M (texte) / L (voix)

### 16. Anciens contrôles du prof et « ce qui tombe »
- **Persona / scénario** : Nathan, 4e, veut savoir quel type d'exercice fait habituellement Mme Y en contrôle.
- **Fonctionnalité** : fiche « Le style de mes contrôles » par cours : types d'exercices récurrents, barème habituel, durée, erreurs souvent pénalisées (si présentes dans les corrigés), lien vers les anciens sujets publiés.
- **Valeur** : transparence des attentes (critère de réussite explicite), réduit l'injustice entre élèves qui ont des grands frères et les autres.
- **Risques** : « prédiction » du contrôle → bachotage ; prof gêné. Garde-fou : visible seulement si le prof l'active, formulé comme « style habituel », jamais « questions probables ».
- **Existant** : **Partiel** — analyse des méthodes et des anciens contrôles côté prof (teacher-tutor.mjs) ; non exposée à l'élève.
- **Priorité** : P2 — **Effort** : S

### 17. Après le contrôle : analyser sa copie rendue
- **Persona / scénario** : Chloé, 3e, a eu 9/20 en physique ; la copie annotée est rendue, elle ne comprend pas ses erreurs.
- **Fonctionnalité** : photo de la copie corrigée → extraction des annotations et des points perdus, classement des erreurs (connaissance, méthode, rédaction, inattention, temps), création automatique d'entrées « à revoir » dans le tuteur, exercice de remédiation pour chacune, et **« ce que je ferai différemment »** rédigé par l'élève.
- **Valeur** : boucle de feedback complète ; le contrôle devient une ressource d'apprentissage.
- **Risques** : OCR manuscrit peu fiable ; la note officielle n'est pas modifiée. Garde-fou : l'élève valide chaque erreur extraite avant enregistrement.
- **Existant** : **Partiel** — erreurs déclarées manuellement (`POST /api/tutor/mistakes`). Pas d'OCR.
- **Priorité** : P1 — **Effort** : L (OCR)

---

## C. Mémoriser sur la durée

### 18. Cartes mémoire générées depuis le cours
- **Persona / scénario** : Ilan, 5e, doit connaître le vocabulaire de SVT et les dates du chapitre sur les croisades.
- **Fonctionnalité** : génération de **cartes question/réponse** sourcées depuis un chapitre (définitions, dates, formules, vocabulaire de langue), modifiables par l'élève, révision en mode « je savais / hésitant / raté », algorithme de répétition espacée (FSRS ou SM-2), file quotidienne de 5 à 10 min.
- **Valeur** : la répétition espacée et le rappel actif sont parmi les méthodes les mieux validées par la recherche ; colle exactement au vocabulaire du prof (contrairement à Quizlet).
- **Risques** : cartes trop atomisées (savoir sans comprendre). Garde-fou : mélanger cartes « rappel » et cartes « pourquoi », lien vers le passage du cours.
- **Existant** : **Partiel** — intervalles 1/3/7 jours par notion (tutor.mjs `topicProfile`). Pas d'objet « carte ».
- **Priorité** : P0 — **Effort** : M

### 19. Courbe d'oubli visible et rappel au bon moment
- **Persona / scénario** : Esther, 1re, a révisé le chapitre des suites il y a 3 semaines ; elle pense le savoir.
- **Fonctionnalité** : jauge de « fraîcheur » par chapitre (dernière révision, résultats, intervalle), rappel dans l'écran « Ce soir » : « 3 questions sur les suites (2 min) », intégration automatique au planning avant un contrôle cumulatif.
- **Valeur** : rend visible un phénomène que les élèves sous-estiment.
- **Risques** : notifications envahissantes. Garde-fou : regroupement quotidien, réglage du volume, aucune notification après 21 h ni pendant Chabbat.
- **Existant** : **Partiel** — `reviewAt` et « À revoir » (tutor.mjs l.354-368).
- **Priorité** : P1 — **Effort** : S

### 20. Révision cumulative avant les examens de fin de trimestre/année
- **Persona / scénario** : élèves de 2nde avant les « bacs blancs » ou les examens de fin d'année.
- **Fonctionnalité** : quiz « interleaving » mélangeant plusieurs chapitres et matières, pondéré par les notions faibles et anciennes.
- **Valeur** : la pratique entrelacée améliore le transfert.
- **Risques** : découragement si trop difficile. Garde-fou : démarrage par les notions maîtrisées.
- **Existant** : **Non** (quiz par cours/chapitre uniquement).
- **Priorité** : P2 — **Effort** : S

### 21. Mémoriser un texte, une récitation, une poésie
- **Persona / scénario** : Shira, 6e, poésie à réciter lundi ; ou élève de 3e qui apprend une citation pour le brevet.
- **Fonctionnalité** : mode « effacement progressif » (mots masqués de plus en plus), écoute audio, récitation enregistrée comparée au texte (STT) avec repérage des oublis.
- **Valeur** : outil simple, très utilisé au collège, mobile.
- **Risques** : faible. Garde-fou : enregistrement non conservé.
- **Existant** : **Non**.
- **Priorité** : P2 — **Effort** : S (texte) / M (voix)

---

## D. Diagnostic, correction et compréhension des erreurs

### 22. Correction d'une copie photographiée avec note indicative
- **Persona / scénario** : Raphaël, Tle, fait un sujet type bac de physique sur papier (comme à l'examen), le photographie.
- **Fonctionnalité** : OCR (manuscrit + formules) → alignement sur le barème du sujet généré ou de l'ancien contrôle → note indicative **par question** avec justification, points de rédaction manquants (selon la méthode du prof), et 2 axes de progrès. Fourchette plutôt que note unique (« entre 11 et 13/20 »).
- **Valeur** : la correction est le maillon manquant de l'entraînement autonome ; permet d'écrire à la main, condition réelle de l'examen.
- **Risques** : erreurs d'OCR, notation incohérente, confusion avec une note officielle, comparaison entre élèves. Garde-fous : afficher la transcription à valider par l'élève avant correction, fourchette, mention « indicative », jamais transmise au prof sans action de l'élève, jamais versée dans École Directe.
- **Existant** : **Non** (FEATURES.md : « Pas d'OCR intégré » ; barèmes vérifiés dans practice-agent.mjs).
- **Priorité** : P1 — **Effort** : L — *identifié « reste à faire » par l'équipe*

### 23. Diagnostic des erreurs de raisonnement
- **Persona / scénario** : Jonas, 4e, se trompe toujours sur les équations : il « passe de l'autre côté » sans changer le signe.
- **Fonctionnalité** : typologie d'erreurs par matière (maths : signe, priorité opératoire, confusion aire/périmètre, réciproque/directe ; français : accord, temps ; physique : unités, conversion ; histoire : anachronisme, confusion cause/conséquence), détection à partir des tentatives, **hypothèse explicite présentée à l'élève** (« Il semble que… ; est-ce que c'est ça ? »), exercice ciblé pour confirmer/infirmer, suivi dans le temps.
- **Valeur** : passer de « tu t'es trompé » à « voici le mécanisme de ton erreur » ; base de la remédiation.
- **Risques** : étiquetage (« tu es nul en signes ») ; faux diagnostic. Garde-fous : hypothèses, jamais diagnostic ; durée de vie limitée ; preuve citée dans la tentative (déjà imposée par le code).
- **Existant** : **Partiel** — observations avec preuve exacte dans la tentative, confirmables (tutor.mjs `decodeTutorAnswer`, `recordTutorObservations`). Pas de typologie ni d'exercice de confirmation.
- **Priorité** : P1 — **Effort** : M — *identifié « reste à faire »*

### 24. Questions à réponse ouverte et calcul (au-delà du QCM)
- **Persona / scénario** : Mila, 3e : les QCM ne la préparent pas aux questions de rédaction.
- **Fonctionnalité** : quiz mixtes : réponse courte, valeur numérique avec tolérance et unité, phrase à justifier évaluée par grille, remise en ordre (étapes d'une démonstration, chronologie).
- **Valeur** : le QCM favorise la reconnaissance, pas le rappel ni la rédaction.
- **Risques** : correction automatique des réponses libres imparfaite. Garde-fou : correction déterministe quand possible, LLM avec grille sinon, droit de contester (« je pense avoir raison » → explication).
- **Existant** : **Non** (QCM 4 choix uniquement, learning.mjs l.1175).
- **Priorité** : P1 — **Effort** : M

### 25. Auto-évaluation avant/après et calibration
- **Persona / scénario** : Benjamin, 2nde, se sent toujours « prêt » et obtient 8/20.
- **Fonctionnalité** : avant chaque quiz/sujet : « Combien penses-tu avoir ? » ; après : écart affiché ; tendance de calibration (« tu te surestimes en SVT, tu te sous-estimes en anglais ») ; grille de compétences du chapitre en « je sais / je crois savoir / je ne sais pas » croisée avec les résultats.
- **Valeur** : métacognition, compétence forte prédictrice de réussite.
- **Risques** : atteinte à l'estime de soi. Garde-fou : formulation bienveillante, privé.
- **Existant** : **Non** (retours « compris/encore difficile » sur exercices seulement).
- **Priorité** : P2 — **Effort** : S

---

## E. Élèves à besoins particuliers (PAP, PPS, PAI, allophones, HPI)

### 26. Élève DYS (dyslexie, dysorthographie)
- **Persona / scénario** : Samuel, 5e, dyslexique avec PAP : police adaptée, textes aérés, lecture audio.
- **Fonctionnalité** : profil d'affichage : police lisible (OpenDyslexic/Luciole), interligne, colonnes courtes, surlignage alterné des lignes, **lecture à voix haute** de toute réponse IA et de tout document (TTS), fiches de révision version « allégée » (phrases courtes, pictogrammes, mots-clés en gras), consignes reformulées, dictée vocale pour répondre.
- **Valeur** : met en œuvre concrètement les aménagements du PAP à la maison ; équité.
- **Risques** : donnée de santé (le PAP est sensible). Garde-fous : réglage d'affichage par l'élève sans saisir le diagnostic ; si le prof doit le savoir, ça passe par l'établissement, pas par IABNE.
- **Existant** : **Non** (FEATURES.md : « accessibilité complète reste à auditer »).
- **Priorité** : P0 (affichage + TTS) — **Effort** : M

### 27. Dyscalculie et dyspraxie
- **Persona / scénario** : Lior, 6e, dyspraxique, écrit lentement, mal à poser les opérations et tracer des figures.
- **Fonctionnalité** : saisie mathématique assistée (clavier de symboles, dictée de formules), exercices de géométrie avec figures générées (pas à tracer), réduction du volume d'exercices à objectif égal, temps majoré dans les examens blancs (tiers-temps paramétrable).
- **Valeur** : retire l'obstacle moteur pour évaluer la compréhension.
- **Risques** : sur-aide. Garde-fou : réglages validés avec le référent handicap si besoin.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : M

### 28. TDAH : sessions courtes et maintien de l'attention
- **Persona / scénario** : Eliott, 4e, TDAH, décroche après 10 min, oublie ce qu'il devait faire.
- **Fonctionnalité** : mode « sessions courtes » (type Pomodoro 10/3), une seule consigne à l'écran, découpage d'un devoir en micro-étapes cochables, rappel « où j'en étais » au retour, réduction des distractions (pas de suggestions latérales), récompense immédiate (progression visible).
- **Valeur** : rend le travail autonome possible.
- **Risques** : gamification addictive. Garde-fou : pas de récompenses aléatoires, pas de classement.
- **Existant** : **Partiel** — chronomètre avec heartbeat (tutor.mjs) ; pas de découpage ni de mode court.
- **Priorité** : P1 — **Effort** : S

### 29. Élève allophone ou nouvel arrivant (UPE2A, olim)
- **Persona / scénario** : Yael, arrivée d'Israël en 4e, parle hébreu et anglais, français A2 ; ou élève arrivé des États-Unis.
- **Fonctionnalité** : **glossaire bilingue du chapitre** (hébreu/anglais ↔ français), explication dans la langue de l'élève puis reformulation en français simple, aide à la lecture de consigne, objectif explicite de passage progressif au français (le pourcentage de langue maternelle diminue).
- **Valeur** : très pertinent pour Yabné (familles franco-israéliennes, alyah/retours) ; accélère l'intégration scolaire.
- **Risques** : dépendance à la traduction ; traductions de termes techniques fausses ; écriture hébraïque de droite à gauche mal rendue. Garde-fous : termes clés toujours affichés en français, support RTL testé.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : M

### 30. Explication orale et dictée vocale
- **Persona / scénario** : tout élève dans le bus ou à qui l'écrit coûte (DYS, fatigue) : « explique-moi à l'oral ».
- **Fonctionnalité** : lecture audio des réponses, fiches en version **audio courte (podcast de 3 min)**, dictée vocale des questions et tentatives, vitesse réglable.
- **Valeur** : nouveaux moments de révision (trajets), accessibilité.
- **Risques** : coût fournisseur ; voix de mineurs envoyées à un tiers. Garde-fous : TTS/STT navigateur (Web Speech) quand possible, sinon fournisseur européen encadré, pas de conservation de l'audio.
- **Existant** : **Non** (USAGES_IA.md : « l'audio n'est pas implémenté »).
- **Priorité** : P1 — **Effort** : M

### 31. Élève à haut potentiel ou en avance
- **Persona / scénario** : Ariel, 5e, finit tout en 10 min, s'ennuie, devient perturbateur.
- **Fonctionnalité** : « Aller plus loin » sur chaque chapitre : problèmes ouverts, défis de transfert, liens entre matières, lecture complémentaire **proposée par le prof** ; quiz niveau « hard » déjà présent ; possibilité de préparer des concours (Kangourou, olympiades) si le prof dépose les ressources.
- **Valeur** : différenciation par le haut, souvent oubliée.
- **Risques** : dérive hors programme non validée. Garde-fou : contenus d'approfondissement issus du corpus ou marqués « hors cours ».
- **Existant** : **Partiel** — difficulté « hard » (learning.mjs), recette de différenciation côté prof (ai-recipes.mjs `differentiation`).
- **Priorité** : P2 — **Effort** : S

### 32. Élève en situation de handicap (PPS) ou absence longue (PAI, hospitalisation)
- **Persona / scénario** : Hannah, 2nde, malvoyante (PPS) ; ou élève hospitalisé 3 semaines.
- **Fonctionnalité** : compatibilité lecteur d'écran (ARIA, contraste, zoom 200 %), descriptions textuelles des schémas générées et validées, navigation clavier ; pour l'absence longue, voir cas 33.
- **Valeur** : obligation légale d'accessibilité (RGAA) et d'inclusion.
- **Risques** : descriptions d'images erronées. Garde-fou : description validée par le prof pour les documents clés.
- **Existant** : **Partiel** — formulaires étiquetés, `aria-label` (PersonalTutor.jsx) ; audit non fait.
- **Priorité** : P0 (audit RGAA) — **Effort** : M

---

## F. Absence, organisation, motivation, bien-être

### 33. Retour d'absence : rattraper un cours manqué
- **Persona / scénario** : Mickaël, 3e, absent 4 jours (grippe). Il ne sait pas ce qui a été fait, demande les cours à des camarades.
- **Fonctionnalité** : **« J'ai été absent du … au … »** → récapitulatif automatique par matière : séances manquées (cahier de textes École Directe : contenu de séance), documents publiés pendant la période, devoirs donnés, contrôles annoncés ; pour chaque séance : résumé de 5 lignes, notions essentielles, mini-quiz de vérification, et liste « questions à poser à mon prof ». Plan de rattrapage inséré dans le planning (sans écraser l'existant).
- **Valeur** : très forte, concrète, fréquente ; réduit le décrochage après absence (y compris fêtes juives, absences pour raisons religieuses ou familiales).
- **Risques** : résumé incomplet si le prof n'a pas déposé le support ; l'élève croit tout savoir. Garde-fous : afficher explicitement « séance sans support déposé : demande à ton professeur », quiz de vérification obligatoire.
- **Existant** : **Partiel** — cahier de textes avec contenus de séance importés (ecoledirecte.mjs, ImportedAgenda.jsx), documents par chapitre, planificateur. Aucune orchestration « absence ».
- **Priorité** : P0 — **Effort** : M

### 34. Bilan hebdomadaire de l'élève
- **Persona / scénario** : dimanche soir, Jessica, 2nde, veut savoir si sa semaine était bonne.
- **Fonctionnalité** : bilan privé : temps de travail réel vs prévu, notions consolidées, notions à revoir, devoirs faits/en retard, suggestion pour la semaine (2 objectifs). Partage optionnel au prof principal ou aux parents (décision de l'élève, selon l'âge).
- **Valeur** : routine réflexive ; lien avec les entretiens de suivi.
- **Risques** : surveillance, comparaison familiale. Garde-fous : privé par défaut, partage révocable, pas de score global.
- **Existant** : **Partiel** — données disponibles (chronomètre, profil, planning) dans tutor.mjs ; pas de synthèse.
- **Priorité** : P1 — **Effort** : S

### 35. Régularité : séries, objectifs, motivation sans addiction
- **Persona / scénario** : Dan, 4e, motivé en septembre, abandonne en novembre.
- **Fonctionnalité** : objectifs fixés par l'élève (« 15 min de maths 4 soirs par semaine »), série de jours **avec jours de repos autorisés** (Chabbat ne casse jamais la série), jalons visibles, messages d'encouragement liés à l'effort, pas au résultat.
- **Valeur** : la régularité est le premier facteur de réussite à l'autonomie.
- **Risques** : mécaniques de type réseau social (anxiété de la série, notifications), comparaison. Garde-fous : pas de classement entre élèves, pas de récompenses aléatoires, « gel » de série gratuit, pas de notifications push la nuit.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : S

### 36. Objectifs fixés avec le professeur principal
- **Persona / scénario** : conseil de classe du 1er trimestre : « doit travailler plus régulièrement en maths ». Entretien avec le PP, objectifs fixés oralement puis oubliés.
- **Fonctionnalité** : **contrat d'objectifs** : le PP saisit 2-3 objectifs co-construits (avec indicateurs), l'élève les voit dans son accueil, le planning en tient compte, point d'étape mi-trimestre où l'élève s'auto-évalue et peut partager son bilan (cas 34) avec le PP.
- **Valeur** : relie IABNE au suivi humain ; transforme l'appréciation du bulletin en plan d'action.
- **Risques** : glissement vers la surveillance des activités privées. Garde-fou : le PP ne voit que ce que l'élève partage + l'auto-évaluation, jamais les conversations.
- **Existant** : **Non** (pas de rôle PP ni de lien prof-élève individuel).
- **Priorité** : P1 — **Effort** : M

### 37. Comprendre ses notes et son bulletin
- **Persona / scénario** : Sacha, 1re, a 11,5 de moyenne en SES et ne comprend pas l'appréciation « manque d'approfondissement » ; ou ne sait pas ce que pèse un contrôle coefficient 2.
- **Fonctionnalité** : import des notes École Directe (si autorisé), simulateur « si j'ai 14 au prochain contrôle », explication des coefficients et du contrôle continu (40 % du bac), traduction des appréciations en actions concrètes (« approfondissement » → exemples développés, mobilisation des notions), lien avec les notions à revoir.
- **Valeur** : la note devient lisible et actionnable.
- **Risques** : obsession des moyennes ; données sensibles ; interprétation hasardeuse des appréciations. Garde-fous : formulation prudente, suggestion de demander au prof.
- **Existant** : **Non** — le connecteur École Directe se limite volontairement à l'emploi du temps et au cahier de textes (ecoledirecte-client.mjs l.40).
- **Priorité** : P2 — **Effort** : M

### 38. Détection de surcharge et de stress
- **Persona / scénario** : Tamar, Tle, 3 contrôles + 1 DM la même semaine, travaille jusqu'à 1 h du matin, écrit au tuteur « j'en peux plus, je vais rater de toute façon ».
- **Fonctionnalité** : (a) **surcharge objective** : semaine dépassant les plafonds → alerte et proposition de priorisation, possibilité de signaler la surcharge au PP (agrégé : « 4 évaluations la même semaine en Tle B » visible par la vie scolaire) ; (b) **détresse exprimée** : le tuteur reconnaît le message, répond avec empathie sans psychologiser, propose une pause, rappelle les personnes ressources (CPE, infirmière, psychologue de l'établissement, PP), et numéros d'aide (3114 pour les idées suicidaires, 119 enfance en danger, 3018 cyberharcèlement) ; (c) **signalement vers un adulte** en cas de danger grave selon un protocole défini avec l'établissement.
- **Valeur** : un élève qui travaille seul le soir peut dire à l'IA ce qu'il ne dit à personne ; obligation morale de réponse adaptée.
- **Risques** : faux positifs, rupture de confiance si signalement opaque, responsabilité juridique, l'IA joue au psy. Garde-fous : règles déterministes + modèle de classification, transparence (« je ne peux pas t'aider seul pour ça, voici à qui parler »), protocole écrit validé par la direction, la CPE et le DPO, jamais de diagnostic, aucune donnée de santé stockée hors protocole.
- **Existant** : **Partiel** — plafonds quotidiens du planificateur (learning.mjs) ; **aucune** gestion de la détresse dans le prompt.
- **Priorité** : P0 (réponse sûre aux messages de détresse) / P1 (signalement) — **Effort** : M

### 39. Carnet de bord de l'élève
- **Persona / scénario** : Hillel, 2nde, veut garder une trace de ce qu'il a compris et de ses questions, pour préparer l'entretien avec son PP et le choix de spécialités.
- **Fonctionnalité** : journal privé daté (texte ou vocal) : « aujourd'hui j'ai compris… / je bloque sur… / question pour le prof », avec rattachement à une notion, export PDF ; l'IA peut proposer une relance hebdomadaire (« quelle a été ta plus grande réussite cette semaine ? »).
- **Valeur** : métacognition ; matière première pour l'orientation et le grand oral (projet).
- **Risques** : contenu intime. Garde-fou : chiffré, jamais vu par l'IA si l'élève le désactive, jamais par les adultes.
- **Existant** : **Partiel** — notes d'erreur/blocage (PersonalTutor.jsx « Noter une erreur ou un blocage »).
- **Priorité** : P2 — **Effort** : S

### 40. Méthodologie : prendre des notes, organiser son classeur, apprendre une leçon
- **Persona / scénario** : Noah, 6e, ne sait pas « apprendre sa leçon » ; Léa, 2nde, prend des notes illisibles.
- **Fonctionnalité** : parcours méthodologiques courts (5 min) : apprendre une leçon (lire, cacher, redire, vérifier), prise de notes (abréviations, Cornell), faire une carte mentale, préparer son sac/son agenda ; **comparaison des notes de l'élève** (photo) avec le cours déposé : ce qui manque.
- **Valeur** : compétences « apprendre à apprendre » rarement enseignées explicitement.
- **Risques** : contenu générique sans lien avec le cours. Garde-fou : exercices appliqués à un vrai chapitre de l'élève.
- **Existant** : **Partiel** — guide de méthode pas à pas (ai-recipes.mjs `method_guide`) centré sur les méthodes disciplinaires.
- **Priorité** : P1 — **Effort** : S

### 41. Travail en groupe entre élèves
- **Persona / scénario** : 4 élèves de 1re préparent un exposé d'histoire ou révisent ensemble le contrôle de SVT.
- **Fonctionnalité** : groupe de travail créé par les élèves (demande de l'utilisateur), espace partagé : tâches, documents, quiz « en équipe » où chacun répond puis on compare, tuteur de groupe qui pose des questions au groupe et répartit la parole ; aucune conversation privée d'un élève n'est visible par le groupe.
- **Valeur** : l'apprentissage entre pairs ; répond à la priorité explicite de l'utilisateur.
- **Risques** : harcèlement, exclusion, copie entre élèves, partage de contenus inappropriés. Garde-fous : groupes limités à l'établissement, modération et signalement, historique conservé, adultes référents.
- **Existant** : **Non** (ajouts_equipe.md : « groupes de travail élèves (rien) »).
- **Priorité** : P1 — **Effort** : M (voir aussi le dossier administration)

---

## G. Disciplines spécifiques et langues

### 42. Maths et physique : formules, calculs et graphiques
- **Persona / scénario** : Elie, Tle spé maths, pose une question sur une intégrale ; la réponse s'affiche en texte brut « int_0^1 x^2 dx ».
- **Fonctionnalité** : rendu LaTeX (KaTeX), saisie de formules, **vérification symbolique** des calculs de l'IA et de l'élève (moteur de calcul formel côté serveur), tracé de courbes, unités et chiffres significatifs en physique, calculatrice virtuelle conforme examen.
- **Valeur** : sans ça le tuteur est presque inutilisable en sciences à partir de la 3e.
- **Risques** : calculs faux des LLM. Garde-fou : calcul délégué au moteur, l'IA explique.
- **Existant** : **Non** (USAGES_IA.md : « composition mathématique spécialisée non implémentée » ; rendu texte simple imposé, learning.mjs l.317).
- **Priorité** : P0 — **Effort** : M

### 43. Schémas, cartes et documents visuels (SVT, physique, histoire-géo)
- **Persona / scénario** : Avigaïl, 5e, doit légender le schéma du cœur ; Yossef, 3e, doit apprendre les repères géographiques de la France.
- **Fonctionnalité** : exercices de **légendage interactif** sur les schémas du prof, cartes muettes (repères du programme), frise chronologique interactive (dates du chapitre, glisser-déposer), analyse de document (photo, carte, graphique) avec questions guidées.
- **Valeur** : l'histoire-géo et les SVT s'évaluent beaucoup sur des documents.
- **Risques** : vision IA erronée sur les schémas. Garde-fou : zones de légende définies à partir du document du prof, pas devinées.
- **Existant** : **Non** (extraction texte seule, documents.mjs).
- **Priorité** : P2 — **Effort** : L

### 44. Philosophie et dissertation (Tle)
- **Persona / scénario** : Rebecca, Tle, sujet « Peut-on être libre sans les autres ? » ; elle commence la rédaction sans problématique.
- **Fonctionnalité** : atelier dissertation en étapes : analyse des termes, paradoxe et problématique, plan, choix des références **du cours**, rédaction d'une partie par l'élève puis retour selon la grille du prof. L'IA joue l'objecteur (« Et si on te disait que… ? »).
- **Valeur** : structure une méthode très exigeante ; rejoint le bac de français (cas 12).
- **Risques** : dissertation entièrement rédigée par l'IA (triche massive). Garde-fous : l'IA ne rédige aucun paragraphe, détection d'énoncé de devoir (cas 2), historique des étapes montrable au prof si l'élève le souhaite (preuve de travail).
- **Existant** : **Partiel** — guide de méthode (ai-recipes.mjs) et méthode prof (teacher-tutor.mjs).
- **Priorité** : P1 — **Effort** : M

### 45. Langues vivantes : écrit, conversation, vocabulaire
- **Persona / scénario** : Ruben, 4e, espagnol LV2 ; doit écrire 10 lignes sur ses vacances.
- **Fonctionnalité** : correction d'expression écrite **par catégorie** sans réécrire (« 3 erreurs de conjugaison dans le 2e paragraphe, trouve-les »), banque de vocabulaire du chapitre → cartes mémoire (cas 18), conversation (cas 15), compréhension orale à partir des audios du prof.
- **Valeur** : production en autonomie avec retour immédiat.
- **Risques** : traducteur déguisé. Garde-fou : refus de traduire un texte entier de l'élève, signalement correctif plutôt que réécriture.
- **Existant** : **Non**.
- **Priorité** : P1 — **Effort** : M

### 46. Hébreu (LV) et études juives (spécifique Yabné)
- **Persona / scénario** : Noam, 2nde, hébreu moderne LVA ; Myriam, 5e, cours de Torah/limoudé kodech (Houmach, Michna, Halakha) avec textes à préparer.
- **Fonctionnalité** : support **RTL et nikoud** (voyelles) à l'affichage et en saisie, cartes de vocabulaire hébreu-français, conjugaison des binyanim, lecture audio avec nikoud ; pour les études juives : préparation d'un texte en hevrouta avec l'IA (questions de compréhension, mots clés, structure du passage), toujours **sur les sources et commentaires déposés par le professeur** (pas d'avis halakhique produit par l'IA).
- **Valeur** : spécifique de l'établissement ; aucun outil grand public ne fait ça proprement avec la méthode du rav/professeur.
- **Risques** : interprétation religieuse erronée ou contraire à la ligne de l'établissement ; questions de halakha pratique (« ai-je le droit de… ») auxquelles l'IA ne doit pas répondre. Garde-fous : abstention sur les questions de pratique avec renvoi au rav/professeur, corpus strictement limité aux documents déposés, validation par le département.
- **Existant** : **Non** (rien sur RTL ; le RAG par cours s'appliquerait techniquement).
- **Priorité** : P1 (RTL + vocabulaire) / P2 (hevrouta) — **Effort** : M

### 47. SVT et démarche expérimentale
- **Persona / scénario** : Jade, 2nde, doit rédiger un compte rendu de TP (hypothèse, protocole, résultats, conclusion).
- **Fonctionnalité** : trame de compte rendu guidée selon la méthode du prof, vérification de la cohérence hypothèse/conclusion, aide à la lecture de graphiques de résultats.
- **Valeur** : la démarche scientifique est évaluée au bac (ECE) et au brevet.
- **Risques** : invention de résultats. Garde-fou : l'IA ne produit jamais de données.
- **Existant** : **Partiel** — guide de méthode.
- **Priorité** : P2 — **Effort** : S

---

## H. Orientation et étapes de l'année

### 48. Choix des spécialités (fin de 2nde) et de l'option
- **Persona / scénario** : Lucas, 2nde, hésite entre SES et SVT, ne sait pas ce qu'implique chaque combinaison pour la suite.
- **Fonctionnalité** : questionnaire d'intérêts + résultats/temps passés par matière (privés), fiches des spécialités proposées à Yabné (déposées par l'établissement), simulation de l'emploi du temps de 1re, liste de questions à poser au PP/Psy-EN, lien vers l'entretien d'orientation.
- **Valeur** : décision lourde prise souvent sur des rumeurs.
- **Risques** : l'IA « oriente » un mineur (biais, enfermement, stéréotypes de genre). Garde-fous : l'outil éclaire, ne recommande pas ; aucune prédiction de réussite ; renvoi systématique aux humains.
- **Existant** : **Non**.
- **Priorité** : P2 — **Effort** : M

### 49. Parcoursup (Tle)
- **Persona / scénario** : Ilana, Tle, 10 vœux à formuler, « projet de formation motivé » à écrire pour chacun, calendrier serré (janvier-avril).
- **Fonctionnalité** : calendrier Parcoursup intégré au planning (dates nationales, saisie fournie par l'établissement), suivi des vœux et des pièces, **aide à la réflexion** pour le projet motivé (questions : pourquoi cette formation ? quelle expérience ? quel lien avec mes spécialités ?) avec retour sur la clarté, **sans rédaction** ; préparation des entretiens (écoles, prépas) en simulation orale ; rubrique « activités et centres d'intérêt » nourrie par le carnet de bord.
- **Valeur** : stress majeur de la Tle ; réduction des inégalités d'accompagnement entre familles.
- **Risques** : lettres générées par IA (détectables, contraires à l'éthique de la plateforme) ; conseils d'orientation erronés ; données sur les vœux sensibles. Garde-fous : aucune rédaction de texte final, l'élève écrit ; informations officielles uniquement depuis les documents de l'établissement (pas d'Internet, conforme au CDC) ; privé.
- **Existant** : **Non**.
- **Priorité** : P1 (calendrier + réflexion) — **Effort** : M

### 50. Stages (3e et 2nde) et rapport de stage
- **Persona / scénario** : Daniel, 3e, stage d'observation d'une semaine ; rapport et oral à rendre. Élèves de 2nde : stage de fin d'année.
- **Fonctionnalité** : trame de rapport par jour (observations, métier, questions posées), relances quotidiennes pendant le stage (mobile), préparation de l'oral.
- **Valeur** : liée à l'orientation et au brevet (oral possible sur le parcours Avenir).
- **Risques** : rédaction du rapport par l'IA. Garde-fou : questions et retours seulement.
- **Existant** : **Non**.
- **Priorité** : P2 — **Effort** : S

### 51. Rentrée et transition 6e / 2nde
- **Persona / scénario** : Eden, nouvelle en 6e : nouveaux profs, casier, multiples cahiers, emploi du temps complexe.
- **Fonctionnalité** : parcours d'accueil (ce qu'attend chaque prof, règles de présentation, comment utiliser IABNE), quiz de prérequis de début d'année par matière (révision CM2/3e), checklist du matériel par matière.
- **Valeur** : moments charnières à forte anxiété.
- **Risques** : faible.
- **Existant** : **Non**.
- **Priorité** : P2 — **Effort** : S

---

## I. Mobile et hors connexion

### 52. Réviser sans connexion (métro, Chabbat exclu, campagne)
- **Persona / scénario** : Mathis, 1re, 40 min de métro sans réseau stable ; veut réviser ses cartes et fiches.
- **Fonctionnalité** : application installable (PWA), cache chiffré des fiches PDF, cartes mémoire et quiz déjà générés, synchronisation des résultats au retour du réseau ; le tuteur IA reste en ligne (indication claire). Effacement du cache à la déconnexion (appareil partagé dans la famille).
- **Valeur** : usage réel des adolescents = smartphone ; le CDC prévoit le mobile.
- **Risques** : données d'un mineur sur un appareil partagé/perdu ; conflits de synchronisation. Garde-fous : cache minimal, pas de conversations hors ligne, verrouillage PIN optionnel.
- **Existant** : **Partiel** — interface responsive testée sur mobile (VALIDATION.md), PDF téléchargeables ; pas de service worker ni de manifeste.
- **Priorité** : P1 — **Effort** : M

### 53. Photo rapide d'un énoncé depuis le téléphone
- **Persona / scénario** : Rose, 4e, recopie un énoncé de 15 lignes à la main dans le tuteur ; elle abandonne.
- **Fonctionnalité** : bouton appareil photo → OCR → l'élève corrige la transcription → l'exercice est créé et lié au devoir.
- **Valeur** : supprime la principale friction de l'aide sur exercice (énoncés papier/manuels).
- **Risques** : photos de manuels (droits) ; photos contenant des visages ou noms. Garde-fous : recadrage, rappel de ne photographier que l'énoncé, image non conservée après extraction.
- **Existant** : **Non**.
- **Priorité** : P0 — **Effort** : M (fournisseur multimodal suffit pour le texte imprimé)

---

## J. Risques transversaux et garde-fous communs

| Risque | Manifestation | Garde-fou recommandé |
| --- | --- | --- |
| Dépendance à l'IA | L'élève demande avant d'essayer | Tentative préalable exigée avant indice niveau 2+ ; indicateur privé « part d'autonomie » (exercices réussis sans aide) |
| Triche | DM, rédactions, Parcoursup, rapports | Statut « devoir évalué », mode coach, refus de rédaction finale, détection d'énoncés de devoirs, historique des étapes exportable comme preuve de travail |
| Erreurs factuelles | Calcul faux, date fausse | Citations déjà imposées ; moteur de calcul ; bouton « signaler une erreur » qui remonte au prof (agrégé) |
| Mineurs et RGPD | Conversations, voix, photos, santé, religion | Minimisation, pas de conservation audio/photo, réglages d'affichage sans diagnostic, protocole détresse, DPIA |
| Surveillance | Parents/profs qui veulent tout voir | Privé par défaut, partage à l'initiative de l'élève, agrégats (seuil 5 déjà en place) |
| Équité | Élèves sans smartphone/ordinateur à la maison | Usage possible au CDI, version imprimable, hors connexion |
| Bien-être | Notifications, séries, pression | Plages silencieuses (nuit, Chabbat, fêtes), pas de classement, messages centrés sur l'effort |

---

## K. Top 10 (rapport valeur/effort, réalisme pour le pilote)

| Rang | Cas | Pourquoi | Priorité / Effort |
| --- | --- | --- | --- |
| 1 | **2 — Devoir évalué / mode coach anti-triche** | Condition d'acceptation par les profs ; corrige la faille du mode `solution` | P0 / M |
| 2 | **1 — Échelle d'aide graduée + exercice jumeau** | Cœur pédagogique, briques déjà là | P0 / M |
| 3 | **33 — Retour d'absence** | Fréquent, concret, s'appuie sur le cahier de textes importé | P0 / M |
| 4 | **53 — Photo d'énoncé (OCR)** | Supprime la friction n° 1 du tuteur ; prérequis aux cas 17 et 22 | P0 / M |
| 5 | **42 — Formules et calcul vérifié** | Sans ça, sciences inutilisables au lycée | P0 / M |
| 6 | **18 — Cartes mémoire + répétition espacée** | Méthode la mieux validée ; extension naturelle de `topicProfile` | P0 / M |
| 7 | **5 + 9 — « Ce soir » et « Veille de contrôle »** | Transforme planning et outils en action quotidienne | P0 / S-M |
| 8 | **38 — Réponse sûre à la détresse + surcharge** | Obligation éthique avec des mineurs seuls le soir | P0 / M |
| 9 | **26 + 30 — DYS : affichage + audio** | Inclusion, équité, réutilisable par tous | P0 / M |
| 10 | **22 — Correction de copie photographiée avec note indicative** | Ferme la boucle d'entraînement ; demandé par l'équipe | P1 / L |

Juste derrière : examen blanc chronométré (10), diagnostic d'erreurs (23), objectifs avec le PP (36), EAF/grand oral (12, 13), calendrier juif (7), groupes de travail (41).

---

## L. Trois « features signature » (différenciation)

### 1. « Le prof de la classe, disponible à 21 h » — tuteur fidèle à la méthode du professeur, qui refuse de faire à la place
Ni Pronote ni École Directe n'aident à apprendre ; Khan Academy et les chatbots génériques expliquent *leur* méthode, pas celle de Mme Y, et rédigent volontiers le DM. IABNE combine : corpus du prof uniquement, méthode validée par le prof (déjà en place), **niveau d'aide réglé par devoir par le professeur**, échelle graduée et exercice jumeau, photo d'énoncé et correction de copie avec note indicative selon le barème du prof. Message produit : « l'aide que donnerait ton professeur, au niveau qu'il autorise ». C'est ce qui rend l'outil acceptable pour les enseignants **et** utile aux élèves.

### 2. « Le fil de l'année » — continuité absence → rattrapage → révision espacée → contrôle → analyse de copie
Quizlet a les cartes mais ignore le calendrier ; Pronote a le calendrier mais aucune pédagogie. IABNE relie le cahier de textes et l'emploi du temps (École Directe), le planificateur, la mémoire privée par notion et les échéances : chaque séance manquée devient un plan de rattrapage, chaque notion ratée devient une carte qui revient au bon moment, chaque contrôle annoncé déclenche une préparation, chaque copie rendue alimente les révisions, et les objectifs du PP s'y raccrochent. Aucun concurrent ne boucle ce cycle avec les vrais documents de la classe.

### 3. « Pensé pour Yabné » — inclusion, bien-être et identité de l'établissement par défaut
Calendrier juif natif (Chabbat et fêtes : pas de travail planifié, pas de notification, séries qui ne cassent pas), hébreu RTL avec nikoud et études juives sur les sources du professeur (sans avis halakhique de l'IA), accompagnement des élèves allophones franco-israéliens, aménagements DYS/TDAH sans saisie de diagnostic, protocole de détresse relié aux adultes de l'établissement. Les outils grand public ne peuvent pas proposer cette combinaison, qui fait d'IABNE un outil de la communauté scolaire plutôt qu'un chatbot de plus.
