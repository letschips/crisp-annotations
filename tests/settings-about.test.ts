// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderAboutCard } from "../src/settings-about";

describe("settings About card", () => {
  it("shows the plugin purpose and a safe external author link", () => {
    const container = document.createElement("div");

    renderAboutCard(
      container,
      "Crisp Annotations",
      "把高亮、批注与思考线索自然留在 Obsidian 笔记中。",
    );

    const card = container.querySelector(".crisp-ann-about");
    const author = card?.querySelector<HTMLAnchorElement>("a");
    expect(card?.querySelector("h3")?.textContent).toBe(
      "关于 Crisp Annotations",
    );
    expect(card?.textContent).toContain(
      "把高亮、批注与思考线索自然留在 Obsidian 笔记中。",
    );
    expect(author?.textContent).toBe("小红书 letschips");
    expect(author?.href).toBe("https://xhslink.cn/m/3MwtKu4822b");
    expect(author?.target).toBe("_blank");
    expect(author?.rel).toBe("noopener noreferrer");
  });
});
