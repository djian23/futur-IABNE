import React, { useEffect, useState, useCallback } from "react";
import { api } from "./api";

const HELP_LEVELS = [
  ["hints", "Indices seulement : l’élève cherche, l’IA l’oriente"],
  [
    "method",
    "Indices, méthode et vérification de sa tentative (pas de correction)",
  ],
  [
    "solution_after_attempt",
    "Correction expliquée possible, mais seulement après une tentative",
  ],
];

export function CourseAiSettings({ courseId }) {
  const [settings, setSettings] = useState(null),
    [canEdit, setCanEdit] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/api/courses/${encodeURIComponent(courseId)}/ai-settings`)
      .then((r) => {
        if (!active) return;
        setSettings({
          ...r.settings,
          corrections_visible_from: r.settings.corrections_visible_from
            ? r.settings.corrections_visible_from.slice(0, 16)
            : "",
        });
        setCanEdit(r.canEdit);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [courseId]);
  if (!settings || !canEdit)
    return error ? <div className="alert error">{error}</div> : null;
  async function save(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setMessage("");
    setError("");
    try {
      await api(`/api/courses/${encodeURIComponent(courseId)}/ai-settings`, {
        method: "PUT",
        body: {
          ...next,
          corrections_visible_from: next.corrections_visible_from
            ? new Date(next.corrections_visible_from).toISOString()
            : null,
        },
      });
      setMessage(
        "Réglage enregistré. Il s’applique immédiatement à vos élèves.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="panel">
      <h3>Réglages de l’IA pour ce cours</h3>
      <p className="muted">
        Ces réglages sont appliqués par le serveur : vos élèves ne peuvent pas
        les contourner.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.ai_enabled}
          onChange={(e) => save({ ai_enabled: e.target.checked })}
        />
        Assistant IA activé pour les élèves de ce cours
      </label>
      <fieldset disabled={!settings.ai_enabled} className="rollover-row">
        <legend>Niveau d’aide maximal</legend>
        {HELP_LEVELS.map(([value, label]) => (
          <label className="check" key={value}>
            <input
              type="radio"
              name={`help-${courseId}`}
              checked={settings.max_help === value}
              onChange={() => save({ max_help: value })}
            />
            {label}
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={settings.students_can_generate}
            onChange={(e) => save({ students_can_generate: e.target.checked })}
          />
          Les élèves peuvent générer des quiz et contrôles d’entraînement
        </label>
      </fieldset>
      <label className="field">
        <span>Corrigés visibles par les élèves à partir du (facultatif)</span>
        <input
          type="datetime-local"
          value={settings.corrections_visible_from}
          onChange={(e) => save({ corrections_visible_from: e.target.value })}
        />
      </label>
      <p className="muted">
        Avant cette date, les documents de type « Correction » sont invisibles
        pour les élèves et inutilisables par l’IA. Laissez vide pour les rendre
        visibles dès leur publication.
      </p>
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

const STATUS = { new: "Nouveau", seen: "Vu", fixed: "Corrigé" };

export function Reports() {
  const [reports, setReports] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/reports")
      .then((r) => setReports(r.reports))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (error) return <div className="alert error">{error}</div>;
  if (!reports) return <p className="muted">Chargement…</p>;
  return (
    <div className="panel">
      <h3>Réponses de l’IA signalées par des élèves</h3>
      <p className="muted">
        Un élève a jugé une réponse fausse, déplacée ou hors de votre méthode.
        Son nom ne vous est pas communiqué. Corrigez votre cours si besoin, puis
        marquez le signalement comme traité.
      </p>
      {reports.length === 0 && (
        <p className="muted">Aucun signalement pour le moment.</p>
      )}
      {reports.map((r) => (
        <article className="report" key={r.id}>
          <header>
            <strong>{r.course_title}</strong> ·{" "}
            {new Date(r.created_at).toLocaleDateString("fr-FR")} ·{" "}
            <span className="badge">{STATUS[r.status]}</span>
          </header>
          <p>
            <strong>Motif :</strong> {r.reason}
          </p>
          <details>
            <summary>Question et réponse signalées</summary>
            <p>
              <strong>Question :</strong> {r.question}
            </p>
            <div className="preview-content" dir="auto">
              {r.answer}
            </div>
          </details>
          <div className="row-actions">
            {["seen", "fixed"]
              .filter((s) => s !== r.status)
              .map((s) => (
                <button
                  key={s}
                  className="text-button"
                  onClick={() =>
                    api(`/api/reports/${r.id}`, {
                      method: "PATCH",
                      body: { status: s },
                    }).then(load)
                  }
                >
                  Marquer « {STATUS[s].toLowerCase()} »
                </button>
              ))}
          </div>
        </article>
      ))}
    </div>
  );
}
