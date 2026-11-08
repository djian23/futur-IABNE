#!/usr/bin/env node
// Jeu de données FICTIF et volumineux pour tester et explorer IABNE : plusieurs classes, cours,
// professeurs, élèves, documents, activité, groupes, alertes, signalements…
// Aucune donnée réelle. Jamais en production. Mot de passe public : EcoleDemo2026!
//
//   DATA_DIR=./data-demo node scripts/seed-demo.mjs            (base vide uniquement)
//   DATA_DIR=./data-demo node scripts/seed-demo.mjs --reset    (supprime la base existante de ce dossier)
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

if (
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT_NAME === "production"
) {
  console.error("Refus : jamais de données de démonstration en production.");
  process.exit(1);
}
const reset = process.argv.includes("--reset");
const dataDir = path.resolve(process.env.DATA_DIR || "./data");
if (reset) {
  for (const f of existsSync(dataDir) ? readdirSync(dataDir) : [])
    if (f.startsWith("school.sqlite")) rmSync(path.join(dataDir, f));
  rmSync(path.join(dataDir, "documents"), { recursive: true, force: true });
}
process.env.DATA_DIR = dataDir;
const { db, uid, DATA_DIR } = await import("../server/db.mjs");
if (db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
  console.error(
    `La base de ${DATA_DIR} contient déjà des comptes. Utilisez un autre DATA_DIR ou --reset (supprime cette base).`,
  );
  process.exit(1);
}
// Crée les tables des autres modules (sans démarrer de serveur).
const noop = new Proxy({}, { get: () => () => {} });
(await import("../server/learning.mjs")).registerLearningRoutes(noop);
(await import("../server/groups.mjs")).registerGroupRoutes(noop);
(await import("../server/practice-agent.mjs")).registerPracticeAgent?.(noop, {
  infer() {},
  nextDifficulty() {},
  isConfigured: () => false,
});

// ---------- utilitaires ----------
let seed = 20261108;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;
const shuffle = (list) => [...list].sort(() => rnd() - 0.5);
const DAY = 86400000;
const ago = (days, hours = 0) =>
  new Date(Date.now() - days * DAY - hours * 3600000).toISOString();
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const ins = (table, row) => {
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  ).run(...keys.map((k) => row[k]));
};
const hashCode = (code) =>
  createHash("sha256")
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
const PASSWORD_HASH = bcrypt.hashSync("EcoleDemo2026!", 10);
// Hash valide d'un secret inconnu : un compte « à activer » ne peut pas se connecter avec un mot de passe.
const UNUSABLE = bcrypt.hashSync(uid() + uid(), 4);
const SCHOOL = "school-fake";

