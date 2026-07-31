import { describe, expect, it } from "vitest";
import type { App, WorkspaceLeaf } from "obsidian";
import CrispAnnotationsPlugin from "../src/main";
import {
  CrispAnnotationsOutlineView,
  OUTLINE_VIEW_TYPE,
} from "../src/outline-view";
import { DEFAULT_SETTINGS } from "../src/settings";

const SOURCE = '正文 ==重点=={ann note="来自当前文档" place=right color=blue}';

interface MarkdownViewShape {
  containerEl: HTMLElement;
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
}

function createWorkspace(): TestWorkspace {
  const markdownView: MarkdownViewShape = {
    containerEl: document.createElement("div"),
    editor: {
      getValue: () => SOURCE,
    },
    getViewType: () => "markdown",
  };
  const markdownLeaf = {
    app: null,
    view: markdownView,
    setViewState: async () => {},
  } as unknown as WorkspaceLeaf;
  const outlineLeaves: WorkspaceLeaf[] = [];
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
    on: () => ({}),
    getLeaf: () => markdownLeaf,
    updateOptions: () => {},
    iterateAllLeaves: () => {},
    getActiveViewOfType: () => null,
  };
  const app = {
    workspace: workspace as unknown as App["workspace"],
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
  };
}

describe("annotation outline lifecycle", () => {
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
});
