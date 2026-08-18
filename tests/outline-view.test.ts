import { describe, expect, it, vi } from "vitest";
import {
  COLOR_HEX,
  COLOR_ICONS,
  CrispAnnotationsOutlineView,
  OUTLINE_VIEW_TYPE,
} from "../src/outline-view";
import { PLACE_LABELS } from "../src/constants";
import type { CrispAnnotationsSettings } from "../src/settings";
import type { WorkspaceLeaf } from "obsidian";
import { findAnnotations } from "../src/annotation-syntax";
import type { VaultAnnotationEntry } from "../src/vault-annotation-index";

/**
 * Adds Obsidian's extension methods (empty, createDiv, createSpan) to any HTMLElement.
 * Returns the same element, now with Obsidian-compatible methods.
 * Children created via createDiv/createSpan also get these extensions.
 */
function applyObsidianExtensions(el: HTMLElement): HTMLElement {
  const proto = el as unknown as Record<string, unknown>;

  proto.empty = function (this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
  };

  proto.createDiv = function (
    this: HTMLElement,
    opts?: { cls?: string; text?: string; attr?: Record<string, string> },
  ): HTMLElement {
    const child = document.createElement("div");
    applyObsidianExtensions(child);
    if (opts?.cls) child.className = opts.cls;
    if (opts?.text) child.textContent = opts.text;
    if (opts?.attr) {
      for (const [key, val] of Object.entries(opts.attr)) {
        child.setAttribute(key, val);
      }
    }
    this.appendChild(child);
    return child;
  };

  proto.createSpan = function (
    this: HTMLElement,
    opts?: { cls?: string; text?: string; attr?: Record<string, string> },
  ): HTMLElement {
    const child = document.createElement("span");
    applyObsidianExtensions(child);
    if (opts?.cls) child.className = opts.cls;
    if (opts?.text) child.textContent = opts.text;
    if (opts?.attr) {
      for (const [key, val] of Object.entries(opts.attr)) {
        child.setAttribute(key, val);
      }
    }
    this.appendChild(child);
    return child;
  };

  return el;
}

function createObsidianEl(): HTMLElement {
  return applyObsidianExtensions(document.createElement("div"));
}

function makeDummySettings(): CrispAnnotationsSettings {
  return {
    recallMode: false,
    defaultPlace: "bottom",
    defaultColor: "amber",
    defaultMark: true,
    editorPreview: true,
    annotationFontMode: "handwritten",
    customFontFamily: "",
    arrowStyle: "hand-drawn",
    arrowStrokeStyle: "solid",
    arrowCurve: 35,
    customColor: "#3b82f6",
    colorTheme: "modern",
    annotationLayout: "inline",
    marginNoteWidth: 180,
    rememberLastChoice: true,
    licenseCode: "",
    lastUsedPlace: "bottom",
    lastUsedColor: "amber",
    lastUsedMark: true,
  };
}