// ---------- contenus pédagogiques fictifs mais plausibles ----------
const SUBJECTS = {
  maths: {
    name: "Mathématiques",
    lessons: [
      [
        "Équations du premier degré",
        "Une équation du premier degré s’écrit ax + b = c. Pour la résoudre, on isole l’inconnue en effectuant la même opération des deux côtés : 3x + 5 = 20 donne 3x = 15 puis x = 5. On vérifie toujours en remplaçant x dans l’équation de départ.",
      ],
      [
        "Pourcentages et proportionnalité",
        "Prendre p % d’une quantité, c’est la multiplier par p/100. Une augmentation de 20 % revient à multiplier par 1,2 ; une baisse de 20 % revient à multiplier par 0,8. Deux évolutions successives ne s’additionnent pas : on multiplie les coefficients.",
      ],
    ],
    quiz: [
      [
        "Quelle est la solution de 3x + 5 = 20 ?",
        ["x = 5", "x = 25/3", "x = 15", "x = 8"],
        0,
        "On soustrait 5 puis on divise par 3 : x = 5 [S1].",
        "Équations",
      ],
      [
        "Un prix de 80 € augmente de 25 %. Quel est le nouveau prix ?",
        ["100 €", "105 €", "85 €", "120 €"],
        0,
        "80 × 1,25 = 100 [S1].",
        "Pourcentages",
      ],
      [
        "Une baisse de 20 % correspond à multiplier par :",
        ["0,2", "0,8", "1,2", "0,98"],
        1,
        "Baisser de 20 %, c’est garder 80 % : coefficient 0,8 [S1].",
        "Pourcentages",
      ],
    ],
    qa: [
      [
        "Comment résoudre 2x − 7 = 9 ?",
        "On ajoute 7 des deux côtés : 2x = 16, puis on divise par 2 : x = 8. Vérification : 2 × 8 − 7 = 9 [S1].",
      ],
      [
        "Pourquoi 20 % puis 20 % ne font pas 40 % ?",
        "Les coefficients se multiplient : 1,2 × 1,2 = 1,44, soit une hausse de 44 % [S1].",
      ],
      ["Comment calculer 15 % de 60 ?", "On calcule 60 × 15/100 = 9 [S1]."],
    ],
    mistakes: [
      [
        "Équations",
        "J’oublie de changer le signe quand je passe un terme de l’autre côté.",
      ],
      ["Pourcentages", "J’additionne les pourcentages successifs."],
    ],
  },
  francais: {
    name: "Français",
    lessons: [
      [
        "La phrase complexe",
        "Une phrase complexe contient plusieurs verbes conjugués. La proposition principale peut se suffire à elle-même ; la subordonnée dépend d’un mot de liaison (que, qui, parce que, lorsque…). Exemple : « Je pense que tu as raison. »",
      ],
      [
        "Le commentaire de texte",
        "Un commentaire s’organise en introduction (auteur, texte, projet de lecture), développement en deux ou trois axes appuyés sur des citations analysées, et conclusion qui répond au projet de lecture.",
      ],
    ],
    quiz: [
      [
        "Dans « Je pense que tu as raison », « que tu as raison » est :",
        [
          "une proposition subordonnée",
          "une proposition principale",
          "un complément du nom",
          "une interjection",
        ],
        0,
        "Elle dépend du verbe « pense » [S1].",
        "Phrase complexe",
      ],
      [
        "Quel mot introduit une subordonnée de cause ?",
        ["parce que", "lorsque", "bien que", "afin que"],
        0,
        "« Parce que » exprime la cause [S1].",
        "Subordonnées",
      ],
      [
        "Dans un commentaire, les citations servent à :",
        [
          "appuyer l’analyse",
          "remplir la page",
          "remplacer l’introduction",
          "éviter d’analyser",
        ],
        0,
        "Chaque citation est analysée pour soutenir un axe [S1].",
        "Commentaire",
      ],
    ],
    qa: [
      [
        "Comment repérer une proposition subordonnée ?",
        "Elle dépend d’un autre verbe et est introduite par un mot subordonnant (que, qui, parce que…) [S1].",
      ],
      [
        "Que mettre dans l’introduction d’un commentaire ?",
        "L’auteur, le texte, le projet de lecture et l’annonce des axes [S1].",
      ],
      [
        "Comment bien utiliser une citation ?",
        "On la copie fidèlement, puis on l’analyse : procédé, effet, sens [S1].",
      ],
    ],
    mistakes: [
      ["Commentaire", "Je raconte le texte au lieu de l’analyser."],
      ["Phrase complexe", "Je confonds principale et subordonnée."],
    ],
  },
  histgeo: {
    name: "Histoire-Géographie",
    lessons: [
      [
        "La Révolution française",
        "En 1789, les États généraux sont convoqués. Le 17 juin, le tiers état se proclame Assemblée nationale ; le 14 juillet, la Bastille est prise ; en août, la Déclaration des droits de l’homme et du citoyen proclame la liberté et l’égalité en droits.",
      ],
      [
        "Les aires urbaines",
        "Une aire urbaine regroupe une ville-centre, sa banlieue et des communes dont une part importante des habitants travaille dans le pôle. La métropolisation concentre emplois, services et pouvoirs de décision dans les grandes villes.",
      ],
    ],
    quiz: [
      [
        "Quel événement a lieu le 14 juillet 1789 ?",
        [
          "Prise de la Bastille",
          "Serment du Jeu de paume",
          "Abolition des privilèges",
          "Fuite à Varennes",
        ],
        0,
        "Les Parisiens prennent la Bastille [S1].",
        "Révolution",
      ],
      [
        "La Déclaration des droits de l’homme et du citoyen date de :",
        ["août 1789", "juin 1791", "septembre 1792", "1799"],
        0,
        "Elle est adoptée en août 1789 [S1].",
        "Révolution",
      ],
      [
        "Une métropole est :",
        [
          "une grande ville concentrant fonctions et pouvoirs",
          "un village rural",
          "une zone industrielle isolée",
          "une frontière",
        ],
        0,
        "La métropolisation concentre les fonctions de commandement [S1].",
        "Urbanisation",
      ],
    ],
    qa: [
      [
        "Pourquoi le 14 juillet 1789 est-il important ?",
        "La prise de la Bastille symbolise la fin de l’arbitraire royal et le début de la Révolution à Paris [S1].",
      ],
      [
        "Qu’est-ce que la métropolisation ?",
        "La concentration des emplois, des services et des pouvoirs dans les grandes villes [S1].",
      ],
      [
        "Que proclame la Déclaration de 1789 ?",
        "La liberté et l’égalité en droits des citoyens [S1].",
      ],
    ],
    mistakes: [
      ["Chronologie", "Je mélange les dates de 1789 et 1792."],
      ["Urbanisation", "Je confonds aire urbaine et agglomération."],
    ],
  },
  anglais: {
    name: "Anglais",
    lessons: [
      [
        "Present perfect et prétérit",
        "On utilise le present perfect (have/has + participe passé) pour un fait passé relié au présent : I have lived here for two years. Le prétérit s’emploie pour une action terminée à un moment précisé : I lived in Lyon in 2019.",
      ],
      [
        "Giving an opinion",
        "To give an opinion: In my opinion…, I believe that…, As far as I’m concerned… To nuance: however, on the other hand, nevertheless.",
      ],
    ],
    quiz: [
      [
        "Choose the correct sentence.",
        [
          "I have lived here since 2020.",
          "I live here since 2020.",
          "I am living here since 2020.",
          "I lived here since 2020.",
        ],
        0,
        "Since + present perfect [S1].",
        "Present perfect",
      ],
      [
        "Which sentence is in the preterite?",
        [
          "She visited Paris in 2019.",
          "She has visited Paris.",
          "She is visiting Paris.",
          "She will visit Paris.",
        ],
        0,
        "A finished action at a given time [S1].",
        "Prétérit",
      ],
      [
        "Which expression introduces an opinion?",
        ["In my opinion", "However", "Moreover", "Meanwhile"],
        0,
        "“In my opinion” introduces a point of view [S1].",
        "Opinion",
      ],
    ],
    qa: [
      [
        "When do I use the present perfect?",
        "For a past fact connected to the present, often with for, since or ever [S1].",
      ],
      [
        "How do I give my opinion?",
        "With expressions such as “In my opinion” or “I believe that”, then justify with an example [S1].",
      ],
      [
        "What is the difference with the preterite?",
        "The preterite is for a finished action at a specific time in the past [S1].",
      ],
    ],
    mistakes: [
      ["Present perfect", "J’utilise since avec le prétérit."],
      ["Opinion", "J’oublie de justifier avec un exemple."],
    ],
  },
  svt: {
    name: "SVT",
    lessons: [
      [
        "La cellule et l’ADN",
        "L’ADN, support de l’information génétique, est localisé dans le noyau des cellules. Il est organisé en chromosomes ; un gène est une portion d’ADN qui détermine un caractère.",
      ],
      [
        "Le système immunitaire",
        "Face à un agent infectieux, l’organisme déclenche une réponse immunitaire : réaction innée immédiate, puis réponse adaptative avec production d’anticorps spécifiques. Un vaccin prépare cette réponse sans provoquer la maladie.",
      ],
    ],
    quiz: [
      [
        "Où se trouve l’ADN dans une cellule animale ?",
        [
          "Dans le noyau",
          "Dans la membrane",
          "Dans le cytoplasme uniquement",
          "Dans la paroi",
        ],
        0,
        "L’ADN est localisé dans le noyau [S1].",
        "Cellule",
      ],
      [
        "Un gène est :",
        [
          "une portion d’ADN",
          "une cellule",
          "un organe",
          "une protéine du sang",
        ],
        0,
        "Un gène est une portion d’ADN qui détermine un caractère [S1].",
        "Génétique",
      ],
      [
        "Un vaccin permet de :",
        [
          "préparer la réponse immunitaire",
          "guérir toutes les maladies",
          "remplacer les anticorps",
          "détruire les cellules saines",
        ],
        0,
        "Il prépare la réponse adaptative sans provoquer la maladie [S1].",
        "Immunité",
      ],
    ],
    qa: [
      [
        "Quelle est la différence entre gène et chromosome ?",
        "Un chromosome est une longue molécule d’ADN ; un gène est une portion de cet ADN [S1].",
      ],
      [
        "Pourquoi se faire vacciner ?",
        "Le vaccin entraîne le système immunitaire à reconnaître l’agent infectieux [S1].",
      ],
      [
        "Où est stockée l’information génétique ?",
        "Dans l’ADN, situé dans le noyau des cellules [S1].",
      ],
    ],
    mistakes: [
      ["Génétique", "Je confonds gène, chromosome et ADN."],
      ["Immunité", "Je crois qu’un vaccin donne la maladie."],
    ],
  },
  physchimie: {
    name: "Physique-Chimie",
    lessons: [
      [
        "Vitesse et mouvement",
        "La vitesse moyenne se calcule par v = d / t. Si d est en mètres et t en secondes, v est en m/s. Pour passer de m/s à km/h, on multiplie par 3,6.",
      ],
      [
        "Atomes et molécules",
        "Un atome est constitué d’un noyau (protons et neutrons) et d’électrons. La molécule d’eau H₂O contient deux atomes d’hydrogène et un atome d’oxygène.",
      ],
    ],
    quiz: [
      [
        "Un cycliste parcourt 30 km en 1,5 h. Quelle est sa vitesse moyenne ?",
        ["20 km/h", "45 km/h", "30 km/h", "15 km/h"],
        0,
        "v = 30 / 1,5 = 20 km/h [S1].",
        "Vitesse",
      ],
      [
        "10 m/s correspondent à :",
        ["36 km/h", "10 km/h", "3,6 km/h", "100 km/h"],
        0,
        "On multiplie par 3,6 [S1].",
        "Vitesse",
      ],
      [
        "Quelle est la formule de la molécule d’eau ?",
        ["H₂O", "CO₂", "O₂", "NaCl"],
        0,
        "Deux hydrogènes, un oxygène [S1].",
        "Molécules",
      ],
    ],
    qa: [
      ["Comment convertir des m/s en km/h ?", "On multiplie par 3,6 [S1]."],
      [
        "Que contient le noyau d’un atome ?",
        "Des protons et des neutrons [S1].",
      ],
      [
        "Comment calculer une vitesse ?",
        "v = d / t, avec des unités cohérentes [S1].",
      ],
    ],
    mistakes: [
      ["Unités", "Je mélange km/h et m/s."],
      ["Molécules", "Je confonds atome et molécule."],
    ],
  },
  juives: {
    name: "Études juives",
    lessons: [
      [
        "Les fêtes de Tichri",
        "Roch Hachana marque le début de l’année et se célèbre par la sonnerie du chofar. Dix jours plus tard, Yom Kippour est consacré au jeûne et au repentir. Souccot commémore le séjour dans le désert et se célèbre dans une souccah. (Pour toute question de pratique, se référer au rav de l’école.)",
      ],
      [
        "Parachat Berechit",
        "בראשית ברא אלהים את השמים ואת הארץ — Au commencement, Dieu créa le ciel et la terre. Le texte décrit la création en six jours, puis le septième jour, le Chabbat, comme jour de repos.",
      ],
    ],
    quiz: [
      [
        "Quel instrument est sonné à Roch Hachana ?",
        ["Le chofar", "La harpe", "Le tambourin", "La cithare"],
        0,
        "On sonne du chofar à Roch Hachana [S1].",
        "Fêtes",
      ],
      [
        "Quel jour est consacré au jeûne et au repentir ?",
        ["Yom Kippour", "Souccot", "Pourim", "Roch Hodech"],
        0,
        "Yom Kippour est consacré au jeûne et au repentir [S1].",
        "Fêtes",
      ],
      [
        "Combien de jours dure la création avant le Chabbat ?",
        ["Six", "Sept", "Dix", "Quarante"],
        0,
        "Six jours, puis le septième jour est le Chabbat [S1].",
        "Berechit",
      ],
    ],
    qa: [
      [
        "Que commémore Souccot ?",
        "Le séjour dans le désert, avec la souccah [S1].",
      ],
      [
        "Que dit le premier verset de la Torah ?",
        "בראשית ברא אלהים את השמים ואת הארץ : « Au commencement, Dieu créa le ciel et la terre » [S1].",
      ],
      ["Quand a lieu Yom Kippour ?", "Dix jours après Roch Hachana [S1]."],
    ],
    mistakes: [
      ["Fêtes", "Je mélange Roch Hachana et Yom Kippour."],
      ["Berechit", "Je ne retiens pas l’ordre des jours."],
    ],
  },
  hebreu: {
    name: "Hébreu",
    lessons: [
      [
        "L’alphabet hébreu",
        "L’alphabet hébreu compte 22 lettres et s’écrit de droite à gauche : א (alef), ב (bet), ג (guimel), ד (dalet)… Les voyelles (nikoud) sont des points placés sous ou au-dessus des lettres.",
      ],
      [
        "Salutations",
        "שלום (chalom) : bonjour, paix. תודה (toda) : merci. בבקשה (bevakacha) : s’il vous plaît. מה שלומך? (ma chlomkha ?) : comment vas-tu ?",
      ],
    ],
    quiz: [
      [
        "Combien de lettres compte l’alphabet hébreu ?",
        ["22", "26", "24", "20"],
        0,
        "Il compte 22 lettres [S1].",
        "Alphabet",
      ],
      [
        "Que signifie תודה ?",
        ["Merci", "Bonjour", "Au revoir", "S’il vous plaît"],
        0,
        "תודה (toda) signifie merci [S1].",
        "Vocabulaire",
      ],
      [
        "Dans quel sens s’écrit l’hébreu ?",
        [
          "De droite à gauche",
          "De gauche à droite",
          "De haut en bas",
          "Dans les deux sens",
        ],
        0,
        "L’hébreu s’écrit de droite à gauche [S1].",
        "Alphabet",
      ],
    ],
    qa: [
      ["Comment dit-on merci en hébreu ?", "תודה (toda) [S1]."],
      [
        "À quoi servent les nikoud ?",
        "Ce sont les voyelles, placées sous ou au-dessus des lettres [S1].",
      ],
      [
        "Comment demande-t-on « comment vas-tu ? » ?",
        "מה שלומך? (ma chlomkha ?) [S1].",
      ],
    ],
    mistakes: [
      ["Alphabet", "Je confonds ב et כ."],
      ["Lecture", "Je lis de gauche à droite par réflexe."],
    ],
  },
  eps: {
    name: "EPS",
    lessons: [
      [
        "Échauffement et prévention",
        "Un échauffement progressif (5 à 10 minutes) élève la fréquence cardiaque, assouplit les articulations et réduit le risque de blessure. Il se termine par des gestes proches de l’activité.",
      ],
      [
        "Endurance et zone d’effort",
        "Pour développer son endurance, on court à une intensité qui permet de parler. La fréquence cardiaque maximale se calcule approximativement par 220 moins l’âge.",
      ],
    ],
    quiz: [
      [
        "Combien de temps dure un échauffement efficace ?",
        ["5 à 10 minutes", "30 secondes", "1 heure", "Il est inutile"],
        0,
        "Un échauffement progressif dure 5 à 10 minutes [S1].",
        "Échauffement",
      ],
      [
        "Quelle est la fréquence cardiaque maximale approximative d’un élève de 16 ans ?",
        ["204", "160", "220", "180"],
        0,
        "220 − 16 = 204 [S1].",
        "Endurance",
      ],
      [
        "En course d’endurance, on doit pouvoir :",
        ["parler", "sprinter", "retenir son souffle", "s’arrêter souvent"],
        0,
        "L’intensité doit permettre de parler [S1].",
        "Endurance",
      ],
    ],
    qa: [
      [
        "Pourquoi s’échauffer ?",
        "Pour élever la fréquence cardiaque, assouplir les articulations et éviter les blessures [S1].",
      ],
      ["Comment calculer ma FC max ?", "Environ 220 moins ton âge [S1]."],
      [
        "Comment progresser en endurance ?",
        "En courant à une intensité où l’on peut encore parler [S1].",
      ],
    ],
    mistakes: [
      ["Endurance", "Je pars trop vite et je m’épuise."],
      ["Échauffement", "Je m’échauffe trop peu."],
    ],
  },
  nsi: {
    name: "NSI",
    lessons: [
      [
        "Variables, conditions et boucles en Python",
        "Une variable associe un nom à une valeur : age = 16. Une boucle for répète des instructions : for i in range(3): print(i) affiche 0, 1, 2. Une condition utilise if / else.",
      ],
      [
        "Complexité d’un algorithme",
        "La complexité mesure l’évolution du temps d’exécution en fonction de la taille des données. Une recherche séquentielle est linéaire ; une recherche dichotomique dans une liste triée est logarithmique.",
      ],
    ],
    quiz: [
      [
        "Que fait for i in range(3): print(i) ?",
        [
          "Affiche 0, 1, 2",
          "Affiche 1, 2, 3",
          "Affiche 3 fois 3",
          "Ne fait rien",
        ],
        0,
        "range(3) génère 0, 1, 2 [S1].",
        "Boucles",
      ],
      [
        "La recherche dichotomique exige une liste :",
        ["triée", "vide", "de nombres négatifs", "de chaînes uniquement"],
        0,
        "Elle ne fonctionne que sur une liste triée [S1].",
        "Complexité",
      ],
      [
        "Quelle structure choisit entre deux cas ?",
        ["if / else", "for", "while True", "import"],
        0,
        "La condition if / else [S1].",
        "Conditions",
      ],
    ],
    qa: [
      [
        "Comment répéter 5 fois une instruction ?",
        "Avec for i in range(5): suivi de l’instruction indentée [S1].",
      ],
      [
        "Pourquoi la dichotomie est-elle rapide ?",
        "Elle divise la liste en deux à chaque étape : complexité logarithmique [S1].",
      ],
      [
        "À quoi sert une variable ?",
        "À associer un nom à une valeur réutilisable [S1].",
      ],
    ],
    mistakes: [
      ["Boucles", "J’oublie que range(n) s’arrête à n−1."],
      ["Indentation", "Je décale mal les blocs."],
    ],
  },
  philo: {
    name: "Philosophie",
    lessons: [
      [
        "La liberté",
        "Être libre, est-ce faire ce que l’on veut ? Spinoza oppose la liberté à l’ignorance des causes qui nous déterminent ; Kant lie la liberté à l’autonomie, c’est-à-dire obéir à la loi que la raison se donne.",
      ],
      [
        "Construire une dissertation",
        "Une dissertation analyse les termes du sujet, formule une problématique, puis développe un plan dialectique : thèse, antithèse, dépassement, en s’appuyant sur des auteurs et des exemples précis.",
      ],
    ],
    quiz: [
      [
        "Pour Kant, la liberté est liée à :",
        [
          "l’autonomie",
          "l’obéissance aveugle",
          "le hasard",
          "le désir immédiat",
        ],
        0,
        "Obéir à la loi que la raison se donne [S1].",
        "Liberté",
      ],
      [
        "Une problématique est :",
        [
          "une question que pose le sujet",
          "un résumé du cours",
          "une citation",
          "une conclusion",
        ],
        0,
        "Elle formule la tension du sujet [S1].",
        "Dissertation",
      ],
      [
        "Un plan dialectique comporte :",
        [
          "thèse, antithèse, dépassement",
          "trois résumés",
          "une liste de citations",
          "un seul argument",
        ],
        0,
        "Thèse, antithèse, puis dépassement [S1].",
        "Dissertation",
      ],
    ],
    qa: [
      [
        "Que veut dire « être libre » pour Spinoza ?",
        "Connaître les causes qui nous déterminent plutôt que les ignorer [S1].",
      ],
      [
        "Comment trouver une problématique ?",
        "En analysant les termes du sujet et la tension entre eux [S1].",
      ],
      [
        "Combien de parties dans une dissertation ?",
        "Généralement trois : thèse, antithèse, dépassement [S1].",
      ],
    ],
    mistakes: [
      ["Dissertation", "Je récite le cours au lieu de répondre au sujet."],
      ["Liberté", "Je confonds liberté et absence de contraintes."],
    ],
  },
};

