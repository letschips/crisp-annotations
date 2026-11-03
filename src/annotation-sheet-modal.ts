import {
  type App,
  Modal,
  setIcon,
} from "obsidian";
import {
  type AnnotationColor,
  type AnnotationPlace,
  type AnnotationSpec,
} from "./annotation-syntax";
import type { CrispAnnotationsSettings } from "./settings";
import { buildAnnotationModalPresentation, previewTarget } from "./annotation-modal-presentation";
import { COLOR_LABELS, PLACE_LABELS } from "./constants";

// Unit vectors on screen axes (y grows downward); order matches PLACE angle 0..315.
const PLACE_VECTORS: Array<{ id: AnnotationPlace; x: number; y: number }> = [
  { id: "top", x: 0, y: -1 },
  { id: "top-right", x: 1, y: -1 },
  { id: "right", x: 1, y: 0 },
  { id: "bottom-right", x: 1, y: 1 },
  { id: "bottom", x: 0, y: 1 },
  { id: "bottom-left", x: -1, y: 1 },
  { id: "left", x: -1, y: 0 },
  { id: "top-left", x: -1, y: -1 },
];

const PRESET_COLORS: AnnotationColor[] = [
  "neutral", "amber", "orange", "red", "green", "blue", "purple", "rainbow",
];

const ARROW_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};


function placeVector(place: AnnotationPlace): { x: number; y: number } {
  return PLACE_VECTORS.find((p) => p.id === place) ?? PLACE_VECTORS[2];
}

function placeFromVector(x: number, y: number): AnnotationPlace | null {
  return PLACE_VECTORS.find((p) => p.x === x && p.y === y)?.id ?? null;
}

// Arrow keys nudge one axis; stepping through the empty centre lands on the opposite side.
export function nudgePlace(place: AnnotationPlace, key: string): AnnotationPlace {
  const delta = ARROW_KEYS[key];
  if (!delta) return place;
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const v = placeVector(place);
  let x = clamp(v.x + delta[0]);
  let y = clamp(v.y + delta[1]);
  if (x === 0 && y === 0) {
    x = clamp(x + delta[0]);
    y = clamp(y + delta[1]);
  }
  return placeFromVector(x, y) ?? place;
}

// Sector of a point around the target, normalised to the stage so wide stages still split evenly.
export function placeFromPoint(dx: number, dy: number, halfWidth: number, halfHeight: number): AnnotationPlace | null {
  const nx = dx / Math.max(halfWidth, 1);
  const ny = dy / Math.max(halfHeight, 1);
  if (Math.hypot(nx, ny) < 0.12) return null;
  const deg = (Math.atan2(nx, -ny) * 180 / Math.PI + 360) % 360;
  return PLACE_VECTORS[Math.round(deg / 45) % 8].id;
}

export class SimpleAnnotationModal extends Modal {
  private draft: AnnotationSpec;
  private customColor: string;
  private errorEl: HTMLElement | null = null;
  private noteInput: HTMLTextAreaElement | null = null;
  private cleanups: Array<() => void> = [];

  constructor(
    app: App,
    initial: AnnotationSpec,
    private readonly editing: boolean,
    private readonly settings: CrispAnnotationsSettings,
    private readonly onOpenSettings: () => void,
    private readonly onSubmit: (spec: AnnotationSpec) => boolean | void,
    private readonly target = "",
  ) {
    super(app);
    this.draft = { ...initial };
    this.customColor = settings.customColor || "#3b82f6";
  }

