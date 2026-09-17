import {
  type App,
  Modal,
  TextAreaComponent,
} from "obsidian";
import {
  type AnnotationColor,
  type AnnotationPlace,
  type AnnotationSpec,
} from "./annotation-syntax";
import type { CrispAnnotationsSettings } from "./settings";
import {
  ANNOTATION_LAYOUT_LABELS,
  ARROW_STROKE_LABELS,
  ARROW_STYLE_LABELS,
  COLOR_LABELS,
  FONT_MODE_LABELS,
  PLACE_LABELS,
} from "./constants";

interface PlaceDef {
  id: AnnotationPlace;
  angle: number;
  label: string;
  icon: string;
}

const PLACE_DEFS: PlaceDef[] = [
  { id: "top", angle: 0, label: "上方", icon: "↑" },
  { id: "top-right", angle: 45, label: "右上", icon: "↗" },
  { id: "right", angle: 90, label: "右侧", icon: "→" },
  { id: "bottom-right", angle: 135, label: "右下", icon: "↘" },
  { id: "bottom", angle: 180, label: "下方", icon: "↓" },
  { id: "bottom-left", angle: 225, label: "左下", icon: "↙" },
  { id: "left", angle: 270, label: "左侧", icon: "←" },
  { id: "top-left", angle: 315, label: "左上", icon: "↖" },
];

interface ColorDef {
  id: AnnotationColor;
  angle: number;
  label: string;
  bg: string;
}

const COLOR_DEFS: ColorDef[] = [
  { id: "neutral", angle: 0, label: "中性", bg: "#71717a" },
  { id: "amber", angle: 45, label: "琥珀", bg: "#d97706" },
  { id: "orange", angle: 90, label: "橙色", bg: "#ea580c" },
  { id: "blue", angle: 135, label: "蓝色", bg: "#2563eb" },
  { id: "green", angle: 180, label: "绿色", bg: "#16a34a" },
  { id: "red", angle: 225, label: "红色", bg: "#dc2626" },
  { id: "purple", angle: 270, label: "紫色", bg: "#9333ea" },
  { id: "rainbow", angle: 315, label: "彩虹", bg: "conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#8b5cf6,#ef4444)" },
];

