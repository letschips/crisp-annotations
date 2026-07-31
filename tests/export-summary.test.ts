import { describe, expect, it } from "vitest";
import { findAnnotations } from "../src/annotation-syntax";

describe("export annotations summary helper", () => {
  it("formats multiple annotations into markdown summary lines", () => {
    const source = `
Here is a note with ==first annotation=={ann note="Check this out" place=top-right color=red}
And another ==second annotation=={ann note="Important detail" color=blue mark=off}
    `;
    const matches = findAnnotations(source);
    expect(matches).toHaveLength(2);

    const lines = [
      `# Crisp Annotations Summary (${matches.length})`,
      "",
      ...matches.map((match, index) => {
        const { target, spec } = match;
        const color = spec.color !== "neutral" ? ` [${spec.color}]` : "";
        const place = spec.place ? ` (${spec.place})` : "";
        return `${index + 1}. **${target}**${color}${place}: ${spec.note}`;
      }),
    ];

    expect(lines[2]).toBe("1. **first annotation** [red] (top-right): Check this out");
    expect(lines[3]).toBe("2. **second annotation** [blue] (bottom): Important detail");
  });
});
