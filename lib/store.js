import fs from "node:fs";
import path from "node:path";

// Tiny JSON-file store. Swap for Postgres/SQLite in production.
const FILE = path.resolve(process.env.DATA_FILE || "data/db.json");
let db = { fund: { balance: 0, totalIn: 0, spent: 0 }, episodes: [], feeLog: [], vaults: {} };

export function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { save(); }
  return db;
}
let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
  }, 50);
}
export const getDb = () => db;
export const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 10);
