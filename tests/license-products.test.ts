import { describe, expect, it } from "vitest";
import { CRISP_LICENSE_PRODUCTS } from "../src/license";

describe("Crisp suite product compatibility", () => {
  it("recognizes Crisp Organize and Crisp Base licenses", () => {
    expect(CRISP_LICENSE_PRODUCTS).toContain("Crisp Organize");
    expect(CRISP_LICENSE_PRODUCTS).toContain("Crisp Base");
  });
});
