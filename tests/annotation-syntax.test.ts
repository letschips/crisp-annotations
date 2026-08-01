import { describe, expect, it } from "vitest";
import {
  findAnnotationAt,
  findAnnotations,
  removeAnnotationFromSource,
  serializeAnnotation,
} from "../src/annotation-syntax";

describe("findAnnotations", () => {
  it("parses the approved annotation syntax with defaults", () => {
    const source = 'Before ==迁移指南=={ann note="发布前先复核"} after';

    expect(findAnnotations(source)).toEqual([
      {
        from: 7,
        to: 34,
        targetFrom: 9,
        targetTo: 13,
        directiveFrom: 15,
        directiveTo: 34,
        target: "迁移指南",
        spec: {
          note: "发布前先复核",
          place: "bottom",
          color: "neutral",
          mark: true,
        },
      },
    ]);
  });

  it("parses explicit placement, color, and mark options", () => {
    const source = '==重点=={ann note="要看这里" place=top-right color=red mark=off}';

    expect(findAnnotations(source)[0]?.spec).toEqual({
      note: "要看这里",
      place: "top-right",
      color: "red",
      mark: false,
    });
  });

  it("accepts the plugin-defined custom color", () => {
    expect(findAnnotations('==重点=={ann note="自定义" color=custom}')[0]?.spec.color)
      .toBe("custom");
  });

  it("ignores annotations with an empty note", () => {
    expect(findAnnotations('==目标=={ann note=""}')).toEqual([]);
  });

  it("allows a single equals sign inside the target text", () => {
    const source = '==a = b=={ann note="公式说明" color=blue}';

    expect(findAnnotations(source)[0]?.target).toBe("a = b");
  });

  it("parses multi-line targets", () => {
    const source = '==line one\nline two=={ann note="多行"}';
    const annotation = findAnnotations(source)[0];
    expect(annotation?.target).toBe("line one\nline two");
    expect(annotation?.targetFrom).toBe(2);
    expect(annotation?.targetTo).toBe(19);
    expect(annotation?.spec.note).toBe("多行");
  });

  it("round-trips multi-line targets through serializeAnnotation", () => {
    const target = "line one\nline two";
    const serialized = serializeAnnotation(target, {
      note: "多行",
      place: "right",
      color: "blue",
      mark: true,
    });
    const annotation = findAnnotations(serialized)[0];
    expect(annotation?.target).toBe(target);
    expect(annotation?.spec.note).toBe("多行");
  });

  it("ignores literal annotation examples inside Markdown code", () => {
    const source = [
      '`==inline=={ann note="不应解析"}`',
      "```md",
      '==fenced=={ann note="不应解析"}',
      "```",
      '==real=={ann note="应当解析"}',
    ].join("\n");

    expect(findAnnotations(source).map((annotation) => annotation.target)).toEqual([
      "real",
    ]);
  });

  it("leaves malformed or misspelled directives visible", () => {
    expect(findAnnotations('==目标=={ann note="说明" colour=red}')).toEqual([]);
    expect(findAnnotations('==目标=={ann note="说明" trailing}')).toEqual([]);
    expect(findAnnotations('==目标=={ann note="说明" note="重复"}')).toEqual([]);
  });

  it("rejects targets with accidental outer whitespace", () => {
    expect(findAnnotations('== 目标 =={ann note="说明"}')).toEqual([]);
  });

  it("ignores annotation-like values in YAML frontmatter", () => {
    const source = [
      "---",
      'example: \'==meta=={ann note="不应解析"}\'',
      "---",
      "",
      '==body=={ann note="应当解析"}',
    ].join("\n");

    expect(findAnnotations(source).map((annotation) => annotation.target)).toEqual([
      "body",
    ]);
  });
});

describe("serializeAnnotation", () => {
  it("writes stable syntax and escapes the note", () => {
    expect(serializeAnnotation("迁移指南", {
      note: '他说 "再看"\\稍后',
      place: "top",
      color: "purple",
      mark: false,
    })).toBe(
      '==迁移指南=={ann note="他说 \\"再看\\"\\\\稍后" place=top color=purple mark=off}',
    );
  });

  it("round-trips escaped annotation text", () => {
    const spec = {
      note: '路径 C:\\Notes } 叫作 "重点"',
      place: "bottom-left" as const,
      color: "blue" as const,
      mark: true,
    };

    expect(findAnnotations(serializeAnnotation("目标", spec))[0]?.spec).toEqual(spec);
  });
});

describe("annotation editing", () => {
  it("finds an annotation at the cursor and removes it without adding a mark", () => {
    const source = '前 ==目标=={ann note="说明" mark=off} 后';
    const match = findAnnotationAt(source, source.indexOf("说明"));

    expect(match?.target).toBe("目标");
    expect(match && removeAnnotationFromSource(source, match)).toBe("前 目标 后");
  });

  it("treats the annotation end offset as outside the annotation", () => {
    const source = '前 ==目标=={ann note="说明"} 后';
    const annotation = findAnnotations(source)[0];

    expect(annotation).toBeDefined();
    expect(findAnnotationAt(source, annotation?.to ?? 0)).toBeNull();
  });
});
