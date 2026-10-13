import { defineModule } from "@/core/modules/define";
import { attendanceStudentFields } from "./source-fields";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "attendance",
  schema,
  sourceFields: { students: attendanceStudentFields },
  fieldSensitivity: {
    attendance_daily: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      studentId: "standard", date: "standard", codeId: "standard", note: "standard", source: "standard",
    },
  },
});
