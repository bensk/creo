import { defineModule } from "@/core/modules/define";
import { behaviorStudentFields } from "./source-fields";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "behavior",
  schema,
  sourceFields: { students: behaviorStudentFields },
  fieldSensitivity: {
    behavior_events: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      studentId: "standard", typeId: "standard", occurredAt: "standard", location: "standard", staffId: "standard",
      points: "standard", source: "standard",
      // Discipline narratives are confidential (access matrix, question 2 pending sign-off).
      narrative: "confidential",
    },
  },
});
