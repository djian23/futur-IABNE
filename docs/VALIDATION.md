# Validation locale — 5 novembre 2026

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| `npm test` | 77 tests réussis, aucun échec, aucun test ignoré. |
| `npm run build` | Compilation de production réussie. |
| `npm run format:check` | Fichiers source et tests conformes au formatage. |
| `npm audit --omit=dev` | Aucune vulnérabilité connue signalée dans les dépendances de production lors de ce contrôle. |
| Chromium, parcours des quatre profils | Connexion ; dépôt délégué en brouillon ; publication et auteur côté professeur ; recherche textuelle et lecture côté élève ; erreur explicite sans IA ; administration des classes ; déconnexion ; affichage mobile. |
| Image Docker de production | Construction réussie ; interface statique et API ; provisionnement ; cookies sécurisés ; refus d’origine étrangère ; processus UID 1000 ; volume et session conservés après redémarrage. |
| Sauvegarde/restauration | Base et document synthétiques conservés ; intégrité contrôlée ; sessions anciennes invalidées ; refus d’écrasement et de sauvegarde altérée. |

Les essais navigateur ont utilisé Chromium installé dans la machine avec un pilote Playwright temporaire, hors des dépendances applicatives. Ils ne font pas partie de `npm test` et ne constituent pas un audit d’accessibilité.

## Ce que couvrent les tests automatisés

- Authentification, rotation des mots de passe et sessions, permissions par classe et établissement.
- Dépôt délégué, publication enseignante, révocation, lecture, recherche, remplacement, historique et suppression des fichiers.
- Fichiers invalides et extraction de texte ; PDF générés avec typographie, références et pagination.
- Données pédagogiques personnelles, refus d’accès aux conversations et générations d’un autre utilisateur, agrégats masqués pour les petits groupes.
- QCM : réponses masquées, notation serveur unique, sources obsolètes, adaptation des prochaines sessions et pistes de révision.
- Planning : disponibilités, exclusions, doublons, plafonds, persistance et séparation des utilisateurs.
- Frontière IA simulée : corpus autorisé seulement, citations invalides refusées, révocation pendant l’appel, JSON de quiz contrôlé et plafond établissement avant appel.
- École Directe simulé : désactivation sans collecte distante, chiffrement des jetons, imports idempotents, préservation des éléments manuels, déconnexion, vérification QCM et liaison cryptographique au propriétaire.
- Mémoire personnelle : erreurs et devoirs du propriétaire seulement, temps chronométré borné distinct du planning, oubli et suspension effectifs, aide sur un exercice et observations IA avec preuve dans la tentative.
- Méthode professeur : analyse prioritaire des corrections publiées, validation du propriétaire, aucun brouillon ni méthode d’un autre professeur utilisé, retrait des profils devenus obsolètes.

- Agent de préparation : options bornées, plan et sources, corrigés masqués, indices, exports PDF, barèmes invalides refusés, brouillons idempotents, annulation, révocation et interruption au redémarrage.
- Outils par rôle et remédiation : seuil de cinq élèves actifs, absence d’identités et exclusion des sources obsolètes.
- Chromium supplémentaire : élève vers tuteur depuis un sujet généré ; professeur vers deux brouillons et outil de différenciation sauvegardé ; mobile et absence d’erreurs JavaScript. Fournisseur simulé dans un processus isolé.

## Vérification supplémentaire des accès au travail

Après l’ajout des boutons depuis les priorités et les devoirs : compilation et formatage réussis ; Chromium vérifie le cours et la notion préremplis, la demande au tuteur contenant le titre du devoir, les parcours de préparation existants et l’absence d’erreurs JavaScript. Ces accès ont été vérifiés dans Chromium ; la suite complète a ensuite été réexécutée avec les modifications du connecteur École Directe.

## Connecteur indépendant : vérification supplémentaire

La suite comporte maintenant 77 tests réussis. Les nouveaux cas vérifient le transport indépendant (GTK, jetons, routes strictement bornées, codes HTTP/métier, volume et annulation), les séances sans devoir, la séparation des deux champs documentés, les consignes et métadonnées complètes, l’isolation des comptes, le diagnostic après réponse invalide et les suppressions limitées à la période.

Un parcours Chromium isolé avec transport synthétique vérifie connexion, import, affichage de la consigne au-delà du titre court, contenu de séance converti en texte, matière/professeur/salle, indication des pièces jointes, conservation après erreur, affichage mobile et purge préservant une tâche manuelle. Aucune erreur JavaScript observée. Les fichiers joints ne sont pas téléchargés.

## Distinctions importantes

Les fournisseurs IA et École Directe sont simulés uniquement dans des processus de test isolés. Aucune clé fournisseur réelle ni aucun compte scolaire externe n’a été utilisé. L’application de production ne possède aucun mode de réussite fictive remplaçant ces services.

Le conteneur a été exécuté localement, avec un volume jetable et des comptes synthétiques. Aucun service Railway distant n’a été déployé. Le code reste dans le checkout local ; aucun push GitHub n’a été effectué.

Les tests techniques ne prouvent ni la qualité pédagogique des réponses d’un modèle réel, ni la compatibilité actuelle de l’API communautaire, ni une conformité RGPD complète. Voir [FEATURES.md](FEATURES.md) pour les limites et [OPERATIONS.md](OPERATIONS.md) pour la mise en service.

## Évolutions issues de la recherche de cas d’usage — vérifications

Vérifications exécutées sur la branche de développement :

| Vérification | Résultat |
| --- | --- |
| `npm test` | 127 tests réussis, aucun échec. Nouvelles suites : sécurité (détresse, hébreu, correction après essai), administration (activation, import, suppression RGPD, audit, 2FA, passage d’année, co-enseignants), contrôles du professeur, calendrier (dates et horaires de référence, planning), groupes (permissions). |
| `npm run build`, `prettier --check` | Réussis. |
| Chromium (iPhone SE et PC) | Menu mobile défilant avec « Se déconnecter » accessible ; bouton retour du navigateur ; onglets d’administration ; import CSV, fiches de connexion et activation d’un compte ; parcours de groupe à trois profils (élève, élève invité, professeur) avec consultation visible des élèves. Aucune erreur JavaScript. |

**Ce que ces vérifications ne prouvent pas :** la justesse des horaires de Chabbat et de fêtes face aux horaires officiels (calcul astronomique approché, à faire valider) ; la qualité de la détection de détresse (motifs simples, non évalués sur des propos réels d’élèves) ; la qualité pédagogique des réponses d’un vrai modèle (aucune clé réelle utilisée) ; un déploiement Railway ; la conformité RGPD (documents de `docs/conformite/` en brouillon). Les tests de groupes figent l’heure du serveur de test pour les heures calmes.
