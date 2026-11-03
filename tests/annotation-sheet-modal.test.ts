import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { SimpleAnnotationModal as AnnotationModal, nudgePlace, placeFromPoint } from "../src/annotation-sheet-modal";
import { previewTarget } from "../src/annotation-modal-presentation";
import type { AnnotationSpec } from "../src/annotation-syntax";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("SimpleAnnotationModal choices", () => {
  it("exposes placement and color choices as keyboard-operable pressed buttons", () => {
    const initial: AnnotationSpec = { note: "Keep this", color: "amber", place: "right", mark: true };
    const modal = new AnnotationModal({} as App, initial, false, DEFAULT_SETTINGS, vi.fn(), vi.fn(), "目标文字");
    modal.onOpen();

    const spots = [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".crisp-ann-sheet__spot")];
    const swatches = [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".crisp-ann-sheet__swatch")];
    expect(spots).toHaveLength(8);
    expect(swatches).toHaveLength(9);
    for (const button of [...spots, ...swatches]) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.type).toBe("button");
      expect(button.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
    }

    const selectedSpot = spots.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(selectedSpot?.title).toContain("右侧");
    spots[0]?.click();
    expect(spots[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedSpot?.getAttribute("aria-pressed")).toBe("false");

    const selectedSwatch = swatches.find((b) => b.getAttribute("aria-pressed") === "true");
    swatches[3]?.click();
    expect(swatches[3]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedSwatch?.getAttribute("aria-pressed")).toBe("false");
  });

  it("previews the real annotation markup and follows every choice", () => {
    const modal = new AnnotationModal({} as App, { note: "", color: "blue", place: "top", mark: false }, false, DEFAULT_SETTINGS, vi.fn(), vi.fn(), "  被标注的\n文字  ");
    modal.onOpen();
    const q = <T extends HTMLElement>(s: string) => modal.contentEl.querySelector<T>(s)!;
    const wrapper = q(".crisp-ann-sheet__paper .crisp-ann");
    expect(q(".crisp-ann__target").textContent).toBe("被标注的 文字");
    expect(wrapper.className).toContain("crisp-ann--top");
    expect(wrapper.classList.contains("crisp-ann--no-mark")).toBe(true);
    expect(q(".crisp-ann__label").classList.contains("is-placeholder")).toBe(true);

    const note = q<HTMLTextAreaElement>(".crisp-ann-sheet__note");
    note.value = "关键论据"; note.dispatchEvent(new Event("input"));
    expect(q(".crisp-ann__label").textContent).toBe("关键论据");
    q('.crisp-ann-sheet__spot[data-place="bottom-left"]').click();
    q('[data-color="green"]').click();
    q(".crisp-ann-sheet__mark").click();
    expect(wrapper.className).toContain("crisp-ann--bottom-left");
    expect(wrapper.className).toContain("crisp-ann--green");
    expect(wrapper.classList.contains("crisp-ann--no-mark")).toBe(false);
    modal.onClose();
  });
});

describe("placement helpers", () => {
  it("nudges one axis per arrow key and jumps across the empty centre", () => {
    expect(nudgePlace("right", "ArrowUp")).toBe("top-right");
    expect(nudgePlace("top-right", "ArrowUp")).toBe("top-right");
    expect(nudgePlace("bottom", "ArrowUp")).toBe("top");
    expect(nudgePlace("left", "ArrowRight")).toBe("right");
    expect(nudgePlace("top-left", "ArrowDown")).toBe("left");
  });

  it("maps a point around the target to the nearest of eight sectors on a wide stage", () => {
    expect(placeFromPoint(200, 0, 240, 90)).toBe("right");
    expect(placeFromPoint(180, -70, 240, 90)).toBe("top-right");
    expect(placeFromPoint(0, 80, 240, 90)).toBe("bottom");
    expect(placeFromPoint(-200, 60, 240, 90)).toBe("bottom-left");
    expect(placeFromPoint(5, 3, 240, 90)).toBeNull();
  });
});

it("shortens long preview targets by visual width", () => {
  expect(previewTarget("短句")).toBe("短句");
  expect(previewTarget("一二三四五六七八九十一二三四五六")).toBe("一二三四五六七八九十一二…");
  expect(previewTarget("there are actually a few optional steps")).toBe("there are actually a few…");
});

