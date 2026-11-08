import React, { useEffect, useState, useCallback } from "react";
import { api, post } from "./api";
import { Form, Field, Select, title } from "./ui";

const roleLabel = {
  admin: "Administration",
  teacher: "Professeur",
  student: "Élève",
};
const actionLabel = {
  "user.create": "Compte créé",
  "user.import": "Import de comptes",
  "user.erase": "Compte supprimé",
  "user.export": "Données exportées",
  "user.disable": "Compte désactivé",
  "user.enable": "Compte réactivé",
  "user.rename": "Compte renommé",
  "user.password_set": "Mot de passe provisoire défini",
  "user.activation_code": "Nouveau code d’activation",
  "class.create": "Classe créée",
  "class.update": "Classe modifiée",
  "class.delete": "Classe supprimée",
  "class.archive": "Classe archivée",
  "class.unarchive": "Classe réactivée",
  "year.create": "Année créée",
  "year.rename": "Année renommée",
  "year.rollover": "Passage d’année",
  "subject.create": "Matière créée",
  "subject.rename": "Matière renommée",
  "subject.delete": "Matière supprimée",
  "assignment.delete": "Affectation retirée",
  "course.update": "Cours modifié",
  "student.move": "Élève changé de classe",
  "2fa.enable": "Double authentification activée",
  "2fa.disable": "Double authentification désactivée",
};
const when = (v) =>
  v
    ? new Date(v).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function ActivationCard({ account, onClose }) {
  return (
    <div className="alert success activation-card" role="status">
      <strong>
        Code d’activation de {account.name} :{" "}
        <code>{account.activation_code}</code>
      </strong>
      <p>
        Identifiant : <code>{account.login_id}</code>. Ce code ne sera plus
        affiché : remettez-le à la personne, qui choisira elle-même son mot de
        passe lors de sa première connexion (valable 30 jours).
      </p>
      <button className="text-button" onClick={onClose}>
        J’ai noté le code
      </button>
    </div>
  );
}

function LoginSheets({ accounts, onClose }) {
  return (
    <div className="panel">
      <div className="sheet-actions no-print">
        <h3>Fiches de connexion ({accounts.length})</h3>
        <button className="button" onClick={() => window.print()}>
          Imprimer les fiches
        </button>
        <button className="text-button" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p className="muted no-print">
        Les codes ne sont affichés qu’une seule fois. Imprimez ou enregistrez en
        PDF maintenant, puis remettez chaque fiche à son propriétaire.
      </p>
      <div className="print-area">
        {accounts.map((a) => (
          <section className="login-sheet" key={a.id}>
            <h4>IABNE · Yabné Paris</h4>
            <p>
              <strong>{a.name}</strong>
              {a.class ? ` · ${a.class}` : ""}
            </p>
            <p>
              Identifiant : <code>{a.login_id}</code>
            </p>
            <p>
              Code d’activation : <code>{a.activation_code}</code>
            </p>
            <small>
              Première connexion : choisissez « Première connexion », entrez
              votre identifiant et ce code, puis créez votre mot de passe. Le
              code est personnel et valable 30 jours.
            </small>
          </section>
        ))}
      </div>
    </div>
  );
}

