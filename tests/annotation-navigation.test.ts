import { describe, expect, it } from "vitest";
import { findAnnotations } from "../src/annotation-syntax";
import { findAdjacentAnnotation } from "../src/annotation-navigation";

const annotations = findAnnotations([
  '==First=={ann note="One"}',
  "Middle",
  '==Second=={ann note="Two"}',
  "End",
].join("\n"));

describe("findAdjacentAnnotation", () => {
  it("moves forward from the cursor and wraps after the last annotation", () => {
    expect(findAdjacentAnnotation(annotations, 0, "next")?.target).toBe("First");
    expect(findAdjacentAnnotation(
      annotations,
      annotations[0].targetFrom,
      "next",
    )?.target).toBe("Second");
    expect(findAdjacentAnnotation(
      annotations,
      annotations[1].targetFrom,
      "next",
    )?.target).toBe("First");
  });

  it("moves backward from the cursor and wraps before the first annotation", () => {
    expect(findAdjacentAnnotation(
      annotations,
      annotations[1].targetFrom + 1,
      "previous",
    )?.target).toBe("Second");
    expect(findAdjacentAnnotation(
      annotations,
      annotations[0].targetFrom,
      "previous",
    )?.target).toBe("Second");
  });

  it("returns null for a document without annotations", () => {
    expect(findAdjacentAnnotation([], 0, "next")).toBeNull();
  });
});