const LEVELS = [
  {
    key: "6e",
    name: "Sixième",
    classes: [
      ["6e A", 18],
      ["6e B", 17],
    ],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "svt",
      "juives",
      "hebreu",
      "eps",
    ],
  },
  {
    key: "5e",
    name: "Cinquième",
    classes: [["5e A", 20]],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "svt",
      "physchimie",
      "juives",
      "hebreu",
      "eps",
    ],
  },
  {
    key: "4e",
    name: "Quatrième",
    classes: [["4e A", 19]],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "svt",
      "physchimie",
      "juives",
      "hebreu",
      "eps",
    ],
  },
  {
    key: "3e",
    name: "Troisième",
    classes: [["3e A", 21]],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "svt",
      "physchimie",
      "juives",
      "hebreu",
      "eps",
    ],
  },
  {
    key: "2nde",
    name: "Seconde",
    classes: [
      ["2nde A", 22],
      ["2nde B", 20],
    ],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "svt",
      "physchimie",
      "juives",
      "hebreu",
      "eps",
    ],
  },
  {
    key: "1re",
    name: "Première",
    classes: [["1re A", 18]],
    subjects: [
      "maths",
      "francais",
      "histgeo",
      "anglais",
      "physchimie",
      "juives",
      "hebreu",
      "nsi",
    ],
  },
  {
    key: "Tle",
    name: "Terminale",
    classes: [["Tle A", 16]],
    subjects: [
      "maths",
      "philo",
      "histgeo",
      "anglais",
      "physchimie",
      "juives",
      "hebreu",
      "nsi",
    ],
  },
];
// [nom, adresse (facultative), matière, niveaux]
const TEACHERS = [
  ["Sarah Bernard", "prof@demo.local", "maths", ["6e", "5e", "4e", "3e"]],
  ["Daniel Perez", null, "maths", ["2nde", "1re", "Tle", "group-maths"]],
  ["Claire Lambert", null, "francais", ["6e", "5e", "4e", "3e"]],
  ["Julien Roche", null, "francais", ["2nde", "1re"]],
  ["Marc Dubois", null, "histgeo", ["6e", "5e", "4e", "3e"]],
  ["Nadia Haddad", null, "histgeo", ["2nde", "1re", "Tle"]],
  ["Emma Walker", null, "anglais", ["6e", "5e", "4e", "3e"]],
  ["Olivier Brun", null, "anglais", ["2nde", "1re", "Tle"]],
  ["Léa Fontaine", null, "svt", ["6e", "5e", "4e", "3e", "2nde"]],
  [
    "Thomas Girard",
    null,
    "physchimie",
    ["5e", "4e", "3e", "2nde", "1re", "Tle"],
  ],
  ["Avraham Cohen", null, "juives", ["6e", "5e", "4e", "3e"]],
  ["Esther Lévy", null, "juives", ["2nde", "1re", "Tle"]],
  [
    "Yaël Mizrahi",
    null,
    "hebreu",
    ["6e", "5e", "4e", "3e", "2nde", "1re", "Tle", "group-hebreu"],
  ],
  ["Karim Benali", null, "eps", ["6e", "5e", "4e", "3e", "2nde"]],
  ["Sophie Marchand", null, "nsi", ["1re", "Tle"]],
  ["Antoine Rey", null, "philo", ["Tle"]],
];
const FIRST = [
  "Alex",
  "Noa",
  "Léa",
  "Lou",
  "Eli",
  "Maya",
  "Ethan",
  "Tamar",
  "Raphaël",
  "Yaël",
  "Samuel",
  "Sarah",
  "Jonathan",
  "Myriam",
  "David",
  "Rachel",
  "Jacob",
  "Ruth",
  "Gabriel",
  "Chloé",
  "Nathan",
  "Inès",
  "Ariel",
  "Talia",
  "Adam",
  "Emma",
  "Simon",
  "Léo",
  "Mila",
  "Isaac",
  "Judith",
  "Hugo",
  "Camille",
  "Ilan",
  "Anna",
  "Yossef",
  "Dina",
  "Maxime",
  "Zoé",
  "Daniel",
  "Nina",
  "Elie",
  "Salomé",
  "Matéo",
  "Orly",
  "Benjamin",
  "Lila",
  "Yonatan",
  "Alma",
  "Tom",
];
const LAST = [
  "Dupont",
  "Moreau",
  "Cohen",
  "Lévy",
  "Azoulay",
  "Benhamou",
  "Martin",
  "Bernard",
  "Haddad",
  "Attal",
  "Zerbib",
  "Uzan",
  "Petit",
  "Rousseau",
  "Dray",
  "Elbaz",
  "Fitoussi",
  "Gabay",
  "Hayoun",
  "Illouz",
  "Kahn",
  "Lellouche",
  "Mimoun",
  "Nahmias",
  "Ohayon",
  "Partouche",
  "Quenot",
  "Rubin",
  "Sebbag",
  "Taieb",
  "Uriel",
  "Vidal",
  "Wolff",
  "Yana",
  "Zana",
  "Amar",
  "Berdugo",
  "Chemla",
  "Dahan",
  "Edery",
  "Franck",
  "Guedj",
  "Hadjadj",
  "Ifergan",
  "Journo",
  "Kalfon",
  "Lugassy",
  "Mamane",
  "Nakache",
  "Oziel",
];

