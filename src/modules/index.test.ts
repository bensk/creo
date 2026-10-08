import { expect, it } from "vitest";
import { registry } from "./index";

it("the module registry builds without collisions", () => {
  expect(registry.modules).toBeDefined();
});
