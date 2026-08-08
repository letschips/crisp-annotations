import { describe, expect, it, vi } from "vitest";
import { addAnnotationContextMenuItem } from "../src/editor-menu";
import { CRISP_ANNOTATION_ICON_NAME } from "../src/icons";

class FakeMenuItem {
  title = "";
  icon = "";
  section = "";
  click: (() => void) | null = null;
  submenu: ReturnType<typeof createMenu> | null = null;

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }

  setSection(section: string): this {
    this.section = section;
    return this;
  }

  onClick(click: () => void): this {
    this.click = click;
    return this;
  }

  setSubmenu() {
    this.submenu = createMenu();
    return this.submenu;
  }
}

function createMenu() {
  const items: FakeMenuItem[] = [];
  return {
    items,
    addItem(configure: (item: FakeMenuItem) => void) {
      const item = new FakeMenuItem();
      configure(item);
      items.push(item);
      return this;
    },
  };
}

function createEditor(source: string, selection: string, cursorOffset = 0) {
  return {
    getValue: () => source,
    getSelection: () => selection,
    getCursor: () => ({ line: 0, ch: cursorOffset }),
    posToOffset: () => cursorOffset,
  };
}

describe("addAnnotationContextMenuItem", () => {
  it("adds a clickable Add annotation item when text is selected", () => {
    const menu = createMenu();
    const editor = createEditor("选中文字", "选中文字");
    const open = vi.fn();

    expect(addAnnotationContextMenuItem(menu, editor, open)).toBe(true);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0]).toMatchObject({
      title: "添加标注",
      icon: CRISP_ANNOTATION_ICON_NAME,
      section: "action",
    });

    menu.items[0].click?.();
    expect(open).toHaveBeenCalledWith(editor);
  });

  it("does not add the item without a selection or existing annotation", () => {
    const menu = createMenu();
    const editor = createEditor("普通文本", "", 2);

    expect(addAnnotationContextMenuItem(menu, editor, vi.fn())).toBe(false);
    expect(menu.items).toHaveLength(0);
  });

  it("adds the edit item, toggle highlight, and remove item when the cursor is inside an existing annotation", () => {
    const source = '前 ==目标=={ann note="说明" color=amber} 后';
    const menu = createMenu();
    const editor = createEditor(source, "", source.indexOf("目标") + 1);
    const remove = vi.fn();
    const toggleHighlight = vi.fn();

    expect(addAnnotationContextMenuItem(
      menu,
      editor,
      vi.fn(),
      remove,
      toggleHighlight,
    )).toBe(true);

    expect(menu.items).toHaveLength(3);
    expect(menu.items[0].title).toBe("编辑标注");
    expect(menu.items[1].title).toBe("Turn off target highlight");
    expect(menu.items[2].title).toBe("Remove annotation");

    menu.items[2].click?.();
    expect(remove).toHaveBeenCalledWith(editor);
  });
});