// ---------- établissement, années, matières ----------
const t0 = ago(70);
ins("schools", {
  id: SCHOOL,
  name: "Collège-Lycée Yabné Paris (données fictives de démonstration)",
});
ins("school_years", { id: "year-fake", school_id: SCHOOL, name: "2026–2027" });
const subjectId = {};
for (const [key, s] of Object.entries(SUBJECTS)) {
  subjectId[key] = `subject-${key}`;
  ins("subjects", { id: subjectId[key], school_id: SCHOOL, name: s.name });
}
const user = (role, name, email, extra = {}) => {
  const id = uid();
  const login =
    slug(name.split(" ")[0]) + "." + slug(name.split(" ").slice(1).join(" "));
  let loginId = login,
    n = 2;
  while (db.prepare("SELECT 1 FROM user_extras WHERE login_id=?").get(loginId))
    loginId = `${login}${n++}`;
  const finalEmail = email || `${loginId}@demo.local`;
  ins("users", {
    id,
    school_id: SCHOOL,
    role,
    name,
    email: finalEmail,
    password_hash: PASSWORD_HASH,
    active: 1,
    created_at: t0,
  });
  ins("user_extras", {
    user_id: id,
    school_id: SCHOOL,
    login_id: loginId,
    must_change_password: 0,
    last_login_at: chance(0.85) ? ago(rnd() * 9, rnd() * 20) : null,
    ...extra,
  });
  return { id, name, email: finalEmail, role, loginId };
};

