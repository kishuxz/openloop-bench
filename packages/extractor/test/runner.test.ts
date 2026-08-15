import { describe, expect, test } from "vitest";
import { extract } from "../src/runner.js";

describe("test split guard", () => {
  test("refuses test extraction without --final before touching providers", async () => {
    await expect(extract({ split: "test", configs: ["hosted-large"], noCache: true, final: false })).rejects.toThrow(
      /without --final/,
    );
  });
});
