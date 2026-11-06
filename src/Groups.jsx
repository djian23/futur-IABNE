import React, { useCallback, useEffect, useState } from "react";
import { api, post } from "./api";
import { Form, Field } from "./ui";

const KIND = {
  revision: "Groupe de révision",
  binome: "Binôme (havrouta)",
  project: "Projet encadré",
};
const when = (v) =>
  new Date(v).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Charter() {
  return (
    <div className="alert" role="note">
      <strong>Règles des groupes :</strong> un groupe sert à travailler
      ensemble, pas à discuter de tout. On y entre sur invitation. Les messages
      restent courts et respectueux, ils sont fermés la nuit, pendant Chabbat et
      les fêtes. Un adulte de la classe peut consulter un groupe : chaque
      consultation est visible ici. Rien de ce qui est écrit dans un groupe
      n’est lu par l’IA. Tu peux signaler tout message qui te met mal à l’aise.
    </div>
  );
}

function Comments({ groupId, detail, reload, me }) {
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const adult = detail.role === "adult";
  async function report(c) {
    const reason = window.prompt(
      "Pourquoi signales-tu ce message ? Un adulte de la classe le lira.",
    );
    if (!reason) return;
    try {
      const r = await post(`/api/groups/${groupId}/reports`, {
        target_type: "comment",
        target_id: c.id,
        reason,
      });
      setSent(r.message);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="panel">
      <h3>Fil du groupe</h3>
      {detail.quiet && (
        <div className="alert" role="status">
          Heures calmes : les messages sont fermés (nuit, Chabbat, fêtes ou jour
          sans travail). Tu peux lire, tu pourras écrire plus tard.
        </div>
      )}
      {sent && <div className="alert success">{sent}</div>}
      {error && <div className="alert error">{error}</div>}
      {detail.comments.length === 0 && (
        <p className="muted">Aucun message pour le moment.</p>
      )}
      {detail.comments.map((c) => (
        <div className="list-item" key={c.id}>
          <span>
            <strong>{c.author}</strong> <small>{when(c.created_at)}</small>
            <br />
            <span dir="auto">{c.body}</span>
          </span>
          <span className="row-actions">
            {c.user_id !== me && !adult && (
              <button className="text-button" onClick={() => report(c)}>
                Signaler
              </button>
            )}
            {(c.user_id === me || adult) && (
              <button
                className="text-button danger"
                onClick={() =>
                  api(`/api/groups/${groupId}/comments/${c.id}`, {
                    method: "DELETE",
                  })
                    .then(reload)
                    .catch((e) => setError(e.message))
                }
              >
                {adult ? "Masquer" : "Supprimer"}
              </button>
            )}
          </span>
        </div>
      ))}
      {!adult && !detail.group.archived_at && (
        <Form
          submit="Envoyer"
          disabled={detail.quiet}
          onSubmit={async (v, form) => {
            await post(`/api/groups/${groupId}/comments`, v);
            form.reset();
            reload();
          }}
        >
          <Field
            label="Message (500 caractères maximum, en lien avec le travail)"
            name="body"
            maxLength="500"
            required
          />
        </Form>
      )}
    </div>
  );
}

function Tasks({ groupId, detail, reload, canWrite }) {
  const [error, setError] = useState("");
  const run = (p) => p.then(reload).catch((e) => setError(e.message));
  return (
    <div className="panel">
      <h3>Tâches</h3>
      {error && <div className="alert error">{error}</div>}
      {detail.tasks.map((t) => (
        <div className="list-item" key={t.id}>
          <input
            type="checkbox"
            aria-label={`Fait : ${t.title}`}
            checked={Boolean(t.done)}
            disabled={!canWrite}
            onChange={(e) =>
              run(
                api(`/api/groups/${groupId}/tasks/${t.id}`, {
                  method: "PATCH",
                  body: { done: e.target.checked },
                }),
              )
            }
          />
          <span style={t.done ? { textDecoration: "line-through" } : {}}>
            <strong>{t.title}</strong>
            <small>
              {t.assignee_name
                ? `Pour ${t.assignee_name}`
                : "Pour tout le groupe"}
              {t.due_date ? ` · avant le ${t.due_date}` : ""}
            </small>
          </span>
          {canWrite && (
            <button
              className="text-button danger"
              onClick={() =>
                run(
                  api(`/api/groups/${groupId}/tasks/${t.id}`, {
                    method: "DELETE",
                  }),
                )
              }
            >
              Supprimer
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <Form
          submit="Ajouter la tâche"
          onSubmit={async (v, form) => {
            await post(`/api/groups/${groupId}/tasks`, {
              title: v.title,
              assignee_id: v.assignee_id || null,
              due_date: v.due_date || null,
            });
            form.reset();
            reload();
          }}
        >
          <Field label="Tâche" name="title" maxLength="120" required />
          <Field label="Pour (facultatif)">
            <select name="assignee_id">
              <option value="">Tout le groupe</option>
              {detail.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Avant le (facultatif)" type="date" name="due_date" />
        </Form>
      )}
    </div>
  );
}

function Resources({ groupId, detail, reload, canWrite, courseDocs }) {
  const [error, setError] = useState("");
  return (
    <div className="panel">
      <h3>Ressources</h3>
      <p className="muted">
        Tu peux lier un document publié de tes cours : chacun ne l’ouvre que
        s’il y a déjà droit. Tu peux aussi écrire une courte note (formules,
        méthode). Pas de liens vers l’extérieur.
      </p>
      {error && <div className="alert error">{error}</div>}
      {detail.resources.map((r) => (
        <div className="list-item" key={r.id}>
          <span>
            <strong>{r.title}</strong>
            <small>
              {r.kind === "document"
                ? r.canOpen
                  ? "Document du cours"
                  : "Document du cours (plus accessible)"
                : "Note"}{" "}
              · ajouté par {r.added_by_name || "un ancien membre"}
            </small>
            {r.kind === "note" && <span dir="auto">{r.body}</span>}
          </span>
          {r.kind === "document" && r.canOpen && (
            <a
              className="text-button"
              href={`/api/documents/${r.document_id}/download`}
            >
              Ouvrir
            </a>
          )}
          {canWrite && (
            <button
              className="text-button danger"
              onClick={() =>
                api(`/api/groups/${groupId}/resources/${r.id}`, {
                  method: "DELETE",
                })
                  .then(reload)
                  .catch((e) => setError(e.message))
              }
            >
              Retirer
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <>
          <Form
            submit="Lier ce document"
            onSubmit={async (v) => {
              await post(`/api/groups/${groupId}/resources`, {
                kind: "document",
                document_id: v.document_id,
              });
              reload();
            }}
          >
            <Field label="Document d’un cours de la classe">
              <select name="document_id" required>
                <option value="">Choisir…</option>
                {courseDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </Field>
          </Form>
          <Form
            submit="Ajouter la note"
            onSubmit={async (v, form) => {
              await post(`/api/groups/${groupId}/resources`, {
                kind: "note",
                title: v.title,
                body: v.body,
              });
              form.reset();
              reload();
            }}
          >
            <Field
              label="Titre de la note"
              name="title"
              maxLength="100"
              required
            />
            <Field label="Texte (1 500 caractères)">
              <textarea name="body" rows="4" maxLength="1500" required />
            </Field>
          </Form>
        </>
      )}
    </div>
  );
}

function Members({ groupId, detail, reload, me }) {
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState("");
  const owner = ["owner", "adult"].includes(detail.role);
  const active = !detail.group.archived_at;
  useEffect(() => {
    if (owner && active)
      api(`/api/groups/${groupId}/candidates`)
        .then((r) => setCandidates(r.candidates))
        .catch(() => {});
  }, [groupId, owner, active, detail.members.length]);
  return (
    <div className="panel">
      <h3>
        Membres ({detail.members.length}/{detail.limits.members})
      </h3>
      {error && <div className="alert error">{error}</div>}
      {detail.members.map((m) => (
        <div className="list-item" key={m.id}>
          <span>
            <strong>{m.name}</strong>
            <small>{m.role === "owner" ? "Anime le groupe" : "Membre"}</small>
          </span>
          {owner && active && m.id !== me && (
            <button
              className="text-button danger"
              onClick={() => {
                if (window.confirm(`Retirer ${m.name} du groupe ?`))
                  api(`/api/groups/${groupId}/members/${m.id}`, {
                    method: "DELETE",
                  })
                    .then(reload)
                    .catch((e) => setError(e.message));
              }}
            >
              Retirer
            </button>
          )}
        </div>
      ))}
      {owner && active && detail.role !== "adult" && (
        <Form
          submit="Inviter"
          onSubmit={async (v) => {
            await post(`/api/groups/${groupId}/invite`, { user_id: v.user_id });
            reload();
          }}
        >
          <Field label="Inviter un élève de la classe (il doit accepter)">
            <select name="user_id" required>
              <option value="">Choisir…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </Form>
      )}
    </div>
  );
}

function Slots({ groupId, detail, reload }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");
  const from = new Date().toISOString().slice(0, 10);
  const load = useCallback(() => {
    if (!detail.sharing) return setSlots(null);
    api(`/api/groups/${groupId}/common-slots?from=${from}&days=10`)
      .then(setSlots)
      .catch((e) => setError(e.message));
  }, [groupId, detail.sharing, from]);
  useEffect(load, [load]);
  return (
    <div className="panel">
      <h3>Créneaux communs</h3>
      <p className="muted">
        Si tu le souhaites, ton planning peut aider le groupe à trouver un
        moment commun. Seuls les créneaux où{" "}
        <strong>tous les membres qui partagent</strong> sont libres sont
        affichés : personne ne voit tes disponibilités détaillées. Chabbat et
        les fêtes sont toujours exclus.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(detail.sharing)}
          onChange={async (e) => {
            await api(`/api/groups/${groupId}/sharing`, {
              method: "PUT",
              body: { share: e.target.checked },
            });
            reload();
          }}
        />
        Partager mes disponibilités avec ce groupe ({detail.sharingCount}{" "}
        membre(s) partagent)
      </label>
      {error && <div className="alert error">{error}</div>}
      {slots?.message && <p className="muted">{slots.message}</p>}
      {slots?.slots?.length === 0 && !slots.message && (
        <p className="muted">
          Aucun créneau commun d’au moins 30 minutes dans les 10 prochains
          jours.
        </p>
      )}
      {slots?.slots?.map((s) => (
        <div className="list-item" key={s.date + s.startTime}>
          <strong>
            {new Date(`${s.date}T00:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </strong>
          <span>
            {s.startTime} – {s.endTime}
          </span>
        </div>
      ))}
    </div>
  );
}

function BinomePlan({ groupId, detail, reload }) {
  return (
    <div className="panel">
      <h3>Plan de séance</h3>
      <p className="muted">
        En havrouta, on prépare, on explique à tour de rôle, puis on questionne.
        Écrivez ici votre plan (par exemple : 10 min lecture seul, 15 min je
        t’explique, 15 min tu m’expliques, 10 min questions).
      </p>
      <Form
        submit="Enregistrer le plan"
        onSubmit={async (v) => {
          await api(`/api/groups/${groupId}`, {
            method: "PUT",
            body: { plan: v.plan },
          });
          reload();
        }}
      >
        <Field label="Plan">
          <textarea
            name="plan"
            rows="4"
            maxLength="1000"
            defaultValue={detail.group.plan}
            dir="auto"
          />
        </Field>
      </Form>
    </div>
  );
}

function GroupDetail({ id, me, onBack, courseDocs }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("feed");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api(`/api/groups/${id}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  if (error) return <div className="alert error">{error}</div>;
  if (!detail) return <p className="muted">Chargement…</p>;
  const adult = detail.role === "adult";
  const canWrite =
    !detail.group.archived_at &&
    (!adult || detail.group.created_by_role !== "student");
  const tabs = [
    ["feed", "Fil"],
    ["tasks", "Tâches"],
    ["resources", "Ressources"],
    ["members", "Membres"],
    ...(!adult ? [["slots", "Créneaux"]] : []),
    ...(detail.group.kind === "binome" ? [["plan", "Plan de séance"]] : []),
  ];
  return (
    <>
      <button className="text-button" onClick={onBack}>
        ← Tous les groupes
      </button>
      <h2>{detail.group.name}</h2>
      <p className="muted">
        {KIND[detail.group.kind]}
        {detail.group.description ? ` · ${detail.group.description}` : ""}
        {detail.group.archived_at ? " · archivé (lecture seule)" : ""}
      </p>
      {adult && (
        <div className="alert" role="note">
          Vous consultez ce groupe en tant qu’adulte : cette consultation est
          enregistrée et visible des élèves membres.
        </div>
      )}
      {detail.consultations.length > 0 && !adult && (
        <div className="alert" role="note">
          Consultations par des adultes :{" "}
          {detail.consultations
            .map((c) => `${c.actor_name} (${when(c.created_at)})`)
            .join(" ; ")}
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
      {tab === "feed" && (
        <Comments groupId={id} detail={detail} reload={load} me={me} />
      )}
      {tab === "tasks" && (
        <Tasks groupId={id} detail={detail} reload={load} canWrite={canWrite} />
      )}
      {tab === "resources" && (
        <Resources
          groupId={id}
          detail={detail}
          reload={load}
          canWrite={canWrite}
          courseDocs={courseDocs.filter(
            (d) =>
              d.status === "published" &&
              d.course_class === detail.group.class_id,
          )}
        />
      )}
      {tab === "members" && (
        <Members groupId={id} detail={detail} reload={load} me={me} />
      )}
      {tab === "slots" && <Slots groupId={id} detail={detail} reload={load} />}
      {tab === "plan" && (
        <BinomePlan groupId={id} detail={detail} reload={load} />
      )}
      <div className="row-actions" style={{ marginTop: 16 }}>
        {!adult && (
          <button
            className="text-button"
            onClick={() => {
              if (window.confirm("Quitter ce groupe ?"))
                api(`/api/groups/${id}/leave`, {
                  method: "POST",
                  body: {},
                }).then(onBack);
            }}
          >
            Quitter le groupe
          </button>
        )}
        {["owner", "adult"].includes(detail.role) && (
          <button
            className="text-button danger"
            onClick={() => {
              if (
                window.confirm(
                  "Dissoudre ce groupe et supprimer tout son contenu ?",
                )
              )
                api(`/api/groups/${id}`, { method: "DELETE" }).then(onBack);
            }}
          >
            Dissoudre le groupe
          </button>
        )}
      </div>
    </>
  );
}

function StudentGroups({ me, courseDocs }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/groups")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (open)
    return (
      <GroupDetail
        id={open}
        me={me}
        courseDocs={courseDocs}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );
  if (error) return <div className="alert error">{error}</div>;
  if (!state) return <p className="muted">Chargement…</p>;
  return (
    <>
      <Charter />
      {state.invitations.length > 0 && (
        <div className="panel">
          <h3>Invitations</h3>
          {state.invitations.map((i) => (
            <div className="list-item" key={i.id}>
              <span>
                <strong>{i.name}</strong>
                <small>
                  {KIND[i.kind]} · invité par{" "}
                  {i.invited_by_name || "un camarade"}
                </small>
              </span>
              <span className="row-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    post(`/api/group-invitations/${i.id}/accept`, {})
                      .then(load)
                      .catch((e) => setError(e.message))
                  }
                >
                  Accepter
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    post(`/api/group-invitations/${i.id}/decline`, {}).then(
                      load,
                    )
                  }
                >
                  Refuser
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="two-col">
        <div className="panel">
          <h3>Mes groupes</h3>
          {state.groups.length === 0 && (
            <p className="muted">
              Tu n’es dans aucun groupe. Crée-en un ou attends une invitation.
            </p>
          )}
          {state.groups.map((g) => (
            <div className="list-item" key={g.id}>
              <span>
                <strong>{g.name}</strong>
                <small>
                  {KIND[g.kind]} · {g.class_name} · {g.members} membre(s)
                  {g.archived_at ? " · archivé" : ""}
                </small>
              </span>
              <button className="text-button" onClick={() => setOpen(g.id)}>
                Ouvrir
              </button>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Créer un groupe</h3>
          <Form
            submit="Créer le groupe"
            onSubmit={async (v) => {
              const r = await post("/api/groups", v);
              load();
              setOpen(r.id);
            }}
          >
            <Field
              label="Nom du groupe (3 à 60 caractères)"
              name="name"
              maxLength="60"
              minLength="3"
              required
            />
            <Field label="Type">
              <select name="kind">
                <option value="revision">
                  Groupe de révision (jusqu’à {state.limits.members} élèves)
                </option>
                <option value="binome">Binôme / havrouta (2 élèves)</option>
              </select>
            </Field>
            <Field label="Classe">
              <select name="class_id" required>
                {state.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="De quoi s’agit-il ? (facultatif)"
              name="description"
              maxLength="300"
            />
          </Form>
        </div>
      </div>
    </>
  );
}

function AdultGroups({ data, me }) {
  const [state, setState] = useState(null);
  const [reports, setReports] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    Promise.all([api("/api/groups/overview"), api("/api/group-reports")])
      .then(([o, r]) => {
        setState(o);
        setReports(r.reports);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const [classId, setClassId] = useState("");
  const [chosen, setChosen] = useState([]);
  if (open)
    return (
      <GroupDetail
        id={open}
        me={me}
        courseDocs={(data.documents || []).map((d) => ({
          ...d,
          course_class: (data.courses || []).find((c) => c.id === d.course_id)
            ?.class_id,
        }))}
        onBack={() => {
          setOpen(null);
          load();
        }}
      />
    );
  if (error) return <div className="alert error">{error}</div>;
  if (!state) return <p className="muted">Chargement…</p>;
  const classmates = (data.memberships || [])
    .filter((m) => m.class_id === classId)
    .map((m) => (data.users || []).find((u) => u.id === m.user_id))
    .filter((u) => u && u.role === "student");
  return (
    <>
      <div className="alert" role="note">
        Vous voyez ici les groupes de vos classes. Ouvrir un groupe d’élèves est
        enregistré et visible des membres. Aucun message privé n’existe entre
        élèves.
      </div>
      {reports.filter((r) => r.status === "new").length > 0 && (
        <div className="panel">
          <h3>Signalements à traiter</h3>
          {reports
            .filter((r) => r.status === "new")
            .map((r) => (
              <div className="list-item" key={r.id}>
                <span>
                  <strong>{r.group_name}</strong>
                  <small>
                    {when(r.created_at)} · {r.reason}
                  </small>
                  {r.comment_body && (
                    <span dir="auto">« {r.comment_body} »</span>
                  )}
                </span>
                <button
                  className="text-button"
                  onClick={() => setOpen(r.group_id)}
                >
                  Ouvrir
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    api(`/api/group-reports/${r.id}`, {
                      method: "PATCH",
                      body: {},
                    }).then(load)
                  }
                >
                  Marquer traité
                </button>
              </div>
            ))}
        </div>
      )}
      <div className="two-col">
        <div className="panel">
          <h3>Groupes de mes classes</h3>
          {state.groups.length === 0 && (
            <p className="muted">Aucun groupe pour le moment.</p>
          )}
          {state.groups.map((g) => (
            <div className="list-item" key={g.id}>
              <span>
                <strong>{g.name}</strong>
                <small>
                  {KIND[g.kind]} · {g.class_name} · {g.members} membre(s)
                  {g.open_reports ? ` · ${g.open_reports} signalement(s)` : ""}
                  {g.archived_at ? " · archivé" : ""}
                </small>
              </span>
              <button className="text-button" onClick={() => setOpen(g.id)}>
                Ouvrir
              </button>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Créer un groupe de projet</h3>
          <Form
            submit="Créer le groupe"
            onSubmit={async (v) => {
              const r = await post("/api/groups", {
                name: v.name,
                class_id: classId,
                kind: "project",
                member_ids: chosen,
              });
              setChosen([]);
              load();
              setOpen(r.id);
            }}
          >
            <Field
              label="Nom du projet"
              name="name"
              maxLength="60"
              minLength="3"
              required
            />
            <Field label="Classe">
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setChosen([]);
                }}
                required
              >
                <option value="">Choisir…</option>
                {state.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {classmates.map((u) => (
              <label className="check" key={u.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(u.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked
                        ? [...chosen, u.id]
                        : chosen.filter((x) => x !== u.id),
                    )
                  }
                />{" "}
                {u.name}
              </label>
            ))}
          </Form>
        </div>
      </div>
    </>
  );
}

export default function Groups({ user, data }) {
  return user.role === "student" ? (
    <StudentGroups
      me={user.id}
      courseDocs={(data.documents || []).map((d) => ({
        ...d,
        course_class: (data.courses || []).find((c) => c.id === d.course_id)
          ?.class_id,
      }))}
    />
  ) : (
    <AdultGroups data={data} me={user.id} />
  );
}
