import { findAnnotationAt } from "./annotation-syntax";
import { CRISP_ANNOTATION_ICON_NAME } from "./icons";

interface AnnotationMenuItem {
  setTitle(title: string): AnnotationMenuItem;
  setIcon(icon: string): AnnotationMenuItem;
  setSection(section: string): AnnotationMenuItem;
  onClick(callback: () => void): AnnotationMenuItem;
}

interface AnnotationMenu {
  addItem(configure: (item: AnnotationMenuItem) => void): unknown;
}

interface AnnotationEditor {
  getSelection(): string;
  getValue(): string;
  getCursor(): unknown;
  posToOffset(position: unknown): number;
}

export function addAnnotationContextMenuItem<TEditor extends AnnotationEditor>(
  menu: AnnotationMenu,
  editor: TEditor,
  open: (editor: TEditor) => void,
  remove?: (editor: TEditor) => void,
  toggleHighlight?: (editor: TEditor) => void,
): boolean {
  const cursorOffset = editor.posToOffset(editor.getCursor());
  const existing = findAnnotationAt(editor.getValue(), cursorOffset);
  const canOpen = Boolean(editor.getSelection()) || Boolean(existing);
  if (!canOpen) {
    return false;
  }

  const mainTitle = existing ? "编辑标注" : "添加标注";
  menu.addItem((item) => item
    .setTitle(mainTitle)
    .setIcon(CRISP_ANNOTATION_ICON_NAME)
    .setSection("action")
    .onClick(() => open(editor)));

  if (existing && toggleHighlight) {
    const highlightTitle = existing.spec.mark ? "Turn off target highlight" : "Turn on target highlight";
    menu.addItem((item) => item
      .setTitle(highlightTitle)
      .setIcon("highlighter")
      .setSection("action")
      .onClick(() => toggleHighlight(editor)));
  }

  if (existing && remove) {
    menu.addItem((item) => item
      .setTitle("Remove annotation")
      .setIcon("eraser")
      .setSection("action")
      .onClick(() => remove(editor)));
  }
  return true;
}
