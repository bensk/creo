import { createRegistry } from "@/core/modules/registry";
import { manifest as cohorts } from "./cohorts/manifest";
import { manifest as students } from "./students/manifest";

// Register every module's manifest here. Order sets sidebar order.
export const registry = createRegistry([students, cohorts]);
