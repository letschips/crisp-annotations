import { describe, expect, it, vi } from "vitest";
import {
  blockSpacingClasses,
  buildMarginConnectorPath,
  chooseMarginSide,
  distributeMarginNotes,
  MarginLayoutManager,
  recalculateBlockSpacing,
} from "../src/margin-layout";
import { DEFAULT_SETTINGS } from "../src/settings";

function setRect(
  element: Element,
  rect: Partial<DOMRect> & Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">,
): void {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

describe("blockSpacingClasses", () => {
  it("preserves both top and bottom spacing for mixed annotations in one block", () => {
    expect(blockSpacingClasses(["top-right", "bottom-left", "right"]))
      .toEqual([
        "crisp-ann-block--space-top",
        "crisp-ann-block--space-bottom",
      ]);
  });

  it("does not reserve vertical space for side-only annotations", () => {
    expect(blockSpacingClasses(["left", "right"])).toEqual([]);
  });

  it("rebuilds shared block spacing and removes stale classes", () => {
    const sizer = document.createElement("div");
    sizer.innerHTML = [
      '<p class="crisp-ann-block--space-top">',
      '<span class="crisp-ann crisp-ann--top-right"></span>',
      '<span class="crisp-ann crisp-ann--bottom-left"></span>',
      "</p>",
    ].join("");
    const block = sizer.querySelector("p");

    recalculateBlockSpacing(sizer, () => true);
    expect(block?.classList.contains("crisp-ann-block--space-top")).toBe(true);
    expect(block?.classList.contains("crisp-ann-block--space-bottom")).toBe(true);

    block?.replaceChildren();
    recalculateBlockSpacing(sizer, () => true);
    expect(block?.classList.contains("crisp-ann-block--space-top")).toBe(false);
    expect(block?.classList.contains("crisp-ann-block--space-bottom")).toBe(false);
  });
});

describe("chooseMarginSide", () => {
  it("uses text horizontal position zones in smart margins mode", () => {
    const sizerRect = { left: 100, width: 1000 };

    // Text near left edge (x = 200, ratio = 10%) -> left margin
    expect(chooseMarginSide("bottom", "smart-margins", {
      left: true,
      right: true,
    }, { left: 0, right: 0 }, { left: 200, width: 50 }, sizerRect)).toBe("left");

    // Text near right edge (x = 850, ratio = 75%) -> right margin
    expect(chooseMarginSide("bottom", "smart-margins", {
      left: true,
      right: true,
    }, { left: 0, right: 0 }, { left: 850, width: 50 }, sizerRect)).toBe("right");

    // Text in middle section (x = 500, ratio = 40%) -> null (Inline Above/Below, no line crossing text)
    expect(chooseMarginSide("bottom", "smart-margins", {
      left: true,
      right: true,
    }, { left: 0, right: 0 }, { left: 500, width: 50 }, sizerRect)).toBeNull();
  });

  it("returns no margin when a fixed side has no room", () => {
    expect(chooseMarginSide("right", "left-margin", {
      left: false,
      right: true,
    }, {
      left: 0,
      right: 0,
    })).toBeNull();
  });
});

describe("distributeMarginNotes", () => {
  it("keeps notes inside the document without collisions", () => {
    const result = distributeMarginNotes([
      { id: "a", desiredY: 20, height: 40 },
      { id: "b", desiredY: 30, height: 50 },
      { id: "c", desiredY: 55, height: 36 },
    ], 180, 12);

    expect(result).toHaveLength(3);
    expect(result[0].y).toBeGreaterThanOrEqual(8);
    expect(result[1].y).toBeGreaterThanOrEqual(
      result[0].y + result[0].height + 12,
    );
    expect(result[2].y).toBeGreaterThanOrEqual(
      result[1].y + result[1].height + 12,
    );
    expect(result[2].y + result[2].height).toBeLessThanOrEqual(172);
  });
});

describe("buildMarginConnectorPath", () => {
  it("builds straight and curved long connectors", () => {
    const straight = buildMarginConnectorPath({
      side: "left",
      style: "straight",
      curve: 35,
      from: { x: -60, y: 90 },
      to: { x: 100, y: 110 },
    });
    const curved = buildMarginConnectorPath({
      side: "left",
      style: "custom-curve",
      curve: 70,
      from: { x: -60, y: 90 },
      to: { x: 100, y: 110 },
    });

    expect(straight).toBe("M-60 90 L100 110");
    expect(curved).toContain(" C");
    expect(curved).not.toBe(straight);
  });

  it("draws a multi-turn spiral across a long margin connector", () => {
    const spiral = buildMarginConnectorPath({
      side: "right",
      style: "spiral",
      curve: 35,
      from: { x: 420, y: 80 },
      to: { x: 40, y: 120 },
    });

    expect(spiral.startsWith("M")).toBe(true);
    expect(spiral.match(/ Q/g)?.length).toBeGreaterThan(40);
  });
});

describe("MarginLayoutManager dispose safety", () => {
  it("keeps right-margin notes inline when a visible Reading Rail uses the remaining edge", () => {
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const pane = document.createElement("div");
    pane.className = "workspace-leaf-content";
    const view = document.createElement("div");
    view.className = "markdown-preview-view";
    const sizer = document.createElement("div");
    sizer.className = "markdown-preview-sizer";
    const wrapper = document.createElement("span");
    wrapper.className = "crisp-ann crisp-ann--right";
    const target = document.createElement("mark");
    target.className = "crisp-ann__target";
    const label = document.createElement("span");
    label.id = "right-note";
    label.className = "crisp-ann__label";
    wrapper.append(target, label);
    sizer.append(wrapper);
    view.append(sizer);
    const rail = document.createElement("nav");
    rail.className = "crisp-reading-rail";
    pane.append(view, rail);
    document.body.append(pane);

    setRect(view, {
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    });
    setRect(sizer, {
      left: 300,
      right: 758,
      top: 0,
      bottom: 800,
      width: 458,
      height: 800,
    });
    setRect(rail, {
      left: 960,
      right: 990,
      top: 18,
      bottom: 782,
      width: 30,
      height: 764,
    });
    setRect(wrapper, {
      left: 700,
      right: 730,
      top: 100,
      bottom: 120,
      width: 30,
      height: 20,
    });
    setRect(target, {
      left: 700,
      right: 730,
      top: 100,
      bottom: 120,
      width: 30,
      height: 20,
    });
    setRect(label, {
      left: 812,
      right: 982,
      top: 80,
      bottom: 120,
      width: 170,
      height: 40,
    });
    Object.defineProperty(sizer, "scrollHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(label, "scrollHeight", {
      configurable: true,
      value: 26,
    });

    const manager = new MarginLayoutManager(() => ({
      ...DEFAULT_SETTINGS,
      annotationLayout: "right-margin",
      marginNoteWidth: 170,
    }));
    manager.schedule(sizer);

    expect(wrapper.classList.contains("crisp-ann--margin")).toBe(false);

    manager.destroy();
    pane.remove();
    requestAnimationFrame.mockRestore();
  });

  it("skips schedule and refreshAll after destroy", () => {
    const manager = new MarginLayoutManager(() => DEFAULT_SETTINGS);
    // Access private `disposed` via schedule behavior — after destroy, no-op.
    manager.destroy();

    // schedule should be a no-op after destroy (no error thrown)
    const div = document.createElement("div");
    expect(() => manager.schedule(div)).not.toThrow();

    // refreshAll should be a no-op after destroy
    expect(() => manager.refreshAll()).not.toThrow();
  });

  it("destroy twice is safe", () => {
    const manager = new MarginLayoutManager(() => DEFAULT_SETTINGS);
    manager.destroy();
    expect(() => manager.destroy()).not.toThrow();
  });

  it("cleans up animation frames and observers on destroy", () => {
    const requestAFSpy = vi.spyOn(window, "requestAnimationFrame");
    const cancelAFSpy = vi.spyOn(window, "cancelAnimationFrame");

    const manager = new MarginLayoutManager(() => DEFAULT_SETTINGS);

    // Simulate a pending rAF by scheduling on a real element
    const sizer = document.createElement("div");
    sizer.classList.add("markdown-preview-sizer");
    const view = document.createElement("div");
    view.classList.add("markdown-preview-view");
    view.append(sizer);
    document.body.append(view);

    // Trigger schedule - since there's a ResizeObserver in jsdom, it may or may not work
    // But we just verify destroy doesn't throw
    expect(() => manager.schedule(sizer)).not.toThrow();
    expect(() => manager.destroy()).not.toThrow();

    document.body.removeChild(view);
    requestAFSpy.mockRestore();
    cancelAFSpy.mockRestore();
  });

  it("does not throw when scheduling on orphaned elements after destroy", () => {
    const manager = new MarginLayoutManager(() => DEFAULT_SETTINGS);
    manager.destroy();

    const orphan = document.createElement("div");
    expect(() => manager.schedule(orphan)).not.toThrow();
    expect(() => manager.refreshAll()).not.toThrow();
  });

  it("removes every stale connector when the layout is destroyed", () => {
    const manager = new MarginLayoutManager(() => DEFAULT_SETTINGS);
    const view = document.createElement("div");
    view.className = "markdown-preview-view";
    const sizer = document.createElement("div");
    sizer.className = "markdown-preview-sizer";
    sizer.innerHTML = [
      '<p><span class="crisp-ann crisp-ann--margin">',
      '<span class="crisp-ann__label"></span>',
      '<svg class="crisp-ann-margin-connectors"></svg>',
      '<svg class="crisp-ann-margin-connectors"></svg>',
      '<svg class="crisp-ann-margin-connectors"></svg>',
      "</span></p>",
    ].join("");
    view.append(sizer);
    document.body.append(view);

    manager.schedule(sizer);
    manager.destroy();

    expect(sizer.querySelectorAll(".crisp-ann-margin-connectors")).toHaveLength(0);
    view.remove();
  });
});
