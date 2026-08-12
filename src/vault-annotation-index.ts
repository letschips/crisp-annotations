import {
  findAnnotations,
  type AnnotationColor,
  type AnnotationMatch,
} from "./annotation-syntax";

export interface VaultMarkdownFile {
  path: string;
  name: string;
  basename: string;
}

export interface VaultAnnotationEntry {
  file: VaultMarkdownFile;
  annotation: AnnotationMatch;
}

export type VaultAnnotationColorFilter = AnnotationColor | "all";

export class VaultAnnotationIndex {
  private readonly files = new Map<
    string,
    { file: VaultMarkdownFile; annotations: AnnotationMatch[] }
  >();
  private readonly revisions = new Map<string, number>();

  constructor(
    private readonly readFile: (file: VaultMarkdownFile) => Promise<string>,
  ) {}

  async rebuild(files: VaultMarkdownFile[]): Promise<void> {
    const currentPaths = new Set(files.map((file) => file.path));
    for (const indexedPath of this.files.keys()) {
      if (!currentPaths.has(indexedPath)) {
        this.remove(indexedPath);
      }
    }
    const batchSize = 24;
    for (let offset = 0; offset < files.length; offset += batchSize) {
      const batch = files.slice(offset, offset + batchSize);
      await Promise.all(batch.map(async (file) => {
        try {
          await this.update(file);
        } catch {
          this.remove(file.path);
        }
      }));
    }
  }

  async update(file: VaultMarkdownFile, source?: string): Promise<void> {
    const revision = (this.revisions.get(file.path) ?? 0) + 1;
    this.revisions.set(file.path, revision);
    const resolvedSource = source ?? await this.readFile(file);
    if (this.revisions.get(file.path) !== revision) {
      return;
    }
    this.files.set(file.path, {
      file,
      annotations: findAnnotations(resolvedSource),
    });
  }

  remove(path: string): void {
    this.revisions.set(path, (this.revisions.get(path) ?? 0) + 1);
    this.files.delete(path);
  }

  rename(oldPath: string, file: VaultMarkdownFile): void {
    const indexed = this.files.get(oldPath);
    this.remove(oldPath);
    if (!indexed) {
      return;
    }
    this.revisions.set(file.path, (this.revisions.get(file.path) ?? 0) + 1);
    this.files.set(file.path, {
      file,
      annotations: indexed.annotations,
    });
  }

  getEntries(): VaultAnnotationEntry[] {
    return [...this.files.values()]
      .flatMap(({ file, annotations }) => (
        annotations.map((annotation) => ({ file, annotation }))
      ))
      .sort((left, right) => (
        left.file.path.localeCompare(right.file.path)
        || left.annotation.from - right.annotation.from
      ));
  }
}

export function filterVaultAnnotationEntries(
  entries: VaultAnnotationEntry[],
  query: string,
  color: VaultAnnotationColorFilter,
): VaultAnnotationEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (color !== "all" && entry.annotation.spec.color !== color) {
      return false;
    }
    if (terms.length === 0) {
      return true;
    }
    const searchable = [
      entry.annotation.target,
      entry.annotation.spec.note,
      entry.file.path,
    ].join("\n").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}