function bindRotaryDrag(container: HTMLElement, onAngle: (deg: number) => void): () => void {
  const onPointerDown = (downEv: PointerEvent) => {
    if (downEv.button !== 0) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const computeDeg = (ev: MouseEvent | PointerEvent) => {
      const dx = ev.clientX - cx;
      const dy = ev.clientY - cy;
      let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
      if (deg < 0) deg += 360;
      return deg;
    };

    onAngle(computeDeg(downEv));

    const onPointerMove = (moveEv: PointerEvent) => {
      onAngle(computeDeg(moveEv));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  container.addEventListener("pointerdown", onPointerDown);
  return () => container.removeEventListener("pointerdown", onPointerDown);
}

export class AnnotationModal extends Modal {
  private draft: AnnotationSpec;
  private errorEl: HTMLElement | null = null;
  private noteInput: TextAreaComponent | null = null;
  private cleanups: Array<() => void> = [];

  constructor(
    app: App,
    initial: AnnotationSpec,
    private readonly editing: boolean,
    private readonly settings: CrispAnnotationsSettings,
    private readonly onOpenSettings: () => void,
    private readonly onSubmit: (spec: AnnotationSpec) => void,
  ) {
    super(app);
    this.draft = { ...initial };
  }

  onOpen(): void {
    this.setTitle(this.editing ? "编辑标注" : "添加标注");
    this.modalEl.addClass("crisp-ann-dialog");
    this.modalEl.addClass("crisp-radio-dialog");
    this.contentEl.addClass("crisp-ann-modal");
    this.contentEl.addClass("crisp-radio-modal");
    this.contentEl.empty();

    // 1. Radio Header Bar: Gooey Balls SVG Icon + "Annotation" only
    const header = this.contentEl.createDiv({ cls: "crisp-radio-header" });
    const brand = header.createDiv({ cls: "crisp-radio-header__brand" });
    const iconSpan = brand.createSpan({ cls: "crisp-radio-header__icon" });
    iconSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><defs><filter id="crisp-gooey-filter"><feGaussianBlur in="SourceGraphic" result="y" stdDeviation="1.5"/><feColorMatrix in="y" result="z" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -7"/><feBlend in="SourceGraphic" in2="z"/></filter></defs><g fill="currentColor" filter="url(#crisp-gooey-filter)"><circle cx="4" cy="12" r="3"><animate attributeName="cx" calcMode="spline" dur="0.75s" keySplines=".56,.52,.17,.98;.56,.52,.17,.98" repeatCount="indefinite" values="4;9;4"/><animate attributeName="r" calcMode="spline" dur="0.75s" keySplines=".56,.52,.17,.98;.56,.52,.17,.98" repeatCount="indefinite" values="3;8;3"/></circle><circle cx="15" cy="12" r="8"><animate attributeName="cx" calcMode="spline" dur="0.75s" keySplines=".56,.52,.17,.98;.56,.52,.17,.98" repeatCount="indefinite" values="15;20;15"/><animate attributeName="r" calcMode="spline" dur="0.75s" keySplines=".56,.52,.17,.98;.56,.52,.17,.98" repeatCount="indefinite" values="8;3;8"/></circle></g></svg>';
    brand.createSpan({ cls: "crisp-radio-header__title", text: "Annotation" });

    // 2. Note Screen (LCD Cassette)
    const screen = this.contentEl.createDiv({ cls: "crisp-radio-screen" });
    const sTop = screen.createDiv({ cls: "crisp-radio-screen__top" });
    const recDot = sTop.createSpan({
      cls: "crisp-radio-screen__rec" + (this.draft.note ? " is-active" : ""),
      text: this.draft.note ? "● 录入中" : "● 等待输入",
    });
    sTop.createSpan({ cls: "crisp-radio-screen__mode", text: "MARKDOWN · NOTE" });

    const sBody = screen.createDiv({ cls: "crisp-radio-screen__body" });
    const textComp = new TextAreaComponent(sBody);
    textComp.setPlaceholder("写一句简短笔记…");
    textComp.setValue(this.draft.note || "");
    textComp.inputEl.rows = 2;
    textComp.inputEl.addClass("crisp-radio-screen__textarea");
    this.noteInput = textComp;

    const sBottom = screen.createDiv({ cls: "crisp-radio-screen__bottom" });
    const charEl = sBottom.createSpan({
      cls: "crisp-radio-screen__meta",
      text: "CHARS · " + (this.draft.note || "").length,
    });
    sBottom.createSpan({
      cls: "crisp-radio-screen__scale",
      text: "········································································",
    });

    textComp.inputEl.addEventListener("input", () => {
      const val = textComp.inputEl.value;
      this.draft.note = val;
      this.setError("");
      charEl.textContent = "CHARS · " + val.length;
      const hasText = val.trim().length > 0;
      recDot.textContent = hasText ? "● 录入中" : "● 等待输入";
      recDot.classList.toggle("is-active", hasText);
    });

    this.errorEl = this.contentEl.createDiv({
      cls: "crisp-ann-modal__error crisp-radio-error",
      attr: { "aria-live": "polite" },
    });

    // 3. Middle Row: Placement Dial (Left), Highlight Switch (Center), Color Dial (Right)
    const controls = this.contentEl.createDiv({ cls: "crisp-radio-controls" });

    // 3A. Placement Dial
    const placePanel = controls.createDiv({ cls: "crisp-radio-panel crisp-radio-panel--place" });
    const placeHeader = placePanel.createDiv({ cls: "crisp-radio-panel__header" });
    placeHeader.createSpan({ cls: "crisp-radio-panel__title", text: "位置指向" });
    const placeBadge = placeHeader.createSpan({ cls: "crisp-radio-panel__badge" });

    const placeDial = placePanel.createDiv({
      cls: "crisp-radio-dial-container",
      attr: { "data-dial": "place" },
    });
    const placeBezel = placeDial.createDiv({ cls: "crisp-radio-dial-bezel" });
    const placeTicks = placeBezel.createDiv({ cls: "crisp-radio-dial-ticks" });
    const placeTickEls = new Map<AnnotationPlace, HTMLButtonElement>();

    for (const p of PLACE_DEFS) {
      const isSel = p.id === this.draft.place;
      const tick = placeTicks.createEl("button", {
        cls: `crisp-radio-dial-tick crisp-ann-modal__compass-btn${isSel ? " is-selected" : ""}`,
        attr: {
          type: "button",
          "data-id": p.id,
          title: PLACE_LABELS[p.id],
          "aria-label": PLACE_LABELS[p.id],
          "aria-pressed": String(isSel),
        },
      });
      tick.style.setProperty("--tick-angle", p.angle + "deg");
      tick.createSpan({ cls: "crisp-radio-dial-tick__marker" });
      tick.createSpan({ cls: "crisp-radio-dial-tick__icon", text: p.icon });
      placeTickEls.set(p.id, tick);
    }

    const placeKnob = placeBezel.createDiv({ cls: "crisp-radio-knob crisp-radio-knob--place" });
    const placeFace = placeKnob.createDiv({ cls: "crisp-radio-knob__face" });
    const placeNeedle = placeFace.createDiv({ cls: "crisp-radio-knob__needle" });
    placeNeedle.createDiv({ cls: "crisp-radio-knob__needle-line" });
    placeNeedle.createDiv({ cls: "crisp-radio-knob__needle-tip" });
    placeFace.createDiv({ cls: "crisp-radio-knob__center-cap" });

    const updatePlace = (newPlace: AnnotationPlace) => {
      this.draft.place = newPlace;
      const pDef = PLACE_DEFS.find((p) => p.id === newPlace) || PLACE_DEFS[2];
      placeNeedle.style.transform = `rotate(${pDef.angle}deg)`;
      placeBadge.textContent = `POS: ${pDef.label}`;
      for (const [id, el] of placeTickEls) {
        const isSel = id === newPlace;
        el.classList.toggle("is-selected", isSel);
        el.setAttribute("aria-pressed", String(isSel));
      }
    };
    updatePlace(this.draft.place);

    for (const p of PLACE_DEFS) {
      placeTickEls.get(p.id)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        updatePlace(p.id);
      });
    }

    const unbindPlaceDrag = bindRotaryDrag(placeDial, (deg) => {
      const sector = Math.round(deg / 45) % 8;
      const matched = PLACE_DEFS.find((p) => Math.round(p.angle / 45) === sector) || PLACE_DEFS[0];
      if (matched.id !== this.draft.place) {
        updatePlace(matched.id);
      }
    });
    this.cleanups.push(unbindPlaceDrag);

    // 3B. Center Pill Switch: Highlight Target
    const pill = controls.createDiv({
      cls: `crisp-radio-pill-switch${this.draft.mark ? " is-active" : ""}`,
      attr: { role: "button", tabindex: "0", title: "点击切换目标文字高亮" },
    });
    const pillIcon = pill.createDiv({ cls: "crisp-radio-pill-switch__icon" });
    pillIcon.createDiv({ cls: "crisp-radio-pill-switch__led" });
    const pillText = pill.createDiv({ cls: "crisp-radio-pill-switch__text" });
    const pillLabel = pillText.createSpan({
      cls: "crisp-radio-pill-switch__label",
      text: this.draft.mark ? "高亮 · ON" : "高亮 · OFF",
    });
    pillText.createSpan({ cls: "crisp-radio-pill-switch__sub", text: "文字底色" });

    const toggleMark = () => {
      this.draft.mark = !this.draft.mark;
      pill.classList.toggle("is-active", this.draft.mark);
      pillLabel.textContent = this.draft.mark ? "高亮 · ON" : "高亮 · OFF";
    };
    pill.addEventListener("click", toggleMark);
    pill.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggleMark();
      }
    });

    // 3C. Color Dial
    const colorPanel = controls.createDiv({ cls: "crisp-radio-panel crisp-radio-panel--color" });
    const colorHeader = colorPanel.createDiv({ cls: "crisp-radio-panel__header" });
    colorHeader.createSpan({ cls: "crisp-radio-panel__title", text: "标注颜色" });
    const colorBadge = colorHeader.createSpan({ cls: "crisp-radio-panel__badge" });

    const colorDial = colorPanel.createDiv({
      cls: "crisp-radio-dial-container",
      attr: { "data-dial": "color" },
    });
    const colorBezel = colorDial.createDiv({ cls: "crisp-radio-dial-bezel" });
    const colorDotEls = new Map<AnnotationColor, HTMLButtonElement>();

    for (const c of COLOR_DEFS) {
      const isSel = c.id === this.draft.color;
      const dot = colorBezel.createEl("button", {
        cls: `crisp-radio-dial-color-pip crisp-ann-modal__color-swatch${isSel ? " is-selected" : ""}`,
        attr: {
          type: "button",
          "data-color": c.id,
          title: COLOR_LABELS[c.id],
          "aria-label": `${COLOR_LABELS[c.id]} annotation color`,
          "aria-pressed": String(isSel),
        },
      });
      dot.style.setProperty("--pip-angle", c.angle + "deg");
      const pipCore = dot.createSpan({ cls: "crisp-radio-dial-color-pip__core" });
      pipCore.style.background = c.bg;
      colorDotEls.set(c.id, dot);
    }

    const colorKnob = colorBezel.createDiv({ cls: "crisp-radio-knob crisp-radio-knob--color" });
    const colorFace = colorKnob.createDiv({ cls: "crisp-radio-knob__face" });
    const colorNeedle = colorFace.createDiv({ cls: "crisp-radio-knob__needle" });
    colorNeedle.createDiv({ cls: "crisp-radio-knob__needle-line" });
    colorNeedle.createDiv({ cls: "crisp-radio-knob__needle-tip" });

    // Center Custom Color Hub
    const customHub = colorFace.createDiv({
      cls: `crisp-radio-knob__custom-hub${this.draft.color === "custom" ? " is-selected" : ""}`,
      attr: { title: "点击弹出自定义色盘" },
    });
    const customJewel = customHub.createDiv({ cls: "crisp-radio-knob__custom-jewel" });
    const curCustomHex = this.settings.customColor || "#3b82f6";
    customJewel.style.backgroundColor = curCustomHex;
    customHub.createSpan({ cls: "crisp-radio-knob__custom-label", text: "HEX" });

    const hiddenPicker = customHub.createEl("input", {
      cls: "crisp-radio-hidden-color-picker",
      attr: { type: "color", value: curCustomHex },
    });

    const updateColor = (newColor: AnnotationColor) => {
      this.draft.color = newColor;
      if (newColor === "custom") {
        colorNeedle.style.opacity = "0.25";
        colorNeedle.style.transform = "rotate(0deg)";
        customHub.classList.add("is-selected");
        const hexVal = this.settings.customColor || "#3b82f6";
        customJewel.style.backgroundColor = hexVal;
        colorBadge.textContent = "COL: " + hexVal.toUpperCase();
        for (const [, el] of colorDotEls) {
          el.classList.remove("is-selected");
          el.setAttribute("aria-pressed", "false");
        }
      } else {
        colorNeedle.style.opacity = "1";
        customHub.classList.remove("is-selected");
        const cDef = COLOR_DEFS.find((c) => c.id === newColor) || COLOR_DEFS[1];
        colorNeedle.style.transform = `rotate(${cDef.angle}deg)`;
        colorBadge.textContent = "COL: " + cDef.label;
        for (const [id, el] of colorDotEls) {
          const isSel = id === newColor;
          el.classList.toggle("is-selected", isSel);
          el.setAttribute("aria-pressed", String(isSel));
        }
      }
    };
    updateColor(this.draft.color);

    for (const c of COLOR_DEFS) {
      colorDotEls.get(c.id)?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        updateColor(c.id);
      });
    }

    const unbindColorDrag = bindRotaryDrag(colorDial, (deg) => {
      const sector = Math.round(deg / 45) % 8;
      const matched = COLOR_DEFS.find((c) => Math.round(c.angle / 45) === sector) || COLOR_DEFS[0];
      if (matched.id !== this.draft.color) {
        updateColor(matched.id);
      }
    });
    this.cleanups.push(unbindColorDrag);

    customHub.addEventListener("click", (ev) => {
      ev.stopPropagation();
      hiddenPicker.click();
    });

    hiddenPicker.addEventListener("input", (ev) => {
      const val = (ev.target as HTMLInputElement).value;
      this.settings.customColor = val;
      customJewel.style.backgroundColor = val;
      document.documentElement.style.setProperty("--crisp-ann-custom-color", val);
      updateColor("custom");
    });

    // 4. Reading Appearance Section: 4 Chunky Tactile Push Keys
    const appSection = this.contentEl.createDiv({ cls: "crisp-radio-appearance-section" });
    const appHeader = appSection.createDiv({ cls: "crisp-radio-appearance-header" });
    appHeader.createSpan({ cls: "crisp-radio-appearance-title", text: "阅读外观" });

    const blocksContainer = appSection.createDiv({ cls: "crisp-radio-blocks" });
    const blockData = [
      { tag: "布局", val: ANNOTATION_LAYOUT_LABELS[this.settings.annotationLayout] || "内联" },
      { tag: "箭头", val: ARROW_STYLE_LABELS[this.settings.arrowStyle] || "手绘" },
      { tag: "线型", val: ARROW_STROKE_LABELS[this.settings.arrowStrokeStyle] || "实线" },
      { tag: "字体", val: FONT_MODE_LABELS[this.settings.annotationFontMode] || "内置手写体" },
    ];

    for (const b of blockData) {
      const block = blocksContainer.createDiv({
        cls: "crisp-radio-block",
        attr: { role: "button", tabindex: "0", title: "点击打开外观设置" },
      });
      const bTop = block.createDiv({ cls: "crisp-radio-block__top" });
      bTop.createSpan({ cls: "crisp-radio-block__led" });
      bTop.createSpan({ cls: "crisp-radio-block__tag", text: b.tag });
      block.createDiv({ cls: "crisp-radio-block__val", text: b.val });
      block.addEventListener("click", () => this.onOpenSettings());
    }

    // 5. Action Buttons Footer: Appearance Button on Left, Cancel & Submit on Right
    const footer = this.contentEl.createDiv({ cls: "crisp-radio-footer" });

    const footerLeft = footer.createDiv({ cls: "crisp-radio-footer__left" });
    const appBtn = footerLeft.createEl("button", {
      cls: "crisp-radio-appearance-btn",
      attr: { type: "button" },
    });
    appBtn.createSpan({ cls: "crisp-radio-appearance-btn__icon", text: "⚙" });
    appBtn.createSpan({ cls: "crisp-radio-appearance-btn__text", text: "外观设置 ↗" });
    appBtn.addEventListener("click", () => this.onOpenSettings());

    const footerRight = footer.createDiv({ cls: "crisp-radio-footer__right" });
    const cancelBtn = footerRight.createEl("button", {
      cls: "crisp-radio-btn crisp-radio-btn--cancel",
      attr: { type: "button" },
    });
    cancelBtn.createSpan({ cls: "crisp-radio-btn__key", text: "ESC" });
    cancelBtn.createSpan({ cls: "crisp-radio-btn__text", text: "取消" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footerRight.createEl("button", {
      cls: "crisp-radio-btn crisp-radio-btn--submit",
      attr: { type: "button" },
    });
    submitBtn.createSpan({ cls: "crisp-radio-btn__led" });
    submitBtn.createSpan({ cls: "crisp-radio-btn__text", text: this.editing ? "保存修改" : "添加标注" });
    submitBtn.createSpan({ cls: "crisp-radio-btn__key", text: "↵" });
    submitBtn.addEventListener("click", () => this.submit());

    this.scope.register(["Mod"], "Enter", (ev) => {
      ev.preventDefault();
      this.submit();
      return false;
    });
    this.scope.register([], "Escape", (ev) => {
      ev.preventDefault();
      this.close();
      return false;
    });

    window.setTimeout(() => {
      this.noteInput?.inputEl.focus();
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
    this.errorEl.classList.toggle(
      "crisp-ann-modal__error--visible",
      Boolean(message),
    );
  }

  private submit(): void {
    const note = this.draft.note.trim();
    if (!note) {
      this.setError("请先写一句简短笔记。");
      this.noteInput?.inputEl.focus();
      return;
    }
    if (this.settings.rememberLastChoice) {
      this.settings.lastUsedPlace = this.draft.place;
      this.settings.lastUsedColor = this.draft.color;
      this.settings.lastUsedMark = this.draft.mark;
    }
    this.onSubmit({ ...this.draft, note });
    this.close();
  }
}
