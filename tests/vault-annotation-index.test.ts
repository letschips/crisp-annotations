import { describe, expect, it } from "vitest";
import {
  VaultAnnotationIndex,
  filterVaultAnnotationEntries,
  type VaultMarkdownFile,
} from "../src/vault-annotation-index";

function file(path: string): VaultMarkdownFile {
  const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  return { path, basename, name: `${basename}.md` };
}

describe("VaultAnnotationIndex", () => {
  it("indexes annotations from every Markdown file and keeps file context", async () => {
    const sources: Record<string, string> = {
      "Notes/Alpha.md": '==Alpha=={ann note="First idea" color=blue}',
      "Projects/Beta.md": [
        '==Beta=={ann note="Second idea" color=green}',
        '`==ignored=={ann note="Code sample"}`',
      ].join("\n"),
    };
    const index = new VaultAnnotationIndex(async (target) => sources[target.path] ?? "");

    await index.rebuild([file("Notes/Alpha.md"), file("Projects/Beta.md")]);

    expect(index.getEntries().map((entry) => ({
      path: entry.file.path,
      target: entry.annotation.target,
      note: entry.annotation.spec.note,
    }))).toEqual([
      { path: "Notes/Alpha.md", target: "Alpha", note: "First idea" },
      { path: "Projects/Beta.md", target: "Beta", note: "Second idea" },
    ]);
  });

  it("replaces, removes, and renames one file without rebuilding other files", async () => {
    const index = new VaultAnnotationIndex(async () => "");
    const alpha = file("Alpha.md");
    const beta = file("Beta.md");
    await index.update(alpha, '==A=={ann note="old"}');
    await index.update(beta, '==B=={ann note="stable"}');

    await index.update(alpha, '==A2=={ann note="new" color=orange}');
    index.rename("Beta.md", file("Archive/Beta.md"));
    index.remove("Alpha.md");

    expect(index.getEntries().map((entry) => ({
      path: entry.file.path,
      note: entry.annotation.spec.note,
    }))).toEqual([
      { path: "Archive/Beta.md", note: "stable" },
    ]);
  });

  it("does not let an older async disk read overwrite a newer editor update", async () => {
    let resolveRead: ((source: string) => void) | undefined;
    const diskRead = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    const target = file("Draft.md");
    const index = new VaultAnnotationIndex(() => diskRead);

    const pendingDiskUpdate = index.update(target);
    await index.update(target, '==New=={ann note="editor" color=purple}');
    resolveRead?.('==Old=={ann note="disk" color=red}');
    await pendingDiskUpdate;

    expect(index.getEntries().map((entry) => entry.annotation.spec.note)).toEqual([
      "editor",
    ]);
  });

  it("continues indexing when one Markdown file cannot be read", async () => {
    const index = new VaultAnnotationIndex(async (target) => {
      if (target.path === "Broken.md") {
        throw new Error("Unavailable");
      }
      return '==Good=={ann note="Still indexed" color=green}';
    });

    await expect(index.rebuild([
      file("Broken.md"),
      file("Good.md"),
    ])).resolves.toBeUndefined();

    expect(index.getEntries().map((entry) => entry.file.path)).toEqual([
      "Good.md",
    ]);
  });
});

describe("filterVaultAnnotationEntries", () => {
  it("searches target, note, and path case-insensitively and filters by color", async () => {
    const index = new VaultAnnotationIndex(async () => "");
    await index.update(
      file("Research/Display Notes.md"),
      [
        '==Framebuffer=={ann note="Memory insight" color=blue}',
        '==Phosphor=={ann note="Screen detail" color=orange}',
      ].join("\n"),
    );
    const entries = index.getEntries();

    expect(filterVaultAnnotationEntries(entries, "MEMORY", "all")).toHaveLength(1);
    expect(filterVaultAnnotationEntries(entries, "display notes", "all")).toHaveLength(2);
    expect(filterVaultAnnotationEntries(entries, "phosphor", "orange")).toHaveLength(1);
    expect(filterVaultAnnotationEntries(entries, "phosphor", "blue")).toHaveLength(0);
  });
});