// ---------- administration (3 profils) ----------
const admins = [
  user("admin", "Camille Martin", "admin@demo.local", {
    admin_kind: "full",
    last_login_at: ago(0, 2),
  }),
  user("admin", "Nathalie Secrétaire", "secretariat@demo.local", {
    admin_kind: "secretariat",
    last_login_at: ago(1),
  }),
  user("admin", "Michel Directeur", "direction@demo.local", {
    admin_kind: "direction",
    last_login_at: ago(0, 5),
  }),
];

// ---------- professeurs ----------
const teachers = TEACHERS.map(([name, email, subject, levels]) => ({
  ...user("teacher", name, email),
  subject,
  levels,
}));
const teacherFor = (subject, levelKey) =>
  teachers.find((t) => t.subject === subject && t.levels.includes(levelKey));

// ---------- classes, groupes d'enseignement, élèves ----------
const classes = [];
const usedNames = new Set();
const newStudentName = () => {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) {
      usedNames.add(n);
      return n;
    }
  }
};
const students = [];
for (const level of LEVELS)
  for (const [name, size] of level.classes) {
    const id = `class-${slug(name)}`;
    ins("classes", {
      id,
      school_id: SCHOOL,
      year_id: "year-fake",
      name,
      level: level.name,
    });
    const klass = { id, name, level, students: [], kind: "class" };
    for (let i = 0; i < size; i++) {
      const first = students.length === 0;
      const s = user(
        "student",
        first ? "Alex Dupont" : newStudentName(),
        first ? "eleve@demo.local" : null,
      );
      if (first) usedNames.add("Alex Dupont");
      ins("memberships", { user_id: s.id, class_id: id });
      klass.students.push(s);
      students.push({ ...s, class: klass });
    }
    classes.push(klass);
  }
// Les élèves de 3e A, 1re A et Tle A forment aussi des groupes d'enseignement.
const groupClasses = [
  {
    id: "class-group-maths",
    name: "Spé Maths (1re + Tle)",
    level: { name: "Lycée", key: "group-maths" },
    source: ["1re A", "Tle A"],
    size: 14,
    subject: "maths",
  },
  {
    id: "class-group-hebreu",
    name: "Hébreu avancé (3e à 1re)",
    level: { name: "Collège-Lycée", key: "group-hebreu" },
    source: ["3e A", "2nde A", "1re A"],
    size: 12,
    subject: "hebreu",
  },
];
for (const g of groupClasses) {
  ins("classes", {
    id: g.id,
    school_id: SCHOOL,
    year_id: "year-fake",
    name: g.name,
    level: g.level.name,
  });
  ins("classes_meta", { class_id: g.id, kind: "group" });
  const pool = shuffle(
    classes.filter((c) => g.source.includes(c.name)).flatMap((c) => c.students),
  ).slice(0, g.size);
  for (const s of pool) ins("memberships", { user_id: s.id, class_id: g.id });
  classes.push({
    id: g.id,
    name: g.name,
    level: g.level,
    students: pool,
    kind: "group",
    subject: g.subject,
  });
}
// « delegue@demo.local » : un élève de 3e A.
const delegate = classes.find((c) => c.name === "3e A").students[1];
db.prepare("UPDATE users SET email='delegue@demo.local' WHERE id=?").run(
  delegate.id,
);
delegate.email = "delegue@demo.local";

