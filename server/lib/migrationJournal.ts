import fs from "fs";
import path from "path";

export interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
}

const PROJECT_ROOT = process.cwd();
const MIGRATIONS_DIR = path.resolve(PROJECT_ROOT, "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function listCommittedMigrationTags(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => file.replace(".sql", ""));
}

export function getMigrationJournalPath(): string {
  return JOURNAL_PATH;
}

export function readMigrationJournal(): MigrationJournal | null {
  if (!fs.existsSync(JOURNAL_PATH)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8")) as MigrationJournal;
}

export function getTrackedMigrationEntries(): MigrationJournalEntry[] {
  const tags = listCommittedMigrationTags();
  const journal = readMigrationJournal();
  const existingEntries = new Map(
    (journal?.entries ?? []).map((entry) => [entry.tag, entry]),
  );

  return tags.map((tag, idx) => {
    const existing = existingEntries.get(tag);
    return {
      idx,
      version: existing?.version ?? journal?.version ?? "7",
      when: existing?.when ?? Date.now() + idx,
      tag,
      breakpoints: existing?.breakpoints ?? true,
    };
  });
}
