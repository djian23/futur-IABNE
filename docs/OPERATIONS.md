# Exploitation

Ces consignes décrivent les précautions et opérations à prévoir pour cette version. Elles ne constituent pas une attestation de disponibilité, de sécurité ou de conformité RGPD.

## Processus et persistance

Utiliser Node.js 24. En développement, `npm run dev` démarre le serveur sur le port 3001 et Vite sur 5173 avec proxy `/api`. Après `npm ci` et `npm run build`, `npm start` sert l’application sur 3001.

Les processus doivent être redémarrés après restauration d’une machine ou modification de configuration. La présence des dépendances sur disque ne signifie pas que le service est lancé.

Conserver `DATA_DIR` sur un stockage persistant, accessible seulement au compte du service et aux opérateurs autorisés. Conserver la base SQLite et les fichiers pédagogiques. Ne pas exposer ce répertoire comme site statique. Exclure données, sauvegardes et secrets du dépôt Git.

## Démonstration et mise en service

`SEED_DEMO=true` est réservé à un environnement de démonstration isolé. Les mots de passe documentés sont publics. Ne pas publier une instance de démonstration avec des données réelles ; désactiver la variable ne doit pas être interprété comme un effacement des comptes déjà créés.

Avant un usage réel : vérifier le provisionnement des comptes, remplacer les paramètres de démonstration, terminer les contrôles de sécurité, utiliser HTTPS, définir les sauvegardes et valider les permissions. Le processus précis de création du premier compte administratif doit correspondre au code livré, et non à une commande supposée.

En production, définir `NODE_ENV=production`, un `SESSION_SECRET` aléatoire d’au moins 32 caractères et utiliser HTTPS ; les cookies sécurisés sont imposés en production (`COOKIE_SECURE=true` les active aussi hors production). Ne pas réutiliser de secret entre installations et ne pas le versionner. Le serveur refuse le chargement de démonstration en production. Il écoute par défaut sur `0.0.0.0` ; limiter l’exposition réseau et configurer le reverse proxy. En production, il fait confiance à un saut de proxy : vérifier que la topologie et les en-têtes transmis correspondent. `APP_ORIGIN` peut fixer explicitement l’origine publique attendue pour les contrôles d’origine.

## Railway

Le Dockerfile de déploiement n’utilise aucun montage BuildKit de type `secret`, non pris en charge par le constructeur Railway utilisé. Les certificats propres à un environnement de développement ne doivent pas être ajoutés à cette image.

Utiliser le `Dockerfile` du dépôt et sa configuration Railway ; l’image installe les dépendances et construit l’interface. Déployer **une seule instance** : cette version utilise une base SQLite locale et ne permet pas plusieurs réplicas partageant leur état.

Le conteneur lance `scripts/container-start.mjs` : ce point d’entrée initialise les permissions du volume monté avec les privilèges initiaux, puis passe à l’UID/GID 1000 **avant** de charger le serveur applicatif. L’application fonctionne donc sans les privilèges root. Ne pas remplacer ce mécanisme par un changement improvisé d’utilisateur Railway ; vérifier les droits des fichiers lors d’une restauration.

1. Relier le dépôt au service Railway et choisir explicitement la région après examen des exigences de l’établissement.
2. Attacher un volume persistant monté sur `/data`.
3. Définir `DATA_DIR=/data`, `NODE_ENV=production`, `HOST=0.0.0.0`, `COOKIE_SECURE=true` et un `SESSION_SECRET` long généré aléatoirement dans les paramètres sécurisés.
4. Laisser Railway fournir `PORT` : ne pas imposer le port local 3001 dans les variables de production.
5. Laisser `SEED_DEMO` absent ou à `false`. Ne pas activer les comptes publics de démonstration.
6. Vérifier le contrôle de santé `/api/health`, puis la connexion et un parcours fonctionnel complet. Un contrôle HTTP sain ne suffit pas à valider les permissions ou l’IA.

Le volume est indispensable : le système de fichiers éphémère du conteneur ne constitue pas une persistance. Éviter une exécution sans état de type serverless ; ne pas autoriser la mise en sommeil si des traitements en arrière-plan doivent s’exécuter. Les sauvegardes doivent sortir du volume Railway utilisé par le service. La restauration sur une instance isolée reste un test à exécuter.

Railway ne règle pas à lui seul les exigences de géographie, de contrat et de sous-traitance. Vérifier la région effective, les engagements contractuels, les transferts et tous les autres prestataires avant données réelles.

### Premier administrateur sur Railway

Le script `npm run provision` crée un établissement, son année scolaire et son premier administrateur dans une base sans utilisateur. Il refuse une installation déjà initialisée et refuse `SEED_DEMO=true` ; il ne réinitialise aucun mot de passe existant.

