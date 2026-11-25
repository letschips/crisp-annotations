// Failure modes for the per-note drafts drawer:
// - text cut from the note before the draft is safely on disk (a failed or blocked save loses it);
// - the note changed while saving, so the wrong range is cut;
// - drafts dropped when the note is renamed, moved with its folder, deleted, or moved outside Obsidian;
// - an unrelated settings save writing data.json without the drafts;
// - one note's drafts shown for another note;
// - a single click deleting a draft for good.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Plugin, type App, type WorkspaceLeaf } from "obsidian";
import CrispAnnotationsPlugin from "../src/main";
import { applyEntitlement } from "../src/entitlement";
import {
  addDraft,
  adoptOrphanDrafts,
  draftCutRange,
  draftsFor,
  normalizeDrafts,
  removeDraft,
  renameDraftPath,
  type NoteDraft,
} from "../src/drafts";
import { CrispAnnotationsOutlineView } from "../src/outline-view";
import { DEFAULT_SETTINGS } from "../src/settings";

vi.mock("../src/icons", () => ({ registerIcons: vi.fn() }));

const LICENSE: Parameters<typeof applyEntitlement>[1] = { valid: true, payload: { product: "Crisp Suite", licenseId: "TEST", userName: "Test", expiresAt: "2999-01-01T00:00:00Z", features: ["all"] } };
const draft = (id: string, text = id, createdAt = 1): NoteDraft => ({ id, text, createdAt });

describe("cut range for a moved paragraph", () => {
  const cut = (value: string, selected: string) => {
    const from = value.indexOf(selected);
    const range = draftCutRange(value, from, from + selected.length);
    return value.slice(0, range.from) + value.slice(range.to);
  };

  it("leaves one blank line between the paragraphs around a moved paragraph", () => {
    expect(cut("甲。\n\n乙。\n\n丙。", "乙。")).toBe("甲。\n\n丙。");
    expect(cut("甲。\n\n乙。\n\n\n丙。", "乙。")).toBe("甲。\n\n丙。");
    expect(cut("甲。\n\n乙。\n\n丙。", "乙。\n\n")).toBe("甲。\n\n丙。");
  });

  it("does not leave blank lines at the top, and keeps at most one newline at the end", () => {
    expect(cut("甲。\n\n乙。", "甲。")).toBe("乙。");
    expect(cut("甲。\n\n乙。\n", "乙。\n")).toBe("甲。\n");
    expect(cut("甲。\n\n乙。", "乙。")).toBe("甲。\n");
  });

  it("removes a whole line without leaving an empty one, and cuts only the selection inside a line", () => {
    expect(cut("开头。可惜的一段。结尾。", "可惜的一段。")).toBe("开头。结尾。");
    expect(cut("甲\n乙\n丙", "乙")).toBe("甲\n丙");
    expect(cut("甲\n乙\n丙", "乙\n")).toBe("甲\n丙");
    expect(cut("甲乙\n丙", "乙")).toBe("甲\n丙");
  });
});

