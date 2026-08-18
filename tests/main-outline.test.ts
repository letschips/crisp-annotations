import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, WorkspaceLeaf } from "obsidian";
import CrispAnnotationsPlugin from "../src/main";
import {
  CrispAnnotationsOutlineView,
  OUTLINE_VIEW_TYPE,
} from "../src/outline-view";
import { DEFAULT_SETTINGS } from "../src/settings";
import { findAnnotations } from "../src/annotation-syntax";
import { AnnotationModal } from "../src/annotation-modal";

vi.mock("../src/icons", () => ({ registerIcons: vi.fn() }));

const SOURCE = '正文 ==重点=={ann note="来自当前文档" place=right color=blue}';

interface MarkdownViewShape {
  containerEl: HTMLElement;
  file: {
    path: string;
    name: string;
    basename: string;
    extension: string;
  };
  editor: {
    getValue(): string;
    getCursor(): { line: number; ch: number };
    getCursor(mode: "from" | "to"): { line: number; ch: number };
    getSelection(): string;
    posToOffset(pos: { line: number; ch: number }): number;
    offsetToPos(offset: number): { line: number; ch: number };
    replaceRange(
      replacement: string,
      from: { line: number; ch: number },
      to?: { line: number; ch: number },
    ): void;
    setCursor(pos: { line: number; ch: number }): void;
    scrollIntoView(): void;
  };
  getViewType(): string;
}

interface TestWorkspace {
  app: App;
  markdownLeaf: WorkspaceLeaf;
  outlineLeaf: WorkspaceLeaf;
  outlineLeaves: WorkspaceLeaf[];
  listeners: Map<string, (...args: never[]) => void>;
  vaultListeners: Map<string, (...args: never[]) => void>;
  getSource(): string;
}

function createWorkspace(): TestWorkspace {
  let markdownSource = SOURCE;
  let cursor = { line: 0, ch: 0 };
  const sourceFile = {
    path: "Current.md",
    name: "Current.md",
    basename: "Current",
    extension: "md",
  };
  const markdownView: MarkdownViewShape = {
    containerEl: document.createElement("div"),
    editor: {
      getValue: () => markdownSource,
      getCursor: () => cursor,
      getSelection: () => "",
      posToOffset: (pos) => pos.ch,
      offsetToPos: (offset) => ({ line: 0, ch: offset }),
      replaceRange: (replacement, from, to = from) => {
        markdownSource = `${markdownSource.slice(0, from.ch)}${replacement}${markdownSource.slice(to.ch)}`;
      },
      setCursor: (pos) => { cursor = pos; },
      scrollIntoView: () => {},
    },
    getViewType: () => "markdown",
    file: sourceFile,
  };
  const markdownLeaf = {
    app: null,
    view: markdownView,
    setViewState: async () => {},
  } as unknown as WorkspaceLeaf;
  const outlineLeaves: WorkspaceLeaf[] = [];
  const listeners = new Map<string, (...args: never[]) => void>();
  const vaultListeners = new Map<string, (...args: never[]) => void>();
  const outlineLeaf = {
    app: null,
    view: {
      containerEl: document.createElement("div"),
      ownerDocument: document,
      getViewType: () => "empty",
    },
    setViewState: async () => {
      const view = new CrispAnnotationsOutlineView(
        outlineLeaf,
        () => DEFAULT_SETTINGS,
      );
      outlineLeaf.view = view;
      outlineLeaves.push(outlineLeaf);
      await view.onOpen();
    },
  } as unknown as WorkspaceLeaf;

  const workspace = {
    activeLeaf: markdownLeaf,
    getLeavesOfType: (type: string) => (
      type === "markdown"
        ? [markdownLeaf]
        : type === OUTLINE_VIEW_TYPE
          ? outlineLeaves
          : []
    ),
    getRightLeaf: () => outlineLeaf,
    revealLeaf: (leaf: WorkspaceLeaf) => {
      workspace.activeLeaf = leaf;
    },
    setActiveLeaf: (leaf: WorkspaceLeaf) => {
      workspace.activeLeaf = leaf;
    },
    on: (event: string, callback: (...args: never[]) => void) => {
      listeners.set(event, callback);
      return {};
    },
    getLeaf: () => markdownLeaf,
    updateOptions: () => {},
    iterateAllLeaves: () => {},
    getActiveViewOfType: () => null,
  };
  const app = {
    workspace: workspace as unknown as App["workspace"],
    vault: {
      getMarkdownFiles: () => [sourceFile],
      getFileByPath: (path: string) => path === sourceFile.path ? sourceFile : null,
      cachedRead: async (file: unknown) => {
        if (file !== sourceFile) {
          throw new Error("cachedRead requires the vault TFile instance");
        }
        return SOURCE;
      },
      on: (event: string, callback: (...args: never[]) => void) => {
        vaultListeners.set(event, callback);
        return {};
      },
    },
    setting: {
      open: () => {},
      openTabById: () => {},
    },
  } as unknown as App;
  (markdownLeaf as unknown as { app: App }).app = app;
  (outlineLeaf as unknown as { app: App }).app = app;

  return {
    app,
    markdownLeaf,
    outlineLeaf,
    outlineLeaves,
    listeners,
    vaultListeners,
    getSource: () => markdownSource,
  };
}

