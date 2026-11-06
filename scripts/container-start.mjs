import { execFileSync } from "node:child_process";
import { mkdirSync, chownSync, existsSync } from "node:fs";
import path from "node:path";

// Railway mounts volumes at runtime, after Docker's build-time ownership changes.
// Initialize the mount then drop privileges before loading the application.
const dir = path.resolve(process.env.DATA_DIR || "/data");
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (process.getuid?.() === 0) {
  for (const p of [
    dir,
    path.join(dir, "documents"),
    path.join(dir, "school.sqlite"),
    path.join(dir, "school.sqlite-wal"),
    path.join(dir, "school.sqlite-shm"),
  ]) {
    if (existsSync(p)) chownSync(p, 1000, 1000);
  }
  process.setgid(1000);
  process.setuid(1000);
}
if (process.env.PROVISION_ON_START === "true") {
  execFileSync(
    process.execPath,
    [new URL("./provision.mjs", import.meta.url).pathname, "--if-empty"],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        PROVISION_SCHOOL_NAME:
          process.env.PROVISION_SCHOOL_NAME || "Yabné Paris",
        PROVISION_ADMIN_NAME:
          process.env.PROVISION_ADMIN_NAME || "Administrateur IABNE",
        PROVISION_ADMIN_EMAIL:
          process.env.PROVISION_ADMIN_EMAIL || "admin@iabne.local",
      },
    },
  );
}
await import("../server/index.mjs");
