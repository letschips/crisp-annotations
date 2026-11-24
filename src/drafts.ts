// Per-note drafts: paragraphs moved out of a note and parked next to it. They live in data.json
// under `drafts`, keyed by note path. Notes renamed inside Obsidian follow through the rename event;
// notes moved by outside tools (scripts, sync) are re-attached by file name when unambiguous.
// Deleting a note keeps its drafts.

export interface NoteDraft {
  id: string;
  text: string;
  createdAt: number;
}

export type DraftMap = Record<string, NoteDraft[]>;

export type DraftAction = "insert" | "copy" | "remove";

function isDraft(value: unknown): value is NoteDraft {
  const draft = value as NoteDraft | null;
  return Boolean(draft)
    && typeof draft!.id === "string" && draft!.id !== ""
    && typeof draft!.text === "string" && draft!.text.trim() !== ""
    && typeof draft!.createdAt === "number" && Number.isFinite(draft!.createdAt);
}

export function normalizeDrafts(value: unknown): DraftMap {
  const map: DraftMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return map;
  for (const [path, list] of Object.entries(value as Record<string, unknown>)) {
    if (!path || !Array.isArray(list)) continue;
    const drafts = list.filter(isDraft).map(({ id, text, createdAt }) => ({ id, text, createdAt }));
    if (drafts.length) map[path] = drafts;
  }
  return map;
}

export function draftsFor(map: DraftMap, path: string): NoteDraft[] {
  return map[path] ?? [];
}

export function addDraft(map: DraftMap, path: string, draft: NoteDraft): DraftMap {
  return { ...map, [path]: [...draftsFor(map, path), draft] };
}

export function removeDraft(map: DraftMap, path: string, id: string): DraftMap {
  const rest = draftsFor(map, path).filter((draft) => draft.id !== id);
  const next = { ...map };
  if (rest.length) next[path] = rest;
  else delete next[path];
  return next;
}

/** Moves the drafts of a renamed note, or of every note under a renamed folder. */
export function renameDraftPath(map: DraftMap, oldPath: string, newPath: string): DraftMap {
  if (oldPath === newPath) return map;
  let next = map;
  for (const path of Object.keys(map)) {
    const target = path === oldPath
      ? newPath
      : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : null;
    if (target === null) continue;
    if (next === map) next = { ...map };
    const moved = next[path];
    delete next[path];
    next[target] = [...(next[target] ?? []), ...moved];
  }
  return next;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** A note with no drafts takes over the drafts of the one missing note that had the same file name. */
export function adoptOrphanDrafts(map: DraftMap, path: string, exists: (path: string) => boolean): DraftMap {
  if (map[path]) return map;
  const name = fileName(path);
  const candidates = Object.keys(map).filter((key) => fileName(key) === name && !exists(key));
  return candidates.length === 1 ? renameDraftPath(map, candidates[0], path) : map;
}

export function newDraftId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
