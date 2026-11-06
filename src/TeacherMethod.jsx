import React, { useEffect, useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { api, post } from "./api";
import StudyContent from "./StudyContent";

export default function TeacherMethod({ courseId, editor = false }) {
  const [profile, setProfile] = useState(null),
    [instructions, setInstructions] = useState(""),
    [approved, setApproved] = useState(false),
    [useAnalysis, setUseAnalysis] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError("");
    setNotice("");
    if (!courseId) return;
    api(`/api/teacher-tutor/profile?courseId=${encodeURIComponent(courseId)}`)
      .then((p) => {
        if (active) {
          setProfile(p);
          setInstructions(p.instructions);
          setApproved(p.approved);
          setUseAnalysis(Boolean(p.analysis));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [courseId]);
  if (!courseId) return null;
  const content = (
    <>
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
      {!profile ? (
        <p role="status">Chargement de la méthode du professeur…</p>
      ) : (
        <>
          <h3>
            <BookOpen size={18} /> La méthode de {profile.teacherName}
          </h3>
          <p className="muted">{profile.notice}</p>
          {profile.stale && (
            <p className="alert">
              Les documents ont changé. L’analyse doit être revue avant de
              guider de nouvelles réponses.
            </p>
          )}
          {editor && profile.canEdit ? (
            <>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const p = await api("/api/teacher-tutor/profile", {
                      method: "PATCH",
                      body: { courseId, instructions, approved, useAnalysis },
                    });
                    setProfile(p);
                    setNotice(
                      p.approved
                        ? "Méthode validée : le tuteur l’utilisera pour vos élèves."
                        : "Brouillon enregistré.",
                    );
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  <span>Mes consignes de raisonnement et de rédaction</span>
                  <textarea
                    name="instructions"
                    rows="5"
                    maxLength="4000"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Ex. Faire identifier les données, citer la propriété, détailler le calcul puis conclure. Utiliser les notations de mon cours."
                  />
                </label>
                <p className="muted">
                  Décrivez des méthodes destinées aux élèves. N’insérez pas de
                  sujet confidentiel, de mot de passe ou de corrigé non publié.
                </p>
                {profile.analysis && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={useAnalysis}
                      onChange={(e) => setUseAnalysis(e.target.checked)}
                    />{" "}
                    Utiliser aussi l’analyse de mes documents ci-dessous
                  </label>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{" "}
                  J’ai vérifié ces méthodes et les valide pour l’accompagnement
                  de mes élèves
                </label>
                <button className="button" disabled={busy} type="submit">
                  Enregistrer ma méthode
                </button>
              </form>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  setNotice("");
                  try {
                    const p = await post("/api/teacher-tutor/analyze", {
                      courseId,
                    });
                    setProfile(p);
                    setApproved(false);
                    setUseAnalysis(true);
                    setNotice(
                      "Analyse préparée. Vérifiez ses références, puis validez-la pour vos élèves.",
                    );
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles size={16} /> Analyser mes raisonnements et corrigés
              </button>
              <p className="muted">
                Seuls les documents publiés de ce cours sont analysés, avec
                priorité aux corrections. L’analyse demande un fournisseur IA
                activé.
              </p>
            </>
          ) : (
            !profile.available && (
              <p className="muted">
                Le tuteur s’appuie sur les cours publiés. Le professeur peut
                aussi valider un profil de méthode pour préciser son
                accompagnement.
              </p>
            )
          )}
          {(editor || profile.available) && profile.instructions && (
            <div className="tutor-recommendation">
              <strong>Consignes du professeur</strong>
              <StudyContent content={profile.instructions} />
            </div>
          )}
          {(editor || profile.available) && profile.analysis && (
            <div className="teacher-analysis">
              <span className="badge">
                {profile.approved && !profile.stale
                  ? "Analyse validée par le professeur"
                  : "Brouillon IA à vérifier"}
              </span>
              <StudyContent content={profile.analysis.summary} />
              {[
                ["reasoningSteps", "Étapes de raisonnement"],
                ["vocabulary", "Vocabulaire et notations"],
                ["correctionCriteria", "Critères de correction"],
                ["teachingApproach", "Démarche pédagogique"],
              ].map(
                ([key, label]) =>
                  profile.analysis[key]?.length > 0 && (
                    <section key={key}>
                      <h4>{label}</h4>
                      <ul>
                        {profile.analysis[key].map((value, i) => (
                          <li key={i}>{value}</li>
                        ))}
                      </ul>
                    </section>
                  ),
              )}
              <details>
                <summary>Documents ayant servi à l’analyse</summary>
                {profile.sources.map((s) => (
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
            </div>
          )}
        </>
      )}
    </>
  );
  return editor ? (
    <details className="panel teacher-method">
      <summary>
        <Sparkles size={17} /> Personnaliser mon agent IA de professeur
      </summary>
      {content}
    </details>
  ) : (
    <section className="teacher-method-readonly">{content}</section>
  );
}
