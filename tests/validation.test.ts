import { describe, expect, it } from "vitest";
import {
  normalizeAnnotationTarget,
  validateAnnotationTarget,
} from "../src/validation";

describe("normalizeAnnotationTarget", () => {
  it("trims leading and trailing whitespace and reports offsets", () => {
    const result = normalizeAnnotationTarget("  hello  ");
    expect(result.target).toBe("hello");
    expect(result.leadingTrim).toBe(2);
    expect(result.trailingTrim).toBe(2);
  });

  it("trims a trailing newline from line selections", () => {
    const result = normalizeAnnotationTarget("hello\n");
    expect(result.target).toBe("hello");
    expect(result.leadingTrim).toBe(0);
    expect(result.trailingTrim).toBe(1);
  });

  it("keeps internal whitespace untouched", () => {
    const result = normalizeAnnotationTarget("  hello world  ");
    expect(result.target).toBe("hello world");
    expect(result.leadingTrim).toBe(2);
    expect(result.trailingTrim).toBe(2);
  });

  it("returns an empty target for whitespace-only selections", () => {
    const result = normalizeAnnotationTarget("   \n  ");
    expect(result.target).toBe("");
    expect(result.leadingTrim).toBe(6);
    expect(result.trailingTrim).toBe(6);
  });
});

describe("validateAnnotationTarget", () => {
  it("still rejects untrimmed targets", () => {
    const result = validateAnnotationTarget(" hello ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Annotations must use trimmed text.");
  });

  it("still rejects == markers", () => {
    expect(validateAnnotationTarget("a==b").valid).toBe(false);
    expect(validateAnnotationTarget("a==b").error).toBe(
      "Annotations must not contain == markers.",
    );
  });

  it("accepts multi-line targets", () => {
    expect(validateAnnotationTarget("line one\nline two").valid).toBe(true);
  });

  it("accepts trimmed single-line targets", () => {
    expect(validateAnnotationTarget("hello world").valid).toBe(true);
  });
});