Dans les paramètres sécurisés du service, fournir temporairement :

- `PROVISION_SCHOOL_NAME` : nom de l’établissement ;
- `PROVISION_ADMIN_NAME` : nom du premier administrateur ;
- `PROVISION_ADMIN_EMAIL` : adresse de connexion ;
- `PROVISION_ADMIN_PASSWORD` : mot de passe unique de 16 à 128 caractères ;
- `PROVISION_YEAR` : année facultative, par défaut `2026–2027`.

Ne jamais coller le mot de passe dans une conversation ou une ligne de commande. Se connecter au conteneur distant du service **qui possède le volume** avec la CLI Railway authentifiée :

```sh
railway ssh -s <service>
```

Puis, dans ce conteneur, vérifier que `DATA_DIR` désigne `/data` sans afficher les valeurs secrètes et exécuter :

```sh
cd /app
npm run provision
```

Retirer ensuite les variables `PROVISION_*` des paramètres sécurisés, appliquer la mise à jour et vérifier la connexion avec le compte créé. `railway run` exécute une commande localement : ne pas l’utiliser pour initialiser la base du volume distant. Le provisionnement et le déploiement Railway ne doivent être déclarés validés qu’après leur exécution réelle.

## Sauvegarde cohérente

Le script livré est `npm run backup`. Il contrôle l’intégrité SQLite, ouvre la source en lecture seule, utilise l’API de sauvegarde SQLite de Node, ferme cette connexion puis copie les documents et crée `manifest.json` avec leurs empreintes SHA-256. Une base seule ne suffit pas à restaurer les fichiers pédagogiques. Le manifeste détecte les altérations ; ce n’est pas une signature authentifiant une sauvegarde provenant d’un tiers.

**Préalable obligatoire : arrêter les écritures** de l’application et des traitements avant l’opération, et les garder arrêtées jusqu’à la fin de la copie des documents. `MAINTENANCE_CONFIRMED=true` est une confirmation de l’opérateur, pas un mécanisme qui arrête ou verrouille automatiquement l’application. L’API SQLite garantit la cohérence de la base, mais ne rend pas atomique la copie séparée des fichiers si des écritures continuent.

Depuis la racine du dépôt ou `/app` dans un environnement de maintenance accédant au volume :

```sh
MAINTENANCE_CONFIRMED=true DATA_DIR=/data BACKUP_DIR=/tmp/sauvegarde-unique npm run backup
```

`BACKUP_DIR` doit être un répertoire nouveau ou vide, hors de `DATA_DIR`. Le script refuse une destination non vide ou située dans les données source. Le chemin `/tmp/sauvegarde-unique` est un exemple de transit : il est éphémère. Exporter immédiatement la sauvegarde complète vers un stockage protégé **hors du volume et du conteneur Railway**, puis vérifier son transfert avant de supprimer la copie temporaire. Ne pas annoncer la réussite d’une sauvegarde externe sur la seule réussite de la commande locale.

Ne pas copier uniquement le fichier principal SQLite pendant que l’application écrit : des transactions peuvent résider dans le WAL. Une copie complète à froid est une alternative, à condition d’arrêter et vérifier tous les écrivains et de préserver ensemble base, fichiers associés et documents.

Chiffrer les sauvegardes, restreindre leurs accès, les stocker séparément et fixer fréquence, rétention et objectifs de reprise avec l’établissement. Les durées des sauvegardes doivent être articulées avec les demandes de suppression.

## Restauration

Le script `npm run restore` vérifie les empreintes du manifeste et l’intégrité SQLite avant copie. Il refuse une destination non vide ou imbriquée avec la sauvegarde. Il restaure la base et les documents, puis purge les sessions enregistrées pour ne pas réactiver d’anciennes connexions.

```sh
MAINTENANCE_CONFIRMED=true BACKUP_DIR=/chemin/sauvegarde RESTORE_DIR=/chemin/restauration-vide npm run restore
```

`RESTORE_DIR` doit être nouveau ou vide et distinct de `BACKUP_DIR`, sans imbrication dans un sens ou dans l’autre. Le script ne remplace jamais une installation existante. Arrêter l’application cible et préserver ses données avant toute bascule. Ne pas restaurer directement sur un répertoire de production déjà occupé.

Après restauration, vérifier les propriétaires et permissions, utiliser une version compatible du code, puis démarrer une instance isolée avec `DATA_DIR` pointant vers le répertoire restauré et sans `SEED_DEMO`. Vérifier une nouvelle connexion, les classes, les permissions, les téléchargements et les données attendues. Consigner résultat, durée de reprise et écarts avant de rouvrir le service. Aucun contact vers les fournisseurs réels n’est nécessaire pour ce premier contrôle isolé.