describe("draft map", () => {
  it("drops malformed entries and keeps valid ones", () => {
    const map = normalizeDrafts({
      "A.md": [draft("a"), { id: 1, text: "x" }, { id: "b", text: "", createdAt: 1 }, draft("c")],
      "B.md": "nope",
      "": [draft("d")],
    });
    expect(map).toEqual({ "A.md": [draft("a"), draft("c")] });
    expect(normalizeDrafts(undefined)).toEqual({});
  });

  it("adds and removes without touching other notes", () => {
    let map = addDraft({}, "A.md", draft("a"));
    map = addDraft(map, "B.md", draft("b"));
    map = removeDraft(map, "A.md", "a");
    expect(map).toEqual({ "B.md": [draft("b")] });
    expect(draftsFor(map, "A.md")).toEqual([]);
  });

  it("follows file renames, folder moves, and merges into an existing entry", () => {
    let map: Record<string, NoteDraft[]> = { "Old.md": [draft("a")], "Dir/N.md": [draft("n")], "Dir/Sub/M.md": [draft("m")], "Dirty.md": [draft("x")] };
    map = renameDraftPath(map, "Old.md", "New.md");
    map = renameDraftPath(map, "Dir", "Moved/Dir");
    expect(map).toEqual({ "New.md": [draft("a")], "Moved/Dir/N.md": [draft("n")], "Moved/Dir/Sub/M.md": [draft("m")], "Dirty.md": [draft("x")] });
    map = renameDraftPath({ "A.md": [draft("a")], "B.md": [draft("b")] }, "A.md", "B.md");
    expect(map).toEqual({ "B.md": [draft("b"), draft("a")] });
  });

  it("re-attaches drafts of a note moved outside Obsidian only when the match is unambiguous", () => {
    const exists = (path: string) => path === "Topics/x/Note.md";
    expect(adoptOrphanDrafts({ "Inbox/Note.md": [draft("a")] }, "Topics/x/Note.md", exists))
      .toEqual({ "Topics/x/Note.md": [draft("a")] });
    const twoCandidates = { "A/Note.md": [draft("a")], "B/Note.md": [draft("b")] };
    expect(adoptOrphanDrafts(twoCandidates, "Topics/x/Note.md", exists)).toBe(twoCandidates);
    const stillThere = { "Topics/x/Note.md": [draft("a")], "Old/Note.md": [draft("b")] };
    expect(adoptOrphanDrafts(stillThere, "Topics/x/Note.md", exists)).toBe(stillThere);
    const alive = { "Other/Note.md": [draft("a")] };
    expect(adoptOrphanDrafts(alive, "Topics/x/Note.md", (p) => p === "Other/Note.md" || exists(p))).toBe(alive);
  });
});

