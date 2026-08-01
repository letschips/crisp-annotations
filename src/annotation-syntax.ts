export const ANNOTATION_PLACES = [
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "top-left",
] as const;

export const ANNOTATION_COLORS = [
  "neutral",
  "amber",
  "orange",
  "blue",
  "green",
  "red",
  "purple",
  "rainbow",
  "custom",
] as const;

export type AnnotationPlace = typeof ANNOTATION_PLACES[number];
export type AnnotationColor = typeof ANNOTATION_COLORS[number];

export interface AnnotationSpec {
  note: string;
  place: AnnotationPlace;
  color: AnnotationColor;
  mark: boolean;
}

export interface AnnotationMatch {
  from: number;
  to: number;
  targetFrom: number;
  targetTo: number;
  directiveFrom: number;
  directiveTo: number;
  target: string;
  spec: AnnotationSpec;
}

const PLACE_SET = new Set<string>(ANNOTATION_PLACES);
const COLOR_SET = new Set<string>(ANNOTATION_COLORS);
const ATTRIBUTE_SET = new Set(["note", "place", "color", "mark"]);

interface SourceRange {
  from: number;
  to: number;
}

function countRun(source: string, offset: number, character: string): number {
  let length = 0;
  while (source[offset + length] === character) {
    length += 1;
  }
  return length;
}

function findFrontmatterRange(source: string): SourceRange | null {
  const firstNewline = source.indexOf("\n");
  if (firstNewline === -1 || source.slice(0, firstNewline).trim() !== "---") {
    return null;
  }

  let lineStart = firstNewline + 1;
  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? source.length : newline;
    const line = source.slice(lineStart, lineEnd).trim();
    if (line === "---" || line === "...") {
      return {
        from: 0,
        to: newline === -1 ? lineEnd : lineEnd + 1,
      };
    }
    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }
  return null;
}

function mergeRanges(ranges: SourceRange[]): SourceRange[] {
  const sorted = [...ranges].sort((left, right) => left.from - right.from);
  const merged: SourceRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function findFencedCodeRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let open: { from: number; character: string; length: number } | null = null;
  let lineStart = 0;

  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? source.length : newline;
    const line = source.slice(lineStart, lineEnd).replace(/^ {0,3}/, "");

    if (open) {
      const runLength = countRun(line, 0, open.character);
      if (runLength >= open.length && line.slice(runLength).trim().length === 0) {
        ranges.push({
          from: open.from,
          to: newline === -1 ? lineEnd : lineEnd + 1,
        });
        open = null;
      }
    } else if (line.startsWith("```") || line.startsWith("~~~")) {
      const character = line[0];
      open = {
        from: lineStart,
        character,
        length: countRun(line, 0, character),
      };
    }

    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }

  if (open) {
    ranges.push({ from: open.from, to: source.length });
  }
  return ranges;
}

function findInlineCodeRanges(source: string, fenced: SourceRange[]): SourceRange[] {
  const ranges: SourceRange[] = [];
  let fenceIndex = 0;
  let offset = 0;

  while (offset < source.length) {
    const fence = fenced[fenceIndex];
    if (fence && offset >= fence.to) {
      fenceIndex += 1;
      continue;
    }
    if (fence && offset >= fence.from) {
      offset = fence.to;
      fenceIndex += 1;
      continue;
    }
    if (source[offset] !== "`") {
      offset += 1;
      continue;
    }

    const delimiterLength = countRun(source, offset, "`");
    let closing = offset + delimiterLength;
    let found = false;
    while (closing < source.length) {
      const nextFence = fenced[fenceIndex];
      if (nextFence && closing >= nextFence.from) {
        break;
      }
      if (source[closing] !== "`") {
        closing += 1;
        continue;
      }
      const closingLength = countRun(source, closing, "`");
      if (closingLength === delimiterLength) {
        const to = closing + closingLength;
        ranges.push({ from: offset, to });
        offset = to;
        found = true;
        break;
      }
      closing += closingLength;
    }
    if (!found) {
      offset += delimiterLength;
    }
  }
  return ranges;
}

