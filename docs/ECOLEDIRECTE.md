# Connecteur École Directe maintenu dans le projet

État au **5 novembre 2026** : code indépendant, sans SDK École Directe tiers, testé sur des réponses synthétiques. **La compatibilité avec un compte réel n’est pas encore validée.** Réécrire le client ne rend pas le protocole distant officiel ou stable.

## Architecture

- `server/ecoledirecte-client.mjs` : transport HTTPS, GTK, connexion, jetons, codes métier, liste restrictive des routes autorisées et délais.
- `server/ecoledirecte.mjs` : vérification interactive d’appareil, sélection du compte, chiffrement, normalisation, synchronisation transactionnelle et accès privés.
- `src/ImportedAgenda.jsx` : consultation de l’emploi du temps, des consignes complètes et des contenus de séance importés.
- `tests/ecoledirecte-client.test.mjs` et `tests/ecoledirecte.test.mjs` : contrats réseau et règles d’import avec fixtures isolées.

Le connecteur utilise directement `fetch` de Node. Les lectures métier sont des POST HTTP avec `verbe=get` et un formulaire `data` JSON. Les seules autres routes autorisées concernent la connexion et sa vérification d’appareil ; aucune route de notes, messagerie, rendu ou modification de devoir n’est accessible par cet adaptateur.

## Données récupérées

| Source | Données locales |
| --- | --- |
| Emploi du temps | Date, début, fin, matière, professeur et salle ; un cours annulé ne bloque pas le planning |
| Travail à faire | Échéance, matière, état distant, consigne textuelle complète dans les limites du connecteur, date donnée et métadonnées des pièces jointes |
| Contenu de séance | Date, matière, professeur, texte et métadonnées des pièces jointes, y compris une séance sans devoir |

Les champs `matiere.contenuDeSeance` et `matiere.aFaire.contenuDeSeance` sont conservés séparément comme « contenu de séance » et « contenu associé au travail à faire ». Les références communautaires ne permettent pas d’affirmer qu’ils ont exactement le même sens. Le connecteur ne les fusionne pas et ne déduit pas leur présence des indicateurs de l’emploi du temps, signalés comme parfois inexacts.

Les consignes ne sont plus réduites au titre court du planificateur. Le texte HTML encodé en base64 est décodé puis converti en texte, jamais exécuté dans le navigateur. Les noms et identifiants des pièces jointes sont affichés ; **les fichiers eux-mêmes ne sont pas téléchargés, extraits ni analysés par ce connecteur**.

Ces données restent privées à l’utilisateur local. Elles ne deviennent ni des documents publiés de classe, ni une méthode professeur validée. Les devoirs alimentent le planificateur et le contexte personnel existant par leur titre et leur échéance ; l’intégralité des séances n’est pas automatiquement envoyée au fournisseur IA.

## Connexion et configuration Railway

Variables serveur :

```dotenv
ENABLE_ECOLEDIRECTE=true
ECOLEDIRECTE_API_VERSION=4.97.2
# Définir ECOLEDIRECTE_ENCRYPTION_KEY dans les secrets Railway.
```

La clé de chiffrement doit contenir **32 octets aléatoires encodés en base64**, conservés séparément du volume et des sauvegardes. Voir [OPERATIONS.md](OPERATIONS.md). La version `4.97.2` vient des sources publiques consultées : ce n’est pas une déclaration de validité actuelle. La variable permet de faire évoluer le protocole sans modifier le transport ; changer ce nombre seul ne résout pas une modification du schéma distant.

Sans activation, clé valide et version syntaxiquement valide, aucune connexion distante n’est tentée. Le volume `/data` existant conserve la base SQLite et les imports ; aucun service supplémentaire n’est requis. Le serveur doit pouvoir joindre `https://api.ecoledirecte.com` avec TLS valide.

Le titulaire se connecte depuis l’interface, confirme explicitement la charte et répond lui-même à l’éventuelle vérification QCM. Le mot de passe n’est pas conservé et doit être saisi de nouveau pour terminer cette vérification. Les jetons persistants sont chiffrés AES-256-GCM et liés à l’utilisateur et à son établissement. Les états temporaires sont chiffrés, à usage unique et expirent après dix minutes. Seuls les comptes élèves sont pris en charge ; les comptes famille et professeur sont refusés.

## Synchronisation et diagnostic

L’utilisateur choisit une période de **1 à 14 jours**. L’interface propose initialement une semaine passée et les jours suivants pour retrouver les séances récentes et les devoirs à venir. Les dates et heures scolaires conservent leur valeur locale, sans conversion implicite en UTC.

