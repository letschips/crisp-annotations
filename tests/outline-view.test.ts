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
    lastUsedPlace: "bottom",
    lastUsedColor: "amber",
    lastUsedMark: true,
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
    expect(PLACE_LABELS.right).toBe("Right");
    expect(PLACE_LABELS.bottom).toBe("Below");
    expect(PLACE_LABELS["top-left"]).toBe("Above left");
  });

  it("constructs with correct view type, display text, and icon", () => {
    const view = new CrispAnnotationsOutlineView(
      makeDummyLeaf(),
      makeDummySettings,
    );

    expect(view.getViewType()).toBe(OUTLINE_VIEW_TYPE);
    expect(view.getDisplayText()).toBe("Annotations outline");
    expect(view.getIcon()).toBe("message-square-text");
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
    expect(place?.textContent).toBe("Above right");

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
    ).toContain("No annotations");
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
    ).toBe("No highlight");

    view.refresh('==有高亮=={ann note="说明" mark=on}');
    expect(
      container.querySelector(".crisp-ann-outline-item__no-mark"),
    ).toBeNull();
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
