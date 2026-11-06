// Calendrier hébraïque et horaires de Chabbat/fêtes pour Paris, sans dépendance.
// ATTENTION : horaires APPROCHÉS (calcul astronomique du coucher du soleil, marges
// prudentes). Ils servent à ne pas planifier de travail pendant ces périodes ; ils ne
// remplacent pas les horaires officiels du consistoire, à faire valider par l'établissement.

export const PARIS = { lat: 48.8566, lon: 2.3522, timeZone: "Europe/Paris" };
// Entrée : 18 min avant le coucher. Sortie : 45 min après le coucher (nuit tombée, marge prudente).
export const ENTRY_MARGIN_MIN = 18;
export const EXIT_MARGIN_MIN = 45;

const HEBREW_EPOCH = -1373427; // jour fixe (R.D.) du 1er Tishri de l'an 1
const DAY_MS = 86400000;
const RD_UNIX_EPOCH = 719163; // R.D. du 1er janvier 1970

export const fixedFromGregorian = (y, m, d) =>
  Math.floor(Date.UTC(y, m - 1, d) / DAY_MS) + RD_UNIX_EPOCH;
export const gregorianFromFixed = (rd) => {
  const date = new Date((rd - RD_UNIX_EPOCH) * DAY_MS);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
};
export const dateKey = ({ y, m, d }) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parseKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
};

const isHebrewLeap = (y) => (7 * y + 1) % 19 < 7;
const monthsElapsed = (y) => Math.floor((235 * y - 234) / 19);
function elapsedDays(y) {
  const months = monthsElapsed(y);
  const parts = 12084 + 13753 * months;
  let day = 29 * months + Math.floor(parts / 25920);
  if ((3 * (day + 1)) % 7 < 3) day++;
  return day;
}
function yearLengthCorrection(y) {
  const ny0 = elapsedDays(y - 1),
    ny1 = elapsedDays(y),
    ny2 = elapsedDays(y + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}
const newYear = (y) => HEBREW_EPOCH + elapsedDays(y) + yearLengthCorrection(y);
const yearDays = (y) => newYear(y + 1) - newYear(y);

// Numérotation : Nissan=1 … Elloul=6, Tichri=7 … Adar=12 (Adar II = 13 les années embolismiques).
function monthLength(y, month) {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 11:
      return 30;
    case 2:
    case 4:
    case 6:
    case 10:
    case 13:
      return 29;
    case 8:
      return yearDays(y) % 10 === 5 ? 30 : 29;
    case 9:
      return yearDays(y) % 10 === 3 ? 29 : 30;
    case 12:
      return isHebrewLeap(y) ? 30 : 29;
    default:
      throw new Error("mois invalide");
  }
}
export function hebrewFromFixed(rd) {
  let year = Math.floor((rd - HEBREW_EPOCH) / 365.2468) + 1;
  while (newYear(year) > rd) year--;
  while (newYear(year + 1) <= rd) year++;
  let day = rd - newYear(year);
  const order = [
    7,
    8,
    9,
    10,
    11,
    12,
    ...(isHebrewLeap(year) ? [13] : []),
    1,
    2,
    3,
    4,
    5,
    6,
  ];
  for (const month of order) {
    const length = monthLength(year, month);
    if (day < length) return { year, month, day: day + 1 };
    day -= length;
  }
  throw new Error("date hébraïque introuvable");
}
export const hebrewFromGregorianKey = (key) => {
  const { y, m, d } = parseKey(key);
  return hebrewFromFixed(fixedFromGregorian(y, m, d));
};

