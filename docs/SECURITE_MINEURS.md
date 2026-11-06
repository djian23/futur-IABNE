# Sécurité des mineurs

## Réponse à un élève en détresse (`server/safety.mjs`)
Le tuteur détecte localement (sans appel à un fournisseur IA) des formulations de détresse ou de harcèlement/violence dans la question de l’élève. Dans ce cas, **aucune génération n’a lieu** : l’élève reçoit un message humain avec les numéros **3114** (prévention du suicide), **119** (enfance en danger), **3020** (harcèlement entre élèves), **3018** (violences numériques) et **112**, et l’invitation à parler à un adulte.
- Le message de l’élève **n’est pas conservé** (ni historique, ni alerte). L’administration voit seulement qu’un élève, de telle classe, a besoin d’un contact (tableau de bord, « Vue d’ensemble »), à traiter selon la procédure de l’établissement (voir `conformite/procedure_propos_inquietants.md`).
- Le circuit fonctionne même si l’IA est désactivée pour le cours.
- **Limites** : détection par motifs, donc incomplète (fautes, argot, autres langues, sous-entendus). Elle ne remplace ni les adultes ni la vigilance. Les motifs sont à enrichir avec la vie scolaire et à tester régulièrement.

## Principes
- Pas de détection d’émotions ni de profilage.
- Les données du tuteur ne servent jamais à noter, orienter ou sanctionner.
- Aucun suivi de la pratique religieuse.
- Conversations et mémoire de l’élève inaccessibles au personnel ; signalements de réponses IA transmis **sans nom**.
- Correction expliquée **jamais sans tentative**, et réglable par le professeur (indices seulement, méthode, correction après tentative, ou IA désactivée).
- Corrigés verrouillables jusqu’à une date, y compris pour l’IA.
- Groupes : pas de messages privés, heures calmes, consultation des adultes visible, signalement.

## Limites connues
Un poste partagé ou un compte partagé mélange les mémoires ; la déconnexion se fait après 2 h d’inactivité ou par le bouton « Se déconnecter ». Les injections d’instructions cachées dans un document déposé ne sont atténuées que par les consignes du système (à tester sur le vrai modèle). Aucun test de jailbreak sur un modèle réel n’a été fait.