function findMarkdownCodeRanges(source: string): SourceRange[] {
  const frontmatter = findFrontmatterRange(source);
  const structural = mergeRanges([
    ...(frontmatter ? [frontmatter] : []),
    ...findFencedCodeRanges(source),
  ]);
  return mergeRanges([
    ...structural,
    ...findInlineCodeRanges(source, structural),
  ]);
}

function unescapeQuoted(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

function parseAttributes(value: string): AnnotationSpec | null {
  const attributes = new Map<string, string>();
  const pattern = /([a-z]+)=(?:"((?:\\.|[^"\\])*)"|([^\s}]+))/y;
  let cursor = 0;
  while (cursor < value.length) {
    const separatorStart = cursor;
    while (/\s/.test(value[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor >= value.length) {
      break;
    }
    if (attributes.size > 0 && cursor === separatorStart) {
      return null;
    }

    pattern.lastIndex = cursor;
    const match = pattern.exec(value);
    if (!match || !ATTRIBUTE_SET.has(match[1]) || attributes.has(match[1])) {
      return null;
    }
    attributes.set(
      match[1],
      match[2] === undefined ? match[3] : unescapeQuoted(match[2]),
    );
    cursor = pattern.lastIndex;
  }

  const note = attributes.get("note");
  if (note === undefined || note.trim().length === 0) {
    return null;
  }
  const place = attributes.get("place") ?? "bottom";
  const color = attributes.get("color") ?? "neutral";
  const mark = attributes.get("mark") ?? "on";
  if (!PLACE_SET.has(place) || !COLOR_SET.has(color) || !["on", "off"].includes(mark)) {
    return null;
  }
  return {
    note,
    place: place as AnnotationPlace,
    color: color as AnnotationColor,
    mark: mark === "on",
  };
}

export function findAnnotations(source: string): AnnotationMatch[] {
  const annotations: AnnotationMatch[] = [];
  const codeRanges = findMarkdownCodeRanges(source);
  let codeRangeIndex = 0;
  const pattern = /==((?:(?!==)[\s\S])+)==\{ann\s+((?:"(?:\\.|[^"\\])*"|[^}])*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const from = match.index;
    while (codeRanges[codeRangeIndex]?.to <= from) {
      codeRangeIndex += 1;
    }
    const codeRange = codeRanges[codeRangeIndex];
    if (codeRange && from >= codeRange.from && from < codeRange.to) {
      continue;
    }
    const spec = parseAttributes(match[2]);
    if (!spec) {
      continue;
    }
    const target = match[1];
    if (target !== target.trim()) {
      continue;
    }
    const directiveFrom = from + target.length + 4;
    annotations.push({
      from,
      to: from + match[0].length,
      targetFrom: from + 2,
      targetTo: from + 2 + target.length,
      directiveFrom,
      directiveTo: from + match[0].length,
      target,
      spec,
    });
  }
  return annotations;
}

export function serializeAnnotation(target: string, spec: AnnotationSpec): string {
  const note = spec.note
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s*\r?\n\s*/g, " ");
  const attributes = [`note="${note}"`];
  if (spec.place !== "bottom") {
    attributes.push(`place=${spec.place}`);
  }
  if (spec.color !== "neutral") {
    attributes.push(`color=${spec.color}`);
  }
  if (!spec.mark) {
    attributes.push("mark=off");
  }
  return `==${target}=={ann ${attributes.join(" ")}}`;
}

export function findAnnotationAt(source: string, offset: number): AnnotationMatch | null {
  const annotations = findAnnotations(source);
  for (const annotation of annotations) {
    if (offset >= annotation.from && offset < annotation.to) {
      return annotation;
    }
    // Annotations are sorted by position — skip remainder when past the target offset.
    if (annotation.from > offset) {
      break;
    }
  }
  return null;
}

export function removeAnnotationFromSource(
  source: string,
  annotation: AnnotationMatch,
): string {
  const replacement = annotation.spec.mark
    ? `==${annotation.target}==`
    : annotation.target;
  return `${source.slice(0, annotation.from)}${replacement}${source.slice(annotation.to)}`;
}