function Overview({ alertsOnly = false }) {
  const [overview, setOverview] = useState(null),
    [alerts, setAlerts] = useState([]),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/admin/overview")
      .then(async (o) => {
        setOverview(o);
        // Les alertes de sécurité ne concernent que la direction (et le profil complet).
        if (o.attention)
          setAlerts((await api("/api/admin/safety-alerts")).alerts || []);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (error) return <div className="alert error">{error}</div>;
  if (!overview) return <p className="muted">Chargement…</p>;
  const { accounts, structure, ai, attention } = overview;
  const open = alerts.filter((a) => !a.handled_at);
  return (
    <>
      {open.length > 0 && (
        <div className="alert error" role="alert">
          <strong>
            {open.length} élève{open.length > 1 ? "s ont" : " a"} besoin qu’un
            adulte les contacte.
          </strong>
          <p>
            Le message n’est pas conservé. Contactez l’élève selon la procédure
            de l’établissement, puis marquez l’alerte comme traitée.
          </p>
          {open.map((a) => (
            <div className="list-item" key={a.id}>
              <span>
                <strong>{a.student_name}</strong>
                <small>
                  {a.class_name || "Sans classe"} ·{" "}
                  {a.category === "distress"
                    ? "détresse"
                    : "harcèlement ou violence"}{" "}
                  · {when(a.created_at)}
                </small>
              </span>
              <button
                className="text-button"
                onClick={() =>
                  api(`/api/admin/safety-alerts/${a.id}/handled`, {
                    method: "POST",
                    body: {},
                  }).then(load)
                }
              >
                Marquer comme traitée
              </button>
            </div>
          ))}
        </div>
      )}
      {!alertsOnly && (
        <div className="stats">
          {[
            [accounts.students, "élèves actifs"],
            [accounts.teachers, "professeurs actifs"],
            [accounts.pendingActivation, "comptes à activer"],
            [accounts.neverLoggedIn, "jamais connectés"],
            [structure.classes, "classes"],
            [structure.publishedDocuments, "documents publiés"],
            ...(ai
              ? [
                  [ai.requestsLast7Days, "demandes IA sur 7 jours"],
                  [
                    Math.round(
                      (ai.tokensLast30Days.input + ai.tokensLast30Days.output) /
                        1000,
                    ),
                    "milliers de jetons IA sur 30 jours",
                  ],
                ]
              : []),
            ...(attention
              ? [[attention.openAiReports, "signalements de réponses IA"]]
              : []),
          ].map(([value, label]) => (
            <div className="stat" key={label}>
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {!alertsOnly && (
        <p className="muted">
          {ai
            ? `Plafond de l’établissement : ${ai.hourlySchoolLimit} demandes IA par heure. `
            : ""}
          Ces chiffres sont des compteurs globaux ; aucune conversation n’est
          consultable ici.
        </p>
      )}
    </>
  );
}

function Accounts({ data, act, busy, kind = "full" }) {
  const canManage = ["full", "secretariat"].includes(kind),
    canErase = ["full", "direction"].includes(kind),
    isFull = kind === "full";
  const [filters, setFilters] = useState({
      q: "",
      role: "",
      state: "",
      class_id: "",
    }),
    [list, setList] = useState({ users: [], total: 0 }),
    [error, setError] = useState(""),
    [created, setCreated] = useState(null),
    [mode, setMode] = useState("code");
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const load = useCallback(() => {
    api(`/api/admin/users?${query}`)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [query]);
  useEffect(load, [load]);
  const run = (fn, message) =>
    act(async () => {
      await fn();
      load();
    }, message);
  async function exportData(u) {
    const r = await fetch(`/api/admin/users/${u.id}/export`, {
      credentials: "same-origin",
    });
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `donnees-${u.login_id || u.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="two-col">
      {canManage && (
        <div className="panel">
          <h3>Créer un compte</h3>
          {created && (
            <ActivationCard
              account={created}
              onClose={() => setCreated(null)}
            />
          )}
          <Form
            disabled={busy}
            submit="Créer le compte"
            onSubmit={async (v, form) => {
              const body = {
                name: v.name,
                role: v.role,
                email: v.email || undefined,
                class_id: v.classId || undefined,
                password: mode === "password" ? v.password : undefined,
                admin_kind:
                  v.role === "admin" ? v.admin_kind || "full" : undefined,
              };
              const r = await post("/api/admin/users", body);
              form.reset();
              if (r.user.activation_code) setCreated(r.user);
              load();
              window.dispatchEvent(new Event("iabne:refresh"));
            }}
          >
            <Field label="Nom complet" name="name" required />
            <Field label="Profil">
              <select name="role">
                <option value="student">Élève</option>
                <option value="teacher">Professeur</option>
                <option value="admin">Administration</option>
              </select>
            </Field>
            {isFull && (
              <Field label="Profil d’administration (si le profil ci-dessus est « Administration »)">
                <select name="admin_kind" defaultValue="secretariat">
                  <option value="secretariat">
                    Secrétariat : comptes, import, structure
                  </option>
                  <option value="direction">
                    Direction : pilotage, alertes, journal, RGPD
                  </option>
                  <option value="full">
                    Complet : tout (à réserver à 1 ou 2 personnes)
                  </option>
                </select>
              </Field>
            )}
            <Field
              label="Adresse e-mail (facultative pour un élève ; obligatoire pour l’administration)"
              type="email"
              name="email"
            />
            <Select
              label="Classe (élève)"
              name="classId"
              items={(data.classes || []).filter((c) => !c.archived_at)}
              required={false}
            />
            <Field label="Première connexion">
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="code">Code d’activation (recommandé)</option>
                <option value="password">Mot de passe provisoire</option>
              </select>
            </Field>
            {mode === "password" && (
              <Field
                label="Mot de passe provisoire (12 caractères minimum, changement obligatoire)"
                type="text"
                name="password"
                autoComplete="off"
                minLength="12"
                required
              />
            )}
          </Form>
          <p className="muted">
            Avec un code d’activation, vous n’avez jamais connaissance du mot de
            passe : la personne le choisit elle-même.
          </p>
        </div>
      )}
      <div className="panel">
        <h3>Comptes ({list.total})</h3>
        {!canManage && (
          <p className="muted">
            Profil direction : vous consultez les comptes et traitez les droits
            RGPD (export, suppression). La création et la modification des
            comptes relèvent du secrétariat.
          </p>
        )}
        <div className="filters">
          <input
            aria-label="Rechercher un compte"
            placeholder="Nom, e-mail, identifiant…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
          <select
            aria-label="Profil"
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          >
            <option value="">Tous les profils</option>
            <option value="student">Élèves</option>
            <option value="teacher">Professeurs</option>
            <option value="admin">Administration</option>
          </select>
          <select
            aria-label="État"
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
          >
            <option value="">Tous les états</option>
            <option value="pending">À activer</option>
            <option value="never">Jamais connectés</option>
            <option value="inactive">Désactivés</option>
          </select>
          <select
            aria-label="Classe"
            value={filters.class_id}
            onChange={(e) =>
              setFilters({ ...filters, class_id: e.target.value })
            }
          >
            <option value="">Toutes les classes</option>
            {(data.classes || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {error && <div className="alert error">{error}</div>}
        {list.users.map((u) => (
          <div className="list-item account-row" key={u.id}>
            <span className="avatar small">{(u.name || "U")[0]}</span>
            <span>
              <strong>{u.name}</strong>
              <small>
                {roleLabel[u.role]} · {u.login_id || u.email}
                {u.classes.length
                  ? ` · ${u.classes.map((c) => c.name).join(", ")}`
                  : ""}
                {!u.active
                  ? " · désactivé"
                  : u.pending_activation
                    ? " · à activer"
                    : u.last_login_at
                      ? ` · connecté ${when(u.last_login_at)}`
                      : " · jamais connecté"}
              </small>
            </span>
            <span className="row-actions">
              {isFull && u.role === "admin" && (
                <select
                  aria-label={`Profil d’administration de ${u.name}`}
                  value={u.admin_kind}
                  disabled={busy}
                  onChange={(e) =>
                    run(
                      () =>
                        api(`/api/admin/users/${u.id}`, {
                          method: "PATCH",
                          body: { admin_kind: e.target.value },
                        }),
                      "Profil d’administration modifié.",
                    )
                  }
                >
                  <option value="full">Complet</option>
                  <option value="secretariat">Secrétariat</option>
                  <option value="direction">Direction</option>
                </select>
              )}
              {canManage && (
                <>
                  <button
                    className="text-button"
                    disabled={busy || u.id === data.user.id}
                    onClick={() =>
                      act(async () => {
                        const r = await post(
                          `/api/admin/users/${u.id}/activation-code`,
                          {},
                        );
                        setCreated({
                          ...u,
                          activation_code: r.activation_code,
                        });
                        load();
                      }, "Nouveau code généré. Les anciennes sessions sont fermées.")
                    }
                  >
                    Nouveau code
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || u.id === data.user.id}
                    onClick={() => {
                      if (
                        u.active &&
                        !window.confirm(
                          `Désactiver le compte de ${u.name} ? La personne sera déconnectée.`,
                        )
                      )
                        return;
                      run(() =>
                        api(`/api/admin/users/${u.id}`, {
                          method: "PATCH",
                          body: { active: !u.active },
                        }),
                      );
                    }}
                  >
                    {u.active ? "Désactiver" : "Réactiver"}
                  </button>
                </>
              )}
              {canErase && (
                <>
                  <button className="text-button" onClick={() => exportData(u)}>
                    Exporter
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy || u.id === data.user.id}
                    onClick={() => {
                      const typed = window.prompt(
                        `Suppression définitive de ${u.name} et de toutes ses données (irréversible).\nPour confirmer, saisissez : ${u.email}`,
                      );
                      if (typed === null) return;
                      run(
                        () =>
                          api(`/api/admin/users/${u.id}`, {
                            method: "DELETE",
                            body: { confirm: typed.trim() },
                          }),
                        "Compte et données supprimés.",
                      );
                    }}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
        {list.users.length === 0 && (
          <p className="muted">Aucun compte ne correspond.</p>
        )}
        {list.total > list.users.length && (
          <p className="muted">
            {list.users.length} sur {list.total} affichés : affinez la
            recherche.
          </p>
        )}
      </div>
    </div>
  );
}

function ImportAccounts({ busy }) {
  const [csv, setCsv] = useState(""),
    [createClasses, setCreateClasses] = useState(false),
    [preview, setPreview] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  async function readFile(file) {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
    setResult(null);
  }
  async function run(path, extra = {}) {
    setWorking(true);
    setError("");
    try {
      return await post(path, { csv, create_classes: createClasses, ...extra });
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setWorking(false);
    }
  }
  if (result?.created?.length)
    return (
      <>
        <LoginSheets
          accounts={result.created}
          onClose={() => {
            setResult(null);
            setCsv("");
            setPreview(null);
            window.dispatchEvent(new Event("iabne:refresh"));
          }}
        />
        {result.skipped.length > 0 && (
          <div className="alert error">
            {result.skipped.length} ligne(s) non importée(s) :{" "}
            {result.skipped
              .map((s) => `ligne ${s.line} (${s.errors[0]})`)
              .join(" ; ")}
          </div>
        )}
      </>
    );
  return (
    <div className="panel">
      <h3>Importer des comptes depuis un fichier</h3>
      <p className="muted">
        Fichier CSV (Excel : « Enregistrer sous » → CSV). Colonnes :{" "}
        <code>nom</code>, <code>prénom</code> (ou <code>nom complet</code>),
        puis facultatives : <code>classe</code>, <code>role</code> (élève ou
        professeur), <code>email</code>, <code>identifiant</code> (numéro
        interne, empêche les doublons). 1 000 lignes maximum. Aucun mot de passe
        n’est nécessaire : chaque personne reçoit un code d’activation.
      </p>
      <Field label="Fichier CSV">
        <input
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={(e) => readFile(e.target.files[0])}
        />
      </Field>
      <Field label="… ou collez le contenu ici">
        <textarea
          rows="6"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
          }}
          placeholder={"Nom;Prénom;Classe\nDupont;Léa;2nde A"}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={createClasses}
          onChange={(e) => {
            setCreateClasses(e.target.checked);
            setPreview(null);
          }}
        />{" "}
        Créer automatiquement les classes qui n’existent pas
      </label>
      {error && <div className="alert error">{error}</div>}
      <div className="row-actions">
        <button
          className="button secondary"
          disabled={!csv.trim() || working || busy}
          onClick={async () => {
            const r = await run("/api/admin/import/preview");
            if (r) setPreview(r);
          }}
        >
          Vérifier le fichier
        </button>
        {preview && preview.summary.ok > 0 && (
          <button
            className="button"
            disabled={working || busy}
            onClick={async () => {
              if (
                preview.summary.errors &&
                !window.confirm(
                  `${preview.summary.errors} ligne(s) en erreur seront ignorées. Continuer ?`,
                )
              )
                return;
              const r = await run("/api/admin/import/commit", {
                skip_errors: true,
              });
              if (r) setResult(r);
            }}
          >
            Créer {preview.summary.ok} compte{preview.summary.ok > 1 ? "s" : ""}
          </button>
        )}
      </div>
      {preview && (
        <>
          <p>
            <strong>{preview.summary.ok}</strong> ligne(s) valide(s),{" "}
            <strong>{preview.summary.errors}</strong> en erreur,{" "}
            <strong>{preview.summary.warnings}</strong> avertissement(s).
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Nom</th>
                  <th>Profil</th>
                  <th>Classe</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr
                    key={l.line}
                    className={l.errors.length ? "row-error" : ""}
                  >
                    <td>{l.line}</td>
                    <td>{l.name || "—"}</td>
                    <td>{roleLabel[l.role] || "—"}</td>
                    <td>{l.class || "—"}</td>
                    <td>
                      {l.errors.length
                        ? l.errors.join(" ")
                        : l.warnings.join(" ") || "✓"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Structure({ data, act, busy }) {
  const [moving, setMoving] = useState(null);
  const classes = data.classes || [];
  const teachers = (data.users || []).filter((u) => u.role === "teacher");
  const students = (data.users || []).filter((u) => u.role === "student");
  const call = (path, method, body, message) =>
    act(() => api(path, { method, body }), message);
  const nameOf = (list, id) => list.find((x) => x.id === id)?.name || "—";
  return (
    <>
      <div className="two-col">
        <div className="panel">
          <h3>Créer une classe ou un groupe d’enseignement</h3>
          <Form
            submit="Créer"
            disabled={busy}
            onSubmit={(v) => act(() => post("/api/admin/classes", v))}
          >
            <Field label="Nom" name="name" placeholder="Terminale A" required />
            <Field
              label="Niveau"
              name="level"
              placeholder="Terminale"
              required
            />
            <Field label="Type">
              <select name="kind">
                <option value="class">Classe</option>
                <option value="group">
                  Groupe d’enseignement (spécialité, option, langue : élèves de
                  plusieurs classes)
                </option>
              </select>
            </Field>
            <Select
              label="Année scolaire (par défaut : la plus récente)"
              name="year_id"
              items={data.years || []}
              required={false}
            />
          </Form>
          <h3 style={{ marginTop: 25 }}>Matières</h3>
          <Form
            submit="Ajouter la matière"
            disabled={busy}
            onSubmit={(v) => act(() => post("/api/admin/subjects", v))}
          >
            <Field label="Nom de la matière" name="name" required />
          </Form>
          {(data.subjects || []).map((s) => (
            <div className="list-item" key={s.id}>
              <strong>{s.name}</strong>
              <button
                className="text-button"
                onClick={() => {
                  const n = window.prompt("Nouveau nom de la matière", s.name);
                  if (n && n !== s.name)
                    call(`/api/admin/subjects/${s.id}`, "PATCH", { name: n });
                }}
              >
                Renommer
              </button>
              <button
                className="text-button danger"
                onClick={() => {
                  if (window.confirm(`Supprimer la matière « ${s.name} » ?`))
                    call(`/api/admin/subjects/${s.id}`, "DELETE");
                }}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Classes et groupes</h3>
          {classes.map((c) => {
            const members = (data.memberships || []).filter(
              (m) => m.class_id === c.id,
            );
            return (
              <div className="list-item" key={c.id}>
                <span>
                  <strong>{title(c)}</strong>
                  <small>
                    {c.level} ·{" "}
                    {c.kind === "group" ? "groupe d’enseignement" : "classe"} ·{" "}
                    {members.length} élève(s)
                    {c.archived_at ? " · archivée" : ""}
                  </small>
                </span>
                <span className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      const n = window.prompt("Nouveau nom", c.name);
                      if (n && n !== c.name)
                        call(`/api/admin/classes/${c.id}`, "PATCH", {
                          name: n,
                        });
                    }}
                  >
                    Renommer
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      call(`/api/admin/classes/${c.id}/archive`, "POST", {
                        archived: !c.archived_at,
                      })
                    }
                  >
                    {c.archived_at ? "Réactiver" : "Archiver"}
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Supprimer « ${c.name} » ? Possible seulement si elle est vide.`,
                        )
                      )
                        call(`/api/admin/classes/${c.id}`, "DELETE");
                    }}
                  >
                    Supprimer
                  </button>
                </span>
              </div>
            );
          })}
          <h3 style={{ marginTop: 25 }}>Inscrire ou déplacer un élève</h3>
          <Form
            submit="Inscrire dans la classe"
            disabled={busy}
            onSubmit={(v) => act(() => post("/api/admin/memberships", v))}
          >
            <Select label="Élève" name="user_id" items={students} />
            <Select
              label="Classe"
              name="class_id"
              items={classes.filter((c) => !c.archived_at)}
            />
          </Form>
          <h4 style={{ marginTop: 16 }}>Changer un élève de classe</h4>
          <Form
            submit="Déplacer"
            disabled={busy}
            onSubmit={(v) =>
              act(
                () => post(`/api/admin/students/${v.user_id}/move`, v),
                "Élève déplacé. Ses délégations dans l’ancienne classe sont révoquées.",
              )
            }
          >
            <Select label="Élève" name="user_id" items={students} />
            <Select
              label="Classe d’origine"
              name="from_class_id"
              items={classes}
            />
            <Select
              label="Nouvelle classe"
              name="to_class_id"
              items={classes.filter((c) => !c.archived_at)}
            />
          </Form>
          <h4 style={{ marginTop: 16 }}>Inscriptions</h4>
          <button
            className="text-button"
            onClick={() => setMoving(moving ? null : "all")}
          >
            {moving ? "Masquer" : "Afficher toutes les inscriptions"}
          </button>
          {moving &&
            (data.memberships || []).map((m) => (
              <div className="list-item" key={`${m.user_id}-${m.class_id}`}>
                <span>
                  {nameOf(students, m.user_id)} · {nameOf(classes, m.class_id)}
                </span>
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Retirer cette inscription ? Les délégations associées seront révoquées.",
                      )
                    )
                      call(
                        `/api/admin/memberships/${m.user_id}/${m.class_id}`,
                        "DELETE",
                      );
                  }}
                >
                  Retirer
                </button>
              </div>
            ))}
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 20 }}>
        <div className="panel">
          <h3>Affecter un professeur</h3>
          <Form
            submit="Enregistrer l’affectation"
            disabled={busy}
            onSubmit={(v) => act(() => post("/api/admin/assignments", v))}
          >
            <Select label="Professeur" name="teacher_id" items={teachers} />
            <Select
              label="Classe"
              name="class_id"
              items={classes.filter((c) => !c.archived_at)}
            />
            <Select
              label="Matière"
              name="subject_id"
              items={data.subjects || []}
            />
          </Form>
          <h3 style={{ marginTop: 25 }}>Créer un espace de cours</h3>
          <p className="muted">
            Une affectation (professeur, classe, matière) doit exister d’abord.
          </p>
          <Form
            submit="Créer le cours"
            disabled={busy}
            onSubmit={(v) =>
              act(() =>
                post("/api/courses", {
                  title: v.title,
                  class_id: v.classId,
                  teacher_id: v.teacherId,
                  subject_id: v.subjectId,
                }),
              )
            }
          >
            <Field label="Titre" name="title" required />
            <Select
              label="Matière"
              name="subjectId"
              items={data.subjects || []}
            />
            <Select
              label="Classe"
              name="classId"
              items={classes.filter((c) => !c.archived_at)}
            />
            <Select label="Professeur" name="teacherId" items={teachers} />
          </Form>
        </div>
        <div className="panel">
          <h3>Cours existants</h3>
          {(data.courses || []).map((c) => (
            <div className="list-item" key={c.id}>
              <span>
                <strong>{title(c)}</strong>
                <small>
                  {nameOf(data.subjects || [], c.subject_id)} ·{" "}
                  {nameOf(classes, c.class_id)} ·{" "}
                  {nameOf(teachers, c.teacher_id)}
                </small>
              </span>
              <select
                aria-label={`Professeur titulaire de ${title(c)}`}
                value={c.teacher_id}
                disabled={busy}
                onChange={(e) => {
                  if (
                    window.confirm(
                      "Changer le titulaire de ce cours ? La méthode du professeur devra être relue et validée par le nouveau titulaire.",
                    )
                  )
                    call(`/api/admin/courses/${c.id}`, "PATCH", {
                      teacher_id: e.target.value,
                    });
                }}
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <CourseTeachers data={data} busy={busy} />
          <h4 style={{ marginTop: 16 }}>Affectations</h4>
          {(data.assignments || []).map((a) => (
            <div
              className="list-item"
              key={`${a.teacher_id}-${a.class_id}-${a.subject_id}`}
            >
              <span>
                {nameOf(teachers, a.teacher_id)} · {nameOf(classes, a.class_id)}{" "}
                · {nameOf(data.subjects || [], a.subject_id)}
              </span>
              <button
                className="text-button danger"
                onClick={() => call("/api/admin/assignments", "DELETE", a)}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CourseTeachers({ data, busy }) {
  const [entries, setEntries] = useState([]),
    [error, setError] = useState("");
  const teachers = (data.users || []).filter((u) => u.role === "teacher");
  const load = useCallback(() => {
    api("/api/admin/course-teachers")
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <h4 style={{ marginTop: 16 }}>Co-enseignants et remplaçants</h4>
      <p className="muted">
        Donne à un autre professeur les droits de gestion d’un cours (documents,
        réglages), pour un remplacement ou un cours partagé. Le titulaire garde
        la validation de la méthode.
      </p>
      {error && <div className="alert error">{error}</div>}
      {entries.map((e) => (
        <div className="list-item" key={e.course_id + e.teacher_id}>
          <span>
            <strong>{e.teacher_name}</strong>
            <small>
              {e.role === "substitute" ? "Remplaçant" : "Co-enseignant"} ·{" "}
              {e.title}
              {e.ends_at
                ? ` · jusqu’au ${new Date(e.ends_at).toLocaleDateString("fr-FR")}`
                : ""}
            </small>
          </span>
          <button
            className="text-button danger"
            onClick={() =>
              api(`/api/admin/course-teachers/${e.course_id}/${e.teacher_id}`, {
                method: "DELETE",
              }).then(load)
            }
          >
            Retirer
          </button>
        </div>
      ))}
      <Form
        submit="Ajouter"
        disabled={busy}
        onSubmit={async (v, form) => {
          await post("/api/admin/course-teachers", {
            course_id: v.course_id,
            teacher_id: v.teacher_id,
            role: v.role,
            ends_at: v.ends_at
              ? new Date(`${v.ends_at}T23:59:59`).toISOString()
              : null,
          });
          form.reset();
          load();
        }}
      >
        <Select label="Cours" name="course_id" items={data.courses || []} />
        <Select label="Professeur" name="teacher_id" items={teachers} />
        <Field label="Rôle">
          <select name="role">
            <option value="substitute">Remplaçant</option>
            <option value="co">Co-enseignant</option>
          </select>
        </Field>
        <Field label="Jusqu’au (facultatif)" type="date" name="ends_at" />
      </Form>
    </>
  );
}

function SchoolYear({ data, act, busy }) {
  const active = (data.classes || []).filter(
    (c) => !c.archived_at && c.kind !== "group",
  );
  const [rows, setRows] = useState(() =>
    active.map((c) => ({
      from: c.id,
      include: true,
      name: c.name,
      level: c.level,
      move: true,
      repeaters: [],
    })),
  );
  const [name, setName] = useState("");
  const [done, setDone] = useState(null);
  const update = (i, patch) =>
    setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const studentsOf = (classId) =>
    (data.memberships || [])
      .filter((m) => m.class_id === classId)
      .map((m) => (data.users || []).find((u) => u.id === m.user_id))
      .filter(Boolean);
  if (done)
    return (
      <div className="alert success">
        <strong>Nouvelle année créée.</strong> {done.summary.classes} classe(s),{" "}
        {done.summary.studentsMoved} élève(s) déplacé(s),{" "}
        {done.summary.repeaters} redoublant(s). {done.note}
      </div>
    );
  return (
    <div className="panel">
      <h3>Passage à la nouvelle année scolaire</h3>
      <p className="muted">
        Crée l’année, les classes de destination et les affectations des
        professeurs, déplace les élèves et archive les anciennes classes (les
        documents et cours restent consultables par les professeurs). Les
        délégations sont révoquées. Les redoublants cochés restent dans
        l’ancienne classe archivée : replacez-les ensuite dans leur classe.
      </p>
      <Field
        label="Nom de la nouvelle année"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="2027–2028"
      />
      {rows.map((r, i) => {
        const c = active.find((x) => x.id === r.from);
        return (
          <fieldset className="rollover-row" key={r.from}>
            <legend>
              <label>
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(i, { include: e.target.checked })}
                />{" "}
                {c.name} → nouvelle classe
              </label>
            </legend>
            {r.include && (
              <>
                <Field
                  label="Nom"
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <Field
                  label="Niveau"
                  value={r.level}
                  onChange={(e) => update(i, { level: e.target.value })}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={r.move}
                    onChange={(e) => update(i, { move: e.target.checked })}
                  />{" "}
                  Faire monter les élèves
                </label>
                <details>
                  <summary>Redoublants ({r.repeaters.length})</summary>
                  {studentsOf(c.id).map((s) => (
                    <label className="check" key={s.id}>
                      <input
                        type="checkbox"
                        checked={r.repeaters.includes(s.id)}
                        onChange={(e) =>
                          update(i, {
                            repeaters: e.target.checked
                              ? [...r.repeaters, s.id]
                              : r.repeaters.filter((x) => x !== s.id),
                          })
                        }
                      />{" "}
                      {s.name}
                    </label>
                  ))}
                </details>
              </>
            )}
          </fieldset>
        );
      })}
      <button
        className="button"
        disabled={busy || !name.trim() || !rows.some((r) => r.include)}
        onClick={() => {
          if (
            !window.confirm(
              "Lancer le passage d’année ? Les anciennes classes seront archivées.",
            )
          )
            return;
          act(async () => {
            const r = await post("/api/admin/years/rollover", {
              name,
              classes: rows
                .filter((r) => r.include)
                .map((r) => ({
                  from_class_id: r.from,
                  to_name: r.name,
                  to_level: r.level,
                  move_students: r.move,
                  repeater_ids: r.repeaters,
                })),
            });
            setDone(r);
          }, "Année créée.");
        }}
      >
        Lancer le passage d’année
      </button>
    </div>
  );
}

function AuditLog() {
  const [entries, setEntries] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/audit?limit=200")
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="panel">
      <h3>Journal des actions d’administration</h3>
      <p className="muted">
        Qui a fait quoi, et quand. Les codes et mots de passe n’y figurent
        jamais.
      </p>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Par</th>
              <th>Action</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{when(e.created_at)}</td>
                <td>{e.actor_name}</td>
                <td>{actionLabel[e.action] || e.action}</td>
                <td>
                  {Object.entries(e.details || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SchoolCalendar() {
  const [data, setData] = useState({ rest: [], entries: [], note: "" }),
    [error, setError] = useState("");
  const from = new Date().toISOString().slice(0, 10);
  const load = useCallback(() => {
    api(`/api/calendar?from=${from}&days=62`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [from]);
  useEffect(load, [load]);
  return (
    <div className="two-col">
      <div className="panel">
        <h3>Ajouter une date au calendrier</h3>
        <p className="muted">
          Chabbat et les fêtes sont déjà exclus automatiquement des plannings.
          Ajoutez ici les jours supplémentaires sans travail (jeûne, deuil…) ou
          de simples informations (vacances, sorties).
        </p>
        <Form
          submit="Ajouter"
          onSubmit={async (v, form) => {
            await post("/api/admin/calendar", v);
            form.reset();
            load();
          }}
        >
          <Field label="Premier jour" type="date" name="start_date" required />
          <Field label="Dernier jour" type="date" name="end_date" required />
          <Field label="Libellé" name="label" maxLength="120" required />
          <Field label="Type">
            <select name="kind">
              <option value="rest">
                Jour sans travail (aucune séance de révision planifiée)
              </option>
              <option value="info">Information seulement</option>
            </select>
          </Field>
        </Form>
        {data.entries.map((e) => (
          <div className="list-item" key={e.id}>
            <span>
              <strong>{e.label}</strong>
              <small>
                {e.start_date} → {e.end_date} ·{" "}
                {e.kind === "rest" ? "sans travail" : "information"}
              </small>
            </span>
            <button
              className="text-button danger"
              onClick={() =>
                api(`/api/admin/calendar/${e.id}`, { method: "DELETE" }).then(
                  load,
                )
              }
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Périodes sans travail des 2 prochains mois</h3>
        {error && <div className="alert error">{error}</div>}
        <p className="muted">{data.note}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>De</th>
                <th>À</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {data.rest.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td>{r.startTime}</td>
                  <td>{r.endTime}</td>
                  <td>{r.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TwoFactor({ user }) {
  const [setup, setSetup] = useState(null),
    [message, setMessage] = useState("");
  return (
    <div className="panel">
      <h3>Double authentification</h3>
      <p className="muted">
        Recommandée pour l’administration : un code à 6 chiffres d’une
        application d’authentification (Google Authenticator, Aegis, 1Password…)
        est demandé à chaque connexion.
        {user.two_factor ? " Elle est actuellement activée." : ""}
      </p>
      {message && <div className="alert success">{message}</div>}
      {!user.two_factor && !setup && (
        <button
          className="button"
          onClick={async () => setSetup(await post("/api/auth/2fa/setup", {}))}
        >
          Activer la double authentification
        </button>
      )}
      {setup && (
        <>
          <p>
            Ajoutez ce compte dans votre application avec la clé :{" "}
            <code>{setup.secret}</code>
          </p>
          <Form
            submit="Confirmer"
            onSubmit={async (v) => {
              await post("/api/auth/2fa/enable", v);
              setSetup(null);
              setMessage("Double authentification activée.");
              window.dispatchEvent(new Event("iabne:refresh"));
            }}
          >
            <Field
              label="Code à 6 chiffres affiché par l’application"
              name="code"
              inputMode="numeric"
              pattern="[0-9 ]{6,7}"
              required
            />
          </Form>
        </>
      )}
      {user.two_factor && (
        <Form
          submit="Désactiver"
          onSubmit={async (v) => {
            await post("/api/auth/2fa/disable", v);
            setMessage("Double authentification désactivée.");
            window.dispatchEvent(new Event("iabne:refresh"));
          }}
        >
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            required
          />
          <Field label="Code actuel" name="code" inputMode="numeric" required />
        </Form>
      )}
    </div>
  );
}

export function Pilotage({ onNavigate }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/pilotage")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <p className="muted">Chargement…</p>;
  const {
    totals,
    attention,
    classes,
    weekly,
    coursesWithoutContent,
    levels,
    subjects,
  } = data;
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.activeStudents));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  return (
    <>
      <Overview alertsOnly />
      <div className="stats" style={{ marginTop: 20 }}>
        {[
          [
            `${pct(totals.activeStudents7d, totals.students)} %`,
            `élèves actifs sur 7 jours (${totals.activeStudents7d}/${totals.students})`,
          ],
          [totals.teachers, "professeurs"],
          [totals.publishedDocuments, "documents de cours publiés"],
          [totals.aiRequests30d, "questions à l’assistant sur 30 jours"],
          [totals.activeGroups, "groupes de travail actifs"],
          [attention.studentsToActivate, "élèves à activer"],
          [attention.newAiReports, "réponses IA signalées à relire"],
          [attention.openGroupReports, "signalements de groupes ouverts"],
        ].map(([value, label]) => (
          <div className="stat" key={label}>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Élèves actifs avec l’assistant, par semaine</h3>
        <p className="muted">
          Élèves ayant posé une question ou répondu à un quiz.
        </p>
        <div
          className="bars"
          role="img"
          aria-label={weekly
            .map(
              (w) => `semaine du ${w.weekStart} : ${w.activeStudents} élèves`,
            )
            .join(" ; ")}
        >
          {weekly.map((w) => (
            <div className="bar-col" key={w.weekStart}>
              <div
                className="bar"
                style={{
                  height: `${Math.round((100 * w.activeStudents) / maxWeekly)}%`,
                }}
                title={`${w.activeStudents} élèves`}
              />
              <small>{w.weekStart.slice(5)}</small>
              <small>{w.activeStudents}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h3>Par classe</h3>
        <p className="muted">
          L’activité d’une classe n’est affichée qu’à partir de 5 élèves. Aucun
          élève ni aucun professeur n’est nommé.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Classe</th>
                <th>Élèves</th>
                <th>À activer</th>
                <th>Actifs 7 j</th>
                <th>Questions IA 30 j</th>
                <th>Quiz 30 j</th>
                <th>Cours avec contenu</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}{" "}
                    <small>{c.kind === "group" ? "(groupe)" : ""}</small>
                  </td>
                  <td>{c.students}</td>
                  <td>{c.pendingActivation}</td>
                  <td>
                    {c.activityHidden
                      ? "—"
                      : `${pct(c.activeStudents7d, c.students)} %`}
                  </td>
                  <td>{c.activityHidden ? "—" : c.aiRequests30d}</td>
                  <td>{c.activityHidden ? "—" : c.quizAnswers30d}</td>
                  <td>
                    {c.coursesWithContent}/{c.courses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="two-col">
        <div className="panel">
          <h3>Par niveau</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th>Élèves</th>
                  <th>Actifs 7 j</th>
                  <th>Questions IA 30 j</th>
                  <th>Quiz 30 j</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.level}>
                    <td>
                      {l.level}{" "}
                      <small>
                        ({l.classes} classe{l.classes > 1 ? "s" : ""})
                      </small>
                    </td>
                    <td>{l.students}</td>
                    <td>
                      {l.activityHidden
                        ? "—"
                        : `${pct(l.activeStudents7d, l.students)} %`}
                    </td>
                    <td>{l.activityHidden ? "—" : l.aiRequests30d}</td>
                    <td>{l.activityHidden ? "—" : l.quizAnswers30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h3>Par matière</h3>
          <p className="muted">
            L’activité d’une matière n’est affichée que si plusieurs professeurs
            l’enseignent et si au moins 5 élèves l’utilisent : ces chiffres ne
            servent pas à évaluer une personne.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matière</th>
                  <th>Cours avec contenu</th>
                  <th>Élèves avec l’assistant</th>
                  <th>Questions 30 j</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.subject}>
                    <td>{s.subject}</td>
                    <td>
                      {s.coursesWithContent}/{s.courses}
                    </td>
                    <td title={s.reason || ""}>
                      {s.activityHidden ? "—" : s.studentsUsingAssistant30d}
                    </td>
                    <td title={s.reason || ""}>
                      {s.activityHidden ? "—" : s.aiQuestions30d}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {coursesWithoutContent.length > 0 && (
        <div className="panel">
          <h3>Matières sans document publié</h3>
          <p className="muted">
            À accompagner (formation, import) : sans documents, l’assistant ne
            peut rien répondre pour ces cours. Ce n’est pas une évaluation des
            professeurs.
          </p>
          <p>
            {coursesWithoutContent
              .map((c) => `${c.class_name} · ${c.subject}`)
              .join(" ; ")}
          </p>
        </div>
      )}
      {onNavigate && (
        <p>
          <button
            className="text-button"
            onClick={() => onNavigate("administration")}
          >
            Aller à l’administration (comptes, classes, import) →
          </button>
        </p>
      )}
    </>
  );
}

export default function Administration({ data, act, busy }) {
  const kind = data.user.admin_kind || "full";
  const all = ["full", "secretariat", "direction"];
  const tabs = [
    ["overview", "Vue d’ensemble", all],
    ["users", "Comptes", all],
    ["import", "Importer", ["full", "secretariat"]],
    ["structure", "Classes & cours", ["full", "secretariat"]],
    ["year", "Nouvelle année", ["full", "secretariat"]],
    ["calendar", "Calendrier", all],
    ["security", "Sécurité", all],
    ["audit", "Journal", ["full", "direction"]],
  ].filter(([, , who]) => who.includes(kind));
  const [tab, setTab] = useState("overview");
  return (
    <>
      {kind !== "full" && (
        <div className="alert" role="note">
          Profil :{" "}
          <strong>
            {kind === "secretariat" ? "Secrétariat" : "Direction"}
          </strong>
          .{" "}
          {kind === "secretariat"
            ? "Vous gérez les comptes, l’import et la structure de l’établissement. Les statistiques, alertes de sécurité et le journal relèvent de la direction."
            : "Vous pilotez l’établissement, traitez les alertes et consultez le journal. La création des comptes et la structure relèvent du secrétariat."}
        </div>
      )}
      <div className="tabs" role="tablist">
        {tabs.map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "users" && (
        <Accounts data={data} act={act} busy={busy} kind={kind} />
      )}
      {tab === "import" && <ImportAccounts busy={busy} />}
      {tab === "structure" && <Structure data={data} act={act} busy={busy} />}
      {tab === "year" && <SchoolYear data={data} act={act} busy={busy} />}
      {tab === "calendar" && <SchoolCalendar />}
      {tab === "security" && <TwoFactor user={data.user} />}
      {tab === "audit" && <AuditLog />}
    </>
  );
}
