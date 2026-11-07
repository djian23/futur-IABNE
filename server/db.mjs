import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
mkdirSync(path.join(DATA_DIR, "documents"), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(DATA_DIR, "school.sqlite"));
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS schools(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS school_years(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),name TEXT NOT NULL,email TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),year_id TEXT NOT NULL REFERENCES school_years(id),name TEXT NOT NULL,level TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjects(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id),class_id TEXT NOT NULL REFERENCES classes(id),PRIMARY KEY(user_id,class_id));
CREATE TABLE IF NOT EXISTS assignments(teacher_id TEXT NOT NULL REFERENCES users(id),class_id TEXT NOT NULL REFERENCES classes(id),subject_id TEXT NOT NULL REFERENCES subjects(id),PRIMARY KEY(teacher_id,class_id,subject_id));
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),class_id TEXT NOT NULL REFERENCES classes(id),subject_id TEXT NOT NULL REFERENCES subjects(id),teacher_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chapters(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id),title TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS delegations(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),course_id TEXT NOT NULL REFERENCES courses(id),student_id TEXT NOT NULL REFERENCES users(id),created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,school_id TEXT NOT NULL REFERENCES schools(id),course_id TEXT NOT NULL REFERENCES courses(id),chapter_id TEXT REFERENCES chapters(id),uploaded_by TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('lesson','exercise','exam','correction')),status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),original_name TEXT NOT NULL,mime_type TEXT NOT NULL,storage_name TEXT NOT NULL,size_bytes INTEGER NOT NULL,extracted_text TEXT NOT NULL DEFAULT '',extraction_status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_chunks(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,position INTEGER NOT NULL,content TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id,status);
CREATE INDEX IF NOT EXISTS idx_delegations_student ON delegations(student_id,course_id,revoked_at);
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS document_views(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),school_id TEXT NOT NULL REFERENCES schools(id),document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,course_id TEXT NOT NULL REFERENCES courses(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_versions(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,storage_name TEXT NOT NULL,original_name TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_extras(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,school_id TEXT NOT NULL,login_id TEXT COLLATE NOCASE,external_id TEXT,must_change_password INTEGER NOT NULL DEFAULT 0,activation_hash TEXT,activation_expires TEXT,last_login_at TEXT,totp_secret TEXT,totp_enabled INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_login_id ON user_extras(login_id) WHERE login_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_external_id ON user_extras(school_id,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,school_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT,target_id TEXT,details TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_school ON audit_log(school_id,created_at);
CREATE TABLE IF NOT EXISTS course_teachers(course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'co' CHECK(role IN ('co','substitute')),starts_at TEXT,ends_at TEXT,PRIMARY KEY(course_id,teacher_id));
CREATE TABLE IF NOT EXISTS classes_meta(class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,kind TEXT NOT NULL DEFAULT 'class' CHECK(kind IN ('class','group')),archived_at TEXT);
`);
if (
  !db
    .prepare("PRAGMA table_info(user_extras)")
    .all()
    .some((c) => c.name === "admin_kind")
)
  db.exec(
    "ALTER TABLE user_extras ADD COLUMN admin_kind TEXT NOT NULL DEFAULT 'full' CHECK(admin_kind IN ('full','secretariat','direction'))",
  );

if (process.env.SEED_DEMO === "true") {
  if (process.env.NODE_ENV === "production")
    throw new Error("SEED_DEMO is forbidden in production");
  if (!db.prepare("SELECT id FROM schools LIMIT 1").get()) {
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO schools VALUES (?,?)").run(
        "school-demo",
        "Lycée Horizon — démonstration",
      );
      db.prepare("INSERT INTO school_years VALUES (?,?,?)").run(
        "year-demo",
        "school-demo",
        "2026–2027",
      );
      const hash = bcrypt.hashSync("EcoleDemo2026!", 12);
      for (const [id, role, name, email] of [
        ["admin-demo", "admin", "Camille Martin", "admin@demo.local"],
        ["teacher-demo", "teacher", "Sarah Bernard", "prof@demo.local"],
        ["student-demo", "student", "Alex Dupont", "eleve@demo.local"],
        ["delegate-demo", "student", "Lou Moreau", "delegue@demo.local"],
      ]) {
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,1,?)").run(
          id,
          "school-demo",
          role,
          name,
          email,
          hash,
          now(),
        );
      }
      db.prepare("INSERT INTO classes VALUES (?,?,?,?,?)").run(
        "class-demo",
        "school-demo",
        "year-demo",
        "Terminale A",
        "Terminale",
      );
      db.prepare("INSERT INTO subjects VALUES (?,?,?)").run(
        "subject-demo",
        "school-demo",
        "Mathématiques",
      );
      for (const id of ["student-demo", "delegate-demo"])
        db.prepare("INSERT INTO memberships VALUES (?,?)").run(
          id,
          "class-demo",
        );
      db.prepare("INSERT INTO assignments VALUES (?,?,?)").run(
        "teacher-demo",
        "class-demo",
        "subject-demo",
      );
      db.prepare("INSERT INTO courses VALUES (?,?,?,?,?,?,?)").run(
        "course-demo",
        "school-demo",
        "class-demo",
        "subject-demo",
        "teacher-demo",
        "Mathématiques — Terminale A",
        now(),
      );
      db.prepare("INSERT INTO chapters VALUES (?,?,?,?)").run(
        "chapter-demo",
        "course-demo",
        "Suites numériques",
        1,
      );
      db.prepare("INSERT INTO delegations VALUES (?,?,?,?,?,?,NULL)").run(
        "delegation-demo",
        "school-demo",
        "course-demo",
        "delegate-demo",
        "teacher-demo",
        now(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
