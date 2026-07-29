import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const [translation, sourcePath, outputPath] = process.argv.slice(2);
if (!translation || !sourcePath || !outputPath) throw new Error("Usage: node convert-bible-vpl.mjs <kjv|web|bbe> <source.vpl.txt> <output.json>");

const books = { GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy", JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles", EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms", PRO: "Proverbs", ECC: "Ecclesiastes", SOL: "Song of Solomon", ISA: "Isaiah", JER: "Jeremiah", LAM: "Lamentations", EZE: "Ezekiel", DAN: "Daniel", HOS: "Hosea", JOE: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAH: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew", MAR: "Mark", LUK: "Luke", JOH: "John", ACT: "Acts", ROM: "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians", PHI: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews", JAM: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JO": "1 John", "2JO": "2 John", "3JO": "3 John", JUD: "Jude", REV: "Revelation" };
const verses = [];
for (const line of readFileSync(resolve(sourcePath), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9]{3})\s+(\d+):(\d+)\s+(.+)$/);
  if (!match || !books[match[1]]) continue;
  verses.push({ translation, book: books[match[1]], chapter: Number(match[2]), verse: Number(match[3]), text: match[4] });
}
if (verses.length < 30000) throw new Error(`Expected a complete Bible; found only ${verses.length} verses in ${basename(sourcePath)}.`);
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(verses));
console.log(`${translation}: wrote ${verses.length} verses to ${outputPath}`);