// ---------- affectations, cours, chapitres, documents ----------
const courses = [];
const documentsByCourse = new Map();
const docDir = path.join(DATA_DIR, "documents");
mkdirSync(docDir, { recursive: true });
const addDocument = (
  course,
  kind,
  title,
  text,
  status,
  createdDaysAgo,
  chapterId,
) => {
  const id = uid();
  const created = ago(createdDaysAgo);
  const storage = `${id}.txt`;
  writeFileSync(path.join(docDir, storage), text, { mode: 0o600 });
  ins("documents", {
    id,
    school_id: SCHOOL,
    course_id: course.id,
    chapter_id: chapterId,
    uploaded_by: course.teacher.id,
    title,
    kind,
    status,
    original_name: `${slug(title)}.txt`,
    mime_type: "text/plain",
    storage_name: storage,
    size_bytes: Buffer.byteLength(text),
    extracted_text: text,
    extraction_status: "ready",
    created_at: created,
    updated_at: created,
  });
  for (
    let start = 0, position = 0;
    start < text.length;
    start += 1000, position++
  )
    ins("document_chunks", {
      id: uid(),
      document_id: id,
      position,
      content: text.slice(start, start + 1200),
    });
  const doc = {
    id,
    title,
    kind,
    status,
    updated_at: created,
    course_id: course.id,
  };
  documentsByCourse.get(course.id).push(doc);
  return doc;
};
const makeCourse = (klass, subject, teacher, levelKey) => {
  ins("assignments", {
    teacher_id: teacher.id,
    class_id: klass.id,
    subject_id: subjectId[subject],
  });
  const id = `course-${slug(klass.name)}-${subject}`;
  const title = `${SUBJECTS[subject].name} — ${klass.name}`;
  ins("courses", {
    id,
    school_id: SCHOOL,
    class_id: klass.id,
    subject_id: subjectId[subject],
    teacher_id: teacher.id,
    title,
    created_at: ago(60),
  });
  const course = { id, title, klass, subject, teacher, levelKey };
  documentsByCourse.set(id, []);
  const bank = SUBJECTS[subject];
  const chapters = bank.lessons.map(([t], i) => {
    const cid = uid();
    ins("chapters", {
      id: cid,
      course_id: id,
      title: `Chapitre ${i + 1} — ${t}`,
      position: i,
    });
    return cid;
  });
  // 5 % des cours sans aucun document, 10 % seulement des brouillons : pour tester la couverture.
  const coverage = rnd();
  if (coverage > 0.05) {
    const published = coverage > 0.15;
    bank.lessons.forEach(([t, text], i) =>
      addDocument(
        course,
        "lesson",
        `${t} (${klass.name})`,
        `${t}\n\n${text}`,
        published ? "published" : "draft",
        50 - i * 9,
        chapters[i],
      ),
    );
    const statements = bank.quiz.map(([q], i) => `${i + 1}) ${q}`).join("\n");
    addDocument(
      course,
      "exercise",
      `Exercices — ${bank.lessons[0][0]}`,
      `Exercices d’entraînement\n\n${statements}`,
      published ? "published" : "draft",
      40,
      chapters[0],
    );
    if (published) {
      const answers = bank.quiz
        .map(
          ([q, opts, a, expl], i) =>
            `${i + 1}) ${opts[a]}. ${expl.replace(/ \[S1\]/, "")}`,
        )
        .join("\n");
      addDocument(
        course,
        "correction",
        `Corrigé — ${bank.lessons[0][0]}`,
        `Corrigé des exercices\n\n${answers}`,
        "published",
        36,
        chapters[0],
      );
      addDocument(
        course,
        "exam",
        `Contrôle d’entraînement — ${bank.lessons[1][0]}`,
        `Contrôle (20 points)\n\n${bank.quiz.map(([q], i) => `Question ${i + 1} (${i === 0 ? 8 : i === 1 ? 6 : 6} pts) : ${q}`).join("\n")}`,
        "published",
        20,
        chapters[1],
      );
    }
  }
  courses.push(course);
  return course;
};
for (const level of LEVELS)
  for (const klass of classes.filter((c) =>
    level.classes.some(([n]) => n === c.name),
  ))
    for (const subject of level.subjects) {
      const teacher = teacherFor(subject, level.key);
      if (teacher) makeCourse(klass, subject, teacher, level.key);
    }
for (const g of groupClasses) {
  const klass = classes.find((c) => c.id === g.id);
  makeCourse(klass, g.subject, teacherFor(g.subject, g.level.key), g.level.key);
}

// ---------- réglages variés, remplaçants, délégués, méthode du professeur ----------
const courseOf = (className, subject) =>
  courses.find((c) => c.klass.name === className && c.subject === subject);
const lock = courseOf("Tle A", "maths");
ins("course_ai_settings", {
  course_id: lock.id,
  ai_enabled: 1,
  max_help: "method",
  students_can_generate: 1,
  corrections_visible_from: ago(-6),
  updated_by: lock.teacher.id,
  updated_at: ago(2),
});
ins("course_ai_settings", {
  course_id: courseOf("4e A", "eps").id,
  ai_enabled: 0,
  max_help: "hints",
  students_can_generate: 0,
  updated_by: courseOf("4e A", "eps").teacher.id,
  updated_at: ago(3),
});
ins("course_ai_settings", {
  course_id: courseOf("2nde A", "histgeo").id,
  ai_enabled: 1,
  max_help: "hints",
  students_can_generate: 0,
  updated_by: courseOf("2nde A", "histgeo").teacher.id,
  updated_at: ago(5),
});
ins("course_teachers", {
  course_id: courseOf("3e A", "maths").id,
  teacher_id: teachers.find((t) => t.name === "Daniel Perez").id,
  role: "substitute",
  starts_at: ago(3),
  ends_at: ago(-12),
});
ins("course_teachers", {
  course_id: courseOf("5e A", "francais").id,
  teacher_id: teachers.find((t) => t.name === "Julien Roche").id,
  role: "substitute",
  starts_at: ago(40),
  ends_at: ago(20),
});
for (const course of shuffle(courses).slice(0, 6)) {
  const s = pick(course.klass.students);
  ins("delegations", {
    id: uid(),
    school_id: SCHOOL,
    course_id: course.id,
    student_id: s.id,
    created_by: course.teacher.id,
    created_at: ago(15),
  });
}
for (const course of shuffle(courses).slice(0, 18))
  ins("teacher_tutor_profiles", {
    course_id: course.id,
    school_id: SCHOOL,
    teacher_id: course.teacher.id,
    instructions:
      "Toujours poser les données, nommer la propriété utilisée, puis conclure par une phrase. Employer le vocabulaire du cours.",
    sources: "[]",
    approved: chance(0.7) ? 1 : 0,
    updated_at: ago(10),
  });

// ---------- comptes à activer (codes connus pour tester la première connexion) ----------
const pending = [];
const pendingPool = shuffle(students).slice(0, 8);
pendingPool.forEach((s, i) => {
  const code = `TEST-${String(i + 1)
    .padStart(4, "0")
    .replace(/\d/g, (d) => "ABCDEFGHJK"[Number(d)])}`;
  db.prepare(
    "UPDATE user_extras SET activation_hash=?,activation_expires=?,last_login_at=NULL WHERE user_id=?",
  ).run(hashCode(code), ago(-25), s.id);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(UNUSABLE, s.id);
  pending.push({ name: s.name, loginId: s.loginId, code, klass: s.class.name });
});
const pendingIds = new Set(pendingPool.map((s) => s.id));

// ---------- activité des élèves sur 8 semaines ----------
const sourceMeta = (course) =>
  documentsByCourse
    .get(course.id)
    .filter((d) => d.status === "published" && d.kind !== "exam")
    .slice(0, 1)
    .map((d, i) => ({
      id: d.id,
      citation: `S${i + 1}`,
      title: d.title,
      kind: d.kind,
      version: d.updated_at,
    }));
