import {
  type ColorComponent,
  type Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type TextComponent,
  type TFile,
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
  type AnnotationMatch,
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
  type OutlineAnnotationAction,
  type OutlineAnnotationContext,
} from "./outline-view";
import { verifyLicenseCode } from "./license";
import {
  renderAnnotationsInElement,
  resetAnnotationMaskState,
} from "./reading-renderer";
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
import {
  VaultAnnotationIndex,
  type VaultMarkdownFile,
} from "./vault-annotation-index";
import {
  findReferencedAnnotation,
  transformReferencedAnnotation,
} from "./annotation-reference";
import {
  findAdjacentAnnotation,
  type AnnotationNavigationDirection,
} from "./annotation-navigation";
import { findClosestVisibleAnnotationIndex } from "./reading-position";

interface ReadingSourceIndex {
  annotations: AnnotationMatch[];
  lineOffsets: number[];
  source: string;
}

export default class CrispAnnotationsPlugin extends Plugin {
  settings: CrispAnnotationsSettings = { ...DEFAULT_SETTINGS };
  private readonly appearanceDocuments = new Set<Document>();
  private readonly marginLayout = new MarginLayoutManager(() => this.settings);
  private lastMarkdownLeaf: WorkspaceLeaf | null = null;
  private outlineRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private vaultAnnotationIndex: VaultAnnotationIndex | null = null;
  private vaultIndexReady = false;
  private vaultIndexBuild: Promise<void> | null = null;
  private readonly readingScrollDocuments = new Set<Document>();
  private readonly readingSyncFrames = new Map<Document, number>();
  private readonly readingSourceIndexes = new WeakMap<Editor, ReadingSourceIndex>();

