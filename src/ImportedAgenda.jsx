import React, { useEffect, useState } from "react";
import { api } from "./api";

export function initialAgendaPeriod() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    startDate: new Date(Date.parse(today + "T00:00:00Z") - 7 * 86400000)
      .toISOString()
      .slice(0, 10),
    days: 14,
  };
}
function Attachments({ files }) {
  if (!files?.length) return null;
  return (
    <p className="muted">
      Pièces jointes signalées : {files.map((file) => file.name).join(" · ")}.
      Leur contenu n’est pas téléchargé par ce connecteur.
    </p>
  );
}
export default function ImportedAgenda({ period, lastSync, eligible }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!eligible || !period.startDate) return;
    let active = true;
    setLoading(true);
    setError("");
    api(
      `/api/integrations/ecoledirecte/data?${new URLSearchParams({ startDate: period.startDate, days: String(period.days) })}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period.startDate, period.days, lastSync, eligible]);
  if (!eligible) return null;
  return (
    <section className="imported-agenda" aria-label="Cahier de textes importé">
      <h3>Mon cahier de textes importé</h3>
      <p className="muted">
        Ces données restent privées à votre compte. Elles ne sont pas publiées
        dans les cours de la classe.
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Chargement des données importées…</p>
      ) : (
        data && (
          <>
            <p className="muted">
              Période consultée : {data.startDate} au {data.endDate}.{" "}
              {data.lastSync
                ? "Dernier import : " +
                  new Date(data.lastSync).toLocaleString("fr-FR")
                : "Aucune connexion synchronisée actuellement."}
            </p>
            <details open>
              <summary>Contenus de séance ({data.lessons.length})</summary>
              {!data.lessons.length && (
                <p className="muted">
                  Aucun contenu importé sur cette période. Une période passée
                  permet de retrouver les séances récentes.
                </p>
              )}
              {data.lessons.map((lesson) => (
                <article className="tutor-recommendation" key={lesson.id}>
                  <strong>
                    {lesson.subject} · {lesson.date}
                  </strong>
                  <p className="muted">
                    {lesson.teacher}
                    {lesson.teacher ? " · " : ""}
                    {lesson.origin === "session"
                      ? "Contenu de séance"
                      : "Contenu associé au travail à faire"}
                  </p>
                  <p className="imported-content">
                    {lesson.content ||
                      "Contenu fourni en pièce jointe uniquement."}
                  </p>
                  <Attachments files={lesson.attachments} />
                </article>
              ))}
            </details>
            <details>
              <summary>Devoirs et consignes ({data.tasks.length})</summary>
              {!data.tasks.length && (
                <p className="muted">Aucun devoir importé sur cette période.</p>
              )}
              {data.tasks.map((task) => (
                <article className="tutor-recommendation" key={task.id}>
                  <strong>
                    {task.subject} · À faire pour le {task.due_date}
                  </strong>
                  <p className="imported-content">
                    {task.content || task.title}
                  </p>
                  <span className="badge">
                    {task.completed ? "Fait sur École Directe" : "À faire"}
                  </span>
                  <Attachments files={task.attachments} />
                </article>
              ))}
            </details>
            <details>
              <summary>Emploi du temps ({data.classes.length})</summary>
              {!data.classes.length && (
                <p className="muted">Aucun cours importé sur cette période.</p>
              )}
              {data.classes.map((course) => (
                <article className="tutor-recommendation" key={course.id}>
                  <strong>
                    {course.subject} · {course.date}
                  </strong>
                  <p>
                    {course.start_time}–{course.end_time}
                    {course.teacher ? ` · ${course.teacher}` : ""}
                    {course.room ? ` · Salle ${course.room}` : ""}
                  </p>
                </article>
              ))}
            </details>
          </>
        )
      )}
    </section>
  );
}
