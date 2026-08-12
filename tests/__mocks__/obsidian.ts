/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Minimal mock of the obsidian API for vitest.
// Extend as needed when tests import more Obsidian types.

function decorateElement<T extends HTMLElement>(element: T): T {
  const target = element as unknown as Record<string, any>;
  target.empty = () => element.replaceChildren();
  target.addClass = (...classes: string[]) => element.classList.add(...classes);
  target.createEl = (
    tag: keyof HTMLElementTagNameMap,
    options?: { cls?: string; text?: string; attr?: Record<string, string> },
  ) => {
    const child = decorateElement(document.createElement(tag));
    if (options?.cls) child.className = options.cls;
    if (options?.text) child.textContent = options.text;
    for (const [name, value] of Object.entries(options?.attr ?? {})) {
      child.setAttribute(name, value);
    }
    element.append(child);
    return child;
  };
  target.createDiv = (
    options?: string | { cls?: string; text?: string; attr?: Record<string, string> },
  ) => target.createEl("div", typeof options === "string" ? { cls: options } : options);
  target.createSpan = (
    options?: string | { cls?: string; text?: string; attr?: Record<string, string> },
  ) => target.createEl("span", typeof options === "string" ? { cls: options } : options);
  return element;
}

export class Component {
  onload(): void {}
  onunload(): void {}
  register(_cb: () => unknown): void {}
  registerEvent(_event: unknown): void {}
  registerDomEvent(
    _element: Document | Window | HTMLElement,
    _type: string,
    _callback: EventListener,
    _options?: boolean | AddEventListenerOptions,
  ): void {}
  addChild(_child: Component): void {}
}

export class ItemView extends Component {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  leaf: WorkspaceLeaf;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = decorateElement(document.createElement("div"));
    this.contentEl = decorateElement(document.createElement("div"));
  }

  getViewType(): string {
    return "";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "";
  }

  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class Plugin extends Component {
  app!: App;
  manifest!: PluginManifest;
  commands: Command[] = [];
  markdownPostProcessors: Array<(
    element: HTMLElement,
    context: {
      sourcePath: string;
      getSectionInfo(element: HTMLElement): {
        text: string;
        lineStart: number;
        lineEnd: number;
      } | null;
    },
  ) => void> = [];

  loadData(): Promise<unknown> {
    return Promise.resolve({});
  }

  saveData(_data: unknown): Promise<void> {
    return Promise.resolve();
  }

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  addSettingTab(_tab: PluginSettingTab): void {}

  registerView(
    _type: string,
    _viewCreator: (leaf: WorkspaceLeaf) => ItemView,
  ): void {}

  registerMarkdownPostProcessor(
    processor: (
      element: HTMLElement,
      context: {
        sourcePath: string;
        getSectionInfo(element: HTMLElement): {
          text: string;
          lineStart: number;
          lineEnd: number;
        } | null;
      },
    ) => void,
  ): void {
    this.markdownPostProcessors.push(processor);
  }

  registerEditorExtension(_extension: unknown): void {}

  addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
    return document.createElement("div");
  }
}

export class PluginSettingTab extends Component {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    super();
    this.app = app;
    this.plugin = plugin;
    this.containerEl = decorateElement(document.createElement("div"));
  }

  display(): void {}
}

export class Modal {
  app: App;
  modalEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;

  scope: any;

