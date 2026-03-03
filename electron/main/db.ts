import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { app } from "electron";

let dbInstance: Database.Database | null = null;

function migrationsDir() {
  return path.join(app.getAppPath(), "db", "migrations");
}

function ensureDbFolder() {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = path.join(ensureDbFolder(), "desktopcal-sync.db");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  runMigrations(dbInstance);
  return dbInstance;
}

function runMigrations(db: Database.Database) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS __migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  ).run();

  const files = fs.readdirSync(migrationsDir()).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const existing = db.prepare("SELECT id FROM __migrations WHERE id = ?").get(file) as { id: string } | undefined;
    if (existing) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir(), file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO __migrations (id, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
  }
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