const stats = {
  chats: 0,
  quizzes: 0,
  answers: 0,
  mistakes: 0,
  views: 0,
  tasks: 0,
};
db.exec("BEGIN");
for (const s of students) {
  if (pendingIds.has(s.id)) continue;
  const level = rnd();
  const weeklyActivity =
    level < 0.28
      ? between(4, 9)
      : level < 0.65
        ? between(1, 4)
        : level < 0.85
          ? between(0, 1)
          : 0;
  const klassCourses = courses.filter(
    (c) =>
      s.class.id === c.klass.id || c.klass.students.some((x) => x.id === s.id),
  );
  for (let week = 0; week < 8 && weeklyActivity; week++) {
    const count = chance(0.15)
      ? 0
      : Math.max(0, weeklyActivity + between(-1, 1));
    for (let k = 0; k < count; k++) {
      const course = pick(klassCourses);
      const bank = SUBJECTS[course.subject];
      const sources = sourceMeta(course);
      if (!sources.length) continue;
      const when = ago(week * 7 + rnd() * 6, rnd() * 10);
      const [question, answer] = pick(bank.qa);
      const chatId = uid();
      ins("learning_chats", {
        id: chatId,
        user_id: s.id,
        school_id: SCHOOL,
        course_id: course.id,
        question,
        answer,
        sources: JSON.stringify(sources),
        created_at: when,
      });
      ins("learning_usage", { id: uid(), user_id: s.id, created_at: when });
      ins("ai_usage_log", {
        id: uid(),
        user_id: s.id,
        school_id: SCHOOL,
        route: "/api/ai/chat",
        model: "claude-sonnet-5-5",
        input_tokens: between(900, 2600),
        output_tokens: between(120, 650),
        created_at: when,
      });
      stats.chats++;
      if (chance(0.22)) {
        const quizId = uid();
        const questions = bank.quiz.map(
          ([prompt, options, answerIndex, explanation, topic]) => ({
            id: uid(),
            prompt,
            options,
            answerIndex,
            explanation,
            topic,
          }),
        );
        ins("learning_quizzes", {
          id: quizId,
          user_id: s.id,
          school_id: SCHOOL,
          course_id: course.id,
          difficulty: pick(["easy", "medium", "medium", "hard"]),
          title: `Quiz — ${bank.lessons[0][0]}`,
          questions: JSON.stringify(questions),
          sources: JSON.stringify(sources),
          created_at: when,
        });
        stats.quizzes++;
        const skill = 0.45 + rnd() * 0.5;
        for (const q of questions) {
          if (!chance(0.9)) continue;
          const correct = chance(skill);
          ins("learning_quiz_answers", {
            id: uid(),
            quiz_id: quizId,
            user_id: s.id,
            school_id: SCHOOL,
            question_id: q.id,
            choice_index: correct
              ? q.answerIndex
              : (q.answerIndex + 1 + between(0, 2)) % 4,
            correct: correct ? 1 : 0,
            created_at: when,
          });
          stats.answers++;
        }
      }
    }
  }
  // Mémoire du tuteur, devoirs, consultations de documents.
  if (weeklyActivity && chance(0.4)) {
    const course = pick(klassCourses);
    const [topic, note] = pick(SUBJECTS[course.subject].mistakes);
    ins("tutor_mistakes", {
      id: uid(),
      user_id: s.id,
      school_id: SCHOOL,
      course_id: course.id,
      topic,
      note,
      created_at: ago(rnd() * 20),
    });
    stats.mistakes++;
  }
  if (chance(0.45)) {
    const course = pick(klassCourses);
    ins("learning_tasks", {
      id: uid(),
      user_id: s.id,
      school_id: SCHOOL,
      title: `Devoir de ${SUBJECTS[course.subject].name}`,
      subject: SUBJECTS[course.subject].name,
      due_date: new Date(Date.now() + between(1, 14) * DAY)
        .toISOString()
        .slice(0, 10),
      duration_minutes: pick([30, 45, 60, 90]),
      difficulty: pick([1, 3, 5]),
      completed: 0,
      created_at: ago(rnd() * 5),
    });
    stats.tasks++;
  }
  if (chance(0.5)) {
    ins("learning_recurring", {
      id: uid(),
      user_id: s.id,
      school_id: SCHOOL,
      weekday: between(1, 4),
      start_time: "17:00",
      end_time: pick(["18:30", "19:00"]),
      until_date: null,
      kind: "available",
    });
  }
  for (const course of shuffle(klassCourses).slice(0, between(0, 4)))
    for (const d of shuffle(
      documentsByCourse.get(course.id).filter((d) => d.status === "published"),
    ).slice(0, 2)) {
      ins("document_views", {
        id: uid(),
        user_id: s.id,
        school_id: SCHOOL,
        document_id: d.id,
        course_id: course.id,
        created_at: ago(rnd() * 25),
      });
      stats.views++;
    }
}
db.exec("COMMIT");

// ---------- alertes de sécurité et signalements (fictifs) ----------
const alertStudents = shuffle(
  students.filter((s) => !pendingIds.has(s.id)),
).slice(0, 3);
ins("safety_alerts", {
  id: uid(),
  school_id: SCHOOL,
  user_id: alertStudents[0].id,
  course_id: null,
  category: "distress",
  created_at: ago(0, 3),
});
ins("safety_alerts", {
  id: uid(),
  school_id: SCHOOL,
  user_id: alertStudents[1].id,
  course_id: null,
  category: "harassment",
  created_at: ago(1, 6),
});
ins("safety_alerts", {
  id: uid(),
  school_id: SCHOOL,
  user_id: alertStudents[2].id,
  course_id: null,
  category: "distress",
  created_at: ago(6),
  handled_at: ago(5),
  handled_by: admins[2].id,
});
const reportReasons = [
  "La réponse ne correspond pas à ce que le professeur a dit en classe",
  "Il y a une erreur de calcul",
  "Je ne comprends pas la méthode proposée",
  "Cette réponse est hors sujet",
];
shuffle(courses)
  .slice(0, 5)
  .forEach((course, i) => {
    const s = pick(course.klass.students);
    const chat = db
      .prepare("SELECT * FROM learning_chats WHERE course_id=? LIMIT 1")
      .get(course.id);
    const reportId = uid();
    if (chat)
      ins("learning_reports", {
        id: reportId,
        user_id: chat.user_id,
        school_id: SCHOOL,
        course_id: course.id,
        target_id: chat.id,
        reason: reportReasons[i % 4],
        created_at: ago(i + 1),
      });
    ins("learning_report_snapshots", {
      report_id: reportId,
      user_id: chat ? chat.user_id : s.id,
      school_id: SCHOOL,
      course_id: course.id,
      question: chat?.question || "Question exemple",
      answer: chat?.answer || "Réponse exemple",
      reason: reportReasons[i % 4],
      created_at: ago(i + 1),
      status: ["new", "new", "seen", "fixed", "new"][i],
    });
  });

