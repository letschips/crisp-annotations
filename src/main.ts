import {
  type ColorComponent,
  type Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type TextComponent,
  type WorkspaceLeaf,
} from "obsidian";
import { AnnotationModal } from "./annotation-modal";
import { QuickAnnotationModal } from "./quick-annotation-modal";
import {
  ANNOTATION_COLORS,
  ANNOTATION_PLACES,
  findAnnotationAt,
  findAnnotations,
  serializeAnnotation,
  type AnnotationColor,
  type AnnotationPlace,
  type AnnotationSpec,
} from "./annotation-syntax";
import { createAnnotationEditorExtension } from "./editor-extension";
import { addAnnotationContextMenuItem } from "./editor-menu";
import { registerIcons } from "./icons";
import {
  applyArrowAppearanceSettings,
  clearArrowAppearanceSettings,
} from "./arrow-settings";
import {
  applyAnnotationFontSettings,
  clearAnnotationFontSettings,
} from "./font-settings";
import { MarginLayoutManager } from "./margin-layout";
import {
  CrispAnnotationsOutlineView,
  OUTLINE_VIEW_TYPE,
} from "./outline-view";
import { verifyLicenseCode } from "./license";
import { renderAnnotationsInElement } from "./reading-renderer";
import { renderAboutCard } from "./settings-about";
import {
  ANNOTATION_FONT_MODES,
  ANNOTATION_LAYOUTS,
  ARROW_STROKE_STYLES,
  ARROW_STYLES,
  COLOR_THEME_LABELS,
  COLOR_THEMES,
  DEFAULT_SETTINGS,
  normalizeHexColor,
  normalizeSettings,
  type AnnotationFontMode,
  type AnnotationLayout,
  type ArrowStrokeStyle,
  type ArrowStyle,
  type ColorTheme,
  type CrispAnnotationsSettings,
} from "./settings";
import {
  ANNOTATION_LAYOUT_LABELS,
  ARROW_STROKE_LABELS,
  ARROW_STYLE_LABELS,
  COLOR_LABELS,
  FONT_MODE_LABELS,
  PLACE_LABELS,
} from "./constants";
import { normalizeAnnotationTarget, validateAnnotationTarget } from "./validation";