describe("sheet regressions", () => {
  function setup() {
    const settings = { ...DEFAULT_SETTINGS };
    const submit = vi.fn();
    const modal = new AnnotationModal({} as App, { note: "草稿", place: "right", color: "green", mark: true }, false, settings, vi.fn(), submit);
    modal.onOpen();
    return { modal, settings, submit, q: <T extends HTMLElement>(s: string) => modal.contentEl.querySelector<T>(s)! };
  }
  function pointer(el: EventTarget, type: string, x = 100, y = 0, id = 1) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(ev, "pointerId", { value: id });
    el.dispatchEvent(ev);
  }
  it("keeps custom color local until submission", () => {
    const { modal, q, settings } = setup();
    const before = settings.customColor;
    const picker = q<HTMLInputElement>('input[type="color"]');
    picker.value = "#123456"; picker.dispatchEvent(new Event("input"));
    expect(q('[data-color="custom"]').getAttribute("aria-pressed")).toBe("true");
    expect(settings.customColor).toBe(before);
    q(".crisp-ann-sheet__submit").click();
    expect(settings.customColor).toBe("#123456");
    modal.onClose();
  });
  it("swings the note with a stage drag and cleans up when closed", () => {
    const { modal, q } = setup();
    const stage = q(".crisp-ann-sheet__stage");
    pointer(stage, "pointerdown", 0, 100);
    expect(stage.dataset.place).toBe("bottom");
    modal.onClose();
    pointer(window, "pointermove", 0, -100);
    expect(stage.dataset.place).toBe("bottom");
    pointer(window, "pointerup");
  });
  it("ends cancelled drags and ignores other pointers", () => {
    const { modal, q } = setup();
    const stage = q(".crisp-ann-sheet__stage");
    pointer(stage, "pointerdown", 0, 100);
    pointer(window, "pointermove", 0, -100, 2);
    expect(stage.dataset.place).toBe("bottom");
    pointer(window, "pointercancel", 0, 100);
    pointer(window, "pointermove", 0, -100);
    expect(stage.dataset.place).toBe("bottom");
    modal.onClose();
  });
  it("exposes switch state and keyboard-operable settings", () => {
    const { modal, q } = setup();
    const mark = q(".crisp-ann-sheet__mark");
    expect(mark.getAttribute("aria-checked")).toBe("true");
    mark.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(mark.getAttribute("aria-checked")).toBe("false");
    expect(q(".crisp-ann-sheet__appearance").tagName).toBe("BUTTON");
    const spot = q('.crisp-ann-sheet__spot[data-place="right"]');
    spot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(q('.crisp-ann-sheet__spot[data-place="bottom-right"]').getAttribute("aria-pressed")).toBe("true");
    modal.onClose();
  });
  it("does not submit during IME composition", () => {
    const { modal, submit } = setup();
    const register = vi.spyOn(modal.scope, "register");
    modal.onClose(); modal.onOpen();
    const handler = register.mock.calls.find(c => c[1] === "Enter")![2] as (e: KeyboardEvent) => void;
    handler(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
    expect(submit).not.toHaveBeenCalled();
    modal.onClose();
  });
});

it("keeps an edited note available when the document rejects the write", () => {
  const modal = new AnnotationModal({} as App, { note: "保留草稿", place: "right", color: "blue", mark: true }, true, { ...DEFAULT_SETTINGS }, vi.fn(), () => false);
  const close = vi.spyOn(modal, "close");
  modal.onOpen();
  modal.contentEl.querySelector<HTMLButtonElement>(".crisp-ann-sheet__submit")!.click();
  expect(close).not.toHaveBeenCalled();
  expect(modal.contentEl.textContent).toContain("文档");
});

it("leaves global settings untouched when the document rejects the write", () => {
  const settings = { ...DEFAULT_SETTINGS, rememberLastChoice: true, lastUsedPlace: "bottom" as const, customColor: "#111111" };
  const modal = new AnnotationModal({} as App, { note: "草稿", place: "right", color: "custom", mark: false }, false, settings, vi.fn(), () => false);
  modal.onOpen();
  const picker = modal.contentEl.querySelector<HTMLInputElement>('input[type="color"]')!;
  picker.value = "#654321"; picker.dispatchEvent(new Event("input"));
  modal.contentEl.querySelector<HTMLButtonElement>(".crisp-ann-sheet__submit")!.click();
  expect(settings.lastUsedPlace).toBe("bottom");
  expect(settings.customColor).toBe("#111111");
  modal.onClose();
});

it("refuses an empty note without closing", () => {
  const modal = new AnnotationModal({} as App, { note: "   ", place: "right", color: "blue", mark: true }, false, { ...DEFAULT_SETTINGS }, vi.fn(), vi.fn());
  const close = vi.spyOn(modal, "close");
  modal.onOpen();
  modal.contentEl.querySelector<HTMLButtonElement>(".crisp-ann-sheet__submit")!.click();
  expect(close).not.toHaveBeenCalled();
  expect(modal.contentEl.querySelector(".crisp-ann-sheet__error")?.classList.contains("is-visible")).toBe(true);
});
