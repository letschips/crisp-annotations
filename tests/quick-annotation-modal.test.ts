import { describe, expect, it, vi } from "vitest";
import { QuickAnnotationModal } from "../src/quick-annotation-modal";
import type { AnnotationSpec } from "../src/annotation-syntax";
import type { App } from "obsidian";

const SPEC: AnnotationSpec = {
  note: "",
  place: "bottom",
  color: "amber",
  mark: true,
};

function createApp(): App {
  return {
    workspace: {} as App["workspace"],
    setting: {
      open: () => {},
      openTabById: () => {},
    },
  } as unknown as App;
}

describe("QuickAnnotationModal", () => {
  it("keeps the dialog open and explains that an empty note is invalid", () => {
    const onSubmit = vi.fn();
    const modal = new QuickAnnotationModal(
      createApp(),
      "目标文字",
      SPEC,
      onSubmit,
    );
    const close = vi.spyOn(modal, "close");
    document.body.append(modal.contentEl);
    modal.onOpen();

    const addButton = Array.from(modal.contentEl.querySelectorAll("button"))
      .find((button) => button.textContent === "Add note");
    addButton?.click();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector(".crisp-ann-quick-modal__error")?.textContent)
      .toContain("short note");
    expect(document.activeElement).toBe(
      modal.contentEl.querySelector(".crisp-ann-quick-modal__input"),
    );
  });
});
