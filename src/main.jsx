import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  UsersRound,
  X,
  Leaf,
  Clock,
  AlertCircle,
} from "lucide-react";
import { api, post } from "./api";
import { Form, Field, Select } from "./ui";
import Administration, { Pilotage } from "./Admin";
import { CourseAiSettings, Reports } from "./TeacherControls";
import Groups from "./Groups";
import StudyContent from "./StudyContent";
import PersonalTutor from "./PersonalTutor";
import TeacherMethod from "./TeacherMethod";
import PracticeAgent from "./PracticeAgent";
import ImportedAgenda, { initialAgendaPeriod } from "./ImportedAgenda";
import "./styles.css";
const labelRole = {
  admin: "Administration",
  teacher: "Professeur",
  student: "Élève",
  professor: "Professeur",
};
const statuses = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
  pending: "En traitement",
  ready: "Texte extrait",
  empty: "Aucun texte lisible",
  failed: "Échec",
};
const kindLabels = {
  lesson: "Cours",
  exercise: "Exercice",
  exam: "Contrôle d’entraînement",
  correction: "Correction",
};
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      })
    : "";
const title = (o) => o?.title || o?.name || o?.label || "";
function normalizeBootstrap(data) {
  const classes = data.classes || [],
    subjects = data.subjects || [],
    users = data.users || [];
  return {
    ...data,
    courses: (data.courses || []).map((c) => ({
      ...c,
      className: classes.find((x) => x.id === c.class_id)?.name,
      subject: subjects.find((x) => x.id === c.subject_id)?.name || c.subject,
      teacherName: users.find((x) => x.id === c.teacher_id)?.name,
    })),
    documents: (data.documents || []).map((d) => ({
      ...d,
      processingStatus: d.extraction_status,
      type: d.kind,
    })),
    delegations: (data.delegations || [])
      .filter((d) => !d.revoked_at)
      .map((d) => ({
        ...d,
        studentName: users.find((x) => x.id === d.student_id)?.name,
      })),
  };
}
function App() {
  const [data, setData] = useState(null),
    [booting, setBooting] = useState(true),
    [error, setError] = useState(""),
    [view, setView] = useState("dashboard"),
    [mobile, setMobile] = useState(false),
    [selected, setSelected] = useState(null),
    [pendingExercise, setPendingExercise] = useState(null),
    [pendingPractice, setPendingPractice] = useState(null),
    [busy, setBusy] = useState(false),
    [mustChange, setMustChange] = useState(null),
    [comfort, setComfort] = useState(
      () => localStorage.getItem("iabne:comfort") === "1",
    ),
    [notice, setNotice] = useState("");
  async function refresh() {
    try {
      setData(normalizeBootstrap(await api("/api/bootstrap")));
      setMustChange(null);
      setError("");
    } catch (e) {
      if (e.status === 401) {
        setData(null);
        setMustChange(null);
      } else if (e.code === "password_change_required") {
        try {
          setMustChange((await api("/api/auth/me")).user);
        } catch {}
      } else setError(e.message);
    } finally {
      setBooting(false);
    }
  }
  useEffect(() => {
    document.documentElement.classList.toggle("comfort", comfort);
    localStorage.setItem("iabne:comfort", comfort ? "1" : "0");
  }, [comfort]);
  // Le bouton « retour » du navigateur ou du téléphone revient à l'écran précédent de l'application.
  useEffect(() => {
    const known = [
      "dashboard",
      "courses",
      "assistant",
      "quizzes",
      "library",
      "planning",
      "groups",
      "account",
      "statistics",
      "reports",
      "administration",
    ];
    const fromHash = () => {
      const key = window.location.hash.slice(1);
      setView(known.includes(key) ? key : "dashboard");
      setMobile(false);
    };
    fromHash();
    window.addEventListener("popstate", fromHash);
    return () => window.removeEventListener("popstate", fromHash);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("iabne:refresh", refresh);
    return () => window.removeEventListener("iabne:refresh", refresh);
  }, []);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  useEffect(() => {
    const open = (e) => {
      if (
        typeof e.detail?.courseId !== "string" ||
        typeof e.detail?.exercise?.id !== "string"
      )
        return;
      setSelected(e.detail.courseId);
      setPendingExercise(e.detail.exercise);
      setView("assistant");
      setMobile(false);
    };
    window.addEventListener("tutor:open-exercise", open);
    return () => window.removeEventListener("tutor:open-exercise", open);
  }, []);
  useEffect(() => {
    const prepare = (event) => {
      const request = event.detail;
      if (
        typeof request?.courseId !== "string" ||
        typeof request?.topic !== "string"
      )
        return;
      setPendingPractice({
        courseId: request.courseId,
        topic: request.topic.slice(0, 160),
        requestedAt: Date.now(),
      });
      setView("library");
      setMobile(false);
    };
    window.addEventListener("practice:prepare", prepare);
    return () => window.removeEventListener("practice:prepare", prepare);
  }, []);
  async function act(fn, message = "Modifications enregistrées.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (booting)
    return (
      <div className="loading" role="status">
        <Logo />
        <p>Votre espace se prépare…</p>
      </div>
    );
  if (mustChange)
    return (
      <ForcedPassword
        user={mustChange}
        onDone={refresh}
        onLogout={async () => {
          await post("/api/auth/logout", {}).catch(() => {});
          setMustChange(null);
          setData(null);
        }}
      />
    );
  if (!data?.user) return <Login onDone={refresh} initialError={error} />;
  const user = data.user,
    role = user.role,
    admin = role === "admin",
    teacher = ["teacher", "professor"].includes(role),
    // La direction pilote (comptes, structure, vision globale) ; les contenus de cours sont aux professeurs.
    staff = teacher;
  const courses = data.courses || [],
    documents = data.documents || [],
    chapters = data.chapters || [],
    classes = data.classes || [],
    delegations = data.delegations || [];
  const nav = admin
    ? [
        ["dashboard", "Pilotage de l’établissement", LayoutDashboard],
        ["administration", "Administration", Users],
        ["groups", "Groupes de travail", UsersRound],
        ["account", "Mon compte", Settings],
      ]
    : [
        ["dashboard", "Vue d’ensemble", LayoutDashboard],
        ["courses", "Mes cours", BookOpen],
        ["assistant", "Assistant pédagogique", Sparkles],
        ["quizzes", "Entraînement", GraduationCap],
        ["library", staff ? "Atelier IA" : "Mes révisions", FileText],
        ["planning", "Mon organisation", CalendarDays],
        ["groups", "Groupes de travail", UsersRound],
        ["account", "Mon compte", Settings],
        ...(staff
          ? [
              ["statistics", "Suivi pédagogique", ChartNoAxesCombined],
              ["reports", "Signalements", AlertCircle],
            ]
          : []),
      ];
  // Une page interdite au profil (adresse #courses d'un compte d'administration…) revient à l'accueil.
  const current = nav.some(([key]) => key === view) ? view : "dashboard";
  function navigate(key) {
    if (key !== "assistant") setPendingExercise(null);
    if (window.location.hash !== `#${key}`)
      window.history.pushState(null, "", `#${key}`);
    setView(key);
    setMobile(false);
    setError("");
    setNotice("");
  }
  const selectedCourse =
    courses.find((c) => String(c.id) === String(selected)) || courses[0];
  return (
    <div className="app">
      <aside
        id="app-navigation"
        className={mobile ? "sidebar open" : "sidebar"}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Fermer le menu"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <Logo />
        <div className="school">
          <span className="school-icon">
            <GraduationCap size={20} />
          </span>
          <div>
            <strong>Yabné Paris</strong>
            <small>Collège · Lycée</small>
          </div>
        </div>
        <p className="nav-label">MON ESPACE</p>
        <nav aria-label="Navigation principale">
          {nav.map(([key, text, Icon]) => (
            <button
              key={key}
              className={current === key ? "nav-item active" : "nav-item"}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {text}
              {current === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help">
            <Sparkles size={20} />
            <strong>Apprendre, à votre rythme.</strong>
            <p>Vos cours, vos questions, votre progression.</p>
          </div>
          <button
            className="profile"
            onClick={() => act(() => post("/api/auth/logout", {}), "")}
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <span className="avatar">
              {(user.name || user.email || "U")[0].toUpperCase()}
            </span>
            <span>
              <strong>{user.name || user.email}</strong>
              <small>{labelRole[role] || role}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="menu-backdrop"
          aria-label="Fermer la navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace">
        <header>
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="Ouvrir le menu"
            aria-controls="app-navigation"
            aria-expanded={mobile}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Mon espace <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === current)?.[1]}</strong>
          </span>
          <div className="header-right">
            <span className="secure">
              <ShieldCheck size={15} /> Espace sécurisé
            </span>
            <button
              className="text-button comfort-toggle"
              aria-pressed={comfort}
              title="Texte plus aéré et plus lisible"
              onClick={() => setComfort(!comfort)}
            >
              Aa Confort de lecture
            </button>
            <button
              className="text-button"
              onClick={() => act(() => post("/api/auth/logout", {}), "")}
            >
              <LogOut size={15} /> Se déconnecter
            </button>
            <span className="avatar small">{(user.name || "U")[0]}</span>
          </div>
        </header>
        <main>
          <div className="page-top">
            <div>
              <div className="eyebrow">L'ENVIE D'APPRENDRE, ENSEMBLE</div>
              <h1>
                {current === "dashboard"
                  ? `Bonjour ${user.name?.split(" ")[0] || ""} ${role === "student" ? "☀" : ""}`
                  : nav.find((n) => n[0] === current)?.[1]}
              </h1>
              <p className="muted">
                {current === "dashboard"
                  ? admin
                    ? "Une vision globale de l’établissement, sans accès aux contenus des cours ni aux conversations."
                    : "Votre parcours IABNE : comprendre, pratiquer et progresser."
                  : current === "groups"
                    ? "Réviser et préparer des projets ensemble, dans un cadre sûr."
                    : current === "courses"
                      ? "Retrouvez les ressources partagées dans votre établissement."
                      : current === "assistant"
                        ? "Comprendre vos cours, une question à la fois."
                        : current === "planning"
                          ? "Un peu chaque jour, pour avancer sereinement."
                          : "Votre espace pour apprendre et faire apprendre."}
              </p>
            </div>
            <span className="today">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {current === "dashboard" && admin && (
            <Pilotage onNavigate={navigate} />
          )}
          {current === "dashboard" && !admin && (
            <>
              <div className="hero">
                <div>
                  <span className="pill light">
                    <Leaf size={14} /> VOTRE ESPACE POUR GRANDIR
                  </span>
                  <h2>
                    {staff ? "Préparer, adapter," : "Comprendre, s’entraîner,"}
                    <br />
                    {staff ? "faire apprendre." : "progresser à votre rythme."}
                  </h2>
                  <p>
                    {staff
                      ? "Vos méthodes et vos documents pour préparer des supports adaptés à vos classes."
                      : "Votre tuteur connaît les méthodes de vos professeurs et vous accompagne dans vos exercices et révisions."}
                  </p>
                  <button
                    className="button cream"
                    onClick={() => navigate(staff ? "library" : "assistant")}
                  >
                    {staff ? "Ouvrir mon atelier IA" : "Retrouver mon tuteur"}{" "}
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <div className="floating-note">
                    <Sparkles size={29} />
                    <span>
                      Un déclic,
                      <br />
                      <b>et tout s’éclaire.</b>
                    </span>
                  </div>
                  <div className="book-shape">
                    <BookOpen size={100} strokeWidth={1} />
                  </div>
                  <span className="star">✳</span>
                </div>
              </div>
              <div className="stats">
                <Stat
                  icon={BookOpen}
                  value={courses.length}
                  label="Cours accessibles"
                  color="green"
                />
                <Stat
                  icon={FileText}
                  value={
                    documents.filter((d) => d.status === "published").length
                  }
                  label="Documents publiés"
                  color="peach"
                />
                <Stat
                  icon={Users}
                  value={classes.length}
                  label="Classes accessibles"
                  color="lavender"
                />
              </div>
              <Section
                title={teacher ? "Vos espaces de cours" : "Reprendre le fil"}
                subtitle="Un chapitre à explorer, une nouvelle idée à découvrir."
                action="Tous les cours"
                onAction={() => navigate("courses")}
              />
              <div className="course-grid">
                {courses.slice(0, 3).map((c, i) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    index={i}
                    documents={documents}
                    onClick={() => {
                      setSelected(c.id);
                      navigate("courses");
                    }}
                  />
                ))}
                {!courses.length && (
                  <Empty
                    icon={BookOpen}
                    title="Les cours arrivent bientôt"
                    text="Les espaces apparaîtront après leur création et votre affectation."
                  />
                )}
              </div>
              <div className="bottom-grid">
                <div className="panel">
                  <Section
                    title="Les dernières ressources"
                    subtitle="Les nouveautés de votre espace."
                  />
                  <DocumentList
                    documents={documents
                      .filter((d) => d.status === "published")
                      .slice(-4)
                      .reverse()}
                    staff={false}
                  />
                </div>
                <div className="panel tip">
                  <span className="icon-tile peach">
                    <Sparkles size={22} />
                  </span>
                  <h3>Besoin d’un petit éclairage ?</h3>
                  <p>
                    L’assistant s’appuie sur les documents de votre cours pour
                    vous aider à comprendre, sans faire à votre place.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("assistant")}
                  >
                    Poser une question <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
          {current === "courses" && (
            <Courses
              {...{
                courses,
                documents,
                chapters,
                classes,
                selected,
                setSelected,
                staff,
                teacher,
                admin,
                delegations,
                user,
                act,
                busy,
                users: data.users,
                memberships: data.memberships,
                onAssistant: () => navigate("assistant"),
              }}
            />
          )}
          {current === "assistant" && (
            <Assistant
              courses={courses}
              selected={selectedCourse}
              onSelect={(id) => {
                setSelected(id);
                setPendingExercise(null);
              }}
              initialExercise={pendingExercise}
              act={act}
              documents={documents}
              personal={user.role === "student"}
            />
          )}
          {current === "quizzes" && (
            <Quizzes courses={courses} chapters={chapters} />
          )}
          {current === "library" && (
            <Library
              initialPractice={pendingPractice}
              courses={courses}
              chapters={chapters}
              act={act}
              user={user}
            />
          )}
          {current === "planning" && <Planning act={act} />}
          {current === "account" && <Account user={user} />}
          {current === "groups" && <Groups user={user} data={data} />}
          {current === "statistics" && <Statistics />}
          {current === "reports" && staff && <Reports />}
          {current === "administration" && admin && (
            <Administration data={data} act={act} busy={busy} />
          )}
          <footer>
            <Logo small />
            <span>Un espace pensé pour apprendre, à votre rythme.</span>
            <span>Confidentialité · Accès restreint</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Logo({ small }) {
  return (
    <div className={"logo " + (small ? "logo-small" : "")}>
      <span className="logo-mark" aria-hidden="true">
        <BookOpen size={small ? 18 : 24} />
      </span>
      <span>IABNE</span>
    </div>
  );
}
function Login({ onDone, initialError = "" }) {
  const [mode, setMode] = useState("login"),
    [needTotp, setNeedTotp] = useState(false),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(path, values) {
    setBusy(true);
    setError("");
    try {
      await post(path, values);
      await onDone();
    } catch (e) {
      if (e.code === "totp_required") setNeedTotp(true);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Logo />
        <span className="pill light">APPRENDRE ET PROGRESSER AVEC IABNE</span>
        <h1>
          Chaque question
          <br />
          est un début.
        </h1>
        <p>
          Les cours de vos professeurs.
          <br />
          Un accompagnement pour mieux comprendre.
          <br />
          Un espace pour avancer à votre rythme.
        </p>
        <BookOpen className="login-book" size={180} strokeWidth={0.7} />
      </div>
      <div className="login-main">
        <div className="login-box">
          <span className="eyebrow">BIENVENUE DANS VOTRE ESPACE</span>
          <h2>
            {mode === "login"
              ? "Heureux de vous retrouver."
              : "Première connexion"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Connectez-vous avec le compte fourni par votre établissement."
              : "Entrez l’identifiant et le code d’activation de votre fiche de connexion, puis choisissez votre mot de passe."}
          </p>
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Se connecter
            </button>
            <button
              role="tab"
              aria-selected={mode === "activate"}
              className={mode === "activate" ? "active" : ""}
              onClick={() => {
                setMode("activate");
                setError("");
              }}
            >
              Première connexion
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {mode === "login" ? (
            <Form
              onSubmit={(v) => submit("/api/auth/login", v)}
              submit={busy ? "Connexion…" : "Se connecter"}
              disabled={busy}
            >
              <Field
                label="Identifiant ou adresse e-mail"
                name="email"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                placeholder="prenom.nom ou prenom@etablissement.fr"
                required
              />
              <Field
                label="Mot de passe"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Votre mot de passe"
                required
              />
              {needTotp && (
                <Field
                  label="Code de votre application d’authentification"
                  name="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              )}
            </Form>
          ) : (
            <Form
              onSubmit={(v) => submit("/api/auth/activate", v)}
              submit={busy ? "Activation…" : "Activer mon compte"}
              disabled={busy}
            >
              <Field
                label="Identifiant"
                name="identifier"
                autoCapitalize="none"
                placeholder="prenom.nom"
                required
              />
              <Field
                label="Code d’activation"
                name="code"
                autoCapitalize="characters"
                placeholder="ABCD-EFGH"
                required
              />
              <Field
                label="Choisissez votre mot de passe (12 caractères minimum)"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength="12"
                required
              />
            </Form>
          )}
          <p className="login-help">
            <ShieldCheck size={16} /> Pas d’inscription libre. Mot de passe
            oublié ou accès à obtenir ? Demandez un nouveau code à
            l’administration ou à la vie scolaire.
          </p>
        </div>
      </div>
    </div>
  );
}
function ForcedPassword({ user, onDone, onLogout }) {
  return (
    <div className="login-page">
      <div className="login-main">
        <div className="login-box">
          <Logo />
          <h2>Choisissez votre mot de passe</h2>
          <p className="muted">
            Bonjour {user.name}. Le mot de passe provisoire donné par
            l’administration ne peut pas servir plus longtemps : choisissez le
            vôtre pour accéder à votre espace.
          </p>
          <Form
            submit="Enregistrer mon mot de passe"
            onSubmit={async (v) => {
              if (v.newPassword !== v.confirm)
                throw new Error(
                  "Les deux mots de passe ne sont pas identiques.",
                );
              await post("/api/auth/password", {
                currentPassword: v.currentPassword,
                newPassword: v.newPassword,
              });
              await onDone();
            }}
          >
            <Field
              label="Mot de passe provisoire"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
            <Field
              label="Nouveau mot de passe (12 caractères minimum)"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength="12"
              required
            />
            <Field
              label="Confirmez le nouveau mot de passe"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength="12"
              required
            />
          </Form>
          <button className="text-button" onClick={onLogout}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
function Section({ title, subtitle, action, onAction }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
function Stat({ icon: Icon, value, label, color }) {
  return (
    <div className="stat">
      <span className={"icon-tile " + color}>
        <Icon size={22} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <ArrowUpRight className="stat-arrow" size={17} />
    </div>
  );
}
function Empty({
  icon: Icon = FileText,
  title = "Rien pour le moment",
  text = "Les éléments disponibles apparaîtront ici.",
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function CourseCard({ course, index = 0, documents, onClick }) {
  const colors = ["sage", "peach", "lavender", "yellow"];
  return (
    <button className="course-card" onClick={onClick}>
      <div className={"course-cover " + colors[index % 4]}>
        <span>{course.subject || "ESPACE DE COURS"}</span>
        <BookOpen size={48} strokeWidth={1.3} />
        <ArrowUpRight size={21} />
      </div>
      <div className="course-body">
        <span className="course-class">
          {course.className || course.class_name || "Cours partagé"}
        </span>
        <h3>{title(course)}</h3>
        <p>{course.teacherName || course.teacher_name || "Votre professeur"}</p>
        <div className="course-meta">
          <FileText size={14} />
          {
            documents.filter(
              (d) => String(d.courseId ?? d.course_id) === String(course.id),
            ).length
          }{" "}
          ressources <ChevronRight size={16} />
        </div>
      </div>
    </button>
  );
}
function DocumentList({ documents, staff, onStatus, onDelete, canDelete }) {
  const [active, setActive] = useState(null),
    [versions, setVersions] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null);
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!documents.length)
    return (
      <Empty
        title="Aucun document disponible"
        text="Les documents publiés par votre professeur apparaîtront ici."
      />
    );
  return (
    <div className="document-list">
      {preview && (
        <section
          className="preview-panel"
          role="dialog"
          aria-modal="false"
          aria-label={"Lecture de " + preview.title}
          tabIndex="-1"
        >
          <div className="section-title">
            <h3>{preview.title}</h3>
            <button
              className="icon-button"
              onClick={() => setPreview(null)}
              aria-label="Fermer la lecture"
            >
              <X size={19} />
            </button>
          </div>
          <p className="muted">
            Texte extrait pour la lecture : la mise en page originale n’est pas
            reproduite. Téléchargez le fichier pour consulter l’original.
          </p>
          {preview.notice && <p className="muted">{preview.notice}</p>}
          <div className="preview-content">
            {preview.content ||
              "Aucun texte exploitable extrait de ce document."}
          </div>
          <a
            className="button secondary"
            href={`/api/documents/${encodeURIComponent(preview.id)}/download`}
          >
            <Download size={16} />
            Télécharger l’original
          </a>
        </section>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <p className="muted" role="status">
          Mise à jour du document en cours…
        </p>
      )}
      {documents.map((d) => (
        <div className="document-entry" key={d.id}>
          <div className="document-row">
            <span className="document-icon">
              <FileText size={20} />
            </span>
            <div className="document-info">
              <strong>
                {title(d) || d.originalName || d.original_name || d.filename}
              </strong>
              <span>
                {kindLabels[d.kind] || d.type || "Document"} ·{" "}
                {date(d.createdAt || d.created_at)}{" "}
                {d.uploaded_by_name && (
                  <span>· Déposé par {d.uploaded_by_name} </span>
                )}
                <span className={"badge " + d.status}>
                  {statuses[d.status] || d.status}
                </span>
                {d.processingStatus && (
                  <span className="badge">
                    {statuses[d.processingStatus] || d.processingStatus}
                  </span>
                )}
                {d.ai_generated && (
                  <span className="badge">
                    {d.status === "draft"
                      ? "Préparé avec IA · à valider"
                      : "Préparé avec IA"}
                  </span>
                )}
              </span>
            </div>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={"Lire " + title(d)}
              onClick={() =>
                run(async () => {
                  const p = await api(
                    `/api/documents/${encodeURIComponent(d.id)}/preview`,
                  );
                  setPreview(p);
                  requestAnimationFrame(() =>
                    document.querySelector(".preview-panel")?.focus(),
                  );
                })
              }
            >
              <BookOpen size={17} />
            </button>
            <a
              className="icon-button"
              href={d.downloadUrl || `/api/documents/${d.id}/download`}
              aria-label={"Télécharger " + title(d)}
            >
              <Download size={17} />
            </a>
            {staff && onStatus && d.status === "draft" && (
              <button
                className="button small"
                disabled={busy || d.processingStatus === "empty"}
                title={
                  d.processingStatus === "empty"
                    ? "Aucun texte lisible : un scan ne peut pas être publié pour l’assistant."
                    : "Rendre ce document visible par les élèves"
                }
                onClick={() => run(() => onStatus(d, "published"))}
              >
                Publier
              </button>
            )}
            {staff && onStatus && (
              <select
                disabled={busy}
                aria-label={"Statut de " + title(d)}
                value={d.status || "draft"}
                onChange={(e) => run(() => onStatus(d, e.target.value))}
              >
                {["draft", "published", "archived"].map((s) => (
                  <option key={s} value={s}>
                    {statuses[s]}
                  </option>
                ))}
              </select>
            )}
            {staff && onStatus && (
              <button
                className="icon-button"
                disabled={busy}
                aria-label={"Versions et remplacement de " + title(d)}
                onClick={() => setActive(active === d.id ? null : d.id)}
              >
                <Settings size={17} />
              </button>
            )}
            {onDelete && canDelete?.(d) && (
              <button
                className="icon-button danger"
                disabled={busy}
                aria-label={"Supprimer " + title(d)}
                onClick={() => {
                  if (
                    window.confirm(
                      "Supprimer ce document et son historique ? Les nouvelles réponses ne pourront plus utiliser cette source.",
                    )
                  )
                    run(() => onDelete(d));
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
          {staff && active === d.id && (
            <div className="document-tools">
              <h3>Remplacer le fichier</h3>
              <p className="muted">
                L’ancienne version est conservée. Le document repasse en
                brouillon : vérifiez puis republiez-le.
              </p>
              <Form
                submit="Remplacer le fichier"
                disabled={busy}
                onSubmit={async (_, form) => {
                  if (
                    d.status === "published" &&
                    !window.confirm(
                      "Ce document est publié. Les élèves ne le verront plus tant que vous ne l’aurez pas republié après vérification. Continuer ?",
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  try {
                    await api(`/api/documents/${d.id}/replace`, {
                      method: "POST",
                      body: new FormData(form),
                    });
                    window.dispatchEvent(new Event("iabne:refresh"));
                    const r = await api(`/api/documents/${d.id}/versions`);
                    setVersions((v) => ({ ...v, [d.id]: r.versions || [] }));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label="Nouvelle version PDF, DOCX ou TXT"
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  required
                />
              </Form>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await api(`/api/documents/${d.id}/versions`);
                    setVersions((v) => ({ ...v, [d.id]: r.versions || [] }));
                  })
                }
              >
                Consulter l’historique des versions
              </button>
              {versions[d.id] &&
                (versions[d.id].length ? (
                  versions[d.id].map((v) => (
                    <div className="list-item" key={v.id}>
                      <FileText size={15} />
                      <span>
                        {v.original_name}
                        <small>
                          {date(v.created_at)} ·{" "}
                          {Math.ceil(v.size_bytes / 1024)} Ko
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">Aucune version antérieure conservée.</p>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function Courses({
  courses,
  documents,
  chapters,
  classes,
  selected,
  setSelected,
  staff,
  teacher,
  admin,
  delegations,
  user,
  act,
  busy,
  users = [],
  memberships = [],
  onAssistant,
}) {
  const [query, setQuery] = useState(""),
    [upload, setUpload] = useState(false);
  const c = courses.find((x) => String(x.id) === String(selected));
  const mine = delegations.some(
    (d) =>
      String(d.studentId ?? d.student_id) === String(user.id) &&
      String(d.courseId ?? d.course_id) === String(c?.id) &&
      !d.revokedAt &&
      !d.revoked_at,
  );
  const edit = staff || mine;
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Rechercher un cours"
            placeholder="Rechercher un cours, une matière…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {c && (
          <button
            className="button secondary"
            onClick={() => setSelected(null)}
          >
            Tous les cours
          </button>
        )}
      </div>
      {!c ? (
        <div className="course-grid">
          {courses
            .filter((x) =>
              `${title(x)} ${x.subject || ""}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((x, i) => (
              <CourseCard
                key={x.id}
                course={x}
                index={i}
                documents={documents}
                onClick={() => setSelected(x.id)}
              />
            ))}
          {!courses.length && (
            <Empty
              icon={BookOpen}
              title="Votre espace attend ses premiers cours"
            />
          )}
        </div>
      ) : (
        <>
          <div className="course-heading panel">
            <span className="icon-tile green">
              <BookOpen />
            </span>
            <div>
              <span className="eyebrow">{c.subject || "COURS"}</span>
              <h2>{title(c)}</h2>
              <p className="muted">
                {c.description ||
                  "Documents et ressources pédagogiques de votre professeur."}
              </p>
              <button className="text-button" onClick={onAssistant}>
                <Sparkles size={15} />
                Poser une question à l’assistant
              </button>
            </div>
            {edit && (
              <button className="button" onClick={() => setUpload(!upload)}>
                <Upload size={17} />
                Déposer un document
              </button>
            )}
          </div>
          {staff && <TeacherMethod courseId={c.id} editor />}
          {staff && <CourseAiSettings courseId={c.id} />}
          {upload && edit && (
            <div className="panel">
              <h3>Nouveau document</h3>
              <Form
                submit="Déposer le document"
                disabled={busy}
                onSubmit={async (_, form) => {
                  const values = new FormData(form);
                  const files = [
                    ...form.querySelector('input[type="file"]').files,
                  ];
                  const base = String(values.get("title") || "").trim();
                  const stem = (f) => f.name.replace(/\.[^.]+$/, "");
                  const saved = await act(
                    async () => {
                      for (const file of files) {
                        const body = new FormData();
                        body.set("course_id", c.id);
                        body.set("kind", values.get("type"));
                        body.set("chapter_id", values.get("chapterId") || "");
                        body.set(
                          "title",
                          files.length > 1
                            ? [base, stem(file)].filter(Boolean).join(" – ")
                            : base || stem(file),
                        );
                        body.set("file", file);
                        await api("/api/documents", { method: "POST", body });
                      }
                    },
                    `${files.length} document${files.length > 1 ? "s déposés" : " déposé"}. Le statut de traitement est indiqué dans la liste ; publiez-les quand vous les avez vérifiés.`,
                  );
                  if (saved) setUpload(false);
                }}
              >
                <div className="form-grid">
                  <Field
                    label="Titre (avec plusieurs fichiers : préfixe du titre)"
                    name="title"
                  />
                  <Select
                    label="Chapitre"
                    name="chapterId"
                    required={false}
                    items={chapters.filter(
                      (x) => String(x.courseId ?? x.course_id) === String(c.id),
                    )}
                  />
                  <Field label="Type">
                    <select name="type">
                      <option value="lesson">Cours</option>
                      <option value="exercise">Exercice</option>
                      <option value="exam">Contrôle d’entraînement</option>
                      <option value="correction">Correction</option>
                    </select>
                  </Field>
                  <Field
                    label="Fichiers PDF, Word ou texte (plusieurs possibles)"
                    type="file"
                    name="file"
                    accept=".pdf,.docx,.txt"
                    multiple
                    required
                  />
                </div>
                <p className="muted">
                  Le fichier doit être traité avant son utilisation par
                  l’assistant. Les droits de publication sont vérifiés par le
                  serveur.
                </p>
              </Form>
            </div>
          )}
          <div className="panel">
            <Section title="Documents du cours" />
            <CourseSearch courseId={c.id} />
            {mine && !staff && (
              <p className="muted">
                Votre délégation permet de déposer des brouillons et de
                supprimer vos propres brouillons. Le professeur vérifie et
                publie les documents.
              </p>
            )}
            <DocumentList
              documents={documents.filter(
                (d) => String(d.courseId ?? d.course_id) === String(c.id),
              )}
              staff={staff}
              canDelete={(d) =>
                staff ||
                (mine && d.uploaded_by === user.id && d.status === "draft")
              }
              onDelete={(d) =>
                act(
                  () => api(`/api/documents/${d.id}`, { method: "DELETE" }),
                  "Document supprimé.",
                )
              }
              onStatus={(d, status) =>
                act(() =>
                  api(`/api/documents/${d.id}`, {
                    method: "PATCH",
                    body: { status },
                  }),
                )
              }
            />
          </div>
          {staff && (
            <div className="two-col">
              <div className="panel">
                <h3>Organiser les chapitres</h3>
                {chapters
                  .filter(
                    (x) => String(x.courseId ?? x.course_id) === String(c.id),
                  )
                  .map((x) => (
                    <p key={x.id} className="list-item">
                      <BookOpen size={16} />
                      {title(x)}
                    </p>
                  ))}
                <Form
                  submit="Ajouter un chapitre"
                  onSubmit={(v) =>
                    act(() =>
                      post("/api/chapters", {
                        title: v.title,
                        course_id: c.id,
                      }),
                    )
                  }
                >
                  <Field label="Titre du chapitre" name="title" required />
                </Form>
              </div>
              <div className="panel">
                <h3>Délégations élèves</h3>
                <p className="muted">
                  Autorisez un élève à contribuer à ce cours. Vous pouvez
                  retirer cet accès.
                </p>
                {delegations
                  .filter(
                    (d) => String(d.courseId ?? d.course_id) === String(c.id),
                  )
                  .map((d) => (
                    <div className="list-item" key={d.id}>
                      <span>
                        {d.studentName || d.studentEmail || d.studentId}
                      </span>
                      <button
                        className="text-button danger"
                        onClick={() =>
                          act(() =>
                            api(`/api/delegations/${d.id}`, {
                              method: "DELETE",
                            }),
                          )
                        }
                      >
                        Révoquer
                      </button>
                    </div>
                  ))}
                <Form
                  submit="Accorder la délégation"
                  onSubmit={(v) =>
                    act(() =>
                      post("/api/delegations", {
                        student_id: v.studentId,
                        course_id: c.id,
                      }),
                    )
                  }
                >
                  <Select
                    label="Élève de la classe"
                    name="studentId"
                    items={users.filter(
                      (u) =>
                        u.role === "student" &&
                        memberships.some(
                          (m) =>
                            m.user_id === u.id && m.class_id === c.class_id,
                        ),
                    )}
                  />
                </Form>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
function CourseSearch({ courseId }) {
  const [result, setResult] = useState(null);
  useEffect(() => setResult(null), [courseId]);
  return (
    <div className="course-search">
      <Form
        className="search-form"
        submit="Rechercher"
        onSubmit={async (v) => {
          setResult(
            await api(
              `/api/courses/${encodeURIComponent(courseId)}/search?q=${encodeURIComponent(v.q)}`,
            ),
          );
        }}
      >
        <Field
          label="Rechercher dans les titres et le texte extrait du cours"
          name="q"
          placeholder="Une notion, un mot-clé…"
          maxLength="200"
          required
        />
      </Form>
      {result && (
        <section aria-label="Résultats de recherche" className="search-results">
          <div className="section-title">
            <h3>
              {result.results.length} résultat
              {result.results.length > 1 ? "s" : ""} pour « {result.query} »
            </h3>
            <button
              className="icon-button"
              aria-label="Fermer les résultats de recherche"
              onClick={() => setResult(null)}
            >
              <X size={17} />
            </button>
          </div>
          {result.results.length ? (
            <>
              {result.results.map((r) => (
                <div className="search-result" key={r.id}>
                  <strong>{r.title}</strong>
                  <p>{r.snippet}</p>
                  <a
                    className="text-button"
                    href={`/api/documents/${encodeURIComponent(r.id)}/download`}
                  >
                    <Download size={13} />
                    Télécharger le document source
                  </a>
                </div>
              ))}
            </>
          ) : (
            <p className="muted">
              Aucun passage correspondant dans les documents auxquels vous avez
              accès.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
function Sources({ sources = [] }) {
  return (
    sources.length > 0 && (
      <div className="sources">
        <strong>Sources utilisées</strong>
        {sources.map((s, j) => (
          <span key={s.chunkId || j}>
            {s.id ? (
              <a
                href={`/api/documents/${encodeURIComponent(s.id)}/download`}
                className="text-button"
              >
                [{s.citation || `S${j + 1}`}] {s.title || "Document"}{" "}
                <Download size={12} />
              </a>
            ) : (
              <span>{s.title || "Source"}</span>
            )}
            {s.page ? ` · page ${s.page}` : ""}
            {s.excerpt && <q>{s.excerpt}</q>}
          </span>
        ))}
      </div>
    )
  );
}
function Assistant({
  courses,
  selected,
  onSelect,
  documents = [],
  personal = false,
  initialExercise = null,
}) {
  const [question, setQuestion] = useState(""),
    [exercise, setExercise] = useState(null),
    [helpMode, setHelpMode] = useState("hint"),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false),
    [historyLoading, setHistoryLoading] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState(null);
  useEffect(() => {
    let active = true;
    setMessages([]);
    setExercise(null);
    setHelpMode("hint");
    setError("");
    if (!selected) return;
    setHistoryLoading(true);
    api(`/api/ai/history?courseId=${encodeURIComponent(selected.id)}`)
      .then((r) => {
        if (active)
          setMessages(
            (r.messages || []).flatMap((m) => [
              { role: "user", content: m.question },
              {
                role: "assistant",
                id: m.id,
                content: m.answer,
                sources: m.sources,
                notice: m.notice,
              },
            ]),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected?.id]);
  useEffect(() => {
    if (initialExercise?.course_id === selected?.id) {
      setExercise(initialExercise);
      setHelpMode("hint");
      setQuestion("Voici ma tentative : ");
      requestAnimationFrame(() =>
        document.querySelector('[aria-label="Votre question"]')?.focus(),
      );
    }
  }, [initialExercise?.id]);
  async function send(e) {
    e.preventDefault();
    if (!question.trim() || !selected) return;
    const text = question;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    setError("");
    try {
      const r = await post("/api/ai/chat", {
        courseId: selected.id,
        question: text,
        helpMode,
        ...(exercise ? { exerciseId: exercise.id } : {}),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          id: r.id,
          content: r.answer,
          sources: r.sources || [],
          notice: r.notice,
        },
      ]);
      window.dispatchEvent(new Event("tutor:refresh"));
    } catch (e) {
      setError(e.message);
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {personal && (
        <PersonalTutor
          key={selected?.id}
          course={selected}
          documents={documents}
          onExercise={(e) => {
            setExercise(e);
            setQuestion(e ? "Voici ma tentative : " : "");
            setHelpMode("hint");
            requestAnimationFrame(() =>
              document.querySelector('[aria-label="Votre question"]')?.focus(),
            );
          }}
          onAsk={(text) => {
            setExercise(null);
            setQuestion(text);
            requestAnimationFrame(() =>
              document.querySelector('[aria-label="Votre question"]')?.focus(),
            );
          }}
        />
      )}
      <div className="assistant-layout">
        <aside className="panel assistant-info">
          <span className="icon-tile green">
            <Sparkles />
          </span>
          <h2>Votre professeur particulier IA.</h2>
          <p className="muted">
            Des explications adaptées à votre parcours, avec les documents de
            votre professeur comme références.
          </p>
          <Select
            label="Votre cours"
            items={courses}
            value={selected?.id || ""}
            onChange={(e) => {
              if (!busy) onSelect(e.target.value);
            }}
          />
          <TeacherMethod courseId={selected?.id} />
          <div className="info-note">
            <ShieldCheck size={18} />
            <p>
              Les sources apparaissent avec les réponses. Si elles ne suffisent
              pas, l’assistant doit vous le signaler.
            </p>
          </div>
        </aside>
        <div className="panel chat">
          <div className="chat-header">
            <span className="icon-tile sage">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>Mon tuteur personnel</strong>
              <small>
                {title(selected) || "Sélectionnez un cours pour commencer"}
              </small>
            </div>
            <button
              className="text-button"
              disabled={!selected || busy || historyLoading}
              onClick={async () => {
                if (!window.confirm("Effacer tous vos échanges de ce cours ?"))
                  return;
                try {
                  await api(
                    `/api/ai/history?courseId=${encodeURIComponent(selected.id)}`,
                    { method: "DELETE" },
                  );
                  setMessages([]);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Effacer mes échanges
            </button>
          </div>
          <div className="messages" aria-live="polite">
            {historyLoading ? (
              <p role="status">Chargement de vos échanges…</p>
            ) : (
              !messages.length && (
                <Empty
                  icon={Sparkles}
                  title="Qu’aimeriez-vous comprendre ?"
                  text="Posez une question sur une notion, demandez une explication ou une reformulation."
                />
              )
            )}
            {messages.map((m, i) => (
              <div key={m.id || i} className={"message " + m.role}>
                <span className="message-author">
                  {m.role === "user" ? "Vous" : "Assistant"}
                </span>
                <StudyContent content={m.content} />
                <Sources sources={m.sources} />
                {m.notice && <p className="muted">{m.notice}</p>}
                {m.id && (
                  <button
                    className="text-button"
                    onClick={() => setReport(m.id)}
                  >
                    Signaler cette réponse
                  </button>
                )}
                {report === m.id && m.id && (
                  <Form
                    submit="Envoyer le signalement"
                    onSubmit={async (v) => {
                      await post("/api/ai/reports", {
                        courseId: selected.id,
                        targetId: m.id,
                        reason: v.reason,
                      });
                      setReport(null);
                      setError("");
                    }}
                  >
                    <Field
                      label="Motif du signalement"
                      name="reason"
                      required
                      maxLength="1500"
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setReport(null)}
                    >
                      Annuler
                    </button>
                  </Form>
                )}
              </div>
            ))}
            {busy && (
              <p className="muted" role="status">
                Recherche dans les documents du cours…
              </p>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {exercise && (
            <div className="tutor-exercise-banner">
              <strong>Exercice : {exercise.topic}</strong>
              <p>{exercise.statement}</p>
              <button className="text-button" onClick={() => setExercise(null)}>
                Revenir à une question libre
              </button>
            </div>
          )}
          {personal && (
            <div
              className="tutor-help-modes"
              role="group"
              aria-label="Type d’accompagnement"
            >
              {[
                ["hint", "Un indice"],
                ["method", "La méthode"],
                ["check", "Vérifier ma tentative"],
                ["solution", "Correction expliquée"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  className={helpMode === mode ? "active" : ""}
                  aria-pressed={helpMode === mode}
                  onClick={() => setHelpMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <form className="chat-input" onSubmit={send}>
            <textarea
              aria-label="Votre question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Explique-moi cette notion…"
              required
              maxLength="2000"
              rows={2}
            />
            <button
              className="button"
              disabled={busy || historyLoading || !selected}
              aria-label="Envoyer la question"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="chat-disclaimer">
            Une réponse IA peut contenir des erreurs. Vérifiez les sources et
            échangez avec votre professeur.
          </p>
        </div>
      </div>
    </>
  );
}
function Library({ courses, chapters, act, user, initialPractice }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [items, setItems] = useState([]),
    [recipes, setRecipes] = useState([
      { id: "sheet", label: "Fiche de révision" },
      { id: "quiz", label: "Quiz avec corrigé" },
    ]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      const r = await api("/api/generations");
      setItems(r.generations || r.items || r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    api("/api/ai/capabilities")
      .then((r) => setRecipes(r.recipes))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PracticeAgent
        courses={courses}
        chapters={chapters}
        user={user}
        initialPractice={initialPractice}
      />
      <div className="panel">
        <Section
          title={
            user.role === "student"
              ? "Créer une ressource de révision"
              : "Préparer et améliorer mes supports avec l’IA"
          }
          subtitle="Une génération fondée sur les documents publiés du cours ou du chapitre choisi."
        />
        <p className="muted">
          Les fiches et sujets sont des ressources d’entraînement générées par
          IA, non validées par le professeur. Ils ne remplacent pas ses
          évaluations.
        </p>
        <Form
          submit="Générer la ressource"
          onSubmit={async (v) => {
            await post("/api/ai/generate", {
              courseId: v.courseId,
              kind: v.type,
              instructions: v.instructions || "",
              ...(v.chapterId ? { chapterId: v.chapterId } : {}),
            });
            await load();
          }}
        >
          <div className="form-grid">
            <Select
              label="Cours"
              name="courseId"
              items={courses}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
            <Select
              key={courseId}
              label="Chapitre (facultatif)"
              name="chapterId"
              items={chapters.filter((c) => c.course_id === courseId)}
              required={false}
              empty="Tout le cours"
            />
            <Field label="Type de ressource">
              <select name="type">
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Objectif ou consignes complémentaires (facultatif)">
            <textarea
              name="instructions"
              maxLength="1200"
              rows="3"
              placeholder={
                user.role === "student"
                  ? "Ex. M’aider à réviser les notions sur lesquelles je me trompe."
                  : "Ex. Préparer une séance avec une activité guidée puis une activité d’approfondissement."
              }
            />
          </Field>
        </Form>
      </div>
      <div className="panel">
        <Section title="Ma bibliothèque" />
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status">Chargement des ressources…</p>
        ) : items.length ? (
          items.map((g) => (
            <details className="generation" key={g.id}>
              <summary>
                <FileText size={18} />
                {title(g) ||
                  {
                    sheet: "Fiche de révision",
                    quiz: "Quiz",
                    exam: "Sujet d’entraînement",
                  }[g.type]}
                <span className="badge">
                  {date(g.createdAt || g.created_at)}
                </span>
              </summary>
              <div>
                {g.obsolete && (
                  <div className="alert error">
                    Les sources ont changé ou ont été retirées. Cette ressource
                    doit être régénérée.
                  </div>
                )}
                {g.notice && <p className="muted">{g.notice}</p>}
                <Sources sources={g.sources} />
              </div>
              <div className="generated-content">
                <StudyContent
                  content={
                    typeof g.content === "string"
                      ? g.content
                      : JSON.stringify(g.content, null, 2)
                  }
                />
              </div>
              <button
                className="text-button danger"
                onClick={async () => {
                  try {
                    await api(`/api/generations/${g.id}`, { method: "DELETE" });
                    await load();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Supprimer cette ressource
              </button>{" "}
              <a
                className="button secondary"
                href={`/api/generations/${g.id}/pdf`}
              >
                <Download size={16} />
                Télécharger le PDF
              </a>
            </details>
          ))
        ) : (
          <Empty
            title="Vos révisions commencent ici"
            text="Vos fiches, quiz et sujets générés seront conservés dans cet espace."
          />
        )}
      </div>
    </>
  );
}
function Quizzes({ courses, chapters }) {
  const [quizzes, setQuizzes] = useState([]),
    [session, setSession] = useState(null),
    [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [choice, setChoice] = useState(""),
    [feedback, setFeedback] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    const r = await api("/api/quizzes");
    setQuizzes(r.quizzes || []);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function open(id) {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/quizzes/${encodeURIComponent(id)}`);
      setSession(r.quiz || r);
      setChoice("");
      setFeedback(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const questions = session?.questions || [],
    question = questions.find((q) => !q.answered),
    answered =
      session?.progress?.answered ?? questions.filter((q) => q.answered).length;
  return (
    <>
      <div className="info-banner">
        <GraduationCap size={23} />
        <div>
          <strong>S’entraîner pour mieux comprendre</strong>
          <p>
            Des questions fondées sur vos cours. Le niveau est ajusté à vos
            réponses précédentes ; il ne constitue pas un diagnostic scolaire.
          </p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="two-col">
        <div className="panel">
          <Section
            title="Un nouvel entraînement"
            subtitle="Choisissez un cours et, si vous le souhaitez, un chapitre."
          />
          <Form
            submit="Créer mon quiz"
            disabled={busy}
            onSubmit={async (v) => {
              const r = await post("/api/quizzes", {
                courseId: v.courseId,
                ...(v.chapterId ? { chapterId: v.chapterId } : {}),
              });
              await load();
              await open((r.quiz || r).id);
            }}
          >
            <Select
              label="Cours"
              name="courseId"
              items={courses}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            />
            <Select
              label="Chapitre (facultatif)"
              name="chapterId"
              required={false}
              empty="Tout le cours"
              items={chapters.filter((c) => c.course_id === courseId)}
            />
          </Form>
        </div>
        <div className="panel">
          <Section title="Mes sessions" />
          {loading ? (
            <p role="status">Chargement de vos quiz…</p>
          ) : quizzes.length ? (
            quizzes.map((q) => (
              <div className="list-item" key={q.id}>
                <GraduationCap size={18} />
                <span>
                  <strong>
                    {q.title ||
                      courses.find((c) => c.id === (q.courseId || q.course_id))
                        ?.title ||
                      "Quiz de cours"}
                  </strong>
                  <small>
                    {date(q.createdAt || q.created_at)} · Niveau{" "}
                    {{
                      easy: "accessible",
                      medium: "intermédiaire",
                      hard: "approfondi",
                    }[q.difficulty] || "adapté"}
                  </small>
                </span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => open(q.id)}
                >
                  Ouvrir
                </button>
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label="Supprimer ce quiz"
                  onClick={async () => {
                    if (!window.confirm("Supprimer ce quiz et ses résultats ?"))
                      return;
                    setBusy(true);
                    try {
                      await api(`/api/quizzes/${q.id}`, { method: "DELETE" });
                      if (session?.id === q.id) setSession(null);
                      await load();
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))
          ) : (
            <Empty
              icon={GraduationCap}
              title="Votre premier quiz vous attend"
              text="Votre établissement doit activer l’assistant et publier des documents avant de pouvoir créer un quiz."
            />
          )}
        </div>
      </div>
      {session && (
        <div className="panel quiz-session">
          <Section
            title={session.title || "Votre entraînement"}
            subtitle={`Niveau ${{ easy: "accessible", medium: "intermédiaire", hard: "approfondi" }[session.difficulty] || "adapté"} · Progression de la session`}
          />
          {session.notice && <p className="muted">{session.notice}</p>}
          {session.obsolete && (
            <div className="alert error">
              Les sources de ce quiz ont changé. Créez un nouvel entraînement
              avant de poursuivre.
            </div>
          )}
          <progress
            value={answered}
            max={questions.length || 1}
            aria-label="Progression du quiz"
          />
          <p className="muted">
            {answered} question{answered > 1 ? "s" : ""} validée
            {answered > 1 ? "s" : ""} sur {questions.length}
          </p>
          {question ? (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const r = await post(`/api/quizzes/${session.id}/answer`, {
                    questionId: question.id,
                    choiceIndex: Number(choice),
                  });
                  setFeedback(r);
                  const fresh = await api(`/api/quizzes/${session.id}`);
                  setSession(fresh.quiz || fresh);
                  setChoice("");
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <legend>
                  {question.question || question.prompt || question.text}
                </legend>
                {(question.options || question.choices || []).map((o, i) => (
                  <label className="quiz-option" key={i}>
                    <input
                      type="radio"
                      name="quizChoice"
                      value={i}
                      checked={choice === String(i)}
                      onChange={(e) => setChoice(e.target.value)}
                      required
                    />
                    <span>{typeof o === "string" ? o : o.text || o.label}</span>
                  </label>
                ))}
              </fieldset>
              <button
                className="button"
                disabled={busy || session.obsolete || choice === ""}
              >
                {busy ? "Vérification…" : "Valider ma réponse"}
                <Check size={16} />
              </button>
            </form>
          ) : (
            <div className="quiz-complete">
              <Check size={30} />
              <h3>Entraînement terminé</h3>
              <p>
                Reprenez les notions à retravailler et vérifiez les explications
                dans les documents du cours.
              </p>
              {session.progress && (
                <p>
                  Résultat de la session : {session.progress.correct} /{" "}
                  {session.progress.total} réponses correctes.
                </p>
              )}
            </div>
          )}
          {feedback && (
            <div
              className={
                "quiz-feedback " + (feedback.correct ? "correct" : "review")
              }
              role="status"
            >
              <h3>
                {feedback.correct
                  ? "Une bonne réponse !"
                  : "Une notion à reprendre"}
              </h3>
              <p>{feedback.explanation || feedback.answer?.explanation}</p>
              <Sources
                sources={feedback.sources || feedback.answer?.sources || []}
              />
              {feedback.notice && <p className="muted">{feedback.notice}</p>}
            </div>
          )}
          {(session.suggestions || []).length > 0 && (
            <div className="info-note">
              <div>
                <h3>Notions à retravailler</h3>
                <ul>
                  {(session.suggestions || []).map((t, i) => (
                    <li key={i}>
                      {typeof t === "string"
                        ? t
                        : `${t.topic} · ${t.missed} réponse${t.missed > 1 ? "s" : ""} à reprendre`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="quiz-history">
            {questions
              .filter((q) => q.answered)
              .map((q) => (
                <details className="generation" key={q.id}>
                  <summary>
                    <span className="badge">
                      {q.correct ? "Correct" : "À reprendre"}
                    </span>
                    {q.prompt}
                  </summary>
                  <p className="muted">
                    Votre choix : {q.options[q.choiceIndex]}
                    <br />
                    Réponse attendue : {q.options[q.answerIndex]}
                  </p>
                  <p>{q.explanation}</p>
                </details>
              ))}
          </div>
          <Sources sources={session.sources} />
        </div>
      )}
    </>
  );
}
function EcoleDirecteConnection({ status, onChange }) {
  const [period, setPeriod] = useState(initialAgendaPeriod);
  const [challenge, setChallenge] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const base = "/api/integrations/ecoledirecte";
  async function connect(values, form) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const credentials = {
        username: values.username,
        password: values.password,
      };
      const result = challenge
        ? await post(`${base}/challenge`, {
            ...credentials,
            challengeId: challenge.challengeId,
            ...(values.answer ? { answer: values.answer } : {}),
            ...(values.accountId ? { accountId: values.accountId } : {}),
          })
        : await post(`${base}/connect`, {
            ...credentials,
            acceptCharter: values.acceptCharter === "on",
          });
      if (result.requiresChallenge || result.requiresSelection) {
        setChallenge(result);
        setNotice(
          "Une vérification supplémentaire est demandée. Renseignez à nouveau vos identifiants pour la terminer.",
        );
      } else {
        setChallenge(null);
        setNotice(
          "Connexion enregistrée. Vous pouvez synchroniser les données autorisées.",
        );
        await onChange();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      form.reset();
      setBusy(false);
    }
  }
  return (
    <section
      className="panel ed-connection"
      aria-label="Connexion École Directe"
    >
      <Section
        title="École Directe"
        subtitle="Intégration expérimentale non certifiée par École Directe."
      />
      <div className="ed-status">
        <span className="badge">
          {status?.enabled
            ? status.connected
              ? "Connectée"
              : "Activée · non connectée"
            : "Désactivée"}
        </span>
        {status?.lastSync && (
          <span className="muted">
            Dernière synchronisation :{" "}
            {new Date(status.lastSync).toLocaleString("fr-FR")}
          </span>
        )}
      </div>
      <p className="muted">
        Importez votre emploi du temps, les consignes de devoirs et les contenus
        de séance dans votre espace privé. Les supports de classe restent
        publiés séparément par les professeurs.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {status?.lastAttempt && (
        <p className="muted" role="status">
          Dernier essai :{" "}
          {status.lastAttempt.status === "succeeded"
            ? "import terminé"
            : status.lastAttempt.status === "running"
              ? "en cours"
              : "échec, données précédentes conservées"}{" "}
          · Étape :{" "}
          {{
            timetable: "emploi du temps",
            homework_index: "liste des devoirs",
            day_details: "détail du cahier de textes",
            normalization: "vérification des données",
            commit: "enregistrement",
            complete: "terminé",
          }[status.lastAttempt.stage] || "synchronisation"}
          .
        </p>
      )}
      {status?.error && (
        <p className="muted">Code de diagnostic : {status.error}</p>
      )}
      {status?.eligible && (
        <div className="form-grid">
          <Field
            label="Début de la période à synchroniser"
            type="date"
            value={period.startDate}
            onChange={(event) =>
              setPeriod({ ...period, startDate: event.target.value })
            }
            required
          />
          <Field
            label="Nombre de jours à consulter et synchroniser"
            type="number"
            min="1"
            max="14"
            value={period.days}
            onChange={(event) =>
              setPeriod({ ...period, days: Number(event.target.value) })
            }
            required
          />
        </div>
      )}
      {status?.eligible === false ? (
        <div className="info-note">
          <ShieldCheck size={18} />
          <p>
            La connexion École Directe est réservée aux comptes élèves. Vous
            pouvez utiliser votre planning manuel.
          </p>
        </div>
      ) : !status?.enabled ? (
        <div className="info-note">
          <ShieldCheck size={18} />
          <p>
            Cette intégration est désactivée sur cet environnement. Aucun
            identifiant École Directe n’est demandé. Votre planning manuel reste
            disponible.
          </p>
        </div>
      ) : !status.connected ? (
        <>
          <Form
            submit={
              challenge ? "Terminer la vérification" : "Connecter mon compte"
            }
            disabled={busy}
            onSubmit={connect}
          >
            <div className="form-grid">
              <Field
                label="Identifiant École Directe (saisie masquée)"
                name="username"
                type="password"
                autoComplete="off"
                required
                maxLength="200"
              />
              <Field
                label="Mot de passe École Directe"
                name="password"
                type="password"
                autoComplete="off"
                required
                maxLength="200"
              />
            </div>
            {challenge?.requiresChallenge && (
              <fieldset className="ed-challenge">
                <legend>
                  {challenge.question || "Vérification École Directe"}
                </legend>
                {(challenge.options || []).map((option) => (
                  <label className="quiz-option" key={option.id}>
                    <input
                      type="radio"
                      name="answer"
                      value={option.id}
                      required
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {challenge?.requiresSelection && (
              <Field label="Compte élève à utiliser">
                <select name="accountId" required>
                  <option value="">Sélectionnez un compte</option>
                  {(challenge.accounts || []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!challenge && (
              <label className="consent">
                <input type="checkbox" name="acceptCharter" required />
                <span>
                  J’ai vérifié que cet usage respecte la charte et les
                  autorisations de mon établissement. J’autorise la connexion et
                  l’import de mon emploi du temps, de mes devoirs et des
                  contenus de séance.
                </span>
              </label>
            )}
          </Form>
          {challenge && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setNotice("");
                setError("");
              }}
            >
              Annuler la vérification
            </button>
          )}
          <p className="muted" style={{ marginTop: 16 }}>
            Les identifiants sont envoyés au serveur pour cette demande, puis
            les champs sont vidés, y compris en cas d’échec. Ils ne sont pas
            conservés dans le stockage de votre navigateur.
          </p>
        </>
      ) : (
        <>
          <Form
            submit="Synchroniser la période choisie"
            disabled={busy}
            onSubmit={async () => {
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const result = await post(`${base}/sync`, {
                  startDate: period.startDate,
                  days: period.days,
                });
                await onChange();
                setNotice(
                  `Synchronisation du ${date(result.startDate)} au ${date(result.endDate)} : ${result.imported?.classes ?? 0} créneaux de cours, ${result.imported?.tasks ?? 0} devoirs et ${result.imported?.lessons ?? 0} contenus de séance importés. ${(result.warnings || []).join(" ")}`,
                );
              } catch (e) {
                setError(e.message);
                await onChange();
              } finally {
                setBusy(false);
              }
            }}
          ></Form>
          <div className="ed-disconnect">
            <Form
              submit="Déconnecter École Directe"
              disabled={busy}
              onSubmit={async (values) => {
                const purgeImported = values.purgeImported === "on";
                if (
                  !window.confirm(
                    purgeImported
                      ? "Déconnecter École Directe et supprimer les données importées ?"
                      : "Déconnecter École Directe en conservant les données déjà importées ?",
                  )
                )
                  return;
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  await api(`${base}/disconnect`, {
                    method: "DELETE",
                    body: { purgeImported },
                  });
                  setChallenge(null);
                  await onChange();
                  setNotice(
                    purgeImported
                      ? "Compte déconnecté et données importées supprimées."
                      : "Compte déconnecté. Les données déjà importées sont conservées.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="consent">
                <input type="checkbox" name="purgeImported" />
                <span>
                  Supprimer également les données importées d’École Directe. Les
                  tâches et disponibilités saisies manuellement sont conservées.
                </span>
              </label>
            </Form>
          </div>
        </>
      )}
      <ImportedAgenda
        period={period}
        lastSync={status?.lastSync}
        eligible={status?.eligible}
      />
    </section>
  );
}

function Planning() {
  const [data, setData] = useState({
      availability: [],
      tasks: [],
      sessions: [],
    }),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState([]),
    [unscheduled, setUnscheduled] = useState([]);
  async function load() {
    try {
      const [a, t, s, e, r, c] = await Promise.all([
        api("/api/planner/availability"),
        api("/api/planner/tasks"),
        api("/api/planner/sessions"),
        api("/api/integrations/ecoledirecte/status"),
        api("/api/planner/recurring"),
        api(
          `/api/calendar?from=${new Date().toISOString().slice(0, 10)}&days=10`,
        ),
      ]);
      setData({
        availability: a.availability || [],
        tasks: t.tasks || [],
        sessions: s.sessions || [],
        recurring: r.recurring || [],
        rest: c.rest || [],
        ecoleDirecte: e,
      });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function remove(kind, id) {
    try {
      await api(`/api/planner/${kind}/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <EcoleDirecteConnection status={data.ecoleDirecte} onChange={load} />
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="alert" role="note">
        Chabbat, les fêtes et les jours sans travail de l’établissement sont
        automatiquement exclus de votre planning
        {data.rest?.length
          ? ` (prochainement : ${data.rest
              .slice(0, 3)
              .map(
                (r) => `${date(r.date)} ${r.startTime}–${r.endTime}, ${r.name}`,
              )
              .join(" ; ")})`
          : ""}
        . Les horaires sont ceux de Paris.
      </div>
      <div className="two-col">
        <div className="panel">
          <Section
            title="Mes disponibilités"
            subtitle="Les moments où vous pouvez travailler sereinement."
          />
          <h3>Chaque semaine</h3>
          <Form
            submit="Ajouter un créneau hebdomadaire"
            onSubmit={async (v) => {
              await post("/api/planner/recurring", {
                weekday: Number(v.weekday),
                startTime: v.startTime,
                endTime: v.endTime,
                untilDate: v.untilDate || null,
                kind: v.kind,
              });
              await load();
            }}
          >
            <Field label="Jour de la semaine">
              <select name="weekday">
                {[
                  "Lundi",
                  "Mardi",
                  "Mercredi",
                  "Jeudi",
                  "Vendredi",
                  "Samedi",
                  "Dimanche",
                ].map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="De" type="time" name="startTime" required />
              <Field label="À" type="time" name="endTime" required />
            </div>
            <Field label="Type de créneau">
              <select name="kind">
                <option value="available">Disponible pour travailler</option>
                <option value="unavailable">Indisponible</option>
                <option value="class">Cours</option>
              </select>
            </Field>
            <Field label="Jusqu’au (facultatif)" type="date" name="untilDate" />
          </Form>
          {(data.recurring || []).map((r) => (
            <div className="list-item" key={r.id}>
              <Clock size={16} />
              <span>
                Chaque{" "}
                {
                  [
                    "lundi",
                    "mardi",
                    "mercredi",
                    "jeudi",
                    "vendredi",
                    "samedi",
                    "dimanche",
                  ][r.weekday - 1]
                }{" "}
                · {r.start_time}–{r.end_time}
                <small>
                  {
                    {
                      available: "Disponible",
                      unavailable: "Indisponible",
                      class: "Cours",
                    }[r.kind]
                  }
                  {r.until_date ? ` · jusqu’au ${date(r.until_date)}` : ""}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Supprimer le créneau hebdomadaire"
                onClick={() => remove("recurring", r.id)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <h3 style={{ marginTop: 20 }}>Un jour précis</h3>
          <Form
            submit="Ajouter un créneau"
            onSubmit={async (v) => {
              await post("/api/planner/availability", v);
              await load();
            }}
          >
            <Field label="Date" name="date" type="date" required />
            <div className="form-grid">
              <Field label="De" type="time" name="startTime" required />
              <Field label="À" type="time" name="endTime" required />
            </div>
            <Field label="Type de créneau">
              <select name="kind">
                <option value="available">Disponible pour travailler</option>
                <option value="unavailable">Indisponible</option>
                <option value="class">Cours</option>
              </select>
            </Field>
          </Form>
          {data.availability.map((a) => (
            <div className="list-item" key={a.id}>
              <Clock size={16} />
              <span>
                {date(a.date)} · {a.start_time || a.startTime}–
                {a.end_time || a.endTime}
                <small>
                  {
                    {
                      available: "Disponible",
                      unavailable: "Indisponible",
                      class: "Cours",
                    }[a.kind]
                  }
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Supprimer le créneau"
                onClick={() => remove("availability", a.id)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="panel">
          <Section
            title="Mes échéances"
            subtitle="Répartir ses efforts commence par voir ce qui arrive."
          />
          <Form
            submit="Ajouter une tâche"
            onSubmit={async (v) => {
              await post("/api/planner/tasks", {
                ...v,
                durationMinutes: Number(v.durationMinutes),
                difficulty: Number(v.difficulty),
              });
              await load();
            }}
          >
            <Field label="Travail à réaliser" name="title" required />
            <Field label="Matière" name="subject" />
            <div className="form-grid">
              <Field label="Date limite" type="date" name="dueDate" required />
              <Field
                label="Durée estimée (minutes)"
                type="number"
                name="durationMinutes"
                min="15"
                defaultValue="30"
                required
              />
            </div>
            <Field label="Difficulté">
              <select name="difficulty">
                <option value="1">Accessible</option>
                <option value="3">Intermédiaire</option>
                <option value="5">Difficile</option>
              </select>
            </Field>
          </Form>
          {data.tasks.map((t) => (
            <div className="list-item" key={t.id}>
              <input
                type="checkbox"
                aria-label={`Terminé : ${title(t)}`}
                checked={Boolean(t.completed)}
                onChange={async (e) => {
                  await post(`/api/planner/tasks/${t.id}/complete`, {
                    completed: e.target.checked,
                  });
                  await load();
                }}
              />
              <span
                style={t.completed ? { textDecoration: "line-through" } : {}}
              >
                {title(t)}
                <small>
                  {date(t.due_date || t.dueDate)} ·{" "}
                  {t.duration_minutes || t.durationMinutes} min
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Supprimer la tâche"
                onClick={() => remove("tasks", t.id)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <Section
          title="Mon programme de travail"
          subtitle="Les sessions sont réparties selon vos disponibilités et vos échéances."
        />
        <Form
          submit="Organiser mes révisions"
          onSubmit={async (v) => {
            const r = await post("/api/planner/generate", {
              startDate: v.startDate,
              days: Number(v.days),
              maxDailyMinutes: Number(v.maxDailyMinutes),
            });
            setWarnings(r.warnings || []);
            setUnscheduled(r.unscheduled || []);
            await load();
          }}
        >
          <Field
            label="À partir du"
            name="startDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
          <div className="form-grid">
            <Field
              label="Sur combien de jours (7 à 31)"
              name="days"
              type="number"
              min="7"
              max="31"
              defaultValue="14"
              required
            />
            <Field
              label="Maximum de travail par jour (minutes)"
              name="maxDailyMinutes"
              type="number"
              min="30"
              max="240"
              step="15"
              defaultValue="120"
              required
            />
          </div>
        </Form>
        {data.sessions.length ? (
          <div className="session-grid">
            {data.sessions.map((s) => (
              <div className="session" key={s.id}>
                <span className="eyebrow">
                  {date(s.date || s.start_at || s.startAt)}
                </span>
                <h3>{s.title || s.task_title || s.taskTitle}</h3>
                <p>
                  {s.start_time || s.startTime}–{s.end_time || s.endTime} ·{" "}
                  {s.duration_minutes || s.durationMinutes} min
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={CalendarDays}
            title="Un planning à votre rythme"
            text="Ajoutez vos disponibilités et vos tâches, puis lancez l’organisation."
          />
        )}
        {unscheduled.length > 0 && (
          <div className="alert error" role="alert">
            <strong>À placer autrement :</strong>
            {unscheduled.map((u) => (
              <p key={u.taskId}>
                {u.title} : {u.remainingMinutes} min non planifiées. {u.reason}
              </p>
            ))}
          </div>
        )}
        {warnings.map((w, i) => (
          <div className="alert" key={i}>
            {typeof w === "string" ? w : JSON.stringify(w)}
          </div>
        ))}
      </div>
    </>
  );
}
function Statistics() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/stats")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="panel">
      <Section
        title="Comprendre les usages"
        subtitle="Des données agrégées pour accompagner les apprentissages."
      />
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : !data ? (
        <p role="status">Chargement des indicateurs…</p>
      ) : (
        <>
          <p className="muted">{data.message}</p>
          {!data.courses?.length && (
            <Empty
              icon={ChartNoAxesCombined}
              title="Pas encore d’indicateur"
              text="Les données apparaissent pour les cours dont vous êtes responsable."
            />
          )}
          {(data.courses || []).map((c) => (
            <div className="statistics-course" key={c.id}>
              <h3>{title(c)}</h3>
              {c.message && <p className="muted">{c.message}</p>}
              <div className="stats">
                <Stat
                  icon={Download}
                  value={c.consultations ?? "Masqué"}
                  label="Consultations de documents"
                  color="green"
                />
                {c.questions !== undefined && (
                  <Stat
                    icon={Sparkles}
                    value={c.questions}
                    label="Questions posées"
                    color="peach"
                  />
                )}
                {c.participants !== undefined && (
                  <Stat
                    icon={Users}
                    value={c.participants}
                    label="Participants IA"
                    color="lavender"
                  />
                )}
              </div>
              <p className="muted">
                Les consultations sont masquées en dessous de 5 utilisateurs
                distincts.
              </p>
              {c.frequentTopics?.length > 0 && (
                <>
                  <h3>Notions mentionnées fréquemment</h3>
                  <div className="topic-list">
                    {c.frequentTopics.map((t) => (
                      <span className="badge" key={t.term}>
                        {t.term} · {t.participants} participants
                      </span>
                    ))}
                  </div>
                  <p className="muted">{c.topicsNotice}</p>
                </>
              )}
              {c.topicsToReview?.length > 0 && (
                <>
                  <h3>Pistes de révision issues des quiz</h3>
                  <div className="topic-list">
                    {c.topicsToReview.map((t) => (
                      <span className="badge" key={t.topic}>
                        {t.topic} · {t.participants} participants ·{" "}
                        {t.incorrectAttempts} réponses à reprendre
                      </span>
                    ))}
                  </div>
                  <p className="muted">
                    {c.difficultyNotice ||
                      "Notions avec réponses incorrectes de 5 élèves distincts au minimum. Ces agrégats orientent les révisions et ne constituent pas un diagnostic individuel."}
                  </p>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
function Account({ user }) {
  const [success, setSuccess] = useState("");
  return (
    <div className="two-col">
      <div className="panel">
        <Section
          title="Votre compte"
          subtitle="Les informations gérées par votre établissement."
        />
        <div className="list-item">
          <span>Nom</span>
          <strong>{user.name}</strong>
        </div>
        <div className="list-item">
          <span>Adresse e-mail</span>
          <strong>{user.email}</strong>
        </div>
        <div className="list-item">
          <span>Profil</span>
          <strong>{labelRole[user.role] || user.role}</strong>
        </div>
        <p className="muted" style={{ marginTop: 20 }}>
          Pour modifier votre nom ou votre adresse, contactez l’administration
          de votre établissement.
        </p>
      </div>
      <div className="panel">
        <Section
          title="Changer mon mot de passe"
          subtitle="Choisissez un mot de passe personnel de 12 à 128 caractères."
        />
        {success && (
          <div className="alert success" role="status">
            <Check size={18} />
            {success}
          </div>
        )}
        <Form
          submit="Enregistrer mon mot de passe"
          onSubmit={async (v, form) => {
            setSuccess("");
            if (v.newPassword !== v.confirmPassword)
              throw new Error(
                "La confirmation ne correspond pas au nouveau mot de passe.",
              );
            await post("/api/auth/password", {
              currentPassword: v.currentPassword,
              newPassword: v.newPassword,
            });
            form.reset();
            setSuccess(
              "Mot de passe modifié. Cette session a été renouvelée ; vos autres sessions ont été déconnectées.",
            );
          }}
        >
          <Field
            label="Mot de passe actuel"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength="128"
          />
          <Field
            label="Nouveau mot de passe"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength="12"
            maxLength="128"
            required
          />
          <Field
            label="Confirmer le nouveau mot de passe"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength="12"
            maxLength="128"
            required
          />
        </Form>
        <p className="muted" style={{ marginTop: 20 }}>
          Votre mot de passe reste masqué pendant la saisie. Les champs sont
          vidés après la modification.
        </p>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
