import { createRegistry } from "@/core/modules/registry";
import { manifest as attendance } from "./attendance/manifest";
import { manifest as behavior } from "./behavior/manifest";
import { manifest as cohorts } from "./cohorts/manifest";
import { manifest as integrations } from "./integrations/manifest";
import { manifest as slack } from "./slack/manifest";
import { manifest as students } from "./students/manifest";
import { manifest as trackers } from "./trackers/manifest";

// Register every module's manifest here. Order sets sidebar order.
export const registry = createRegistry([students, cohorts, trackers, attendance, behavior, integrations, slack]);
