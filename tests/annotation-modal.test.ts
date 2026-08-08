import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { AnnotationModal } from "../src/annotation-modal";
import { buildAnnotationModalPresentation } from "../src/annotation-modal-presentation";
import type { AnnotationSpec } from "../src/annotation-syntax";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("buildAnnotationModalPresentation", () => {
  it("explains placement and global appearance in margin mode", () => {
    expect(buildAnnotationModalPresentation({
      ...DEFAULT_SETTINGS,
      annotationLayout: "smart-margins",
      arrowStyle: "spiral",
      arrowStrokeStyle: "dashed",
    })).toEqual({
      placementDescription: "首选侧；智能页边可能重新平衡它的位置。",
      placementName: "首选位置",
      summary: "智能页边 · 螺旋 · 虚线 · 内置手写体",
    });
  });

  it("keeps ordinary placement language for inline mode", () => {
    expect(buildAnnotationModalPresentation(DEFAULT_SETTINGS).placementName)
      .toBe("位置");
  });
});

describe("AnnotationModal choices", () => {
  it("exposes placement and color choices as keyboard-operable pressed buttons", () => {
    const initial: AnnotationSpec = {
      note: "Keep this",
      color: "amber",
      place: "right",
      mark: true,
    };
    const modal = new AnnotationModal(
      {} as App,
      initial,
      false,
      DEFAULT_SETTINGS,
      vi.fn(),
      vi.fn(),
    );

    modal.onOpen();

    const placementButtons = [
      ...modal.contentEl.querySelectorAll<HTMLButtonElement>(
        ".crisp-ann-modal__compass-btn:not(.crisp-ann-modal__compass-btn--center)",
      ),
    ];
    const colorButtons = [
      ...modal.contentEl.querySelectorAll<HTMLButtonElement>(
        ".crisp-ann-modal__color-swatch",
      ),
    ];

    expect(placementButtons).toHaveLength(8);
    expect(colorButtons.length).toBeGreaterThan(1);
    for (const button of [...placementButtons, ...colorButtons]) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.type).toBe("button");
      expect(button.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
    }

    const selectedPlacement = placementButtons.find(
      (button) => button.getAttribute("aria-pressed") === "true",
    );
    expect(selectedPlacement?.title).toContain("右侧");

    placementButtons[0]?.click();
    expect(placementButtons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedPlacement?.getAttribute("aria-pressed")).toBe("false");

    const selectedColor = colorButtons.find(
      (button) => button.getAttribute("aria-pressed") === "true",
    );
    const lastColorButton = colorButtons[colorButtons.length - 1];
    lastColorButton?.click();
    expect(lastColorButton?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedColor?.getAttribute("aria-pressed")).toBe("false");
  });
});
