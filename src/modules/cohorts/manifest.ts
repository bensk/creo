import { defineModule } from "@/core/modules/define";
import { cohortStudentFields } from "./source-fields";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "cohorts",
  schema,
  sourceFields: { students: cohortStudentFields },
  permissions: [
    { key: "cohorts.view", description: "See groups, homerooms, and their members" },
    { key: "cohorts.manage", description: "Create groups and change memberships and staffing" },
    { key: "cohorts.create_lists", description: "Create lists of students" },
    { key: "cohorts.view_all_lists", description: "See every list, shared or not (oversight)" },
  ],
});
