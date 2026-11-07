// Profils d'administration. Le rôle technique reste « admin » ; le profil précise la fonction :
//  - full        : établissement qui n'a pas séparé les fonctions (premier compte, petite équipe)
//  - secretariat : comptes, import, structure (classes, affectations, passage d'année)
//  - direction   : pilotage, alertes de sécurité, audit, modération des groupes, droits RGPD
export const ADMIN_KINDS = ["full", "secretariat", "direction"];
const CAPABILITIES = {
  usersRead: ["full", "secretariat", "direction"],
  calendar: ["full", "secretariat", "direction"],
  accounts: ["full", "secretariat"],
  structure: ["full", "secretariat"],
  pilotage: ["full", "direction"],
  moderation: ["full", "direction"],
  audit: ["full", "direction"],
  rgpd: ["full", "direction"],
  adminKinds: ["full"],
};
export const adminKindOf = (user) => user?.admin_kind || "full";
export const adminCan = (user, capability) =>
  user?.role === "admin" &&
  Boolean(CAPABILITIES[capability]?.includes(adminKindOf(user)));
export const requireCapability = (capability) => (req, res, next) =>
  adminCan(req.user, capability)
    ? next()
    : res.status(403).json({
        error:
          "Votre profil d’administration n’a pas accès à cette fonction. Elle relève d’un autre profil (secrétariat ou direction).",
        code: "admin_capability",
      });