function harness(options: { storedDrafts?: unknown; failWrite?: boolean } = {}) {
  let value = "开头。可惜的一段。结尾。";
  let selection = { from: 3, to: 9 };
  const pos = (offset: number) => ({ line: 0, ch: offset });
  const editor = {
    getValue: () => value,
    getSelection: () => value.slice(selection.from, selection.to),
    getCursor: (mode?: "from" | "to" | "head") => pos(mode === "to" ? selection.to : selection.from),
    getRange: (from: { ch: number }, to: { ch: number }) => value.slice(from.ch, to.ch),
    replaceRange: (text: string, from: { ch: number }, to: { ch: number } = from) => {
      value = value.slice(0, from.ch) + text + value.slice(to.ch);
      selection = { from: from.ch + text.length, to: from.ch + text.length };
    },
    replaceSelection: (text: string) => {
      value = value.slice(0, selection.from) + text + value.slice(selection.to);
      selection = { from: selection.from + text.length, to: selection.from + text.length };
    },
    posToOffset: (p: { ch: number }) => p.ch,
    offsetToPos: pos,
    setCursor: () => {},
    focus: () => {},
  };
  const file = { path: "Note.md", name: "Note.md", basename: "Note", extension: "md" };
  const markdownLeaf = { view: { editor, file, containerEl: document.createElement("div"), getViewType: () => "markdown" } } as unknown as WorkspaceLeaf;
  const files = new Map<string, string>();
  const dataPath = "plugins/crisp-annotations/data.json";
  if (options.storedDrafts !== undefined) files.set(dataPath, JSON.stringify({ drafts: options.storedDrafts }));
  const vaultListeners = new Map<string, (...args: never[]) => void>();
  const outlineLeaves: WorkspaceLeaf[] = [];
  const existing = new Set(["Note.md"]);
  const app = {
    workspace: {
      activeLeaf: markdownLeaf,
      getLeavesOfType: (type: string) => type === "markdown" ? [markdownLeaf] : type === "crisp-annotations-outline-view" ? outlineLeaves : [],
      on: () => ({}), iterateAllLeaves: () => {}, onLayoutReady: () => {}, updateOptions: () => {}, getActiveViewOfType: () => null,
    },
    vault: {
      getMarkdownFiles: () => [], cachedRead: async () => "",
      getFileByPath: (path: string) => existing.has(path) ? { ...file, path } : null,
      getAbstractFileByPath: (path: string) => existing.has(path) ? { ...file, path } : null,
      on: (event: string, cb: (...args: never[]) => void) => { vaultListeners.set(event, cb); return {}; },
      adapter: {
        exists: async (p: string) => files.has(p),
        read: async (p: string) => { const v = files.get(p); if (v === undefined) throw new Error("missing"); return v; },
        write: async (p: string, d: string) => { files.set(p, d); },
      },
    },
  } as unknown as App;
  vi.spyOn(Plugin.prototype, "loadData").mockImplementation(async () => {
    const raw = files.get(dataPath);
    return raw === undefined ? null : JSON.parse(raw);
  });
  vi.spyOn(Plugin.prototype, "saveData").mockImplementation(async (data) => {
    if (!options.failWrite) files.set(dataPath, JSON.stringify(data));
  });
  const manifest = { id: "crisp-annotations", name: "Crisp Annotations", version: "0", author: "", minAppVersion: "1.8.0", description: "", dir: "plugins/crisp-annotations" };
  const plugin = new CrispAnnotationsPlugin(app, manifest);
  plugin.app = app;
  plugin.manifest = manifest;
  applyEntitlement(plugin, LICENSE);
  const api = plugin as unknown as {
    moveSelectionToDrafts(editor: unknown, file: unknown): Promise<boolean>;
    handleDraftAction(action: "insert" | "copy" | "remove", path: string, id: string): Promise<void>;
    onExternalSettingsChange(): Promise<void>;
  };
  return {
    plugin, api, editor, file, files, dataPath, vaultListeners, existing, outlineLeaves,
    getValue: () => value,
    setSelection: (from: number, to: number) => { selection = { from, to }; },
    setValue: (next: string) => { value = next; },
    stored: () => JSON.parse(files.get(dataPath) ?? "{}") as { drafts?: Record<string, NoteDraft[]>; colorTheme?: string },
  };
}

