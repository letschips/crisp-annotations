import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(`${process.cwd()}/styles.css`, "utf8");

describe("plugin styles", () => {
  it("ships every annotation direction and a hand-drawn arrow", () => {
    for (const place of [
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
      "top-left",
    ]) {
      expect(styles).toContain(`.crisp-ann--${place}::before`);
      expect(styles).toContain(`.crisp-ann--${place} > .crisp-ann__label`);
    }
    expect(styles.match(/--_crisp-ann-arrow-mask:/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("bundles the handwriting font and keeps selectors plugin-scoped", () => {
    expect(styles).toContain("@font-face");
    expect(styles).toContain('url("assets/ShantellSans-Variable.ttf")');
    expect(styles).toContain(".markdown-preview-view .crisp-ann__target");
    expect(styles).not.toMatch(/\.markdown-preview-view\s+mark\s*\{/);
  });

  it("has narrow-screen and reduced-motion fallbacks", () => {
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toContain("@media (prefers-reduced-motion: no-preference)");
  });

  it("keeps wrapped highlights aligned without cloned line seams", () => {
    const wrapperRule = styles.match(/\.crisp-ann\s*\{[^}]+\}/)?.[0] ?? "";
    const targetRule = styles.match(
      /\.markdown-rendered \.crisp-ann__target,[\s\S]*?\.markdown-preview-view \.crisp-ann__target\s*\{[^}]+\}/,
    )?.[0] ?? "";

    expect(wrapperRule).toContain("line-height: inherit");
    expect(targetRule).toContain("-webkit-box-decoration-break: slice");
    expect(targetRule).toContain("box-decoration-break: slice");
  });

  it("uses a deliberate CJK handwriting fallback", () => {
    expect(styles).toContain("--crisp-ann-handwritten-font:");
    expect(styles).toContain(
      "--crisp-ann-font: var(--crisp-ann-font-override, var(--crisp-ann-handwritten-font));",
    );
    expect(styles).toContain('"Kaiti SC"');
    expect(styles).toContain('"STKaiti"');
    expect(styles).toContain('"KaiTi"');
  });

  it("animates the opt-in rainbow color smoothly and calmly", () => {
    expect(styles).toContain("@property --crisp-ann-color");
    expect(styles).toContain("@property --crisp-ann-editor-color");
    expect(styles).toContain("crisp-ann-rainbow-cycle 8s linear infinite");
  });

  it("supports a custom annotation color and generated arrow masks", () => {
    expect(styles).toContain(".crisp-ann--custom");
    expect(styles).toContain("var(--crisp-ann-custom-color");
    for (const place of [
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
      "top-left",
    ]) {
      expect(styles).toContain(`var(--crisp-ann-arrow-mask-${place},`);
    }
  });

  it("uses the safe bottom layout on Obsidian mobile at every viewport width", () => {
    expect(styles).toContain("body.is-mobile .crisp-ann::before");
    expect(styles).toContain("body.is-mobile .crisp-ann > .crisp-ann__label");
    expect(styles).toContain("body.is-mobile .crisp-ann-block--space-top");
  });

  it("provides scoped margin notes and an inline fallback", () => {
    expect(styles).toContain(".crisp-ann-margin-item");
    expect(styles).toContain(".crisp-ann--margin::before");
    expect(styles).toContain(".crisp-ann-margin-connectors");
    expect(styles).toContain("body.is-mobile .crisp-ann-margin-item");
  });

  it("uses a compact borderless annotation dialog system", () => {
    expect(styles).toContain(".crisp-ann-dialog");
    expect(styles).toContain(".crisp-ann-modal__choices");
    expect(styles).toContain(".crisp-ann-modal__appearance-chip");
    expect(styles).toContain(".crisp-ann-modal__field");
    const titleRule = styles.match(
      /\.crisp-ann-dialog \.modal-title\s*\{[^}]*\}/s,
    )?.[0] ?? "";
    expect(titleRule).toContain("border-bottom: 0");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("provides print / PDF export media query with collapsed margins", () => {
    expect(styles).toContain("@media print");
    expect(styles).toContain(".crisp-ann-margin-item");
    expect(styles).toContain("break-inside: avoid");
    expect(styles).toContain("page-break-inside: avoid");
    expect(styles).toContain(".crisp-ann-margin-connectors");
    expect(styles).toContain("display: none !important");
  });

  it("does not include hover flashing rules", () => {
    expect(styles).not.toContain(".crisp-ann--hovered");
  });

  it("boosts dark mode editor badge and target contrast", () => {
    expect(styles).toContain(".theme-dark .crisp-ann-editor-badge");
    expect(styles).toContain(".theme-dark .crisp-ann-editor-target");
    // Verify dark mode uses higher color-mix percentages for readability
    const darkBadgeRule = styles.match(
      /\.theme-dark \.crisp-ann-editor-badge\s*\{[^}]*\}/s,
    )?.[0] ?? "";
    expect(darkBadgeRule).toContain("color-mix");
  });

  it("styles outline view items with hover states and color dots", () => {
    expect(styles).toContain(".crisp-ann-outline-view");
    expect(styles).toContain(".crisp-ann-outline-item:hover");
    expect(styles).toContain(".crisp-ann-outline-item__color");
    expect(styles).toContain(".crisp-ann-outline-item__target");
    expect(styles).toContain(".crisp-ann-outline-item__note");
  });

  it("styles the vault scope, search controls, and file groups", () => {
    expect(styles).toContain(".crisp-ann-outline-scope");
    expect(styles).toContain('.crisp-ann-outline-scope__button[aria-pressed="true"]');
    expect(styles).toContain(".crisp-ann-outline-search__input");
    expect(styles).toContain(".crisp-ann-outline-search__color");
    expect(styles).toContain(".crisp-ann-outline-file-group__header");
    expect(styles).toContain(".crisp-ann-outline-file-group__path");
  });

  it("keeps item actions compact and reveals them on hover or keyboard focus", () => {
    expect(styles).toContain(".crisp-ann-outline-item__actions");
    expect(styles).toContain(".crisp-ann-outline-item__action");
    expect(styles).toContain(".crisp-ann-outline-item:hover .crisp-ann-outline-item__actions");
    expect(styles).toContain(".crisp-ann-outline-item:focus-within .crisp-ann-outline-item__actions");
    expect(styles).toContain(".crisp-ann-outline-item__action--remove");
  });

  it("gives the reading-synchronized outline item a calm active state", () => {
    expect(styles).toContain(".crisp-ann-outline-item.is-active");
    expect(styles).toContain("var(--interactive-accent)");
  });

  it("keeps reading-mode annotation labels directly editable", () => {
    expect(styles).toContain(".crisp-ann__label--editable");
    expect(styles).toContain("pointer-events: auto");
    expect(styles).toContain("cursor: pointer");
  });

  it("masks recall text without changing the label box geometry", () => {
    const maskedRule = styles.match(
      /body\[data-crisp-ann-recall="true"\][\s\S]*?\.crisp-ann__label:not\(\.is-revealed\)\s*\{[^}]*\}/,
    )?.[0] ?? "";
    expect(maskedRule).toContain("color: transparent");
    expect(maskedRule).toContain("text-shadow:");
    expect(maskedRule).not.toContain("padding:");
    expect(maskedRule).not.toContain("border:");
    expect(styles).toContain(".crisp-ann__label.is-revealed");
    expect(styles).toContain("body[data-crisp-ann-recall=\"true\"]");
  });

  it("always reveals annotation text in print and PDF export", () => {
    const printBlock = styles.match(/@media print\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(printBlock).toContain("data-crisp-ann-recall");
    expect(printBlock).toContain("color: var(--crisp-ann-color) !important");
  });

  it("keeps choice motion explicit and fine-pointer gated", () => {
    expect(styles).not.toMatch(/transition:\s*all\b/);
    const finePointerBlock = styles.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
    expect(finePointerBlock).toContain(".crisp-ann-modal__compass-btn:not(");
    expect(finePointerBlock).toContain("transform: scale(1.04)");
  });
});
