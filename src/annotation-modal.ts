import {
  type App,
  Modal,
  Setting,
  type TextAreaComponent,
} from "obsidian";
import {
  ANNOTATION_COLORS,
  type AnnotationColor,
  type AnnotationPlace,
  type AnnotationSpec,
} from "./annotation-syntax";
import { buildAnnotationModalPresentation } from "./annotation-modal-presentation";
import type { CrispAnnotationsSettings } from "./settings";
import { COLOR_LABELS, PLACE_LABELS } from "./constants";

export class AnnotationModal extends Modal {
  private draft: AnnotationSpec;
  private errorEl: HTMLElement | null = null;
  private noteInput: TextAreaComponent | null = null;

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
    this.contentEl.addClass("crisp-ann-modal");
    const presentation = buildAnnotationModalPresentation(this.settings);

    new Setting(this.contentEl)
      .setName("笔记")
      .setDesc("阅读模式下显示的简短标签。")
      .setClass("crisp-ann-modal__field")
      .setClass("crisp-ann-modal__field--note")
      .addTextArea((text) => {
        this.noteInput = text;
        text
          .setPlaceholder("写一句简短笔记…")
          .setValue(this.draft.note)
          .onChange((value) => {
            this.draft.note = value;
            this.setError("");
          });
        text.inputEl.rows = 2;
        text.inputEl.addClass("crisp-ann-modal__note");
        text.inputEl.focus();
      });

    this.errorEl = this.contentEl.createDiv({
      cls: "crisp-ann-modal__error",
      attr: {
        "aria-live": "polite",
      },
    });

    const choiceSection = this.contentEl.createDiv("crisp-ann-modal__choices");

    // Placement 3x3 Compass Grid
    const placeSetting = new Setting(choiceSection)
      .setName(presentation.placementName)
      .setDesc(presentation.placementDescription)
      .setClass("crisp-ann-modal__field")
      .setClass("crisp-ann-modal__field--compass");

    const compassContainer = placeSetting.settingEl.createDiv("crisp-ann-modal__compass-container");
    const compassGrid = compassContainer.createDiv("crisp-ann-modal__compass-grid");

    const compassCells: Array<{ place: AnnotationPlace | "center"; icon: string }> = [
      { place: "top-left", icon: "↖" },
      { place: "top", icon: "↑" },
      { place: "top-right", icon: "↗" },
      { place: "left", icon: "←" },
      { place: "center", icon: "Target" },
      { place: "right", icon: "→" },
      { place: "bottom-left", icon: "↙" },
      { place: "bottom", icon: "↓" },
      { place: "bottom-right", icon: "↘" },
    ];

    const placeButtons: Map<AnnotationPlace, HTMLButtonElement> = new Map();

    for (const cell of compassCells) {
      if (cell.place === "center") {
        const centerEl = compassGrid.createDiv("crisp-ann-modal__compass-btn crisp-ann-modal__compass-btn--center");
        centerEl.createSpan({ cls: "crisp-ann-modal__compass-target", text: "== Text ==" });
        continue;
      }
      const place: AnnotationPlace = cell.place;
      const btn = compassGrid.createEl("button", {
        cls: `crisp-ann-modal__compass-btn${place === this.draft.place ? " is-selected" : ""}`,
        attr: {
          type: "button",
          title: PLACE_LABELS[place],
          "aria-label": PLACE_LABELS[place],
          "aria-pressed": String(place === this.draft.place),
        },
      });
      btn.createSpan({ cls: "crisp-ann-modal__compass-icon", text: cell.icon });
      btn.addEventListener("click", () => {
        this.draft.place = place;
        for (const [p, b] of placeButtons) {
          const selected = p === place;
          b.classList.toggle("is-selected", selected);
          b.setAttribute("aria-pressed", String(selected));
        }
      });
      placeButtons.set(place, btn);
    }

    // Color Swatches
    const colorSetting = new Setting(choiceSection)
      .setName("颜色")
      .setDesc("随标注一起保存。")
      .setClass("crisp-ann-modal__field");

    const colorContainer = colorSetting.controlEl.createDiv("crisp-ann-modal__color-container");
    const colorSwatches = colorContainer.createDiv("crisp-ann-modal__color-swatches");
    const swatchButtons: Map<AnnotationColor, HTMLButtonElement> = new Map();

    for (const color of ANNOTATION_COLORS) {
      const selected = color === this.draft.color;
      const swatch = colorSwatches.createEl("button", {
        cls: `crisp-ann-modal__color-swatch${color === this.draft.color ? " is-selected" : ""}`,
        attr: {
          type: "button",
          "aria-label": `${COLOR_LABELS[color]} annotation color`,
          "aria-pressed": String(selected),
        },
      });
      swatch.createSpan({
        cls: "crisp-ann-modal__color-dot",
        attr: { "data-color": color },
      });
      swatch.createSpan({
        cls: "crisp-ann-modal__color-text",
        text: COLOR_LABELS[color],
      });
      swatch.addEventListener("click", () => {
        this.draft.color = color;
        for (const [c, s] of swatchButtons) {
          const isSelected = c === color;
          s.classList.toggle("is-selected", isSelected);
          s.setAttribute("aria-pressed", String(isSelected));
        }
      });
      swatchButtons.set(color, swatch);
    }

    new Setting(this.contentEl)
      .setName("高亮标注目标")
      .setDesc("当目标本身已有填充时可关闭。")
      .setClass("crisp-ann-modal__highlight")
      .addToggle((toggle) => toggle
        .setValue(this.draft.mark)
        .onChange((value) => {
          this.draft.mark = value;
        }));

    const appearanceDescription = this.contentEl.ownerDocument.createDocumentFragment();
    const chips = this.contentEl.ownerDocument.createElement("div");
    chips.className = "crisp-ann-modal__appearance-chips";
    appearanceDescription.append(chips);
    for (const label of presentation.summary.split(" · ")) {
      const chip = this.contentEl.ownerDocument.createElement("span");
      chip.className = "crisp-ann-modal__appearance-chip";
      chip.textContent = label;
      chips.append(chip);
    }
    const appearanceHint = this.contentEl.ownerDocument.createElement("div");
    appearanceHint.className = "crisp-ann-modal__appearance-hint";
    appearanceHint.textContent = "全局阅读外观";
    appearanceDescription.append(appearanceHint);

    new Setting(this.contentEl)
      .setName("阅读外观")
      .setDesc(appearanceDescription)
      .setClass("crisp-ann-modal__appearance")
      .addButton((button) => button
        .setButtonText("外观")
        .onClick(() => {
          this.onOpenSettings();
        }));

    new Setting(this.contentEl)
      .setClass("crisp-ann-modal__footer")
      .addButton((button) => button
        .setButtonText("取消")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setButtonText(this.editing ? "保存修改" : "添加标注")
        .onClick(() => this.submit()));

    this.scope.register(["Mod"], "Enter", (event) => {
      event.preventDefault();
      this.submit();
      return false;
    });
    this.scope.register([], "Escape", (event) => {
      event.preventDefault();
      this.close();
      return false;
    });
  }

  onClose(): void {
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
      this.setError("Add a short note to continue.");
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