function vaultEntry(
  path: string,
  source: string,
): VaultAnnotationEntry {
  const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  const annotation = findAnnotations(source)[0];
  if (!annotation) {
    throw new Error(`Test fixture has no annotation: ${source}`);
  }
  return {
    file: { path, basename, name: `${basename}.md` },
    annotation,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDummyLeaf(): any {
  return {
    app: { workspace: { getLeavesOfType: () => [], activeLeaf: null } },
    view: { containerEl: document.createElement("div"), ownerDocument: document, getViewType: () => "" },
    setViewState: async () => {},
  };
}

describe("CrispAnnotationsOutlineView", () => {
  it("exports the correct outline view type string", () => {
    expect(OUTLINE_VIEW_TYPE).toBe("crisp-annotations-outline-view");
  });

  it("provides color icons for all annotation colors including custom", () => {
    const colors = [
      "neutral",
      "amber",
      "blue",
      "green",
      "red",
      "purple",
      "rainbow",
    ] as const;
    for (const color of colors) {
      expect(COLOR_ICONS[color]).toBeTruthy();
      expect(typeof COLOR_ICONS[color]).toBe("string");
      expect(COLOR_ICONS[color].length).toBeGreaterThan(0);
    }
  });

  it("provides hex color values for all annotation colors", () => {
    const colors = [
      "neutral",
      "amber",
      "blue",
      "green",
      "red",
      "purple",
      "rainbow",
      "custom",
    ] as const;
    for (const color of colors) {
      expect(COLOR_HEX[color]).toBeTruthy();
      expect(typeof COLOR_HEX[color]).toBe("string");
      if (color !== "custom") {
        expect(COLOR_HEX[color]).toMatch(/^#/);
      }
    }
    // Custom color uses a CSS variable as fallback
    expect(COLOR_HEX.custom).toContain("var(--crisp-ann-custom-color");
    expect(COLOR_HEX.custom).toContain("#3b82f6");
  });

  it("provides readable place labels for all annotation positions", () => {
    const places = [
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
      "top-left",
    ] as const;
    for (const place of places) {
      expect(PLACE_LABELS[place]).toBeTruthy();
      expect(typeof PLACE_LABELS[place]).toBe("string");
    }
    expect(PLACE_LABELS.right).toBe("右侧");
    expect(PLACE_LABELS.bottom).toBe("下方");
    expect(PLACE_LABELS["top-left"]).toBe("左上方");
  });

  it("constructs with correct view type, display text, and icon", () => {
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );

    expect(view.getViewType()).toBe(OUTLINE_VIEW_TYPE);
    expect(view.getDisplayText()).toBe("标注中心");
    expect(view.getIcon()).toBe("message-square-text");
  });

  it("lets readers switch between current-document and vault scopes", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh('==当前=={ann note="当前文档" color=blue}');

    const scopeButtons = container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    );
    expect(scopeButtons).toHaveLength(2);
    expect(scopeButtons[0].textContent).toBe("当前文档");
    expect(scopeButtons[0].getAttribute("aria-pressed")).toBe("true");
    expect(scopeButtons[1].textContent).toBe("整个仓库");
    expect(scopeButtons[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps vault results separate from the current document", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh('==当前=={ann note="只属于当前文档" color=blue}');
    const vaultButton = container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1];
    vaultButton.click();

    expect(container.textContent).not.toContain("只属于当前文档");
    expect(container.querySelector(".crisp-ann-outline-empty")?.textContent).toContain(
      "仓库中还没有标注",
    );
  });

  it("shows an honest loading state while the vault index is being built", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    view.setVaultLoading(true);
    view.refresh("No annotations here");

    container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    expect(container.querySelector(".crisp-ann-outline-empty")?.textContent).toContain(
      "正在索引仓库标注",
    );
  });

  it("groups vault annotations by file and shows their file paths", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    view.refreshVault([
      vaultEntry("Notes/Alpha.md", '==Alpha=={ann note="First" color=blue}'),
      vaultEntry("Notes/Alpha.md", '==More=={ann note="Second" color=green}'),
      vaultEntry("Projects/Beta.md", '==Beta=={ann note="Third" color=orange}'),
    ]);

    view.refresh("No annotations here");
    container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    expect(container.querySelectorAll(".crisp-ann-outline-file-group")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll(
      ".crisp-ann-outline-file-group__path",
    )).map((element) => element.textContent)).toEqual([
      "Notes/Alpha.md",
      "Projects/Beta.md",
    ]);
    expect(container.querySelectorAll(".crisp-ann-outline-item")).toHaveLength(3);
  });

  it("filters vault annotations by search text and color", () => {
    const container = createObsidianEl();
    document.body.appendChild(container);
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    view.refreshVault([
      vaultEntry(
        "Research/Displays.md",
        '==Framebuffer=={ann note="Memory insight" color=blue}',
      ),
      vaultEntry(
        "Research/Displays.md",
        '==Phosphor=={ann note="Screen detail" color=orange}',
      ),
    ]);
    view.refresh("No annotations here");
    container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    const search = container.querySelector<HTMLInputElement>(
      ".crisp-ann-outline-search__input",
    );
    expect(search).toBeTruthy();
    if (!search) return;
    search.focus();
    search.value = "memory";
    search.dispatchEvent(new Event("input"));
    expect(container.ownerDocument.activeElement).toBe(
      container.querySelector(".crisp-ann-outline-search__input"),
    );
    expect(container.querySelectorAll(".crisp-ann-outline-item")).toHaveLength(1);
    expect(container.textContent).toContain("Framebuffer");

    const color = container.querySelector<HTMLSelectElement>(
      ".crisp-ann-outline-search__color",
    );
    expect(color).toBeTruthy();
    if (!color) return;
    color.value = "orange";
    color.dispatchEvent(new Event("change"));
    expect(container.querySelectorAll(".crisp-ann-outline-item")).toHaveLength(0);
    expect(container.textContent).toContain("没有匹配的标注");
  });

  it("highlights the annotation nearest the reading viewport", () => {
    const container = createObsidianEl();
    const sourceLeaf = {
      view: {
        file: { path: "Current.md" },
        editor: {
          offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
          setCursor: () => {},
          scrollIntoView: () => {},
        },
      },
    };
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    const source = [
      '==First=={ann note="One" color=blue}',
      '==Second=={ann note="Two" color=green}',
    ].join("\n");
    const matches = findAnnotations(source);
    view.refresh(source, sourceLeaf as unknown as WorkspaceLeaf);

    view.setActiveAnnotation("Current.md", matches[1].from);

    const items = container.querySelectorAll<HTMLElement>(
      ".crisp-ann-outline-item",
    );
    expect(items[0].classList.contains("is-active")).toBe(false);
    expect(items[1].classList.contains("is-active")).toBe(true);
    expect(items[1].getAttribute("aria-current")).toBe("true");
  });

  it("renders annotation items from parsed source", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh('前 ==重要=={ann note="关键注释" place=top-right color=blue} 后');

    const items = container.querySelectorAll(".crisp-ann-outline-item");
    expect(items.length).toBe(1);
    const target = container.querySelector(".crisp-ann-outline-item__target");
    const note = container.querySelector(".crisp-ann-outline-item__note");
    const place = container.querySelector(".crisp-ann-outline-item__place");
    expect(target?.textContent).toBe("重要");
    expect(note?.textContent).toBe("关键注释");
    expect(place?.textContent).toBe("右上方");

    const item = items[0] as HTMLElement;
    expect(item.getAttribute("data-crisp-ann-from")).toBeTruthy();
    expect(item.getAttribute("data-crisp-ann-to")).toBeTruthy();
  });

  it("shows empty state when no annotations exist", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh("空文档，无批注");
    expect(container.querySelector(".crisp-ann-outline-empty")).toBeTruthy();
    expect(
      container.querySelector(".crisp-ann-outline-empty")?.textContent,
    ).toContain("当前文档没有标注");
  });

  it("shows 'No highlight' badge for mark=off annotations", () => {
    const container = createObsidianEl();
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh('==无高亮=={ann note="说明" mark=off}');
    expect(
      container.querySelector(".crisp-ann-outline-item__no-mark")?.textContent,
    ).toBe("无高亮");

    view.refresh('==有高亮=={ann note="说明" mark=on}');
    expect(
      container.querySelector(".crisp-ann-outline-item__no-mark"),
    ).toBeNull();
  });

  it("offers four compact actions without triggering item navigation", () => {
    const container = createObsidianEl();
    const onAction = vi.fn();
    let revealCount = 0;
    const sourceLeaf = {
      view: {
        file: { path: "Current.md" },
        editor: {
          offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
          setCursor: () => {},
          scrollIntoView: () => {},
        },
      },
    };
    const outlineLeaf = makeDummyLeaf();
    outlineLeaf.app.workspace = {
      activeLeaf: outlineLeaf,
      getLeavesOfType: (type: string) => type === "markdown" ? [sourceLeaf] : [],
      revealLeaf: () => { revealCount += 1; },
      setActiveLeaf: () => {},
    };
    const view = new CrispAnnotationsOutlineView(
      outlineLeaf,
      makeDummySettings,
      undefined,
      onAction,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    view.refresh(
      '==重要=={ann note="关键注释" color=blue}',
      sourceLeaf as unknown as WorkspaceLeaf,
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-item__action",
    );
    expect(Array.from(buttons).map((button) => button.getAttribute("aria-label")))
      .toEqual(["编辑标注", "关闭原文高亮", "复制标注内容", "删除标注"]);

    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();

    expect(onAction.mock.calls.map((call) => call[0])).toEqual([
      "edit",
      "toggle-mark",
      "copy",
      "remove",
    ]);
    expect(onAction.mock.calls[0][1]).toMatchObject({
      filePath: "Current.md",
      annotation: { target: "重要" },
    });
    expect(revealCount).toBe(0);
  });

  it("opens a vault result in a Markdown tab and jumps to its target", async () => {
    const container = createObsidianEl();
    const targetFile = {
      path: "Research/Displays.md",
      name: "Displays.md",
      basename: "Displays",
    };
    const openFile = vi.fn(async () => {});
    const setCursor = vi.fn();
    const scrollIntoView = vi.fn();
    const targetLeaf = {
      view: {
        file: targetFile,
        editor: {
          offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
          setCursor,
          scrollIntoView,
        },
      },
      openFile,
    };
    const outlineLeaf = makeDummyLeaf();
    outlineLeaf.app.vault = {
      getAbstractFileByPath: (path: string) => path === targetFile.path ? targetFile : null,
    };
    outlineLeaf.app.workspace = {
      activeLeaf: outlineLeaf,
      getLeavesOfType: () => [],
      getLeaf: () => targetLeaf,
      revealLeaf: vi.fn(),
      setActiveLeaf: vi.fn(),
    };
    const view = new CrispAnnotationsOutlineView(
      outlineLeaf,
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });
    view.refreshVault([
      vaultEntry(
        targetFile.path,
        '前 ==Framebuffer=={ann note="Memory insight" color=blue} 后',
      ),
    ]);
    view.refresh("No annotations here");
    container.querySelectorAll<HTMLButtonElement>(
      ".crisp-ann-outline-scope__button",
    )[1].click();

    (container.querySelector(".crisp-ann-outline-item") as HTMLElement).click();
    await vi.waitFor(() => expect(openFile).toHaveBeenCalledOnce());

    expect(openFile).toHaveBeenCalledWith(targetFile, { active: true });
    expect(setCursor).toHaveBeenCalledWith({ line: 0, ch: 4 });
    expect(scrollIntoView).toHaveBeenCalledWith({
      from: { line: 0, ch: 4 },
      to: { line: 0, ch: 15 },
    }, true);
  });

  it("navigates back to the markdown leaf that supplied the outline", () => {
    const container = createObsidianEl();
    const wrongLeaf = {
      view: {
        editor: {
          offsetToPos: () => ({ line: 0, ch: 0 }),
          setCursor: () => {},
          scrollIntoView: () => {},
        },
      },
    };
    const sourceLeaf = {
      view: {
        editor: {
          offsetToPos: (offset: number) => ({ line: 0, ch: offset }),
          setCursor: () => {},
          scrollIntoView: () => {},
        },
      },
    };
    let revealedLeaf: unknown = null;
    const outlineLeaf = makeDummyLeaf();
    outlineLeaf.app.workspace = {
      activeLeaf: outlineLeaf,
      getLeavesOfType: (type: string) => type === "markdown" ? [wrongLeaf, sourceLeaf] : [],
      revealLeaf: (leaf: unknown) => {
        revealedLeaf = leaf;
      },
      setActiveLeaf: () => {},
    };
    const view = new CrispAnnotationsOutlineView(
      outlineLeaf,
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh(
      '前 ==重要=={ann note="关键注释" place=top-right color=blue} 后',
      sourceLeaf as unknown as WorkspaceLeaf,
    );
    (container.querySelector(".crisp-ann-outline-item") as HTMLElement).click();

    expect(revealedLeaf).toBe(sourceLeaf);
  });

  it("activates the source leaf and centers the matching source line in reading mode", () => {
    const container = createObsidianEl();
    const applyScroll = vi.fn();

    const sourceLeaf = {
      view: {
        getMode: () => "preview",
        currentMode: {
          applyScroll,
        },
        editor: {
          offsetToPos: (offset: number) => (
            offset < 20
              ? { line: 0, ch: offset }
              : { line: 1, ch: offset - 20 }
          ),
          setCursor: () => {},
          scrollIntoView: () => {},
        },
      },
    };
    let activatedLeaf: unknown = null;
    let activationOptions: unknown = null;
    const outlineLeaf = makeDummyLeaf();
    outlineLeaf.app.workspace = {
      activeLeaf: outlineLeaf,
      getLeavesOfType: (type: string) => type === "markdown" ? [sourceLeaf] : [],
      revealLeaf: () => {},
      setActiveLeaf: (leaf: unknown, options: unknown) => {
        activatedLeaf = leaf;
        activationOptions = options;
      },
    };
    const view = new CrispAnnotationsOutlineView(
      outlineLeaf,
      makeDummySettings,
    );
    Object.defineProperty(view, "containerEl", { value: container });

    view.refresh(
      [
        '==第一处=={ann note="第一条" color=blue}',
        '==第二处=={ann note="第二条" color=green}',
      ].join("\n"),
      sourceLeaf as unknown as WorkspaceLeaf,
    );
    const items = container.querySelectorAll(".crisp-ann-outline-item");
    (items[1] as HTMLElement).click();

    expect(activatedLeaf).toBe(sourceLeaf);
    expect(activationOptions).toEqual({ focus: true });
    expect(applyScroll).toHaveBeenCalledWith(1, {
      center: true,
      highlight: true,
    });
  });
});
