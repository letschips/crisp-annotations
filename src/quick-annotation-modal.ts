import {
  type App,
  Modal,
  Setting,
  type TextComponent,
} from "obsidian";
import type { AnnotationSpec } from "./annotation-syntax";

export class QuickAnnotationModal extends Modal {
  private noteValue = "";
  private inputComponent: TextComponent | null = null;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly targetText: string,
    private readonly initialSpec: AnnotationSpec,
    private readonly onSubmit: (spec: AnnotationSpec) => void,
  ) {
    super(app);
    this.noteValue = initialSpec.note;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("crisp-ann-quick-modal");

    contentEl.createEl("h3", {
      cls: "crisp-ann-quick-modal__title",
      text: "快速标注",
    });

    contentEl.createDiv({
      cls: "crisp-ann-quick-modal__target",
      text: `目标: "${this.targetText}"`,
    });

    new Setting(contentEl)
      .setClass("crisp-ann-quick-modal__field")
      .addText((text) => {
        this.inputComponent = text;
        text
          .setPlaceholder("输入笔记后按 Enter...")
          .setValue(this.noteValue)
          .onChange((val) => {
            this.noteValue = val;
            this.clearError();
          });
        text.inputEl.addClass("crisp-ann-quick-modal__input");
        text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            this.submit();
          }
        });
      });

    this.errorEl = contentEl.createDiv({
      cls: "crisp-ann-quick-modal__error",
      attr: { "aria-live": "polite" },
    });

    const footerEl = contentEl.createDiv("crisp-ann-quick-modal__footer");
    const cancelBtn = footerEl.createEl("button", { text: "取消" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footerEl.createEl("button", {
      cls: "mod-cta",
      text: "添加笔记",
    });
    submitBtn.addEventListener("click", () => this.submit());

    window.setTimeout(() => {
      this.inputComponent?.inputEl.focus();
      this.inputComponent?.inputEl.select();
    }, 30);
  }

  private submit(): void {
    const note = this.noteValue.trim();
    if (!note) {
      if (this.errorEl) {
        this.errorEl.textContent = "请先写一句简短笔记。";
      }
      this.inputComponent?.inputEl.focus();
      return;
    }

    const finalSpec: AnnotationSpec = {
      ...this.initialSpec,
      note,
    };
    this.close();
    this.onSubmit(finalSpec);
  }

  private clearError(): void {
    if (this.errorEl) {
      this.errorEl.textContent = "";
    }
  }

  onClose(): void {
    this.inputComponent = null;
    this.errorEl = null;
    this.contentEl.empty();
  }
}
