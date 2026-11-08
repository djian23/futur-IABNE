# Données de démonstration (fictives)

Pour explorer IABNE avec un établissement « plein » sans aucune donnée réelle :

```sh
DATA_DIR=./data-demo node scripts/seed-demo.mjs --reset   # ou : DATA_DIR=./data-demo npm run seed:demo -- --reset
DATA_DIR=./data-demo npm run dev
```

Le script refuse de s'exécuter en production, et sans `--reset` il refuse une base qui contient déjà des comptes. `--reset` supprime la base du dossier indiqué : ne l'utilisez que sur un dossier de démonstration. Les noms sont inventés ; toute ressemblance avec une personne réelle serait fortuite. Le jeu de données est reproductible (même graine à chaque exécution), l'activité est datée par rapport au jour d'exécution.

## Contenu
- **11 classes et groupes** : 6e A et B, 5e A, 4e A, 3e A, 2nde A et B, 1re A, Tle A, plus deux groupes d'enseignement (Spé Maths 1re + Tle, Hébreu avancé).
- **16 professeurs**, dont plusieurs par matière (pour voir le détail du pilotage) et un seul pour d'autres (détail masqué) ; **171 élèves** ; **3 administrateurs** (complet, secrétariat, direction).
- **79 cours** avec chapitres et **~340 documents** (cours, exercices, corrigés, contrôles), 5 % de cours sans document et 10 % avec brouillons seulement, pour tester la couverture. Contenus réels et exacts à l'échelle du programme (maths, français, histoire-géographie, anglais, SVT, physique-chimie, études juives, hébreu avec texte en hébreu, EPS, NSI, philosophie).
- **Activité sur 8 semaines** : environ 2 600 questions à l'assistant (réponses préenregistrées, citations comprises), 600 quiz, plus de 1 600 réponses, mémoire du tuteur, devoirs, disponibilités hebdomadaires, consultations de documents, volume de jetons.
- **8 groupes de travail** (révision, binôme havrouta, projet encadré créé par un professeur) avec membres, messages, tâches, ressources, une invitation en attente et une consultation d'adulte visible.
- **Cas particuliers** : réglages d'IA variés (aide limitée aux indices, IA désactivée, corrigés verrouillés une semaine), un remplaçant actif et un expiré, 6 élèves délégués, 3 alertes de sécurité (2 ouvertes, 1 traitée), 5 réponses IA signalées, vacances au calendrier, journal d'audit.
- **8 comptes à activer** pour tester la première connexion (les codes s'affichent à la fin du script).

## Comptes
Mot de passe de **tous** les comptes : `EcoleDemo2026!` (public : jamais sur un environnement réel).

| Profil | Identifiant |
| --- | --- |
| Administration complète | `admin@demo.local` |
| Secrétariat | `secretariat@demo.local` |
| Direction | `direction@demo.local` |
| Professeur de maths (collège) | `prof@demo.local` |
| Élève de 6e A | `eleve@demo.local` |
| Élève de 3e A | `delegue@demo.local` |
| Autres | `prenom.nom@demo.local` (liste dans Administration → Comptes) |

## Limites
L'IA n'est pas configurée : les questions déjà posées sont des données enregistrées, de nouvelles questions affichent « IA non configurée » tant qu'aucune clé n'est ajoutée. Les statistiques sont plus homogènes et plus élevées (environ 80 % d'élèves actifs) qu'elles ne le seraient en début de déploiement. Ce jeu de données ne prouve rien sur la qualité pédagogique ni sur la tenue en charge.