// ---------- groupes de travail ----------
const groupDefs = [
  ["Révisions brevet maths", "revision", "3e A", 6],
  ["Dissertation de philo", "revision", "Tle A", 4],
  ["Havrouta Parachat Berechit", "binome", "2nde A", 2],
  ["Préparation grand oral", "revision", "Tle A", 5],
  ["Anglais : oral du bac", "revision", "1re A", 4],
  ["Les fractions en 6e", "revision", "6e A", 3],
  ["Fiches SVT — l’ADN", "revision", "4e A", 5],
];
const quietSafe = ago(1, 4);
groupDefs.forEach(([name, kind, className, size], index) => {
  const klass = classes.find((c) => c.name === className);
  const members = shuffle(
    klass.students.filter((s) => !pendingIds.has(s.id)),
  ).slice(0, size);
  const gid = uid();
  ins("study_groups", {
    id: gid,
    school_id: SCHOOL,
    class_id: klass.id,
    name,
    description: "Groupe de démonstration (données fictives).",
    kind,
    plan:
      kind === "binome"
        ? "10 min lecture seul · 15 min je t’explique · 15 min tu m’expliques · 10 min questions"
        : "",
    created_by: members[0].id,
    created_by_role: "student",
    created_at: ago(14 - index),
  });
  members.forEach((m, i) =>
    ins("group_members", {
      group_id: gid,
      user_id: m.id,
      role: i === 0 ? "owner" : "member",
      share_availability: chance(0.5) ? 1 : 0,
      joined_at: ago(13 - index),
    }),
  );
  [
    "On se retrouve jeudi à 17h ?",
    "J’ai fini la fiche du chapitre 2, je la partage.",
    "Qui peut m’expliquer l’exercice 3 ?",
    "Merci, c’est plus clair maintenant !",
  ]
    .slice(0, between(2, 4))
    .forEach((body, i) =>
      ins("group_comments", {
        id: uid(),
        group_id: gid,
        user_id: members[i % members.length].id,
        body,
        created_at: ago(index % 4, 4 + i),
      }),
    );
  ins("group_tasks", {
    id: uid(),
    group_id: gid,
    title: "Faire la fiche du chapitre",
    assignee_id: members[1 % members.length].id,
    due_date: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10),
    done: 0,
    created_by: members[0].id,
    created_at: ago(3),
  });
  ins("group_tasks", {
    id: uid(),
    group_id: gid,
    title: "Relire les corrigés",
    assignee_id: null,
    due_date: null,
    done: 1,
    created_by: members[0].id,
    created_at: ago(6),
  });
  ins("group_resources", {
    id: uid(),
    group_id: gid,
    kind: "note",
    title: "Formules à retenir",
    body: "Penser à vérifier les unités et à écrire une phrase de conclusion.",
    added_by: members[0].id,
    created_at: ago(4),
  });
  const doc = documentsByCourse
    .get(courses.find((c) => c.klass.id === klass.id).id)
    .find((d) => d.status === "published");
  if (doc)
    ins("group_resources", {
      id: uid(),
      group_id: gid,
      kind: "document",
      title: doc.title,
      document_id: doc.id,
      body: "",
      added_by: members[0].id,
      created_at: ago(5),
    });
  if (index === 1)
    ins("group_audit", {
      id: uid(),
      group_id: gid,
      school_id: SCHOOL,
      actor_id: teachers[0].id,
      actor_name: teachers[0].name,
      actor_role: "teacher",
      action: "view",
      created_at: ago(2),
    });
});
// Un groupe de projet créé par un professeur, et une invitation en attente.
{
  const klass = classes.find((c) => c.name === "2nde B");
  const gid = uid();
  const teacher = teacherFor("histgeo", "2nde");
  ins("study_groups", {
    id: gid,
    school_id: SCHOOL,
    class_id: klass.id,
    name: "Exposé — les droits de l’homme",
    description: "Projet encadré (fictif).",
    kind: "project",
    plan: "",
    created_by: teacher.id,
    created_by_role: "teacher",
    created_at: ago(9),
  });
  klass.students.slice(0, 4).forEach((m) =>
    ins("group_members", {
      group_id: gid,
      user_id: m.id,
      role: "member",
      share_availability: 0,
      joined_at: ago(9),
    }),
  );
  ins("group_tasks", {
    id: uid(),
    group_id: gid,
    title: "Plan de l’exposé",
    assignee_id: klass.students[0].id,
    due_date: new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10),
    done: 0,
    created_by: teacher.id,
    created_at: ago(8),
  });
  const stranger = klass.students[6];
  ins("group_invitations", {
    id: uid(),
    group_id: gid,
    invitee_id: stranger.id,
    invited_by: teacher.id,
    status: "pending",
    created_at: ago(1),
  });
}

// ---------- calendrier, journal d'audit ----------
ins("school_calendar", {
  id: uid(),
  school_id: SCHOOL,
  start_date: "2026-12-19",
  end_date: "2027-01-03",
  label: "Vacances de fin d’année",
  kind: "info",
  created_by: admins[1].id,
  created_at: ago(30),
});
ins("school_calendar", {
  id: uid(),
  school_id: SCHOOL,
  start_date: "2027-02-13",
  end_date: "2027-02-28",
  label: "Vacances d’hiver",
  kind: "info",
  created_by: admins[1].id,
  created_at: ago(30),
});
const auditEntries = [
  [admins[1], "user.import", "school", { created: 171, skipped: 0 }, 68],
  [admins[1], "class.create", "class", { name: "6e A", kind: "class" }, 69],
  [admins[0], "user.admin_kind", "user", { to: "direction" }, 66],
  [admins[1], "course.teacher_add", "course", { role: "substitute" }, 3],
  [admins[2], "user.export", "user", {}, 12],
  [admins[1], "user.activation_code", "user", {}, 2],
];
for (const [actor, action, type, details, days] of auditEntries)
  ins("audit_log", {
    id: uid(),
    school_id: SCHOOL,
    actor_id: actor.id,
    action,
    target_type: type,
    target_id: null,
    details: JSON.stringify(details),
    created_at: ago(days),
  });

// ---------- récapitulatif ----------
const count = (table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
console.log("\nDonnées de démonstration FICTIVES créées dans", DATA_DIR);
console.log(
  `  ${count("classes")} classes/groupes · ${count("courses")} cours · ${count("documents")} documents · ${count("users")} comptes ` +
    `(${teachers.length} professeurs, ${students.length} élèves, ${admins.length} administrateurs)`,
);
console.log(
  `  ${stats.chats} questions à l’assistant · ${stats.quizzes} quiz · ${stats.answers} réponses · ${count("study_groups")} groupes · ${count("safety_alerts")} alertes`,
);
console.log("\nMot de passe de TOUS les comptes : EcoleDemo2026!");
console.log("  Complet          admin@demo.local");
console.log("  Secrétariat      secretariat@demo.local");
console.log("  Direction        direction@demo.local");
console.log(
  "  Professeur       prof@demo.local (maths collège) · identifiants prenom.nom@demo.local pour les autres",
);
console.log(
  "  Élève            eleve@demo.local (6e A) · delegue@demo.local (3e A)",
);
console.log(
  "\nComptes à activer (onglet « Première connexion », identifiant + code) :",
);
for (const p of pending)
  console.log(`  ${p.loginId.padEnd(24)} ${p.code}   ${p.klass}`);