export default class CrispAnnotationsPlugin extends Plugin {
  settings: CrispAnnotationsSettings = { ...DEFAULT_SETTINGS };
  private readonly appearanceDocuments = new Set<Document>();
  private readonly marginLayout = new MarginLayoutManager(() => this.settings);
  private lastMarkdownLeaf: WorkspaceLeaf | null = null;
  private outlineRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  async onload(): Promise<void> {
    registerIcons();
    this.settings = normalizeSettings(await this.loadData());
    this.applyAppearanceSettings();
    this.registerEvent(this.app.workspace.on(
      "window-open",
      (_workspaceWindow, window) => this.applyAppearanceSettingsToDocument(window.document),
    ));
    this.registerEvent(this.app.workspace.on(
      "window-close",
      (_workspaceWindow, window) => this.appearanceDocuments.delete(window.document),
    ));

    this.registerMarkdownPostProcessor((element) => {
      renderAnnotationsInElement(element);
      this.marginLayout.schedule(element);
    });
    this.registerEditorExtension(createAnnotationEditorExtension(
      () => this.settings.editorPreview,
    ));

    this.registerView(
      OUTLINE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CrispAnnotationsOutlineView(leaf, () => this.settings),
    );

    this.addCommand({
      id: "add-or-edit-annotation",
      name: "Add or edit annotation",
      editorCallback: (editor) => this.openAnnotationModal(editor),
    });
    this.addCommand({
      id: "remove-annotation",
      name: "Remove annotation",
      editorCallback: (editor) => this.removeAnnotation(editor),
    });
    this.addCommand({
      id: "open-annotation-outline",
      name: "Open annotations outline",
      callback: () => this.openAnnotationOutline(),
    });
    this.addCommand({
      id: "add-quick-annotation",
      name: "Quick annotation",
      editorCallback: (editor) => this.openQuickAnnotationModal(editor),
    });
    this.addCommand({
      id: "export-annotations-summary",
      name: "Export annotations summary to clipboard",
      editorCallback: (editor) => this.exportAnnotationsSummary(editor),
    });

    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      addAnnotationContextMenuItem(
        menu,
        editor,
        (activeEditor) => this.openAnnotationModal(activeEditor),
        (activeEditor) => this.removeAnnotation(activeEditor),
        (activeEditor) => this.toggleQuickHighlight(activeEditor),
      );
    }));

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      const context = this.getMarkdownContext(leaf);
      if (context) {
        this.lastMarkdownLeaf = context.leaf;
        this.refreshOutlineViews(context.source, context.leaf);
        return;
      }
      this.refreshOutlineViews();
    }));

    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      const sourceLeaf = this.app.workspace.getLeavesOfType("markdown").find(
        (leaf) => leaf.view === info,
      ) ?? this.getMarkdownContext()?.leaf;
      if (sourceLeaf) {
        this.lastMarkdownLeaf = sourceLeaf;
      }
      const source = editor.getValue();
      if (this.outlineRefreshTimer !== null) {
        clearTimeout(this.outlineRefreshTimer);
      }
      this.outlineRefreshTimer = setTimeout(() => {
        this.outlineRefreshTimer = null;
        this.refreshOutlineViews(source, sourceLeaf);
      }, 200);
    }));

    this.addSettingTab(new CrispAnnotationsSettingTab(this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyAppearanceSettings();
    this.marginLayout.refreshAll();
    this.app.workspace.updateOptions();
  }

  onunload(): void {
    if (this.outlineRefreshTimer !== null) {
      clearTimeout(this.outlineRefreshTimer);
      this.outlineRefreshTimer = null;
    }
    this.marginLayout.destroy();
    for (const appearanceDocument of this.appearanceDocuments) {
      appearanceDocument.body.removeAttribute("data-crisp-ann-theme");
      clearAnnotationFontSettings(appearanceDocument.body.style);
      clearArrowAppearanceSettings(appearanceDocument.body.style);
    }
    this.appearanceDocuments.clear();
  }

  applyAppearanceSettings(): void {
    this.applyAppearanceSettingsToDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => {
      this.applyAppearanceSettingsToDocument(leaf.view.containerEl.ownerDocument);
    });
  }

  private applyAppearanceSettingsToDocument(appearanceDocument: Document): void {
    this.appearanceDocuments.add(appearanceDocument);
    appearanceDocument.body.setAttribute("data-crisp-ann-theme", this.settings.colorTheme);
    applyAnnotationFontSettings(appearanceDocument.body.style, this.settings);
    applyArrowAppearanceSettings(appearanceDocument.body.style, this.settings);
  }

  async ensureLicenseActivated(): Promise<boolean> {
    if (!this.settings.licenseCode) {
      new Notice("🔒 Crisp Annotations 未激活，请先在插件设置中激活 Crisp 授权。");
      return false;
    }
    const check = await verifyLicenseCode(this.settings.licenseCode, "crisp-annotations");
    if (!check.valid) {
      new Notice(`🔒 Crisp Annotations 授权无效: ${check.reason || "未激活"}`);
      return false;
    }
    return true;
  }

  private async openAnnotationModal(editor: Editor): Promise<void> {
    if (!(await this.ensureLicenseActivated())) return;
    const source = editor.getValue();
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const existing = findAnnotationAt(source, cursorOffset);
    const rawTarget = existing?.target ?? editor.getSelection();
    if (!rawTarget) {
      new Notice("请先选中文字，或将光标放在标注内。");
      return;
    }
    const { target, leadingTrim, trailingTrim } = normalizeAnnotationTarget(rawTarget);
    if (!target) {
      new Notice("请先选中文字，或将光标放在标注内。");
      return;
    }
    const validation = validateAnnotationTarget(target);
    if (!validation.valid) {
      new Notice(validation.error ?? "Invalid annotation target.");
      return;
    }

    const useLastChoice = this.settings.rememberLastChoice && !existing;
    const initial: AnnotationSpec = existing?.spec ?? {
      note: "",
      place: useLastChoice ? this.settings.lastUsedPlace : this.settings.defaultPlace,
      color: useLastChoice ? this.settings.lastUsedColor : this.settings.defaultColor,
      mark: useLastChoice ? this.settings.lastUsedMark : this.settings.defaultMark,
    };
    const from = existing
      ? editor.offsetToPos(existing.from)
      : editor.getCursor("from");
    const to = existing
      ? editor.offsetToPos(existing.to)
      : editor.getCursor("to");
    const trimmedFrom = editor.offsetToPos(editor.posToOffset(from) + leadingTrim);
    const trimmedTo = editor.offsetToPos(editor.posToOffset(to) - trailingTrim);

    new AnnotationModal(
      this.app,
      initial,
      Boolean(existing),
      this.settings,
      () => {
        const settings = (this.app as { setting?: { open(): void; openTabById(id: string): void } }).setting;
        settings?.open();
        settings?.openTabById(this.manifest.id);
      },
      async (spec) => {
        editor.replaceRange(serializeAnnotation(target, spec), trimmedFrom, trimmedTo);
        await this.saveSettings();
      },
    ).open();
  }

  private async openAnnotationOutline(): Promise<void> {
    const context = this.getMarkdownContext();
    if (context) {
      this.lastMarkdownLeaf = context.leaf;
    }
    const leaves = this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof CrispAnnotationsOutlineView && context) {
        view.refresh(context.source, context.leaf);
      }
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: OUTLINE_VIEW_TYPE,
        active: true,
      });
      const view = leaf.view;
      if (view instanceof CrispAnnotationsOutlineView && context) {
        view.refresh(context.source, context.leaf);
      }
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private getMarkdownContext(preferredLeaf?: WorkspaceLeaf | null): {
    leaf: WorkspaceLeaf;
    source: string;
  } | null {
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    const candidates = [
      preferredLeaf,
      this.app.workspace.activeLeaf,
      this.lastMarkdownLeaf,
      ...markdownLeaves,
    ];
    for (const leaf of candidates) {
      if (!leaf || !markdownLeaves.includes(leaf)) {
        continue;
      }
      const editor = (leaf.view as { editor?: { getValue(): string } } | null)?.editor;
      if (editor) {
        return { leaf, source: editor.getValue() };
      }
    }
    return null;
  }

  private refreshOutlineViews(
    source?: string,
    sourceLeaf?: WorkspaceLeaf | null,
  ): void {
    const context = source === undefined
      ? this.getMarkdownContext(sourceLeaf)
      : {
        source,
        leaf: sourceLeaf ?? this.getMarkdownContext()?.leaf ?? null,
      };
    if (!context) {
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CrispAnnotationsOutlineView) {
        view.refresh(context.source, context.leaf);
      }
    }
  }

  private async openQuickAnnotationModal(editor: Editor): Promise<void> {
    if (!(await this.ensureLicenseActivated())) return;
    const source = editor.getValue();
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const existing = findAnnotationAt(source, cursorOffset);
    const rawTarget = existing?.target ?? editor.getSelection();
    if (!rawTarget) {
      new Notice("请先选中文字，或将光标放在标注内。");
      return;
    }
    const { target, leadingTrim, trailingTrim } = normalizeAnnotationTarget(rawTarget);
    if (!target) {
      new Notice("请先选中文字，或将光标放在标注内。");
      return;
    }
    const validation = validateAnnotationTarget(target);
    if (!validation.valid) {
      new Notice(validation.error ?? "Invalid annotation target.");
      return;
    }

    const spec: AnnotationSpec = {
      note: existing?.spec.note ?? "",
      place: existing?.spec.place
        ?? (this.settings.rememberLastChoice ? this.settings.lastUsedPlace : this.settings.defaultPlace),
      color: existing?.spec.color
        ?? (this.settings.rememberLastChoice ? this.settings.lastUsedColor : this.settings.defaultColor),
      mark: existing?.spec.mark
        ?? (this.settings.rememberLastChoice ? this.settings.lastUsedMark : this.settings.defaultMark),
    };
    const from = existing
      ? editor.offsetToPos(existing.from)
      : editor.getCursor("from");
    const to = existing
      ? editor.offsetToPos(existing.to)
      : editor.getCursor("to");
    const trimmedFrom = editor.offsetToPos(editor.posToOffset(from) + leadingTrim);
    const trimmedTo = editor.offsetToPos(editor.posToOffset(to) - trailingTrim);

    new QuickAnnotationModal(
      this.app,
      target,
      spec,
      (finalSpec) => {
        editor.replaceRange(serializeAnnotation(target, finalSpec), trimmedFrom, trimmedTo);
        if (this.settings.rememberLastChoice) {
          this.settings.lastUsedPlace = finalSpec.place;
          this.settings.lastUsedColor = finalSpec.color;
          this.settings.lastUsedMark = finalSpec.mark;
          void this.saveSettings();
        }
      },
    ).open();
  }

  private removeAnnotation(editor: Editor): void {
    const source = editor.getValue();
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const existing = findAnnotationAt(source, cursorOffset);
    if (!existing) {
      new Notice("请将光标放在标注内以删除它。");
      return;
    }
    const replacement = existing.spec.mark
      ? `==${existing.target}==`
      : existing.target;
    editor.replaceRange(
      replacement,
      editor.offsetToPos(existing.from),
      editor.offsetToPos(existing.to),
    );
  }

  private toggleQuickHighlight(editor: Editor): void {
    const source = editor.getValue();
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const existing = findAnnotationAt(source, cursorOffset);
    if (!existing) {
      return;
    }
    const spec: AnnotationSpec = {
      ...existing.spec,
      mark: !existing.spec.mark,
    };
    const from = editor.offsetToPos(existing.from);
    const to = editor.offsetToPos(existing.to);
    editor.replaceRange(serializeAnnotation(existing.target, spec), from, to);
    if (this.settings.rememberLastChoice) {
      this.settings.lastUsedMark = spec.mark;
      void this.saveSettings();
    }
  }

  private exportAnnotationsSummary(editor: Editor): void {
    const source = editor.getValue();
    const matches = findAnnotations(source);
    if (matches.length === 0) {
      new Notice("当前文档中没有 Crisp 标注。");
      return;
    }
    const lines = [
      `# Crisp Annotations Summary (${matches.length})`,
      "",
      ...matches.map((match, index) => {
        const { target, spec } = match;
        const color = spec.color !== "neutral" ? ` [${spec.color}]` : "";
        const place = spec.place ? ` (${spec.place})` : "";
        return `${index + 1}. **${target}**${color}${place}: ${spec.note}`;
      }),
    ];
    const text = lines.join("\n");
    void navigator.clipboard.writeText(text).then(
      () => new Notice(`已复制 ${matches.length} 条标注到剪贴板！`),
      () => new Notice("复制标注到剪贴板失败。"),
    );
  }
}

class CrispAnnotationsSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: CrispAnnotationsPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    let customColorPicker: ColorComponent | null = null;
    let customColorInput: TextComponent | null = null;
    let customFontSetting: Setting | null = null;
    let curveSetting: Setting | null = null;
    let marginWidthSetting: Setting | null = null;

    const createGroup = (
      title: string,
      description: string,
      open = false,
    ): HTMLElement => {
      const details = this.containerEl.createEl("details", {
        cls: `crisp-ann-setting-card${open ? " is-open" : ""}`,
      });
      if (open) {
        details.open = true;
      }
      const summary = details.createEl("summary", {
        cls: "crisp-ann-setting-card__header",
      });

      const titleEl = summary.createDiv("crisp-ann-setting-card__title-group");
      titleEl.createDiv({ cls: "crisp-ann-setting-card__title", text: title });
      if (description) {
        titleEl.createDiv({ cls: "crisp-ann-setting-card__desc", text: description });
      }

      summary.createDiv({ cls: "crisp-ann-setting-card__chevron" });

      const contentWrapper = details.createDiv("crisp-ann-setting-card__content-wrapper");
      const body = contentWrapper.createDiv("crisp-ann-setting-card__body");

      summary.addEventListener("click", (evt) => {
        evt.preventDefault();
        if (details.classList.contains("is-closing")) {
          return;
        }
        if (details.open) {
          details.classList.remove("is-open");
          details.classList.add("is-closing");
          window.setTimeout(() => {
            details.open = false;
            details.classList.remove("is-closing");
          }, 240);
        } else {
          details.open = true;
          window.requestAnimationFrame(() => {
            details.classList.add("is-open");
          });
        }
      });

      return body;
    };

    const licenseGroup = createGroup(
      "软件授权",
      "纯离线 Ed25519 密钥激活验证",
      true,
    );

    const statusSetting = new Setting(licenseGroup)
      .setName("当前激活状态")
      .setDesc("正在验证授权状态...");

    if (this.plugin.settings.licenseCode) {
      void verifyLicenseCode(this.plugin.settings.licenseCode, "crisp-annotations").then((verifyRes) => {
        if (verifyRes.valid && verifyRes.payload) {
          statusSetting.setDesc(
            `✅ 已激活（授权给: ${verifyRes.payload.userName}，到期时间: ${verifyRes.payload.expiresAt.split("T")[0]}）`,
          );
        } else {
          statusSetting.setDesc(
            `❌ 未激活（${verifyRes.reason || "授权码无效"}）`,
          );
        }
      });
    } else {
      statusSetting.setDesc("❌ 未激活（尚未输入 Crisp 授权码）");
    }

    new Setting(licenseGroup)
      .setName("输入授权码")
      .setDesc("粘贴购买获取的 Crisp Suite 授权字符串进行离线激活。")
      .addText((text) => text
        .setPlaceholder("粘贴 Crisp 授权码...")
        .setValue(this.plugin.settings.licenseCode)
        .onChange(async (value) => {
          this.plugin.settings.licenseCode = value.trim();
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText("激活 / 重新验证")
        .setCta()
        .onClick(async () => {
          const result = await verifyLicenseCode(this.plugin.settings.licenseCode, "crisp-annotations");
          if (result.valid && result.payload) {
            new Notice(`🎉 Crisp Annotations 激活成功！欢迎使用，${result.payload.userName}`);
            this.display();
          } else {
            new Notice(`❌ 激活失败: ${result.reason}`);
          }
        }));

    const syncConditionalSettings = (): void => {
      customFontSetting?.settingEl.classList.toggle(
        "crisp-ann-setting--hidden",
        this.plugin.settings.annotationFontMode !== "custom",
      );
      marginWidthSetting?.settingEl.classList.toggle(
        "crisp-ann-setting--hidden",
        this.plugin.settings.annotationLayout === "inline",
      );
      curveSetting?.settingEl.classList.toggle(
        "crisp-ann-setting--hidden",
        this.plugin.settings.arrowStyle !== "custom-curve",
      );
    };

    this.containerEl.createEl("p", {
      cls: "crisp-ann-settings-intro",
      text: "默认值会写入新标注；阅读布局、笔记字体与连接线设置会更新所有标注。",
    });

    // 1. Defaults Group (Default Open)
    const defaultsBody = createGroup(
      "新标注默认值",
      "添加标注时，这些选项会写入 Markdown。",
      true,
    );

    new Setting(defaultsBody)
      .setName("默认位置")
      .setDesc("内联位置，或页边布局激活时的首选侧。")
      .addDropdown((dropdown) => {
        for (const place of ANNOTATION_PLACES) {
          dropdown.addOption(place, PLACE_LABELS[place]);
        }
        dropdown
          .setValue(this.plugin.settings.defaultPlace)
          .onChange(async (value) => {
            this.plugin.settings.defaultPlace = value as AnnotationPlace;
            await this.plugin.saveSettings();
          });
      });

    new Setting(defaultsBody)
      .setName("默认颜色")
      .setDesc("标注弹窗中初始选中的颜色。")
      .addDropdown((dropdown) => {
        for (const color of ANNOTATION_COLORS) {
          dropdown.addOption(color, COLOR_LABELS[color]);
        }
        dropdown
          .setValue(this.plugin.settings.defaultColor)
          .onChange(async (value) => {
            this.plugin.settings.defaultColor = value as AnnotationColor;
            await this.plugin.saveSettings();
          });
      });

    new Setting(defaultsBody)
      .setName("默认高亮标注目标")
      .setDesc("仍可在每个标注的弹窗中单独修改。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.defaultMark)
        .onChange(async (value) => {
          this.plugin.settings.defaultMark = value;
          await this.plugin.saveSettings();
        }));

    // 2. Reading Layout Group
    const layoutBody = createGroup(
      "阅读布局",
      "控制阅读模式下所有标注笔记的渲染位置。",
      false,
    );

    new Setting(layoutBody)
      .setName("标注布局")
      .setDesc("智能页边跟随每个标注的首选侧，并按需重新平衡。")
      .addDropdown((dropdown) => {
        for (const layout of ANNOTATION_LAYOUTS) {
          dropdown.addOption(layout, ANNOTATION_LAYOUT_LABELS[layout]);
        }
        dropdown
          .setValue(this.plugin.settings.annotationLayout)
          .onChange(async (value) => {
            this.plugin.settings.annotationLayout = value as AnnotationLayout;
            syncConditionalSettings();
            await this.plugin.saveSettings();
          });
      });

    marginWidthSetting = new Setting(layoutBody)
      .setName("页边笔记宽度")
      .setDesc("可选 140–260px；窄面板自动回退为内联。")
      .addSlider((slider) => slider
        .setLimits(140, 260, 10)
        .setValue(this.plugin.settings.marginNoteWidth)
        .setInstant(false)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.marginNoteWidth = value;
          await this.plugin.saveSettings();
        }));

    // 3. Appearance & Typography Group
    const appearanceBody = createGroup(
      "标注外观",
      "全局字体、主题预设与可复用的自定义颜色。",
      false,
    );

    new Setting(appearanceBody)
      .setName("颜色主题预设")
      .setDesc("切换全局配色（Classic、莫兰迪、Kindle Paper、赛博霓虹）。")
      .addDropdown((dropdown) => {
        for (const theme of COLOR_THEMES) {
          dropdown.addOption(theme, COLOR_THEME_LABELS[theme]);
        }
        dropdown
          .setValue(this.plugin.settings.colorTheme)
          .onChange(async (value) => {
            this.plugin.settings.colorTheme = value as ColorTheme;
            this.plugin.applyAppearanceSettings();
            await this.plugin.saveSettings();
          });
      });

    new Setting(appearanceBody)
      .setName("自定义标注颜色")
      .setDesc("用于所有保存颜色为「自定义」的标注。")
      .addColorPicker((picker) => {
        customColorPicker = picker;
        picker
          .setValue(this.plugin.settings.customColor)
          .onChange(async (value) => {
            const normalized = normalizeHexColor(value)
              ?? DEFAULT_SETTINGS.customColor;
            this.plugin.settings.customColor = normalized;
            customColorInput?.setValue(normalized);
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        customColorInput = text;
        text
          .setPlaceholder("#3b82f6")
          .setValue(this.plugin.settings.customColor);
        text.inputEl.maxLength = 7;
        text.inputEl.addClass("crisp-ann-setting-color-hex");
        text.inputEl.addEventListener("change", async () => {
          const normalized = normalizeHexColor(text.getValue());
          if (!normalized) {
            new Notice("请输入 3 或 6 位十六进制颜色，例如 #3b82f6。");
            text.setValue(this.plugin.settings.customColor);
            return;
          }
          this.plugin.settings.customColor = normalized;
          customColorPicker?.setValue(normalized);
          text.setValue(normalized);
          await this.plugin.saveSettings();
        });
      });

    new Setting(appearanceBody)
      .setName("标注字体")
      .setDesc("只影响标注笔记；目标文本保持正文字体。")
      .addDropdown((dropdown) => {
        for (const mode of ANNOTATION_FONT_MODES) {
          dropdown.addOption(mode, FONT_MODE_LABELS[mode]);
        }
        dropdown
          .setValue(this.plugin.settings.annotationFontMode)
          .onChange(async (value) => {
            this.plugin.settings.annotationFontMode = value as AnnotationFontMode;
            syncConditionalSettings();
            await this.plugin.saveSettings();
          });
      });

    customFontSetting = new Setting(appearanceBody)
      .setName("自定义字体族")
      .setDesc('CSS font-family，例如 "LXGW WenKai", cursive。')
      .addText((text) => {
        text
          .setPlaceholder('"LXGW WenKai", cursive')
          .setValue(this.plugin.settings.customFontFamily)
          .onChange(async (value) => {
            this.plugin.settings.customFontFamily = value;
            await this.plugin.saveSettings();
          });
      });

    // 4. Connector Group
    const connectorBody = createGroup(
      "连接线",
      "内联与页边标注共用的全局线条样式。",
      false,
    );

    new Setting(connectorBody)
      .setName("箭头样式")
      .setDesc("选择手绘、直线、自定义曲线、螺旋、波浪或双线。")
      .addDropdown((dropdown) => {
        for (const style of ARROW_STYLES) {
          dropdown.addOption(style, ARROW_STYLE_LABELS[style]);
        }
        dropdown
          .setValue(this.plugin.settings.arrowStyle)
          .onChange(async (value) => {
            this.plugin.settings.arrowStyle = value as ArrowStyle;
            syncConditionalSettings();
            await this.plugin.saveSettings();
          });
      });

    new Setting(connectorBody)
      .setName("箭头线条")
      .setDesc("使用实线或虚线连接；箭头保持清晰。")
      .addDropdown((dropdown) => {
        for (const style of ARROW_STROKE_STYLES) {
          dropdown.addOption(style, ARROW_STROKE_LABELS[style]);
        }
        dropdown
          .setValue(this.plugin.settings.arrowStrokeStyle)
          .onChange(async (value) => {
            this.plugin.settings.arrowStrokeStyle = value as ArrowStrokeStyle;
            await this.plugin.saveSettings();
          });
      });

    curveSetting = new Setting(connectorBody)
      .setName("自定义曲线")
      .setDesc("负值与正值使线条向相反方向弯曲。")
      .addSlider((slider) => slider
        .setLimits(-100, 100, 5)
        .setValue(this.plugin.settings.arrowCurve)
        .setInstant(false)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.arrowCurve = value;
          await this.plugin.saveSettings();
        }));

    // 5. Editing Group
    const editingBody = createGroup(
      "编辑",
      "控制写作时标注元数据的呈现方式。",
      false,
    );

    new Setting(editingBody)
      .setName("紧凑编辑器预览")
      .setDesc("用光标外的紧凑徽章替代标注元数据。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.editorPreview)
        .onChange(async (value) => {
          this.plugin.settings.editorPreview = value;
          await this.plugin.saveSettings();
        }));

    new Setting(editingBody)
      .setName("记住上次选择")
      .setDesc("新建标注时复用上次的位置、颜色与高亮选择。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.rememberLastChoice)
        .onChange(async (value) => {
          this.plugin.settings.rememberLastChoice = value;
          await this.plugin.saveSettings();
        }));

    syncConditionalSettings();
    renderAboutCard(
      this.containerEl,
      "Crisp Annotations",
      "把高亮、批注与思考线索自然留在 Obsidian 笔记中。",
    );
  }
}