### Niveau de vérification

Le test automatisé local `tests/operations.test.mjs` a été exécuté avec succès pendant le développement : provisionnement sans écrasement, sauvegarde, restauration des comptes et d’un fichier, intégrité de la base, suppression des sessions et refus d’une sauvegarde altérée. Ce test utilise des données synthétiques dans des répertoires temporaires. Il ne démontre ni une sauvegarde de production, ni un export hors Railway, ni un exercice de reprise du service distant : ces opérations restent à exécuter dans l’environnement retenu.

## Données personnelles et responsabilités

L’établissement doit définir ses responsabilités avec son DPO ou conseil compétent : finalités, base légale, information des élèves et responsables légaux, droits d’accès et de suppression, gestion des incidents et contrats avec les sous-traitants. Aucun portail parent n’est exigé par défaut.

Vérifier les lieux effectifs de traitement et de stockage de chaque prestataire, y compris IA, journaux, messagerie et sauvegardes. Un hébergement européen de l’application ne garantit pas celui de tous les traitements. Toute transmission de documents à un fournisseur IA doit être encadrée avant données réelles.

Fixer la conservation des comptes, documents, conversations, traces et sauvegardes. La rétention automatique et l’effacement complet ne doivent pas être supposés opérationnels tant que leurs mécanismes et leurs tests n’existent pas. Ne pas inventer une durée universelle de conformité.

## Support et surveillance

Désigner les référents administratif, pédagogique et technique. Ne jamais demander de mot de passe au support. Limiter les journaux aux informations utiles ; éviter secrets, contenu de conversations et copies de documents. Surveiller les erreurs, l’espace disque, les échecs d’indexation et la consommation IA. Une panne IA doit laisser les documents consultables.

Les fournisseurs pris en charge sont l’API officielle Anthropic (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) ou l’API officielle OpenAI (`AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL=https://api.openai.com/v1`). Anthropic est prioritaire si les deux sont configurés. Les clés sont à saisir dans le gestionnaire sécurisé de l’hébergement ; ne pas les transmettre au navigateur. Les plafonds actuels sont par utilisateur et ne constituent pas un budget global garanti pour l’établissement. Configurer aussi des alertes et limites côté fournisseur.

## Connecteur École Directe expérimental

Le connecteur implémenté reste désactivé par défaut et non validé contre le service distant. Définir `ENABLE_ECOLEDIRECTE=true` **et** une `ECOLEDIRECTE_ENCRYPTION_KEY` valide est nécessaire à son activation. La clé doit contenir exactement 32 octets aléatoires encodés en base64 ; la générer dans le terminal privé de l’opérateur, puis la fournir dans les paramètres sécurisés Railway, jamais dans Git ni dans une conversation :

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Ne pas exécuter cette commande dans un canal partagé de diagnostic. Conserver la clé dans une sauvegarde sécurisée **séparée de la base** ; la base sauvegardée seule ne permet pas de déchiffrer les connexions. Un changement de clé sans migration rend les jetons existants inutilisables et impose une déconnexion/reconnexion. Ne pas réutiliser `SESSION_SECRET` comme clé de chiffrement.

Les jetons enregistrés sont chiffrés par AES-256-GCM et liés à l’utilisateur et à son établissement. Les mots de passe École Directe ne sont pas persistés. Les vérifications QCM sont temporaires en mémoire ; elles expirent et disparaissent au redémarrage. L’activation technique ne remplace pas les accords et tests préalables décrits dans [ECOLEDIRECTE.md](ECOLEDIRECTE.md).

La synchronisation est déclenchée manuellement sur une période bornée, sans tâche de fond ni écriture distante de devoirs. La déconnexion efface la connexion locale ; une option distincte permet de retirer aussi les éléments importés. Cette suppression locale ne prouve pas une révocation du jeton chez École Directe. Conserver la saisie manuelle comme solution de continuité.

Le transport École Directe est maintenu dans `server/ecoledirecte-client.mjs`, sans SDK tiers. `ECOLEDIRECTE_API_VERSION` permet de définir la version du protocole (défaut documenté : `4.97.2`, compatibilité réelle non vérifiée). Les nouvelles tables du cahier de textes et des diagnostics sont créées automatiquement au démarrage dans la base du volume existant. Elles sont incluses dans la sauvegarde SQLite habituelle. La dernière tentative de synchronisation et son étape sont visibles dans l’interface ; aucune reprise réseau n’est lancée au redémarrage.