  async onload(): Promise<void> {
    registerIcons();
    this.settings = normalizeSettings(await this.loadData());
    this.vaultAnnotationIndex = new VaultAnnotationIndex(async (file) => {
      const vaultFile = this.app.vault.getFileByPath(file.path);
      if (!vaultFile) {
        throw new Error(`Markdown file is no longer available: ${file.path}`);
      }
      return this.app.vault.cachedRead(vaultFile);
    });
    this.applyAppearanceSettings();
    this.registerReadingScrollDocument(document);
    this.app.workspace.iterateAllLeaves((leaf) => {
      this.registerReadingScrollDocument(leaf.view.containerEl.ownerDocument);
    });
    this.registerEvent(this.app.workspace.on(
      "window-open",
      (_workspaceWindow, window) => {
        this.applyAppearanceSettingsToDocument(window.document);
        this.registerReadingScrollDocument(window.document);
      },
    ));
    this.registerEvent(this.app.workspace.on(
      "window-close",
      (_workspaceWindow, window) => {
        const closedDocument = window.document;
        this.appearanceDocuments.delete(closedDocument);
        this.readingScrollDocuments.delete(closedDocument);
        const frame = this.readingSyncFrames.get(closedDocument);
        if (frame !== undefined) {
          closedDocument.defaultView?.cancelAnimationFrame(frame);
          this.readingSyncFrames.delete(closedDocument);
        }
      },
    ));

    this.registerMarkdownPostProcessor((element, context) => {
      const sectionInfo = context.getSectionInfo(element);
      renderAnnotationsInElement(element, (wrapper) => {
        void this.editRenderedAnnotation(context.sourcePath, wrapper);
      });
      this.marginLayout.schedule(element);
      const leaf = this.findMarkdownLeaf(context.sourcePath, element);
      if (leaf) {
        const editor = (leaf.view as { editor?: Editor }).editor;
        if (editor && sectionInfo) {
          const sourceIndex = this.getReadingSourceIndex(editor);
          const sectionStart = sourceIndex.lineOffsets[sectionInfo.lineStart]
            ?? sourceIndex.source.length;
          const sectionEnd = sourceIndex.lineOffsets[sectionInfo.lineEnd + 1]
            ?? sourceIndex.source.length;
          const sectionAnnotations = sourceIndex.annotations.filter((annotation) => (
            annotation.from >= sectionStart && annotation.from < sectionEnd
          ));
          const wrappers = element.querySelectorAll<HTMLElement>(".crisp-ann");
          const unusedAnnotations = [...sectionAnnotations];
          for (const [index, wrapper] of Array.from(wrappers).entries()) {
            let annotation = wrappers.length === sectionAnnotations.length
              ? sectionAnnotations[index]
              : undefined;
            if (!annotation) {
              const target = wrapper.querySelector<HTMLElement>(
                ".crisp-ann__target",
              )?.textContent ?? "";
              const note = wrapper.querySelector<HTMLElement>(
                ".crisp-ann__label",
              )?.textContent ?? "";
              const matchingIndex = unusedAnnotations.findIndex((candidate) => (
                candidate.target === target && candidate.spec.note === note
              ));
              if (matchingIndex >= 0) {
                annotation = unusedAnnotations.splice(matchingIndex, 1)[0];
              }
            }
            if (annotation) {
              wrapper.dataset.crispAnnFrom = String(annotation.from);
            }
          }
        }
        this.scheduleReadingSync(leaf);
      }
    });
    this.registerEditorExtension(createAnnotationEditorExtension(
      () => this.settings.editorPreview,
    ));

    this.registerView(
      OUTLINE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CrispAnnotationsOutlineView(
        leaf,
        () => this.settings,
        () => { void this.ensureVaultIndex(); },
        (action, context) => { void this.handleOutlineAction(action, context); },
      ),
    );

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (this.isMarkdownFile(file)) {
        void this.updateVaultIndexFile(file);
      }
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (this.isMarkdownFile(file)) {
        void this.updateVaultIndexFile(file);
      }
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (!this.vaultIndexReady || !this.vaultAnnotationIndex) {
        return;
      }
      this.vaultAnnotationIndex.remove(file.path);
      this.refreshVaultOutlineViews();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!this.vaultIndexReady || !this.vaultAnnotationIndex) {
        return;
      }
      if (this.isMarkdownFile(file)) {
        this.vaultAnnotationIndex.rename(oldPath, this.toVaultMarkdownFile(file));
      } else {
        this.vaultAnnotationIndex.remove(oldPath);
      }
      this.refreshVaultOutlineViews();
    }));

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
      name: "Open annotation center",
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
    this.addCommand({
      id: "toggle-active-recall-mode",
      name: "Toggle active recall / mask mode (切换批注遮罩自测模式)",
      callback: () => {
        void this.setRecallMode(!this.settings.recallMode, true);
      },
    });
    this.addCommand({
      id: "previous-annotation",
      name: "Go to previous annotation",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "ArrowUp" }],
      callback: () => this.navigateAdjacentAnnotation("previous"),
    });
    this.addCommand({
      id: "next-annotation",
      name: "Go to next annotation",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "ArrowDown" }],
      callback: () => this.navigateAdjacentAnnotation("next"),
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
      this.cancelOutlineRefresh();
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
      const sourceFile = (sourceLeaf?.view as { file?: TFile } | undefined)?.file;
      if (sourceFile) {
        void this.updateVaultIndexFile(sourceFile, source);
      }
      this.cancelOutlineRefresh();
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
    this.cancelOutlineRefresh();
    this.marginLayout.destroy();
    for (const [readingDocument, frame] of this.readingSyncFrames) {
      readingDocument.defaultView?.cancelAnimationFrame(frame);
    }
    this.readingSyncFrames.clear();
    this.readingScrollDocuments.clear();
    for (const appearanceDocument of this.appearanceDocuments) {
      appearanceDocument.body.removeAttribute("data-crisp-ann-theme");
      appearanceDocument.body.removeAttribute("data-crisp-ann-recall");
      clearAnnotationFontSettings(appearanceDocument.body.style);
      clearArrowAppearanceSettings(appearanceDocument.body.style);
    }
    this.appearanceDocuments.clear();
  }

  private cancelOutlineRefresh(): void {
    if (this.outlineRefreshTimer === null) {
      return;
    }
    clearTimeout(this.outlineRefreshTimer);
    this.outlineRefreshTimer = null;
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
    appearanceDocument.body.setAttribute(
      "data-crisp-ann-recall",
      String(this.settings.recallMode),
    );
    applyAnnotationFontSettings(appearanceDocument.body.style, this.settings);
    applyArrowAppearanceSettings(appearanceDocument.body.style, this.settings);
  }

  async setRecallMode(enabled: boolean, announce = false): Promise<void> {
    this.settings.recallMode = enabled;
    this.applyAppearanceSettings();
    for (const appearanceDocument of this.appearanceDocuments) {
      appearanceDocument.body.setAttribute(
        "data-crisp-ann-recall",
        String(enabled),
      );
      resetAnnotationMaskState(appearanceDocument, enabled);
    }
    await this.saveData(this.settings);
    this.marginLayout.refreshAll();
    this.app.workspace.updateOptions();
    if (announce) {
      new Notice(enabled
        ? "💡 Crisp Annotations: 已开启自测遮罩模式（点击批注揭晓）"
        : "👁️ Crisp Annotations: 已退出自测遮罩模式（显示所有批注）");
    }
  }

  private registerReadingScrollDocument(readingDocument: Document): void {
    if (this.readingScrollDocuments.has(readingDocument)) {
      return;
    }
    this.readingScrollDocuments.add(readingDocument);
    this.registerDomEvent(readingDocument, "scroll", (event) => {
      const target = event.target && "nodeType" in event.target
        ? event.target as Node
        : null;
      const leaf = this.app.workspace.getLeavesOfType("markdown").find((candidate) => {
        const container = candidate.view.containerEl;
        return container.ownerDocument === readingDocument
          && (!target || target === readingDocument || container.contains(target));
      }) ?? this.findMarkdownLeaf(undefined, undefined, readingDocument);
      if (leaf) {
        this.scheduleReadingSync(leaf);
      }
    }, true);
  }

  private getReadingSourceIndex(editor: Editor): ReadingSourceIndex {
    const source = editor.getValue();
    const cached = this.readingSourceIndexes.get(editor);
    if (cached?.source === source) {
      return cached;
    }
    const lineOffsets = [0];
    for (let offset = source.indexOf("\n"); offset !== -1; offset = source.indexOf(
      "\n",
      offset + 1,
    )) {
      lineOffsets.push(offset + 1);
    }
    const sourceIndex = {
      annotations: findAnnotations(source),
      lineOffsets,
      source,
    };
    this.readingSourceIndexes.set(editor, sourceIndex);
    return sourceIndex;
  }

  private findMarkdownLeaf(
    filePath?: string,
    element?: HTMLElement,
    ownerDocument?: Document,
  ): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const containingLeaf = element
      ? leaves.find((leaf) => leaf.view.containerEl.contains(element))
      : null;
    if (containingLeaf) {
      return containingLeaf;
    }
    if (filePath) {
      const fileLeaf = leaves.find((leaf) => (
        (leaf.view as { file?: { path?: string } }).file?.path === filePath
        && (!ownerDocument || leaf.view.containerEl.ownerDocument === ownerDocument)
      ));
      if (fileLeaf) {
        return fileLeaf;
      }
    }
    const activeLeaf = this.app.workspace.activeLeaf;
    if (
      activeLeaf
      && leaves.includes(activeLeaf)
      && (!ownerDocument || activeLeaf.view.containerEl.ownerDocument === ownerDocument)
    ) {
      return activeLeaf;
    }
    return leaves.find((leaf) => (
      !ownerDocument || leaf.view.containerEl.ownerDocument === ownerDocument
    )) ?? null;
  }

  private scheduleReadingSync(leaf: WorkspaceLeaf): void {
    const readingDocument = leaf.view.containerEl.ownerDocument;
    const readingWindow = readingDocument.defaultView;
    if (!readingWindow || this.readingSyncFrames.has(readingDocument)) {
      return;
    }
    const frame = readingWindow.requestAnimationFrame(() => {
      this.readingSyncFrames.delete(readingDocument);
      this.syncActiveAnnotationFromReading(leaf);
    });
    this.readingSyncFrames.set(readingDocument, frame);
  }

  private syncActiveAnnotationFromReading(leaf: WorkspaceLeaf): void {
    const view = leaf.view as {
      containerEl: HTMLElement;
      editor?: Editor;
      file?: { path?: string };
    };
    const preview = view.containerEl.querySelector<HTMLElement>(
      ".markdown-preview-view",
    );
    const filePath = view.file?.path;
    if (!preview || !view.editor || !filePath) {
      this.clearActiveOutlineAnnotation();
      return;
    }
    const wrappers = Array.from(preview.querySelectorAll<HTMLElement>(
      ".crisp-ann",
    ));
    const viewportRect = preview.getBoundingClientRect();
    const viewportTop = viewportRect.top;
    const viewportBottom = viewportRect.bottom > viewportRect.top
      ? viewportRect.bottom
      : viewportTop + preview.clientHeight;
    const index = findClosestVisibleAnnotationIndex(
      wrappers.map((wrapper) => wrapper.getBoundingClientRect()),
      viewportTop,
      viewportBottom,
    );
    const annotations = this.getReadingSourceIndex(view.editor).annotations;
    const activeWrapper = index === null ? null : wrappers[index];
    const activeFrom = activeWrapper?.dataset.crispAnnFrom;
    const annotation = activeFrom !== undefined
      ? annotations.find((candidate) => candidate.from === Number(activeFrom)) ?? null
      : index !== null && wrappers.length === annotations.length
        ? annotations[index] ?? null
        : null;
    for (const outlineLeaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      const outline = outlineLeaf.view;
      if (!(outline instanceof CrispAnnotationsOutlineView)) {
        continue;
      }
      if (annotation) {
        outline.setActiveAnnotation(filePath, annotation.from);
      } else {
        outline.clearActiveAnnotation();
      }
    }
  }

  private clearActiveOutlineAnnotation(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CrispAnnotationsOutlineView) {
        view.clearActiveAnnotation();
      }
    }
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
    await this.ensureVaultIndex();
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
      if (view instanceof CrispAnnotationsOutlineView) {
        view.refreshVault(this.vaultAnnotationIndex?.getEntries() ?? []);
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
      if (view instanceof CrispAnnotationsOutlineView) {
        view.refreshVault(this.vaultAnnotationIndex?.getEntries() ?? []);
      }
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private isMarkdownFile(file: { path: string }): file is TFile {
    return (file as { extension?: string }).extension === "md";
  }

  private toVaultMarkdownFile(file: TFile): VaultMarkdownFile {
    return {
      path: file.path,
      name: file.name,
      basename: file.basename,
    };
  }

  private async ensureVaultIndex(): Promise<void> {
    if (this.vaultIndexReady) {
      this.refreshVaultOutlineViews();
      return;
    }
    if (!this.vaultAnnotationIndex) {
      return;
    }
    if (!this.vaultIndexBuild) {
      this.setVaultOutlineLoading(true);
      this.vaultIndexBuild = this.vaultAnnotationIndex
        .rebuild(this.app.vault.getMarkdownFiles().map((file) => (
          this.toVaultMarkdownFile(file)
        )))
        .then(async () => {
          if (!this.vaultAnnotationIndex) {
            return;
          }
          await Promise.all(this.app.workspace.getLeavesOfType("markdown").map(
            async (leaf) => {
              const view = leaf.view as {
                file?: TFile;
                editor?: { getValue(): string };
              };
              if (!view.file || !view.editor) {
                return;
              }
              await this.vaultAnnotationIndex?.update(
                this.toVaultMarkdownFile(view.file),
                view.editor.getValue(),
              );
            },
          ));
        })
        .then(() => {
          this.vaultIndexReady = true;
          this.refreshVaultOutlineViews();
        })
        .finally(() => {
          this.vaultIndexBuild = null;
          this.setVaultOutlineLoading(false);
        });
    }
    await this.vaultIndexBuild;
  }

  private async updateVaultIndexFile(file: TFile, source?: string): Promise<void> {
    if (!this.vaultIndexReady || !this.vaultAnnotationIndex) {
      return;
    }
    try {
      await this.vaultAnnotationIndex.update(this.toVaultMarkdownFile(file), source);
    } catch {
      return;
    }
    this.refreshVaultOutlineViews();
  }

  private refreshVaultOutlineViews(): void {
    const entries = this.vaultAnnotationIndex?.getEntries() ?? [];
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CrispAnnotationsOutlineView) {
        view.refreshVault(entries);
      }
    }
  }

  private async editRenderedAnnotation(
    filePath: string,
    wrapper: HTMLElement,
  ): Promise<void> {
    const leaf = this.findMarkdownLeaf(filePath, wrapper);
    const editor = (leaf?.view as { editor?: Editor } | undefined)?.editor;
    if (!leaf || !editor) {
      new Notice("无法打开这条标注所在的文档。");
      return;
    }
    const annotations = this.getReadingSourceIndex(editor).annotations;
    let reference: ReturnType<typeof findAnnotations>[number] | undefined;
    const storedFrom = wrapper.dataset.crispAnnFrom;
    if (storedFrom !== undefined) {
      reference = annotations.find((annotation) => (
        annotation.from === Number(storedFrom)
      ));
    }
    const wrappers = Array.from(leaf.view.containerEl.querySelectorAll<HTMLElement>(
      ".markdown-preview-view .crisp-ann",
    ));
    const wrapperIndex = wrappers.indexOf(wrapper);
    if (!reference && wrapperIndex >= 0 && wrappers.length === annotations.length) {
      reference = annotations[wrapperIndex];
    } else if (!reference) {
      const target = wrapper.querySelector<HTMLElement>(
        ".crisp-ann__target",
      )?.textContent ?? "";
      const note = wrapper.querySelector<HTMLElement>(
        ".crisp-ann__label",
      )?.textContent ?? "";
      const matches = annotations.filter((annotation) => (
        annotation.target === target && annotation.spec.note === note
      ));
      reference = matches.length === 1 ? matches[0] : undefined;
    }
    if (!reference) {
      new Notice("无法准确定位这条标注，请从标注中心重试。");
      return;
    }
    await this.handleOutlineAction("edit", {
      annotation: reference,
      filePath,
      sourceLeaf: leaf,
    });
  }

  private async handleOutlineAction(
    action: OutlineAnnotationAction,
    context: OutlineAnnotationContext,
  ): Promise<void> {
    if (action === "copy") {
      const text = `${context.annotation.target}\n${context.annotation.spec.note}`;
      try {
        await navigator.clipboard.writeText(text);
        new Notice("已复制标注内容。");
      } catch {
        new Notice("复制标注内容失败。");
      }
      return;
    }

    const editorContext = await this.getOutlineEditorContext(
      context,
      action === "edit",
    );
    if (action === "edit") {
      if (!editorContext) {
        new Notice("无法打开这条标注所在的文档。");
        return;
      }
      const annotation = findReferencedAnnotation(
        editorContext.editor.getValue(),
        context.annotation,
      );
      if (!annotation) {
        new Notice("标注内容已经变化，请刷新标注中心后重试。");
        return;
      }
      editorContext.editor.setCursor(
        editorContext.editor.offsetToPos(annotation.targetFrom),
      );
      await this.openAnnotationModal(editorContext.editor);
      return;
    }

    if (editorContext) {
      const source = editorContext.editor.getValue();
      const annotation = findReferencedAnnotation(source, context.annotation);
      if (!annotation) {
        new Notice("标注内容已经变化，请刷新标注中心后重试。");
        return;
      }
      const replacement = action === "remove"
        ? annotation.spec.mark
          ? `==${annotation.target}==`
          : annotation.target
        : serializeAnnotation(annotation.target, {
          ...annotation.spec,
          mark: !annotation.spec.mark,
        });
      editorContext.editor.replaceRange(
        replacement,
        editorContext.editor.offsetToPos(annotation.from),
        editorContext.editor.offsetToPos(annotation.to),
      );
      const updatedSource = editorContext.editor.getValue();
      this.refreshOutlineViews(updatedSource, editorContext.leaf);
      const file = (editorContext.leaf.view as { file?: TFile }).file;
      if (file) {
        void this.updateVaultIndexFile(file, updatedSource);
      }
      return;
    }

    const file = context.filePath
      ? this.app.vault.getFileByPath(context.filePath)
      : null;
    if (!file) {
      new Notice("无法找到这条标注所在的文档。");
      return;
    }
    let changed = false;
    await this.app.vault.process(file, (source) => {
      const transformed = transformReferencedAnnotation(
        source,
        context.annotation,
        action,
      );
      if (transformed === null) {
        return source;
      }
      changed = true;
      return transformed;
    });
    if (!changed) {
      new Notice("标注内容已经变化，请刷新标注中心后重试。");
    }
  }

  private async getOutlineEditorContext(
    context: OutlineAnnotationContext,
    openIfNeeded: boolean,
  ): Promise<{ editor: Editor; leaf: WorkspaceLeaf } | null> {
    const sourceEditor = (context.sourceLeaf?.view as { editor?: Editor } | undefined)?.editor;
    if (context.sourceLeaf && sourceEditor) {
      return { editor: sourceEditor, leaf: context.sourceLeaf };
    }
    if (!context.filePath) {
      return null;
    }
    let leaf = this.app.workspace.getLeavesOfType("markdown").find((candidate) => (
      (candidate.view as { file?: { path?: string } }).file?.path === context.filePath
    ));
    if (!leaf && openIfNeeded) {
      const file = this.app.vault.getFileByPath(context.filePath);
      if (!file) {
        return null;
      }
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file, { active: true });
    }
    const editor = (leaf?.view as { editor?: Editor } | undefined)?.editor;
    return leaf && editor ? { editor, leaf } : null;
  }

  private setVaultOutlineLoading(loading: boolean): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof CrispAnnotationsOutlineView) {
        view.setVaultLoading(loading);
      }
    }
  }

  private navigateAdjacentAnnotation(
    direction: AnnotationNavigationDirection,
  ): void {
    const context = this.getMarkdownContext();
    if (!context) {
      new Notice("请先打开一篇 Markdown 文档。");
      return;
    }
    const view = context.leaf.view as {
      file?: TFile;
      getMode?(): string;
      currentMode?: {
        applyScroll?(
          line: number,
          options?: { center?: boolean; highlight?: boolean },
        ): boolean;
      };
      editor?: Editor;
    };
    const editor = view.editor;
    if (!editor) {
      return;
    }
    const cursorOffset = editor.posToOffset(editor.getCursor());
    const annotation = findAdjacentAnnotation(
      findAnnotations(context.source),
      cursorOffset,
      direction,
    );
    if (!annotation) {
      new Notice("当前文档没有标注。");
      return;
    }
    const from = editor.offsetToPos(annotation.targetFrom);
    const to = editor.offsetToPos(annotation.targetTo);
    editor.setCursor(from);
    this.app.workspace.setActiveLeaf(context.leaf, { focus: true });
    void this.app.workspace.revealLeaf(context.leaf);
    if (
      view.getMode?.() === "preview"
      && view.currentMode?.applyScroll?.(from.line, {
        center: true,
        highlight: true,
      })
    ) {
      return;
    }
    editor.scrollIntoView({ from, to }, true);
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
      .setName("自测遮罩模式 (Active Recall)")
      .setDesc("开启后批注文字默认遮罩；点击或按 Enter 揭晓，双击或按 Shift+Enter 编辑。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.recallMode)
        .onChange(async (value) => {
          await this.plugin.setRecallMode(value, false);
        }));

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
