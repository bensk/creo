import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "cohorts",
  schema,
  permissions: [
    { key: "cohorts.view", description: "See groups, homerooms, and their members" },
    { key: "cohorts.manage", description: "Create groups and change memberships and staffing" },
  ],
});
