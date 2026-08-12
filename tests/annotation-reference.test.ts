import { describe, expect, it } from "vitest";
import { findAnnotations } from "../src/annotation-syntax";
import {
  findReferencedAnnotation,
  transformReferencedAnnotation,
} from "../src/annotation-reference";

describe("annotation references", () => {
  it("finds the same unique annotation after earlier text shifts its offsets", () => {
    const original = '==Target=={ann note="Keep me" color=blue}';
    const reference = findAnnotations(original)[0];
    const shifted = `New heading\n\n${original}`;

    expect(findReferencedAnnotation(shifted, reference)?.from).toBe(13);
  });

  it("refuses an ambiguous fallback when duplicate annotations exist", () => {
    const syntax = '==Same=={ann note="Duplicate" color=green}';
    const reference = findAnnotations(syntax)[0];
    const shiftedWithDuplicates = `Prefix\n${syntax}\n${syntax}`;

    expect(findReferencedAnnotation(shiftedWithDuplicates, reference)).toBeNull();
  });

  it("removes or toggles only the referenced annotation", () => {
    const source = [
      '==First=={ann note="One" color=blue}',
      '==Second=={ann note="Two" color=red mark=off}',
    ].join("\n");
    const [first, second] = findAnnotations(source);

    expect(transformReferencedAnnotation(source, first, "remove")).toBe([
      "==First==",
      '==Second=={ann note="Two" color=red mark=off}',
    ].join("\n"));
    expect(transformReferencedAnnotation(source, second, "toggle-mark")).toBe([
      '==First=={ann note="One" color=blue}',
      '==Second=={ann note="Two" color=red}',
    ].join("\n"));
  });
});