describe("annotation outline lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.removeAttribute("data-crisp-ann-recall");
  });

  it("opens with annotations from the markdown leaf that launched it", async () => {
    const { app, outlineLeaf } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.4.1",
      author: "letschips",
      minAppVersion: "1.5.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;

    await (plugin as unknown as {
      openAnnotationOutline(): Promise<void>;
    }).openAnnotationOutline();

    expect(outlineLeaf.view.containerEl.querySelectorAll(
      ".crisp-ann-outline-item",
    )).toHaveLength(1);
    expect(outlineLeaf.view.containerEl.textContent).toContain("来自当前文档");
  });

  it("loads the whole-vault index when the outline is opened", async () => {
    const { app, outlineLeaf } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.0",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();

    await (plugin as unknown as {
      openAnnotationOutline(): Promise<void>;
    }).openAnnotationOutline();
    outlineLeaf.view.containerEl.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    expect(outlineLeaf.view.containerEl.textContent).toContain("全库标注 (1)");
    expect(outlineLeaf.view.containerEl.textContent).toContain("Current.md");
    expect(outlineLeaf.view.containerEl.textContent).toContain("来自当前文档");
  });

  it("prefers unsaved editor text over the cached file during initial indexing", async () => {
    const { app, outlineLeaf } = createWorkspace();
    Object.assign(app.vault, {
      cachedRead: async () => "Saved text without annotations",
    });
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.0",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();

    await (plugin as unknown as {
      openAnnotationOutline(): Promise<void>;
    }).openAnnotationOutline();
    outlineLeaf.view.containerEl.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    expect(outlineLeaf.view.containerEl.textContent).toContain("全库标注 (1)");
    expect(outlineLeaf.view.containerEl.textContent).toContain("来自当前文档");
  });

  it("updates an open vault outline when a Markdown file changes", async () => {
    const { app, outlineLeaf, vaultListeners } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.0",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();
    await (plugin as unknown as {
      openAnnotationOutline(): Promise<void>;
    }).openAnnotationOutline();
    outlineLeaf.view.containerEl.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    const changedFile = {
      path: "Changed.md",
      name: "Changed.md",
      basename: "Changed",
      extension: "md",
    };
    (app.vault.cachedRead as unknown as { mockResolvedValue?(value: string): void })
      .mockResolvedValue?.('==Updated=={ann note="来自磁盘修改" color=green}');
    Object.assign(app.vault, {
      getFileByPath: (path: string) => path === changedFile.path ? changedFile : null,
      cachedRead: async () => '==Updated=={ann note="来自磁盘修改" color=green}',
    });
    vaultListeners.get("modify")?.(changedFile as never);

    await vi.waitFor(() => {
      expect(outlineLeaf.view.containerEl.textContent).toContain("来自磁盘修改");
    });
    expect(outlineLeaf.view.containerEl.textContent).toContain("Changed.md");
  });

  it("does not surface a transient file-read failure from an incremental update", async () => {
    const { app } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.0",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();
    await (plugin as unknown as {
      ensureVaultIndex(): Promise<void>;
    }).ensureVaultIndex();
    Object.assign(app.vault, {
      getFileByPath: () => ({
        path: "Moving.md",
        name: "Moving.md",
        basename: "Moving",
        extension: "md",
      }),
      cachedRead: async () => { throw new Error("File moved during read"); },
    });

    await expect((plugin as unknown as {
      updateVaultIndexFile(file: never): Promise<void>;
    }).updateVaultIndexFile({
      path: "Moving.md",
      name: "Moving.md",
      basename: "Moving",
      extension: "md",
    } as never)).resolves.toBeUndefined();
  });

  it("executes panel edit, highlight, copy, and remove actions against a reading leaf", async () => {
    const { app, markdownLeaf, getSource } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    vi.spyOn(plugin, "ensureLicenseActivated").mockResolvedValue(true);
    const openModal = vi.spyOn(AnnotationModal.prototype, "open");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const reference = findAnnotations(SOURCE)[0];
    const context = {
      annotation: reference,
      filePath: "Current.md",
      sourceLeaf: markdownLeaf,
    };

    await (plugin as unknown as {
      handleOutlineAction(action: string, context: unknown): Promise<void>;
    }).handleOutlineAction("edit", context);
    expect(openModal).toHaveBeenCalledOnce();

    await (plugin as unknown as {
      handleOutlineAction(action: string, context: unknown): Promise<void>;
    }).handleOutlineAction("copy", context);
    expect(writeText).toHaveBeenCalledWith("重点\n来自当前文档");

    await (plugin as unknown as {
      handleOutlineAction(action: string, context: unknown): Promise<void>;
    }).handleOutlineAction("toggle-mark", context);
    expect(getSource()).toContain("mark=off");

    const toggledReference = findAnnotations(getSource())[0];
    await (plugin as unknown as {
      handleOutlineAction(action: string, context: unknown): Promise<void>;
    }).handleOutlineAction("remove", {
      ...context,
      annotation: toggledReference,
    });
    expect(getSource()).toBe("正文 重点");
  });

  it("updates a closed vault file atomically from the panel", async () => {
    const { app } = createWorkspace();
    const closedFile = {
      path: "Closed.md",
      name: "Closed.md",
      basename: "Closed",
      extension: "md",
    };
    let closedSource = '==Closed target=={ann note="Closed note" color=green}';
    Object.assign(app.vault, {
      getFileByPath: (path: string) => path === closedFile.path ? closedFile : null,
      process: async (_file: unknown, transform: (source: string) => string) => {
        closedSource = transform(closedSource);
      },
    });
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;

    await (plugin as unknown as {
      handleOutlineAction(action: string, context: unknown): Promise<void>;
    }).handleOutlineAction("toggle-mark", {
      annotation: findAnnotations(closedSource)[0],
      filePath: closedFile.path,
      sourceLeaf: null,
    });

    expect(closedSource).toContain("mark=off");
  });

  it("registers previous and next shortcuts that wrap through the active document", async () => {
    const { app, markdownLeaf } = createWorkspace();
    const source = [
      '==First=={ann note="One"}',
      '==Second=={ann note="Two"}',
    ].join("\n");
    const annotations = findAnnotations(source);
    const editor = (markdownLeaf.view as unknown as MarkdownViewShape).editor;
    Object.assign(editor, { getValue: () => source });
    editor.setCursor(editor.offsetToPos(annotations[0].targetFrom));
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();
    const commands = (plugin as unknown as {
      commands: Array<{
        id: string;
        hotkeys?: Array<{ modifiers: string[]; key: string }>;
        callback?: () => void;
      }>;
    }).commands;
    const previous = commands.find((command) => command.id === "previous-annotation");
    const next = commands.find((command) => command.id === "next-annotation");

    expect(previous?.hotkeys).toEqual([{
      modifiers: ["Mod", "Alt"],
      key: "ArrowUp",
    }]);
    expect(next?.hotkeys).toEqual([{
      modifiers: ["Mod", "Alt"],
      key: "ArrowDown",
    }]);

    next?.callback?.();
    expect(editor.getCursor()).toEqual(editor.offsetToPos(annotations[1].targetFrom));
    next?.callback?.();
    expect(editor.getCursor()).toEqual(editor.offsetToPos(annotations[0].targetFrom));
    previous?.callback?.();
    expect(editor.getCursor()).toEqual(editor.offsetToPos(annotations[1].targetFrom));
  });

  it("edits the matching annotation when its reading-mode label is activated", async () => {
    const { app, markdownLeaf } = createWorkspace();
    const source = [
      '==First=={ann note="One"}',
      '==Second=={ann note="Two"}',
    ].join("\n");
    const markdownView = markdownLeaf.view as unknown as MarkdownViewShape;
    Object.assign(markdownView.editor, { getValue: () => source });
    const preview = document.createElement("div");
    preview.className = "markdown-preview-view";
    markdownView.containerEl.append(preview);
    preview.innerHTML = [
      '<p><mark>First</mark>{ann note="One"}</p>',
      '<p><mark>Second</mark>{ann note="Two"}</p>',
    ].join("");
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    vi.spyOn(plugin, "ensureLicenseActivated").mockResolvedValue(true);
    const openModal = vi.spyOn(AnnotationModal.prototype, "open");
    await plugin.onload();

    const processor = (plugin as unknown as {
      markdownPostProcessors: Array<(
        element: HTMLElement,
        context: {
          sourcePath: string;
          getSectionInfo(element: HTMLElement): {
            text: string;
            lineStart: number;
            lineEnd: number;
          };
        },
      ) => void>;
    }).markdownPostProcessors[0];
    processor(preview, {
      sourcePath: "Current.md",
      getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: 1 }),
    });
    const labels = preview.querySelectorAll<HTMLElement>(".crisp-ann__label");
    const wrappers = preview.querySelectorAll<HTMLElement>(".crisp-ann");
    expect(wrappers[1].dataset.crispAnnFrom).toBe(
      String(findAnnotations(source)[1].from),
    );
    labels[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    await vi.waitFor(() => expect(openModal).toHaveBeenCalledOnce());
    expect(markdownView.editor.getCursor()).toEqual(
      markdownView.editor.offsetToPos(findAnnotations(source)[1].targetFrom),
    );
  });

  it("marks the reading annotation nearest the viewport as active in the panel", async () => {
    const { app, markdownLeaf, outlineLeaf } = createWorkspace();
    const source = [
      '==First=={ann note="One"}',
      '==Second=={ann note="Two"}',
    ].join("\n");
    const markdownView = markdownLeaf.view as unknown as MarkdownViewShape;
    Object.assign(markdownView.editor, { getValue: () => source });
    const preview = document.createElement("div");
    preview.className = "markdown-preview-view";
    markdownView.containerEl.append(preview);
    Object.defineProperty(preview, "clientHeight", { value: 600 });
    preview.getBoundingClientRect = () => ({
      top: 100,
      bottom: 700,
      left: 0,
      right: 800,
      width: 800,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const wrapper = document.createElement("span");
    wrapper.className = "crisp-ann";
    wrapper.dataset.crispAnnFrom = String(findAnnotations(source)[1].from);
    preview.append(wrapper);
    wrapper.getBoundingClientRect = () => ({
      top: 385,
      bottom: 415,
      left: 0,
      right: 120,
      width: 120,
      height: 30,
      x: 0,
      y: 385,
      toJSON: () => ({}),
    });
    await outlineLeaf.setViewState({ type: OUTLINE_VIEW_TYPE });
    const outline = outlineLeaf.view as CrispAnnotationsOutlineView;
    outline.refresh(source, markdownLeaf);
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;

    (plugin as unknown as {
      syncActiveAnnotationFromReading(leaf: WorkspaceLeaf): void;
    }).syncActiveAnnotationFromReading(markdownLeaf);

    const items = outline.containerEl.querySelectorAll<HTMLElement>(
      ".crisp-ann-outline-item",
    );
    expect(items[0].classList.contains("is-active")).toBe(false);
    expect(items[1].classList.contains("is-active")).toBe(true);
    expect(items[1].getAttribute("aria-current")).toBe("true");
  });

  it("removes every plugin-owned appearance marker on unload", () => {
    const { app } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.4.1",
      author: "letschips",
      minAppVersion: "1.5.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      colorTheme: "kindle",
    };
    const appearanceDocument = document.implementation.createHTMLDocument(
      "Crisp Annotations appearance cleanup",
    );

    (plugin as unknown as {
      applyAppearanceSettingsToDocument(document: Document): void;
    }).applyAppearanceSettingsToDocument(appearanceDocument);
    expect(appearanceDocument.body.getAttribute("data-crisp-ann-theme")).toBe(
      "kindle",
    );
    expect(appearanceDocument.body.getAttribute("data-crisp-ann-recall")).toBe(
      "false",
    );

    plugin.onunload();

    expect(appearanceDocument.body.hasAttribute("data-crisp-ann-theme")).toBe(
      false,
    );
    expect(appearanceDocument.body.hasAttribute("data-crisp-ann-recall")).toBe(
      false,
    );
  });

  it("applies recall mode and clears stale per-label state in every document", async () => {
    const { app } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.5.1",
      author: "letschips",
      minAppVersion: "1.8.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    const firstDocument = document.implementation.createHTMLDocument("first");
    const secondDocument = document.implementation.createHTMLDocument("second");
    firstDocument.body.innerHTML = '<span class="crisp-ann__label is-masked">One</span>';
    secondDocument.body.innerHTML = '<span class="crisp-ann__label is-revealed">Two</span>';
    const privatePlugin = plugin as unknown as {
      applyAppearanceSettingsToDocument(document: Document): void;
      setRecallMode(enabled: boolean, announce?: boolean): Promise<void>;
    };
    privatePlugin.applyAppearanceSettingsToDocument(firstDocument);
    privatePlugin.applyAppearanceSettingsToDocument(secondDocument);

    await privatePlugin.setRecallMode(true, false);

    for (const appearanceDocument of [firstDocument, secondDocument]) {
      expect(appearanceDocument.body.getAttribute("data-crisp-ann-recall")).toBe("true");
      expect(appearanceDocument.querySelector(".is-masked, .is-revealed")).toBeNull();
    }
    expect(plugin.settings.recallMode).toBe(true);
  });

  it("does not let a stale editor debounce overwrite a newly active leaf", async () => {
    vi.useFakeTimers();
    const { app, markdownLeaf, listeners } = createWorkspace();
    const manifest = {
      id: "crisp-annotations",
      name: "Crisp Annotations",
      version: "1.4.15",
      author: "letschips",
      minAppVersion: "1.5.0",
      description: "Hand-drawn inline annotations for Obsidian Markdown.",
    };
    const plugin = new CrispAnnotationsPlugin(app, manifest);
    plugin.app = app;
    plugin.manifest = manifest;
    await plugin.onload();
    const refresh = vi.spyOn(
      plugin as unknown as {
        refreshOutlineViews(source?: string, leaf?: WorkspaceLeaf): void;
      },
      "refreshOutlineViews",
    );

    listeners.get("editor-change")?.(
      { getValue: () => "旧文档" } as never,
      markdownLeaf.view as never,
    );
    listeners.get("active-leaf-change")?.(markdownLeaf as never);
    await vi.advanceTimersByTimeAsync(250);

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenLastCalledWith(SOURCE, markdownLeaf);
  });
});
