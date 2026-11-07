# Administration

Réservée aux comptes « Administration », selon leur profil (secrétariat, direction ou complet : voir [ROLES.md](ROLES.md)). Toutes les actions sensibles sont inscrites dans le **journal d’audit** (onglet « Journal »), sans mot de passe ni code.

## Comptes
- **Création** : nom, profil, classe (élèves). L’adresse e-mail est facultative pour un élève : un identifiant `prenom.nom` est généré (`prenom.nom2` en cas d’homonyme). Plusieurs frères et sœurs peuvent donc exister sans adresse partagée.
- **Première connexion** : par défaut, un **code d’activation** (8 caractères, valable 30 jours, à usage unique) est remis à la personne, qui choisit elle-même son mot de passe. L’administration ne connaît jamais ce mot de passe. Un mot de passe provisoire reste possible : il doit alors être changé avant tout usage.
- **Mot de passe oublié** : « Nouveau code » dans la liste des comptes. Les anciennes sessions sont fermées.
- **Règles des mots de passe** : 12 à 128 caractères, pas d’espaces seuls, pas de répétitions ni de suites évidentes, pas de mots de passe courants, pas le nom ou l’adresse.
- **Désactivation** (avec confirmation) : la personne est déconnectée et voit un message explicite.
- **Suppression RGPD complète** : confirmation par saisie de l’adresse ; tous les enregistrements liés sont purgés (conversations, mémoire du tuteur, planning, quiz, groupes, documents déposés…). Un professeur titulaire de cours doit d’abord être remplacé. **Export** des données d’un compte en JSON.
- **Double authentification (TOTP)** : facultative, recommandée pour l’administration (onglet « Sécurité »).
- La session expire après 2 heures d’inactivité.

## Import en masse
Onglet « Importer » : fichier CSV (séparateur `;`, `,` ou tabulation). Colonnes : `nom`, `prénom` (ou `nom complet`), puis facultatives `classe`, `role`, `email`, `identifiant` (numéro interne, empêche les doublons à un second import). Un **aperçu** signale chaque ligne en erreur sans rien écrire. Option : créer les classes manquantes. Après validation, des **fiches de connexion imprimables** (identifiant + code) sont affichées **une seule fois**. Maximum 1 000 lignes.

## Structure
Années, classes, matières, affectations : création avec refus des doublons, renommage, suppression (si vide) ou **archivage**. Les **groupes d’enseignement** (spécialités, options, langues) sont des classes de type « groupe », dont les élèves viennent de plusieurs classes. **Changement de classe** en une action. **Passage d’année** : nouvelle année, classes de destination, affectations copiées, élèves déplacés, redoublants laissés dans l’ancienne classe archivée, groupes de travail archivés, délégations révoquées.

## Co-enseignants et remplaçants
Un autre professeur peut recevoir les droits de gestion d’un cours (documents, réglages) pour une période. Le titulaire garde la validation de la méthode ; changer de titulaire remet la méthode à valider.

## Calendrier
Voir [CALENDRIER.md](CALENDRIER.md).

## Tableau de bord
Comptes à activer / jamais connectés, classes, documents, demandes IA (7 et 30 jours), volume de jetons IA, signalements ouverts, et **alertes de sécurité** (élèves à contacter). Aucun contenu de conversation n’y figure.

## Alertes de sécurité
Voir [SECURITE_MINEURS.md](SECURITE_MINEURS.md).
