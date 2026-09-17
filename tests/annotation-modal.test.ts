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

describe("radio modal regressions", () => {
  function setup() {
    const settings = { ...DEFAULT_SETTINGS };
    const submit = vi.fn();
    const modal = new AnnotationModal({} as App, { note: "草稿", place: "right", color: "green", mark: true }, false, settings, vi.fn(), submit);
    modal.onOpen();
    return { modal, settings, submit, q: <T extends HTMLElement>(s: string) => modal.contentEl.querySelector<T>(s)! };
  }
  function pointer(el: EventTarget, type: string, x = 100, y = 0, id = 1) {
    const ev = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(ev, "pointerId", { value: id });
    el.dispatchEvent(ev);
  }
  it("does not rotate when opening the custom picker", () => {
    const { modal, q } = setup();
    pointer(q('.crisp-radio-knob__custom-hub'), 'pointerdown');
    expect(q('[data-color="green"]').getAttribute('aria-pressed')).toBe('true');
    modal.onClose();
  });
  it("keeps custom color local until submission", () => {
    const { modal, q, settings } = setup();
    const before = settings.customColor;
    const picker = q<HTMLInputElement>('input[type="color"]');
    picker.value = '#123456'; picker.dispatchEvent(new Event('input'));
    expect(settings.customColor).toBe(before);
    q('.crisp-radio-btn--submit').click();
    expect(settings.customColor).toBe('#123456');
    modal.onClose();
  });
  it("cleans up an active drag when closed", () => {
    const { modal, q } = setup();
    const badge = q('.crisp-radio-panel--place .crisp-radio-panel__badge');
    pointer(q('[data-dial="place"]'), 'pointerdown');
    modal.onClose();
    const before = badge.textContent;
    pointer(window, 'pointermove', 0, 100);
    expect(badge.textContent).toBe(before);
    pointer(window, 'pointerup');
  });
  it("ends cancelled drags and ignores other pointers", () => {
    const { modal, q } = setup();
    const badge = q('.crisp-radio-panel--place .crisp-radio-panel__badge');
    pointer(q('[data-dial="place"]'), 'pointerdown');
    const before = badge.textContent;
    pointer(window, 'pointermove', 0, 100, 2);
    expect(badge.textContent).toBe(before);
    pointer(window, 'pointercancel');
    pointer(window, 'pointermove', 0, 100);
    expect(badge.textContent).toBe(before);
    modal.onClose();
  });
  it("exposes switch state and keyboard-operable settings and custom color", () => {
    const { modal, q } = setup();
    const pill = q('.crisp-radio-pill-switch');
    expect(pill.getAttribute('aria-checked')).toBe('true');
    pill.click(); expect(pill.getAttribute('aria-checked')).toBe('false');
    expect(q('.crisp-radio-block').tagName).toBe('BUTTON');
    expect(q('.crisp-radio-knob__custom-hub').tabIndex).toBe(0);
    modal.onClose();
  });
  it("does not submit during IME composition", () => {
    const { modal, submit } = setup();
    const register = vi.spyOn(modal.scope, 'register');
    modal.onClose(); modal.onOpen();
    const handler = register.mock.calls.find(c => c[1] === 'Enter')![2] as (e: KeyboardEvent) => void;
    handler(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    expect(submit).not.toHaveBeenCalled();
    modal.onClose();
  });
});
