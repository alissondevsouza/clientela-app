import { describe, expect, it } from "vitest";
import { extractClientIp } from "./client-ip";

describe("extractClientIp", () => {
  it("retorna o IP quando o header tem um único valor", () => {
    expect(extractClientIp("1.2.3.4")).toBe("1.2.3.4");
  });

  it("retorna o ÚLTIMO valor quando o header é multi-valor", () => {
    expect(extractClientIp("1.2.3.4, 5.6.7.8")).toBe("5.6.7.8");
  });

  it("retorna undefined quando o header está ausente (null)", () => {
    expect(extractClientIp(null)).toBeUndefined();
  });

  it("retorna undefined quando o último valor fica vazio após trim", () => {
    expect(extractClientIp("1.2.3.4, ")).toBeUndefined();
  });

  it("retorna undefined para header vazio", () => {
    expect(extractClientIp("")).toBeUndefined();
  });
});