// Jours de fête où le travail est interdit (diaspora).
const YOM_TOV = [
  [7, 1, "Roch Hachana"],
  [7, 2, "Roch Hachana"],
  [7, 10, "Yom Kippour"],
  [7, 15, "Souccot"],
  [7, 16, "Souccot"],
  [7, 22, "Chemini Atséret"],
  [7, 23, "Sim'hat Torah"],
  [1, 15, "Pessah"],
  [1, 16, "Pessah"],
  [1, 21, "Pessah"],
  [1, 22, "Pessah"],
  [3, 6, "Chavouot"],
  [3, 7, "Chavouot"],
];
export function restDayName(key) {
  const { y, m, d } = parseKey(key);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const h = hebrewFromFixed(fixedFromGregorian(y, m, d));
  const fest = YOM_TOV.find(([mm, dd]) => mm === h.month && dd === h.day);
  if (fest) return weekday === 6 ? `${fest[2]} et Chabbat` : fest[2];
  return weekday === 6 ? "Chabbat" : null;
}

// Coucher du soleil (algorithme NOAA simplifié), en millisecondes UTC.
export function sunsetUtc(key, { lat, lon } = PARIS) {
  const { y, m, d } = parseKey(key);
  const rad = Math.PI / 180;
  const dayOfYear =
    Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (18 - 12) / 24);
  const eq =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const cosHa =
    Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) -
    Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / rad;
  const minutesUtc = 720 - 4 * (lon - ha) - eq;
  return Date.UTC(y, m - 1, d) + Math.round(minutesUtc * 60000);
}

const parisOffsetMinutes = (utcMs) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS.timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Math.round(
    (Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
    ) -
      Math.floor(utcMs / 60000) * 60000) /
      60000,
  );
};
export const parisMidnightUtc = (key) => {
  const { y, m, d } = parseKey(key);
  const t0 = Date.UTC(y, m - 1, d);
  return t0 - parisOffsetMinutes(t0 - 3 * 3600000) * 60000;
};
export const parisClock = (utcMs) => {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS.timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  return `${parts.find((p) => p.type === "hour").value}:${parts.find((p) => p.type === "minute").value}`;
};

const addDays = (key, n) =>
  dateKey(
    gregorianFromFixed(fixedFromGregorian(...Object.values(parseKey(key))) + n),
  );

// Périodes de repos [début, fin) en ms UTC couvrant la date locale `key`.
function restPeriodsAround(key) {
  const periods = [];
  for (const k of [addDays(key, -1), key, addDays(key, 1)]) {
    if (!restDayName(k)) continue;
    const start = sunsetUtc(addDays(k, -1)) - ENTRY_MARGIN_MIN * 60000;
    const end = sunsetUtc(k) + EXIT_MARGIN_MIN * 60000;
    periods.push([start, end, restDayName(k)]);
  }
  periods.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const p of periods) {
    const last = merged.at(-1);
    if (last && p[0] <= last[1]) {
      last[1] = Math.max(last[1], p[1]);
      last[2] = last[2] === p[2] ? last[2] : `${last[2]} · ${p[2]}`;
    } else merged.push([...p]);
  }
  return merged;
}

// Intervalles de repos en minutes locales [0,1440] pour la date locale `key`.
export function restIntervals(key) {
  const midnight = parisMidnightUtc(key);
  const dayEnd = parisMidnightUtc(addDays(key, 1));
  const out = [];
  for (const [start, end, name] of restPeriodsAround(key)) {
    const s = Math.max(start, midnight),
      e = Math.min(end, dayEnd);
    if (e > s)
      out.push({
        start: Math.round((s - midnight) / 60000),
        end: Math.round((e - midnight) / 60000),
        name,
      });
  }
  return out;
}
export const isRestMoment = (key, minute) =>
  restIntervals(key).some((i) => minute >= i.start && minute < i.end);

export function restPeriods(fromKey, days) {
  const list = [];
  for (let n = 0; n < days; n++) {
    const key = addDays(fromKey, n);
    for (const i of restIntervals(key)) {
      list.push({
        date: key,
        startTime: `${String(Math.floor(i.start / 60)).padStart(2, "0")}:${String(i.start % 60).padStart(2, "0")}`,
        endTime:
          i.end >= 1440
            ? "24:00"
            : `${String(Math.floor(i.end / 60)).padStart(2, "0")}:${String(i.end % 60).padStart(2, "0")}`,
        name: i.name,
      });
    }
  }
  return list;
}
export { addDays };
