import React, { useEffect, useRef, useState } from "react";
import {
  Brain,
  Clock,
  Play,
  Square,
  BookOpen,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, post } from "./api";

function Input({ label, children, ...props }) {
  const id = React.useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {children ? (
        React.cloneElement(children, { id, "aria-labelledby": `${id}-label` })
      ) : (
        <input {...props} id={id} />
      )}
    </label>
  );
}
function Form({ children, submit, onSubmit }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = e.currentTarget;
        try {
          await onSubmit(Object.fromEntries(new FormData(form)), form);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button disabled={busy} className="button" type="submit">
        {busy ? "Enregistrement…" : submit}
      </button>
    </form>
  );
}
const duration = (seconds) =>
  `${Math.floor(seconds / 60)} min ${Math.max(0, seconds % 60)} s`;

export default function PersonalTutor({
  course,
  documents = [],
  onExercise,
  onAsk,
}) {
  const [profile, setProfile] = useState(null),
    [exercises, setExercises] = useState([]),
    [tab, setTab] = useState("priorities"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [notice, setNotice] = useState("");
  const lastInteraction = useRef(Date.now()),
    generation = useRef(0);
  const id = course?.id;
  async function load() {
    if (!id) return;
    const version = ++generation.current;
    const [p, e] = await Promise.all([
      api(`/api/tutor/profile?courseId=${encodeURIComponent(id)}`),
      api(`/api/tutor/exercises?courseId=${encodeURIComponent(id)}`),
    ]);
    if (version === generation.current) {
      setProfile(p);
      setExercises(e.exercises);
      setError("");
    }
  }
  useEffect(() => {
    setProfile(null);
    setExercises([]);
    setNotice("");
    load().catch((e) => setError(e.message));
    const reload = () => load().catch((e) => setError(e.message));
    window.addEventListener("tutor:refresh", reload);
    return () => {
      generation.current++;
      window.removeEventListener("tutor:refresh", reload);
    };
  }, [id]);
  useEffect(() => {
    const activity = () => {
      lastInteraction.current = Date.now();
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    return () => {
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  const active = profile?.study?.active;
  useEffect(() => {
    if (!active) return;
    const display = setInterval(() => setTick(Date.now()), 1000);
    const heartbeat = setInterval(async () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastInteraction.current > 5 * 60000
      )
        return;
      try {
        await post(`/api/tutor/study/${active.id}/heartbeat`, {});
        await load();
      } catch (e) {
        setError(e.message);
      }
    }, 30000);
    return () => {
      clearInterval(display);
      clearInterval(heartbeat);
    };
  }, [active?.id, id]);
  async function act(fn, message) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      if (message) setNotice(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!id) return null;
  return (
    <section className="personal-tutor panel" aria-label="Mon tuteur personnel">
      <div className="section-title">
        <div>
          <div className="eyebrow">
            <Brain size={16} /> VOTRE ACCOMPAGNEMENT PERSONNEL
          </div>
          <h2>Un tuteur qui suit votre chemin.</h2>
          <p>
            Vos erreurs, vos essais et vos révisions deviennent des repères pour
            mieux vous aider.
          </p>
        </div>
        <span className="badge">Mémoire privée</span>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {!profile ? (
        <p role="status">Chargement de votre parcours…</p>
      ) : (
        <>
          <div className="tutor-metrics">
            <div>
              <Clock size={18} />
              <strong>{Math.round(profile.study.seconds / 60)} min</strong>
              <span>chronométrées sur 7 jours</span>
            </div>
            <div>
              <BookOpen size={18} />
              <strong>{profile.study.plannedMinutes} min</strong>
              <span>prévues dans le planning</span>
            </div>
            <div>
              <Brain size={18} />
              <strong>
                {profile.topics.filter((t) => t.state === "to_review").length}
              </strong>
              <span>notions à retravailler</span>
            </div>
          </div>
          <div className="tutor-session">
            <div>
              <strong>
                {active
                  ? active.course_id === id
                    ? "Révision en cours"
                    : "Une séance est ouverte dans un autre cours"
                  : "Prendre un moment pour réviser"}
              </strong>
              <p className="muted">
                {active
                  ? duration(
                      Math.min(
                        10800,
                        active.credited_seconds +
                          Math.max(
                            0,
                            Math.min(
                              90,
                              Math.floor(
                                (tick -
                                  Date.parse(
                                    active.last_tick || active.started_at,
                                  )) /
                                  1000,
                              ),
                            ),
                          ),
                      ),
                    )
                  : "Le temps chronométré reste distinct de votre maîtrise du cours."}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    active
                      ? post(`/api/tutor/study/${active.id}/stop`, {})
                      : post("/api/tutor/study/start", { courseId: id }),
                  "Séance mise à jour.",
                )
              }
            >
              {active ? <Square size={16} /> : <Play size={16} />}{" "}
              {active ? "Terminer la séance" : "Démarrer une révision"}
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Votre parcours">
            {[
              ["priorities", "Mes priorités"],
              ["exercises", "Mes exercices"],
              ["memory", "Ma mémoire"],
            ].map(([k, label]) => (
              <button
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "active" : ""}
                key={k}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "priorities" && (
            <div className="two-col">
              <div>
                <h3>Mes prochaines étapes</h3>
                {!profile.memoryEnabled ? (
                  <p>
                    La personnalisation est suspendue. Vous pouvez la réactiver
                    dans « Ma mémoire ».
                  </p>
                ) : profile.recommendations.length ? (
                  profile.recommendations.map((r) => (
                    <div className="tutor-recommendation" key={r.topic}>
                      <strong>{r.topic}</strong>
                      <p>
                        {r.reason} · Séance proposée : {r.minutes} min
                      </p>
                      <button
                        className="text-button"
                        onClick={() => onAsk(r.prompt)}
                      >
                        <Sparkles size={15} /> Travailler cette notion
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("practice:prepare", {
                              detail: { courseId: id, topic: r.topic },
                            }),
                          )
                        }
                      >
                        Préparer des exercices ciblés
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Commencez un quiz, indiquez une difficulté ou travaillez un
                    exercice. Votre tuteur actualisera ses propositions au fil
                    des activités.
                  </p>
                )}
                {profile.memoryEnabled && profile.observations?.length > 0 && (
                  <div>
                    <h3>Ce que mon tuteur a relevé</h3>
                    <p className="muted">
                      Des pistes tirées de vos tentatives, à confirmer ensemble.
                    </p>
                    {profile.observations.slice(0, 5).map((o) => (
                      <div className="tutor-recommendation" key={o.id}>
                        <span className="badge">
                          {o.status === "confirmed"
                            ? "Confirmé par vous"
                            : "Hypothèse du tuteur"}
                        </span>
                        <h4>{o.topic}</h4>
                        <p>{o.description}</p>
                        <blockquote>
                          Votre tentative : « {o.evidence} »
                        </blockquote>
                        <p>
                          <strong>Prochaine étape :</strong> {o.next_step}
                        </p>
                        <div className="tutor-actions">
                          {o.status !== "confirmed" && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                act(() =>
                                  api(`/api/tutor/observations/${o.id}`, {
                                    method: "PATCH",
                                    body: { courseId: id, status: "confirmed" },
                                  }),
                                )
                              }
                            >
                              Oui, c’est mon blocage
                            </button>
                          )}
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              act(() =>
                                api(`/api/tutor/observations/${o.id}`, {
                                  method: "PATCH",
                                  body: { courseId: id, status: "dismissed" },
                                }),
                              )
                            }
                          >
                            {o.status === "confirmed"
                              ? "Ce blocage est résolu"
                              : "Cette piste ne me correspond pas"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {profile.topics.map((t) => (
                  <div className="tutor-topic" key={t.topic}>
                    <span>
                      <strong>{t.topic}</strong>
                      <small>{t.evidence}</small>
                    </span>
                    <span className="badge">
                      {t.state === "to_review"
                        ? "À revoir"
                        : t.state === "progressing"
                          ? "En progression"
                          : "À explorer"}
                    </span>
                    {t.accuracy !== null && (
                      <span>{t.accuracy}% sur les quiz</span>
                    )}
                    <small>
                      Rappel proposé le{" "}
                      {new Date(t.reviewAt + "T12:00:00").toLocaleDateString(
                        "fr-FR",
                      )}
                    </small>
                  </div>
                ))}
              </div>
              <div>
                <h3>Mes devoirs dans cette matière</h3>
                {profile.deadlines.length ? (
                  profile.deadlines.map((t) => (
                    <div className="list-item" key={t.id}>
                      <span>
                        <strong>{t.title}</strong>
                        <small>
                          Échéance : {t.due_date} · Difficulté déclarée{" "}
                          {t.difficulty}/5 · {t.duration_minutes} min estimées
                        </small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          onAsk(
                            `Aide-moi à préparer mon devoir « ${t.title} », prévu le ${t.due_date}. Demande-moi d’abord l’énoncé et ce que j’ai essayé, puis accompagne-moi étape par étape à partir des sources du cours, sans inventer le contenu du devoir.`,
                          )
                        }
                      >
                        Préparer avec mon tuteur
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Ajoutez vos devoirs dans « Mon organisation » en choisissant
                    la matière « {profile.subject} ». Les imports École Directe
                    peuvent aussi les alimenter.
                  </p>
                )}
              </div>
            </div>
          )}
          {tab === "exercises" && (
            <div className="two-col">
              <div>
                <h3>Travailler un exercice avec mon tuteur</h3>
                <Form
                  submit="Préparer l’accompagnement"
                  onSubmit={async (v, form) => {
                    const r = await post("/api/tutor/exercises", {
                      courseId: id,
                      topic: v.topic,
                      statement: v.statement,
                      ...(v.documentId ? { documentId: v.documentId } : {}),
                    });
                    await load();
                    onExercise(r.exercise);
                    form.reset();
                  }}
                >
                  <Input
                    label="Notion travaillée"
                    name="topic"
                    maxLength="100"
                    placeholder="Ex. Suites arithmétiques"
                    required
                  />
                  <Input label="Énoncé de l’exercice">
                    <textarea
                      name="statement"
                      maxLength="5000"
                      rows="4"
                      required
                      placeholder="Copiez l’énoncé, puis expliquez votre tentative dans la conversation."
                    />
                  </Input>
                  <Input label="Document du professeur (facultatif)">
                    <select name="documentId">
                      <option value="">Cours autorisés de cette matière</option>
                      {documents
                        .filter(
                          (d) => d.course_id === id && d.status === "published",
                        )
                        .map((d) => (
                          <option value={d.id} key={d.id}>
                            {d.title}
                          </option>
                        ))}
                    </select>
                  </Input>
                </Form>
              </div>
              <div>
                <h3>Mes exercices suivis</h3>
                {exercises.length ? (
                  exercises.map((e) => (
                    <div className="tutor-recommendation" key={e.id}>
                      <strong>{e.topic}</strong>
                      <p>{e.statement}</p>
                      <small>
                        {e.attempts} échange(s) d’aide ·{" "}
                        {
                          {
                            practising: "En cours",
                            needs_help: "Encore difficile",
                            understood: "Compris selon votre retour",
                          }[e.status]
                        }
                      </small>
                      {!e.available && (
                        <p className="alert">
                          Le document source a été retiré. Choisissez une
                          ressource publiée pour poursuivre.
                        </p>
                      )}
                      <div className="tutor-actions">
                        <button
                          className="text-button"
                          disabled={!e.available}
                          onClick={() => onExercise(e)}
                        >
                          Me faire accompagner
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || !e.available}
                          onClick={() =>
                            act(() =>
                              api(`/api/tutor/exercises/${e.id}`, {
                                method: "PATCH",
                                body: {
                                  courseId: id,
                                  status:
                                    e.status === "understood"
                                      ? "needs_help"
                                      : "understood",
                                },
                              }),
                            )
                          }
                        >
                          {e.status === "understood"
                            ? "J’ai encore besoin d’aide"
                            : "J’ai compris"}
                        </button>
                        <button
                          aria-label={`Supprimer l’exercice ${e.topic}`}
                          className="icon-button"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api(`/api/tutor/exercises/${e.id}`, {
                                method: "DELETE",
                              }),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Vos tentatives seront conservées ici pour reprendre votre
                    raisonnement plus tard.
                  </p>
                )}
              </div>
            </div>
          )}
          {tab === "memory" && (
            <div className="two-col">
              <div>
                <h3>Ce que mon tuteur doit prendre en compte</h3>
                <Form
                  key={`${id}:${profile.resetAt}`}
                  submit="Enregistrer mes préférences"
                  onSubmit={async (v) => {
                    await api("/api/tutor/profile", {
                      method: "PATCH",
                      body: {
                        courseId: id,
                        memoryEnabled: v.memory === "on",
                        goal: v.goal,
                        style: v.style,
                      },
                    });
                    await load();
                    setNotice("Préférences mises à jour.");
                  }}
                >
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="memory"
                      defaultChecked={profile.memoryEnabled}
                    />{" "}
                    Adapter les réponses à mon parcours
                  </label>
                  <Input
                    label="Mon objectif"
                    name="goal"
                    maxLength="300"
                    defaultValue={profile.goal}
                    placeholder="Ex. Comprendre les méthodes avant mon contrôle"
                  />
                  <Input label="Ma façon préférée d’apprendre">
                    <select name="style" defaultValue={profile.style}>
                      <option value="step_by_step">Étape par étape</option>
                      <option value="brief">Explications courtes</option>
                      <option value="examples">
                        Avec des exemples du cours
                      </option>
                    </select>
                  </Input>
                </Form>
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Réinitialiser ce profil, ses exercices et ses séances ? Les anciens quiz et conversations restent consultables mais ne seront plus réutilisés pour cette mémoire.",
                      )
                    )
                      act(
                        () =>
                          api(
                            `/api/tutor/memory?courseId=${encodeURIComponent(id)}`,
                            { method: "DELETE" },
                          ),
                        "Profil réinitialisé.",
                      );
                  }}
                >
                  Réinitialiser la mémoire de ce cours
                </button>
              </div>
              <div>
                <h3>Noter une erreur ou un blocage</h3>
                <Form
                  submit="Mémoriser cette difficulté"
                  onSubmit={async (v, form) => {
                    await post("/api/tutor/mistakes", {
                      courseId: id,
                      topic: v.topic,
                      note: v.note,
                    });
                    await load();
                    form.reset();
                  }}
                >
                  <Input
                    label="Notion concernée"
                    name="topic"
                    maxLength="100"
                    required
                  />
                  <Input label="Ce qui me bloque">
                    <textarea name="note" maxLength="1000" rows="3" required />
                  </Input>
                </Form>
                {profile.mistakes.map((m) => (
                  <div className="tutor-recommendation" key={m.id}>
                    <strong>{m.topic}</strong>
                    <p>{m.note}</p>
                    <button
                      className="text-button"
                      onClick={() =>
                        act(() =>
                          api(`/api/tutor/mistakes/${m.id}`, {
                            method: "DELETE",
                          }),
                        )
                      }
                    >
                      Retirer cette note
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="muted tutor-privacy">
            {profile.notice} Désactiver la personnalisation ne supprime pas vos
            conversations. Les données utilisées pour personnaliser les réponses
            peuvent être transmises au fournisseur IA configuré par
            l’établissement ; elles ne sont jamais partagées avec les autres
            élèves.
          </p>
        </>
      )}
    </section>
  );
}