  onOpen(): void {
    this.setTitle(this.editing ? "编辑标注" : "添加标注");
    this.modalEl.addClass("crisp-ann-sheet-dialog");
    this.contentEl.addClass("crisp-ann-sheet");
    this.contentEl.empty();
    const doc = this.contentEl.ownerDocument;
    const win = doc.defaultView ?? window;

    // 1. Stage: the real annotation markup, so arrow, stroke, font and theme match the note.
    const presentation = buildAnnotationModalPresentation(this.settings);
    const stage = this.contentEl.createDiv({
      cls: "crisp-ann-sheet__stage",
      attr: { role: "group", "aria-label": presentation.placementName, title: presentation.placementDescription },
    });
    const paper = stage.createDiv({ cls: "crisp-ann-sheet__paper markdown-rendered" });
    const wrapper = paper.createSpan({ cls: "crisp-ann" });
    const targetEl = wrapper.createEl("mark", {
      cls: "crisp-ann__target",
      text: previewTarget(this.target) || "所选文字",
    });
    const labelEl = wrapper.createSpan({ cls: "crisp-ann__label is-revealed" });

    const spotEls = new Map<AnnotationPlace, HTMLButtonElement>();
    for (const [index, p] of PLACE_VECTORS.entries()) {
      const angle = index * 45 * Math.PI / 180;
      const spot = stage.createEl("button", {
        cls: "crisp-ann-sheet__spot",
        attr: {
          type: "button",
          "data-place": p.id,
          title: PLACE_LABELS[p.id],
          "aria-label": PLACE_LABELS[p.id],
          "aria-pressed": "false",
        },
      });
      spot.style.setProperty("--spot-x", `${50 + Math.sin(angle) * 44}%`);
      spot.style.setProperty("--spot-y", `${50 - Math.cos(angle) * 38}%`);
      spotEls.set(p.id, spot);
    }

    const renderPreview = () => {
      wrapper.className = `crisp-ann crisp-ann--${this.draft.place} crisp-ann--${this.draft.color}`;
      wrapper.classList.toggle("crisp-ann--no-mark", !this.draft.mark);
      wrapper.style.setProperty("--crisp-ann-custom-color", this.customColor);
      const note = this.draft.note.trim();
      labelEl.textContent = note || "写点什么…";
      labelEl.classList.toggle("is-placeholder", !note);
      stage.dataset.place = this.draft.place;
    };

    const updatePlace = (place: AnnotationPlace) => {
      this.draft.place = place;
      for (const [id, el] of spotEls) {
        el.setAttribute("aria-pressed", String(id === place));
        el.tabIndex = id === place ? 0 : -1;
      }
      renderPreview();
    };

    for (const [id, el] of spotEls) {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        updatePlace(id);
      });
      el.addEventListener("keydown", (ev) => {
        if (!(ev.key in ARROW_KEYS)) return;
        ev.preventDefault();
        const next = nudgePlace(this.draft.place, ev.key);
        updatePlace(next);
        spotEls.get(next)?.focus();
      });
    }

    // Press anywhere on the stage (and drag) to swing the note around the target.
    let endDrag = () => {};
    const onStageDown = (down: PointerEvent) => {
      if (down.button !== 0 || (down.target as Element).closest("button")) return;
      endDrag();
      down.preventDefault();
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== down.pointerId) return;
        const stageRect = stage.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const place = placeFromPoint(
          ev.clientX - (targetRect.left + targetRect.width / 2),
          ev.clientY - (targetRect.top + targetRect.height / 2),
          stageRect.width / 2,
          stageRect.height / 2,
        );
        if (place && place !== this.draft.place) updatePlace(place);
      };
      const finish = (ev: PointerEvent) => {
        if (ev.pointerId === down.pointerId) endDrag();
      };
      endDrag = () => {
        stage.classList.remove("is-dragging");
        win.removeEventListener("pointermove", move);
        win.removeEventListener("pointerup", finish);
        win.removeEventListener("pointercancel", finish);
        win.removeEventListener("blur", endDrag);
        endDrag = () => {};
      };
      stage.classList.add("is-dragging");
      move(down);
      win.addEventListener("pointermove", move);
      win.addEventListener("pointerup", finish);
      win.addEventListener("pointercancel", finish);
      win.addEventListener("blur", endDrag);
    };
    stage.addEventListener("pointerdown", onStageDown);
    this.cleanups.push(() => {
      endDrag();
      stage.removeEventListener("pointerdown", onStageDown);
    });

    // 2. Note.
    const noteInput = this.contentEl.createEl("textarea", {
      cls: "crisp-ann-sheet__note",
      attr: { rows: "2", placeholder: "写下这条标注…", "aria-label": "标注笔记" },
    });
    noteInput.value = this.draft.note || "";
    this.noteInput = noteInput;
    const autosize = () => {
      noteInput.style.height = "auto";
      if (noteInput.scrollHeight > 0) noteInput.style.height = `${noteInput.scrollHeight + 2}px`;
    };
    noteInput.addEventListener("input", () => {
      this.draft.note = noteInput.value;
      this.setError("");
      autosize();
      renderPreview();
    });

    this.errorEl = this.contentEl.createDiv({
      cls: "crisp-ann-sheet__error",
      attr: { "aria-live": "polite" },
    });

    // 3. Color and highlight on one row.
    const row = this.contentEl.createDiv({ cls: "crisp-ann-sheet__row" });
    const colors = row.createDiv({ cls: "crisp-ann-sheet__colors", attr: { role: "group", "aria-label": "标注颜色" } });
    const swatchEls = new Map<AnnotationColor, HTMLButtonElement>();
    const addSwatch = (color: AnnotationColor) => {
      const swatch = colors.createEl("button", {
        cls: "crisp-ann-sheet__swatch",
        attr: {
          type: "button",
          "data-color": color,
          title: COLOR_LABELS[color],
          "aria-label": `${COLOR_LABELS[color]}标注颜色`,
          "aria-pressed": "false",
        },
      });
      swatch.createSpan({ cls: `crisp-ann-sheet__swatch-fill crisp-ann--${color}` });
      swatchEls.set(color, swatch);
      return swatch;
    };
    for (const color of PRESET_COLORS) addSwatch(color);
    const customSwatch = addSwatch("custom");
    customSwatch.title = "自定义颜色";
    const picker = customSwatch.createEl("input", {
      cls: "crisp-ann-sheet__picker",
      attr: { type: "color", value: this.customColor, tabindex: "-1", "aria-hidden": "true" },
    });

    const updateColor = (color: AnnotationColor) => {
      this.draft.color = color;
      for (const [id, el] of swatchEls) el.setAttribute("aria-pressed", String(id === color));
      customSwatch.style.setProperty("--crisp-ann-custom-color", this.customColor);
      renderPreview();
    };
    for (const [id, el] of swatchEls) {
      el.addEventListener("click", (ev) => {
        if (ev.target === picker) return;
        updateColor(id);
        if (id === "custom") picker.click();
      });
    }
    picker.addEventListener("input", () => {
      this.customColor = picker.value;
      updateColor("custom");
    });

    const markToggle = row.createDiv({
      cls: "crisp-ann-sheet__mark",
      attr: { role: "switch", tabindex: "0", "aria-checked": "false", "aria-label": "高亮原文" },
    });
    markToggle.createSpan({ cls: "crisp-ann-sheet__mark-label", text: "高亮原文" });
    const markTrack = markToggle.createDiv({ cls: "checkbox-container" });
    const updateMark = (mark: boolean) => {
      this.draft.mark = mark;
      markToggle.setAttribute("aria-checked", String(mark));
      markTrack.classList.toggle("is-enabled", mark);
      renderPreview();
    };
    markToggle.addEventListener("click", () => updateMark(!this.draft.mark));
    markToggle.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        updateMark(!this.draft.mark);
      }
    });

    // 4. Footer: global appearance summary on the left, actions on the right.
    const footer = this.contentEl.createDiv({ cls: "crisp-ann-sheet__footer" });
    const appearanceBtn = footer.createEl("button", {
      cls: "crisp-ann-sheet__appearance",
      attr: { type: "button", title: "外观设置" },
    });
    setIcon(appearanceBtn.createSpan({ cls: "crisp-ann-sheet__appearance-icon" }), "settings-2");
    const summaryEl = appearanceBtn.createSpan({ cls: "crisp-ann-sheet__appearance-text", text: presentation.summary });
    appearanceBtn.addEventListener("click", () => this.onOpenSettings());

    // Settings opens above this modal; refresh the summary when focus returns.
    this.contentEl.addEventListener("focusin", () => {
      const current = buildAnnotationModalPresentation(this.settings);
      summaryEl.textContent = current.summary;
      stage.setAttribute("aria-label", current.placementName);
      stage.title = current.placementDescription;
    });

    const actions = footer.createDiv({ cls: "crisp-ann-sheet__actions" });
    const cancelBtn = actions.createEl("button", {
      cls: "crisp-ann-sheet__cancel",
      attr: { type: "button" },
      text: "取消",
    });
    cancelBtn.addEventListener("click", () => this.close());
    const submitBtn = actions.createEl("button", {
      cls: "crisp-ann-sheet__submit mod-cta",
      attr: { type: "button" },
    });
    submitBtn.createSpan({ text: this.editing ? "保存" : "添加标注" });
    submitBtn.createEl("kbd", {
      cls: "crisp-ann-sheet__kbd",
      text: /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘↵" : "Ctrl ↵",
    });
    submitBtn.addEventListener("click", () => this.submit());

    this.scope.register(["Mod"], "Enter", (ev: KeyboardEvent) => {
      if (ev.isComposing || ev.keyCode === 229) return true;
      ev.preventDefault();
      this.submit();
      return false;
    });

    updatePlace(this.draft.place);
    updateColor(this.draft.color);
    updateMark(this.draft.mark);

    win.setTimeout(() => {
      if (!this.noteInput) return;
      autosize();
      this.noteInput.focus();
      const end = this.noteInput.value.length;
      this.noteInput.setSelectionRange(end, end);
    }, 30);
  }

  onClose(): void {
    for (const fn of this.cleanups) {
      try {
        fn();
      } catch {
        // noop
      }
    }
    this.cleanups = [];
    this.errorEl = null;
    this.noteInput = null;
    this.contentEl.empty();
  }

  private setError(message: string): void {
    if (!this.errorEl) {
      return;
    }
    this.errorEl.textContent = message;
    this.errorEl.classList.toggle("is-visible", Boolean(message));
  }

  private submit(): void {
    const note = this.draft.note.trim();
    if (!note) {
      this.setError("先写一句笔记。");
      this.noteInput?.focus();
      return;
    }
    // Settings are applied before onSubmit persists them, and rolled back if the write is refused.
    const previous = {
      lastUsedPlace: this.settings.lastUsedPlace,
      lastUsedColor: this.settings.lastUsedColor,
      lastUsedMark: this.settings.lastUsedMark,
      customColor: this.settings.customColor,
    };
    if (this.settings.rememberLastChoice) {
      this.settings.lastUsedPlace = this.draft.place;
      this.settings.lastUsedColor = this.draft.color;
      this.settings.lastUsedMark = this.draft.mark;
    }
    if (this.draft.color === "custom") this.settings.customColor = this.customColor;
    if (this.onSubmit({ ...this.draft, note }) === false) {
      Object.assign(this.settings, previous);
      this.setError("文档已变化，未写入标注。请复制笔记后重新选择目标。");
      return;
    }
    this.close();
  }
}
