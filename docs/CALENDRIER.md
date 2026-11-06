# Calendrier, Chabbat et fêtes

Le planning de l’élève, les créneaux communs des groupes, les programmes de révision générés par l’IA et les « heures calmes » des groupes tiennent compte de Chabbat, des fêtes où le travail est interdit et des jours sans travail saisis par l’administration.

## Méthode (`server/calendar-core.mjs`)
- Calendrier hébraïque calculé sans dépendance (algorithme standard, vérifié sur des dates connues : Roch Hachana 5787 = 12 septembre 2026, Yom Kippour = 21 septembre 2026, Pessah 2026 et 2027, Chavouot 2026).
- Jours de repos (diaspora) : Roch Hachana (2 jours), Yom Kippour, Souccot (2 premiers jours), Chemini Atséret, Sim’hat Torah, Pessah (2 premiers et 2 derniers jours), Chavouot (2 jours), et tous les Chabbat.
- Horaires pour **Paris** : coucher du soleil calculé astronomiquement ; entrée **18 minutes avant** le coucher, sortie **45 minutes après** (marge prudente). Heure de Paris avec changement d’heure.

## À faire valider par l’établissement
Ces horaires sont **approchés** : ils servent à ne rien planifier pendant ces périodes, ils ne remplacent pas les horaires officiels du consistoire. Les marges d’entrée et de sortie, la liste des fêtes (jeûnes, Roch Hodesh, Hanoucca, Pourim non inclus : travail permis), et la gestion des jours de veille de fête sont à confirmer avec le rabbin ou la direction. Les marges se règlent dans `ENTRY_MARGIN_MIN` et `EXIT_MARGIN_MIN`.

## Jours supplémentaires
Onglet « Calendrier » de l’administration : jours sans travail (aucune séance planifiée) ou informations (vacances, sorties).

## Planning
Disponibilités datées ou **hebdomadaires**, horizon de 7 à 31 jours et plafond quotidien réglables, tâches terminables, séances passées conservées au recalcul, tâches non placées affichées avec la raison. Les heures sont celles de Paris telles que saisies.
