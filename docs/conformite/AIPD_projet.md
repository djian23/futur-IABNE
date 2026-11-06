# Analyse d’impact (AIPD) — plan à compléter

Traitement : plateforme pédagogique IABNE avec assistant IA pour des élèves mineurs. Une AIPD est attendue (mineurs + technologie innovante ; à confirmer par le DPO).

## 1. Description
Finalités : aider à comprendre les cours publiés par les professeurs ; quiz ; planning personnel ; groupes de travail. Personnes : élèves (mineurs), professeurs, administration. Données : identité, classe, documents de cours, questions posées à l’IA et réponses (conservées dans l’espace privé de l’élève), erreurs et exercices (mémoire du tuteur, désactivable, effaçable), disponibilités et devoirs (planning, éventuellement importés d’École Directe), messages de groupe. Destinataires : l’élève ; le professeur (statistiques agrégées à partir de 5 élèves, signalements sans nom) ; l’administration (comptes, journal d’audit) ; le fournisseur IA (extraits de cours + question + contexte personnel nécessaire à la réponse).
Durées de conservation : **à fixer** (aucune purge automatique n’existe aujourd’hui).

## 2. Nécessité et proportionnalité — à argumenter
Base légale à choisir (mission d’intérêt public / consentement des responsables selon l’âge). Minimisation : l’IA n’a pas accès à Internet ; les conversations ne sont pas lues par le personnel ; pas de notation ni d’orientation par l’IA ; le message de détresse n’est pas conservé.

## 3. Risques et mesures (état du code)
| Risque | Mesure implémentée | À compléter |
| --- | --- | --- |
| Accès non autorisé aux données d’un élève | Droits côté serveur, cloisonnement par classe, tests de permissions, journal d’audit admin, double authentification facultative, session 2 h | 2FA obligatoire admin, audit externe |
| Réponse fausse ou inappropriée de l’IA | Citations vérifiées, abstention sans source, signalement vers le professeur, réglages d’aide par cours | Jeux d’évaluation avec les professeurs, tests de jailbreak |
| Détresse d’un élève | Circuit de détresse (numéros d’aide, alerte sans contenu) | Procédure humaine, enrichissement des motifs |
| Triche / dépendance | Correction jamais sans tentative, réglable, corrigés verrouillables | Charte, retours des professeurs |
| Surveillance perçue des élèves et des professeurs | Statistiques agrégées, signalements anonymes, consultation des groupes visible des élèves | Charte professeurs |
| Transfert hors UE | Aucun fournisseur imposé | **Choisir hébergeur et fournisseur IA en UE, contrats** |
| Données sensibles (religion, santé) | Pas de suivi religieux ; calendrier religieux appliqué sans stockage de pratique | Vérifier les contenus des cours |
| Droits (accès, effacement, portabilité) | Export JSON et suppression complète par l’administration | Libre-service, délais, procédure |

## 4. Avis et validation
DPO, direction, représentants des parents et des élèves : **à recueillir**.
