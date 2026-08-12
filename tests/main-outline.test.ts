import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, WorkspaceLeaf } from "obsidian";
import CrispAnnotationsPlugin from "../src/main";
import {
  CrispAnnotationsOutlineView,
  OUTLINE_VIEW_TYPE,
} from "../src/outline-view";
import { DEFAULT_SETTINGS } from "../src/settings";

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
}

function createWorkspace(): TestWorkspace {
  const sourceFile = {
    path: "Current.md",
    name: "Current.md",
    basename: "Current",
    extension: "md",
  };
  const markdownView: MarkdownViewShape = {
    containerEl: document.createElement("div"),
    editor: {
      getValue: () => SOURCE,
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
  };
}

describe("annotation outline lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
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

    plugin.onunload();

    expect(appearanceDocument.body.hasAttribute("data-crisp-ann-theme")).toBe(
      false,
    );
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
