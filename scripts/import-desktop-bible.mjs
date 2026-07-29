// Imports an audited, installer-bundled Bible JSON file into the desktop
// SQLite cache. Expected shape: [{ translation, book, chapter, verse, text }].
// Run this only in the Electron Node 24 runtime so node:sqlite is available.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [databasePath, sourcePath] = process.argv.slice(2);
if (!databasePath || !sourcePath) throw new Error("Usage: node import-desktop-bible.mjs <workspace.sqlite> <bible.json>");
const verses = JSON.parse(readFileSync(sourcePath, "utf8"));
if (!Array.isArray(verses) || !verses.every((verse) => verse.translation && verse.book && verse.chapter && verse.verse && verse.text)) {
  throw new Error("Bible source must contain translation, book, chapter, verse, and text for every verse.");
}
const db = new DatabaseSync(databasePath);
db.exec("BEGIN; DELETE FROM bible_verses;");
const insert = db.prepare("INSERT INTO bible_verses (translation, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)");
for (const verse of verses) insert.run(verse.translation, verse.book, Number(verse.chapter), Number(verse.verse), verse.text);
db.exec("COMMIT;");