describe("moving text into drafts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves the draft first, then cuts exactly the selected text", async () => {
    const h = harness();
    await h.plugin.onload();
    expect(await h.api.moveSelectionToDrafts(h.editor, h.file)).toBe(true);
    expect(h.getValue()).toBe("开头。结尾。");
    expect(h.stored().drafts?.["Note.md"].map((d) => d.text)).toEqual(["可惜的一段。"]);
  });

  it("removes the blank lines a moved paragraph leaves behind, but stores only the selection", async () => {
    const h = harness();
    await h.plugin.onload();
    h.setValue("第一段。\n\n挪走的一段。\n\n最后一段。");
    h.setSelection(6, 12);
    expect(await h.api.moveSelectionToDrafts(h.editor, h.file)).toBe(true);
    expect(h.getValue()).toBe("第一段。\n\n最后一段。");
    expect(h.stored().drafts?.["Note.md"].map((d) => d.text)).toEqual(["挪走的一段。"]);
  });

  it("leaves the note untouched when the draft could not be written", async () => {
    const h = harness({ failWrite: true });
    await h.plugin.onload();
    expect(await h.api.moveSelectionToDrafts(h.editor, h.file)).toBe(false);
    expect(h.getValue()).toBe("开头。可惜的一段。结尾。");
  });

  it("keeps the note text when it changed while the draft was being saved", async () => {
    const h = harness();
    await h.plugin.onload();
    const pending = h.api.moveSelectionToDrafts(h.editor, h.file);
    h.setValue("新输入开头。可惜的一段。结尾。");
    expect(await pending).toBe(false);
    expect(h.getValue()).toBe("新输入开头。可惜的一段。结尾。");
    expect(h.stored().drafts?.["Note.md"]).toHaveLength(1);
  });

  it("keeps drafts when settings are saved, the note is renamed, or deleted", async () => {
    const h = harness({ storedDrafts: { "Note.md": [draft("a", "甲")] } });
    await h.plugin.onload();
    h.plugin.settings.colorTheme = "kindle";
    await h.plugin.saveSettings();
    expect(h.stored().drafts).toEqual({ "Note.md": [draft("a", "甲")] });
    h.existing.add("Renamed.md");
    h.vaultListeners.get("rename")?.({ path: "Renamed.md", extension: "md" } as never, "Note.md" as never);
    await vi.waitFor(() => expect(h.stored().drafts).toEqual({ "Renamed.md": [draft("a", "甲")] }));
    h.vaultListeners.get("delete")?.({ path: "Renamed.md", extension: "md" } as never);
    await Promise.resolve();
    expect(h.stored().drafts).toEqual({ "Renamed.md": [draft("a", "甲")] });
  });

  it("inserts a draft at the cursor and only then removes it", async () => {
    const h = harness({ storedDrafts: { "Note.md": [draft("a", "回来的段落")] } });
    await h.plugin.onload();
    h.setSelection(3, 3);
    await h.api.handleDraftAction("insert", "Note.md", "a");
    expect(h.getValue()).toBe("开头。回来的段落可惜的一段。结尾。");
    expect(h.stored().drafts).toEqual({});
  });

  it("reloads drafts written by another device", async () => {
    const h = harness({ storedDrafts: {} });
    await h.plugin.onload();
    h.files.set(h.dataPath, JSON.stringify({ drafts: { "Note.md": [draft("z", "别处写的")] } }));
    await h.api.onExternalSettingsChange();
    await h.plugin.saveSettings();
    expect(h.stored().drafts).toEqual({ "Note.md": [draft("z", "别处写的")] });
  });
});

describe("drafts tab in the annotation center", () => {
  const owner = {};
  applyEntitlement(owner, LICENSE);

  function view(path: string | null, drafts: Record<string, NoteDraft[]>) {
    const leaf = { app: { workspace: { getLeavesOfType: () => [], activeLeaf: null } }, view: { containerEl: document.createElement("div") } } as unknown as WorkspaceLeaf;
    const outline = new CrispAnnotationsOutlineView(leaf, () => DEFAULT_SETTINGS).bindEntitlement(owner);
    const act = vi.fn();
    outline.bindDrafts({ list: (p) => drafts[p] ?? [], act });
    const sourceLeaf = path ? { view: { file: { path } } } as unknown as WorkspaceLeaf : null;
    outline.refresh("", sourceLeaf);
    const tab = [...outline.containerEl.querySelectorAll<HTMLButtonElement>(".crisp-ann-outline-scope__button")].find((b) => b.textContent?.startsWith("草稿"));
    tab?.click();
    return { outline, act, el: outline.containerEl };
  }

  it("shows only the current note's drafts", () => {
    const { el } = view("A.md", { "A.md": [draft("a", "甲段")], "B.md": [draft("b", "乙段")] });
    expect(el.textContent).toContain("甲段");
    expect(el.textContent).not.toContain("乙段");
  });

  it("sends insert and copy, and asks twice before deleting", () => {
    const { el, act } = view("A.md", { "A.md": [draft("a", "甲段")] });
    const button = (name: string) => el.querySelector<HTMLButtonElement>(`.crisp-ann-draft__action--${name}`)!;
    button("insert").click();
    button("copy").click();
    expect(act.mock.calls).toEqual([["insert", "A.md", "a"], ["copy", "A.md", "a"]]);
    button("remove").click();
    expect(act).toHaveBeenCalledTimes(2);
    button("remove").click();
    expect(act).toHaveBeenLastCalledWith("remove", "A.md", "a");
  });
});