  constructor(app: App) {
    this.app = app;
    this.modalEl = decorateElement(document.createElement("div"));
    this.contentEl = decorateElement(document.createElement("div"));
    this.titleEl = decorateElement(document.createElement("div"));
    this.scope = {
      register: () => {},
    };
  }

  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
  setTitle(_title: string): void {
    this.titleEl.textContent = _title;
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = decorateElement(document.createElement("div"));
    this.settingEl.className = "setting-item";
    this.infoEl = decorateElement(document.createElement("div"));
    this.infoEl.className = "setting-item-info";
    this.nameEl = decorateElement(document.createElement("div"));
    this.nameEl.className = "setting-item-name";
    this.descEl = decorateElement(document.createElement("div"));
    this.descEl.className = "setting-item-description";
    this.controlEl = decorateElement(document.createElement("div"));
    this.controlEl.className = "setting-item-control";
    this.infoEl.append(this.nameEl, this.descEl);
    this.settingEl.append(this.infoEl, this.controlEl);
    containerEl.append(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.replaceChildren();
    if (typeof desc === "string") {
      this.descEl.textContent = desc;
    } else {
      this.descEl.append(desc);
    }
    return this;
  }

  setHeading(): this {
    return this;
  }

  setClass(cls: string): this {
    this.settingEl.classList.add(cls);
    return this;
  }

  addText(cb: (text: TextComponent) => unknown): this {
    const component = new TextComponent();
    this.controlEl.append(component.inputEl);
    cb(component);
    return this;
  }

  addTextArea(cb: (text: TextAreaComponent) => unknown): this {
    const component = new TextAreaComponent();
    this.controlEl.append(component.inputEl);
    cb(component);
    return this;
  }

  addDropdown(cb: (dropdown: DropdownComponent) => unknown): this {
    const component = new DropdownComponent();
    this.controlEl.append(component.selectEl);
    cb(component);
    return this;
  }

  addToggle(cb: (toggle: ToggleComponent) => unknown): this {
    const component = new ToggleComponent();
    this.controlEl.append(component.toggleEl);
    cb(component);
    return this;
  }

  addSlider(cb: (slider: SliderComponent) => unknown): this {
    const component = new SliderComponent();
    this.controlEl.append(component.sliderEl);
    cb(component);
    return this;
  }

  addButton(cb: (button: ButtonComponent) => unknown): this {
    const component = new ButtonComponent();
    this.controlEl.append(component.buttonEl);
    cb(component);
    return this;
  }

  addColorPicker(cb: (picker: ColorComponent) => unknown): this {
    const component = new ColorComponent();
    this.controlEl.append(component.colorPickerEl);
    cb(component);
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;

  constructor() {
    this.inputEl = decorateElement(document.createElement("input"));
    this.inputEl.type = "text";
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChange(cb: (value: string) => unknown): this {
    this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }
}

export class TextAreaComponent {
  inputEl: HTMLTextAreaElement;

  constructor() {
    this.inputEl = decorateElement(document.createElement("textarea"));
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChange(cb: (value: string) => unknown): this {
    this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
    return this;
  }
}

export class DropdownComponent {
  selectEl: HTMLSelectElement;

  constructor() {
    this.selectEl = decorateElement(document.createElement("select"));
  }

  addOption(_value: string, _label: string): this {
    return this;
  }

  setValue(_value: string): this {
    return this;
  }

  onChange(_cb: (value: string) => unknown): this {
    return this;
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;

  constructor() {
    this.toggleEl = decorateElement(document.createElement("div"));
  }

  setValue(_value: boolean): this {
    return this;
  }

  onChange(_cb: (value: boolean) => unknown): this {
    return this;
  }
}

export class SliderComponent {
  sliderEl: HTMLInputElement;

  constructor() {
    this.sliderEl = decorateElement(document.createElement("input"));
    this.sliderEl.type = "range";
  }

  setLimits(_min: number, _max: number, _step: number): this {
    return this;
  }

  setValue(_value: number): this {
    return this;
  }

  setInstant(_instant: boolean): this {
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  onChange(_cb: (value: number) => unknown): this {
    return this;
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor() {
    this.buttonEl = decorateElement(document.createElement("button"));
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  setCta(): this {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }

  onClick(cb: () => unknown): this {
    this.buttonEl.addEventListener("click", () => cb());
    return this;
  }

  setIcon(_icon: string): this {
    return this;
  }
}

export class ColorComponent {
  colorPickerEl: HTMLInputElement;

  constructor() {
    this.colorPickerEl = decorateElement(document.createElement("input"));
    this.colorPickerEl.type = "color";
  }

  setValue(_value: string): this {
    return this;
  }

  onChange(_cb: (value: string) => unknown): this {
    return this;
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.setAttribute("data-icon", iconId);
}

export class Scope {
  keys: Array<{
    modifiers: string | string[] | null;
    key: string | null;
    func: KeymapEventHandler;
  }> = [];

  register(
    _modifiers: string | string[] | null,
    _key: string | null,
    func: KeymapEventHandler,
  ): KeymapEventHandler {
    this.keys.push({ modifiers: _modifiers, key: _key, func });
    return func;
  }
}

type KeymapEventHandler = (evt: KeyboardEvent, ctx: any) => boolean | void;

export interface App {
  workspace: Workspace;
  setting: {
    open(): void;
    openTabById(_id: string): void;
  };
}

export interface Workspace {
  on(_name: string, _callback: (...args: unknown[]) => unknown): EventRef;
  getLeavesOfType(_type: string): WorkspaceLeaf[];
  revealLeaf(_leaf: WorkspaceLeaf): void;
  getRightLeaf(_split: boolean): WorkspaceLeaf | null;
  getLeaf(): WorkspaceLeaf;
  updateOptions(): void;
  iterateAllLeaves(_cb: (leaf: WorkspaceLeaf) => void): void;
  getActiveViewOfType<T>(_type: unknown): T | null;
  activeLeaf: WorkspaceLeaf | null;
}

export interface WorkspaceLeaf {
  app: App;
  view: View;
  setViewState(_state: { type: string; active?: boolean }): Promise<void>;
}

export interface View {
  containerEl: HTMLElement;
  ownerDocument: Document;
  getViewType(): string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export interface Command {
  id: string;
  name: string;
  hotkeys?: Array<{ modifiers: string[]; key: string }>;
  editorCallback?: (editor: Editor) => void;
  callback?: () => void;
}

export interface Editor {
  getValue(): string;
  getCursor(): CodeMirror.Position;
  getCursor(_mode: "from" | "to"): CodeMirror.Position;
  getSelection(): string;
  posToOffset(_pos: CodeMirror.Position): number;
  offsetToPos(_offset: number): CodeMirror.Position;
  replaceRange(_replacement: string, _from: CodeMirror.Position, _to?: CodeMirror.Position): void;
  setCursor(_pos: CodeMirror.Position): void;
  scrollIntoView(
    _range: { from: CodeMirror.Position; to: CodeMirror.Position },
    _center?: boolean,
  ): void;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CodeMirror {
  export interface Position {
    line: number;
    ch: number;
  }
}

export type EventRef = Record<string, never>;