Les étapes sont suivies côté serveur : emploi du temps, liste des devoirs, détails journaliers, vérification et enregistrement. L’état expose le dernier essai et un code d’erreur sûr, sans identifiants, mot de passe, jeton ni réponse distante brute. Un succès indique la réussite de cet import ; il ne constitue pas une certification générale de compatibilité.

Les imports sont idempotents, avec identifiants stables. Ils mettent à jour les données distantes et retirent les éléments importés absents de la période resynchronisée ; les autres dates et les éléments manuels restent conservés. Les données de séance n’ont pas besoin d’une tâche locale pour exister. En cas de réponse incompatible ou de panne, l’import entier échoue : aucun effacement partiel des données précédentes. Les changements sont appliqués dans une transaction.

Une opération par utilisateur, douze demandes de connexion/vérification/synchronisation par quinze minutes, dix secondes par requête et délai global de soixante secondes pour la synchronisation. Aucune nouvelle tentative automatique après un échec ou un redémarrage. Vingt diagnostics d’import au maximum sont conservés par utilisateur ; une opération interrompue au redémarrage est marquée comme telle.

Les réponses sont limitées à 1 Mo par requête, les textes décodés à 20 000 caractères par champ, les pièces jointes à 50 métadonnées par champ. Un dépassement est refusé, sans troncature silencieuse du texte. Les bornes du planificateur restent de 200 tâches et 500 créneaux par utilisateur ; les contenus de séance sont limités à 2 000. Les nouveaux devoirs ont initialement 30 minutes et une difficulté 2/5, à ajuster par l’utilisateur : ce ne sont pas des estimations IA. Un import réussi invalide les séances calculées ; il faut régénérer le planning.

La déconnexion supprime les secrets locaux. La purge des imports est un choix distinct, qui retire également les séances importées mais préserve les tâches et disponibilités manuelles. Une déconnexion locale n’est pas une révocation distante garantie.

## API locale

Préfixe `/api/integrations/ecoledirecte`, session locale obligatoire. Les mutations conservent la protection d’origine de l’application.

| Route | Contrat |
| --- | --- |
| `GET /status` | Activation, connexion, dernière synchronisation, dernier essai, révision du connecteur et version du protocole, sans jeton |
| `POST /connect` | `{username,password,acceptCharter:true}` ; retourne connexion, QCM ou sélection des seuls comptes élèves effectivement renvoyés |
| `POST /challenge` | `{challengeId,username,password,answer}` pour le QCM ; `{challengeId,accountId}` pour une sélection |
| `POST /sync` | `{startDate:"AAAA-MM-JJ",days:1..14}` ; nombres d’éléments importés et retirés par type |
| `GET /data?startDate=AAAA-MM-JJ&days=14` | Emploi du temps détaillé, consignes et séances privées de l’utilisateur connecté ; lecture locale, aucun appel distant |
| `DELETE /disconnect` | `{purgeImported:true}` facultatif |

La consultation des imports conservés reste possible après déconnexion ou désactivation du connecteur. Le personnel et les camarades ne peuvent pas lire ces données en transmettant l’identifiant d’un autre utilisateur.

## Références et validation réelle restante

Références publiques effectivement consultées :

- [Documentation EduWireApps](https://github.com/EduWireApps/ecoledirecte-api-docs/tree/39e3a156e35ded43ebc8d8016f14b98d6d086bda), notamment le détail journalier du cahier de textes et ses deux champs de séance. Dernier commit étudié : 2 avril 2025.
- [api-ecoledirecte](https://github.com/louislegrain/api-ecoledirecte/tree/1e8c8a08c4365906c4f61ebae487377d0205c7ff), version déclarée 1.4.6, méthodes de session et d’agenda, ainsi que codes d’erreur. Dernier commit étudié : 6 avril 2026. Ce paquet n’est pas une dépendance du projet.

Ce sont des références communautaires, pas une documentation contractuelle Aplim. Les tests simulés couvrent le GTK, le QCM, l’expiration, le chiffrement, les restrictions de routes, les imports et suppressions bornés, les réponses invalides, la confidentialité et la purge. Chromium vérifie aussi la consultation de textes complets, l’affichage mobile et la conservation des données après échec.

Il reste à exécuter le parcours avec un compte de test autorisé, sa vérification d’appareil et une période connue, puis à comparer l’import au site officiel. Ce test doit utiliser l’interface prévue, sans partager le mot de passe dans le chat ou le dépôt. Aucun compte réel ni appel à l’API École Directe n’a été utilisé pour les validations rapportées ici.
