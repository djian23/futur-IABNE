import React, { useEffect, useState } from "react";
import {
  Sparkles,
  FileText,
  Download,
  Play,
  Check,
  Trash2,
} from "lucide-react";
import { api, post } from "./api";
import StudyContent from "./StudyContent";

const labels = {
  queued: "Demande enregistrée",
  retrieving: "Recherche des cours et anciens sujets",
  planning: "Adaptation au professeur et à votre objectif",
  generating: "Rédaction du sujet et du corrigé",
  checking: "Vérification des références et du barème",
  ready: "Entraînement prêt",
  failed: "Préparation interrompue",
  interrupted: "Préparation interrompue",
};
function Field({ label, children, ...props }) {
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
export default function PracticeAgent({
  courses,
  chapters,
  user,
  initialPractice,
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [kind, setKind] = useState("exercise"),
    [topic, setTopic] = useState(""),
    [runs, setRuns] = useState([]),
    [current, setCurrent] = useState(null),
    [correction, setCorrection] = useState(null),
    [hints, setHints] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (
      !initialPractice ||
      !courses.some((c) => c.id === initialPractice.courseId)
    )
      return;
    setCourseId(initialPractice.courseId);
    setKind("exercise");
    setTopic(initialPractice.topic);
    setNotice(
      "Entraînement ciblé depuis votre parcours. Vérifiez les options puis lancez la préparation.",
    );
  }, [initialPractice]);
  const running = current && ["queued", "running"].includes(current.status);
  async function load() {
    const r = await api("/api/agents/practice");
    setRuns(r.runs);
  }
  useEffect(() => {
    let active = true;
    api("/api/agents/practice")
      .then((r) => {
        if (active) {
          setRuns(r.runs);
          const pending = r.runs.find((r) =>
            ["queued", "running"].includes(r.status),
          );
          if (pending) setCurrent(pending);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const r = await api(`/api/agents/practice/${current.id}`);
        if (!active) return;
        setCurrent(r);
        if (!["queued", "running"].includes(r.status)) await load();
      } catch (e) {
        if (active) {
          setError(e.message);
          clearInterval(timer);
        }
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [current?.id, running]);
  async function open(id) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api(`/api/agents/practice/${id}`);
      setCurrent(r);
      setCorrection(null);
      setHints({});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const subject = current?.subject;
  return (
    <section
      className="panel practice-agent"
      aria-label="Agent de préparation des entraînements"
    >
      <div className="section-title">
        <div>
          <div className="eyebrow">
            <Sparkles size={17} /> PRÉPARER · ADAPTER · VÉRIFIER
          </div>
          <h2>
            {user.role === "student"
              ? "Des entraînements dans le style de votre professeur"
              : "Mon assistant de préparation pédagogique"}
          </h2>
          <p>
            L’agent s’appuie sur les cours, exercices et corrigés publiés du
            professeur, puis prépare un sujet nouveau avec son corrigé séparé.
          </p>
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <form
        className="form"
        key={kind}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          const v = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const r = await post("/api/agents/practice", {
              courseId,
              kind,
              questionCount: Number(v.questionCount),
              durationMinutes: Number(v.durationMinutes),
              totalPoints: Number(v.totalPoints),
              difficulty: v.difficulty,
              topic: v.topic,
              ...(v.chapterId ? { chapterId: v.chapterId } : {}),
            });
            setCurrent(r);
            setCorrection(null);
            setHints({});
            await load();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Cours de l’entraînement">
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
            >
              <option value="">Choisir…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="exercise">Série d’exercices similaires</option>
              <option value="exam">Contrôle d’entraînement</option>
            </select>
          </Field>
          <Field label="Chapitre ciblé">
            <select name="chapterId" key={courseId}>
              <option value="">Tout le cours</option>
              {chapters
                .filter((c) => c.course_id === courseId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Difficulté de l’entraînement">
            <select name="difficulty">
              <option value="adaptive">
                {user.role === "student"
                  ? "Adaptée à mon parcours"
                  : "Niveau standard, modifiable ci-dessous"}
              </option>
              <option value="easy">Accessible / soutien</option>
              <option value="medium">Intermédiaire</option>
              <option value="hard">Approfondissement</option>
            </select>
          </Field>
          <Field
            label="Nombre de questions"
            name="questionCount"
            type="number"
            min="1"
            max="8"
            defaultValue={kind === "exam" ? 5 : 3}
            required
          />
          <Field
            label="Durée prévue (minutes)"
            name="durationMinutes"
            type="number"
            min="5"
            max="180"
            defaultValue={kind === "exam" ? 45 : 15}
            required
          />
          <Field
            label="Total du barème proposé"
            name="totalPoints"
            type="number"
            min="1"
            max="100"
            step="0.25"
            defaultValue="20"
            required
          />
          <Field
            label="Notion ou objectif ciblé (facultatif)"
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength="160"
            placeholder="Ex. Justifier les étapes du raisonnement"
          />
        </div>
        <button
          className="button"
          disabled={busy || running || !courseId}
          type="submit"
        >
          <Sparkles size={17} />
          {running ? "Préparation en cours…" : "Préparer avec mon agent IA"}
        </button>
        <p className="muted">
          Les questions sont nouvelles et les barèmes proposés sont vérifiés
          arithmétiquement. La qualité pédagogique reste à relire ; l’agent ne
          prédit pas un vrai contrôle.
        </p>
      </form>
      <div className="practice-history">
        {runs.map((r) => (
          <button
            className={`practice-history-item ${current?.id === r.id ? "active" : ""}`}
            key={r.id}
            disabled={busy}
            onClick={() => open(r.id)}
          >
            <FileText size={17} />
            <span>
              {r.subject?.title ||
                r.summary?.title ||
                `${r.kind === "exam" ? "Contrôle" : "Exercices"} — ${courses.find((c) => c.id === r.courseId)?.title || "Cours"}`}
              <small>
                {labels[r.stage] || r.status}
                {r.obsolete ? " · Sources modifiées" : ""}
              </small>
            </span>
          </button>
        ))}
      </div>
      {current && (
        <div className="practice-result">
          <div className="section-title">
            <h3>{labels[current.stage] || current.status}</h3>
            <button
              className="text-button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Supprimer cette préparation ? Les documents déjà déposés en cours restent conservés.",
                  )
                )
                  return;
                try {
                  await api(`/api/agents/practice/${current.id}`, {
                    method: "DELETE",
                  });
                  setCurrent(null);
                  setCorrection(null);
                  await load();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          </div>
          <ol className="practice-trace" aria-label="Suivi de la préparation">
            {(current.trace || []).map((s, i) => (
              <li key={i}>
                <Check size={14} />
                {labels[s.stage] || s.stage}
              </li>
            ))}
          </ol>
          {running && (
            <p role="status">
              L’agent prépare les documents. Vous pouvez revenir à cette
              préparation depuis votre bibliothèque.
            </p>
          )}
          {current.error && (
            <p className="alert error" role="alert">
              {current.error}
            </p>
          )}
          {current.obsolete && (
            <p className="alert error">
              Les sources ont changé. Préparez une nouvelle version avant de
              demander un corrigé ou une aide.
            </p>
          )}
          {current.plan && (
            <div className="info-note">
              <div>
                <strong>Repères de préparation</strong>
                <p>
                  {current.plan.questionCount} questions ·{" "}
                  {current.plan.durationMinutes} min ·{" "}
                  {current.plan.totalPoints} points ·{" "}
                  {
                    {
                      easy: "niveau accessible",
                      medium: "niveau intermédiaire",
                      hard: "approfondissement",
                    }[current.plan.difficulty]
                  }
                </p>
                <p>
                  {
                    {
                      published_examples: `Style fondé sur ${current.plan.exampleCount} sujet(s) ou exercice(s) publié(s) du professeur.`,
                      validated_method:
                        "Style guidé par la méthode validée du professeur.",
                      course_only:
                        "Style approché à partir des cours : aucun ancien sujet disponible.",
                    }[current.plan.similarityBasis]
                  }
                </p>
                {current.plan.focusTopics?.length > 0 && (
                  <p>Priorités : {current.plan.focusTopics.join(", ")}</p>
                )}
              </div>
            </div>
          )}
          {subject && (
            <>
              <h2>{subject.title}</h2>
              <p className="muted">{current.notice}</p>
              <StudyContent content={subject.instructions} />
              {subject.questions.map((q) => (
                <article className="practice-question" key={q.id}>
                  <div className="section-title">
                    <h3>
                      {q.id} · {q.topic}
                    </h3>
                    <span className="badge">{q.points} points</span>
                  </div>
                  <StudyContent content={q.statement} />
                  <div className="tutor-actions">
                    <button
                      className="text-button"
                      disabled={
                        current.obsolete ||
                        busy ||
                        hints[q.id]?.level >= hints[q.id]?.total
                      }
                      onClick={async () => {
                        setError("");
                        try {
                          const next = (hints[q.id]?.level || 0) + 1,
                            r = await api(
                              `/api/agents/practice/${current.id}/questions/${q.id}/hint?level=${next}`,
                            );
                          setHints((h) => ({
                            ...h,
                            [q.id]: {
                              ...r,
                              items: [...(h[q.id]?.items || []), r.hint],
                            },
                          }));
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Révéler un indice
                    </button>
                    {user.role === "student" && (
                      <button
                        className="text-button"
                        disabled={current.obsolete || busy}
                        onClick={async () => {
                          try {
                            const r = await post(
                              `/api/agents/practice/${current.id}/questions/${q.id}/start`,
                              {},
                            );
                            window.dispatchEvent(
                              new CustomEvent("tutor:open-exercise", {
                                detail: {
                                  courseId: current.courseId,
                                  exercise: r.exercise,
                                },
                              }),
                            );
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        <Play size={15} />
                        Travailler avec mon tuteur
                      </button>
                    )}
                  </div>
                  {hints[q.id]?.items.map((h, i) => (
                    <p className="info-note" key={i}>
                      Indice {i + 1} : {h}
                    </p>
                  ))}
                </article>
              ))}
              <div className="tutor-actions">
                <a
                  className="button secondary"
                  href={`/api/agents/practice/${current.id}/pdf?part=subject`}
                >
                  <Download size={16} />
                  Sujet PDF
                </a>
                <button
                  className="button secondary"
                  disabled={current.obsolete || busy}
                  onClick={async () => {
                    try {
                      const r = await api(
                        `/api/agents/practice/${current.id}/correction`,
                      );
                      setCorrection(r.correction);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Ouvrir le corrigé séparé
                </button>
                {user.role !== "student" &&
                  ["subject", "correction"].map((part) => (
                    <button
                      className="text-button"
                      key={part}
                      disabled={current.obsolete || busy}
                      onClick={async () => {
                        setBusy(true);
                        setNotice("");
                        setError("");
                        try {
                          const r = await post(
                            `/api/agents/practice/${current.id}/drafts`,
                            { parts: [part] },
                          );
                          setNotice(r.message);
                          window.dispatchEvent(new Event("elan:refresh"));
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {part === "subject"
                        ? "Déposer le sujet en brouillon"
                        : "Déposer le corrigé en brouillon"}
                    </button>
                  ))}
              </div>
              {correction && (
                <section
                  className="practice-correction"
                  aria-label="Corrigé de l’entraînement"
                >
                  <h3>Corrigé expliqué et barème proposé</h3>
                  <p className="muted">
                    Vérifiez les étapes avec les documents du professeur.
                  </p>
                  {correction.questions.map((q) => (
                    <div className="practice-question" key={q.id}>
                      <h4>
                        {q.id} · {q.points} points
                      </h4>
                      <p>
                        <strong>Méthode attendue :</strong> {q.expectedMethod}
                      </p>
                      <StudyContent content={q.solution} />
                      <ul>
                        {q.criteria.map((c, i) => (
                          <li key={i}>
                            {c.description} — {c.points} point(s)
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <a
                    className="button secondary"
                    href={`/api/agents/practice/${current.id}/pdf?part=correction`}
                  >
                    <Download size={16} />
                    Corrigé PDF
                  </a>
                </section>
              )}
              <details>
                <summary>Documents utilisés</summary>
                {current.sources.map((s) => (
                  <p key={s.citation}>
                    <a
                      className="text-button"
                      href={`/api/documents/${s.id}/download`}
                    >
                      [{s.citation}] {s.title}
                    </a>
                  </p>
                ))}
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
