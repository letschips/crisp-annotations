import { describe, expect, it } from "vitest";
import { buildEditorPreviewRanges, buildEditorPreviewRangesFromAnnotations } from "../src/editor-preview";
import { findAnnotations } from "../src/annotation-syntax";

describe("buildEditorPreviewRanges", () => {
  it("collapses metadata outside the active annotation and reveals it at the cursor", () => {
    const source = '前 ==目标=={ann note="说明" color=blue} 后';
    const outside = buildEditorPreviewRanges(source, [{ from: 0, to: 0 }]);
    const insideOffset = source.indexOf("说明");
    const inside = buildEditorPreviewRanges(source, [{
      from: insideOffset,
      to: insideOffset,
    }]);

    expect(outside[0]?.hideDirective).toBe(true);
    expect(inside[0]?.hideDirective).toBe(false);
    expect(outside[0]?.color).toBe("blue");
    expect(outside[0]?.note).toBe("说明");
  });

  it("keeps metadata collapsed when the cursor is immediately after an annotation", () => {
    const source = '前 ==目标=={ann note="说明"} 后';
    const annotationEnd = source.indexOf("} 后") + 1;
    const ranges = buildEditorPreviewRanges(source, [{
      from: annotationEnd,
      to: annotationEnd,
    }]);

    expect(ranges[0]?.hideDirective).toBe(true);
  });
});

describe("buildEditorPreviewRangesFromAnnotations", () => {
  it("produces identical output to buildEditorPreviewRanges for the same source", () => {
    const source = 'A ==x=={ann note="n1" color=red} B ==y=={ann note="n2" place=top}';
    const selections = [{ from: 0, to: 0 }];
    const direct = buildEditorPreviewRanges(source, selections);
    const fromCached = buildEditorPreviewRangesFromAnnotations(
      findAnnotations(source),
      selections,
    );
    expect(fromCached).toEqual(direct);
  });

  it("avoids re-parsing when annotations are cached", () => {
    const source = '==x=={ann note="cached"}';
    const annotations = findAnnotations(source);
    const ranges = buildEditorPreviewRangesFromAnnotations(annotations, []);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.note).toBe("cached");
    expect(ranges[0]?.hideDirective).toBe(true);
  });
});
