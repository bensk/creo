import { defineModule } from "@/core/modules/define";
import { attendanceStudentFields } from "./source-fields";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "attendance",
  schema,
  sourceFields: { students: attendanceStudentFields },
  permissions: [
    { key: "attendance.take", description: "Take daily homeroom attendance (teachers: their homeroom, today)" },
    { key: "attendance.manage", description: "Take or correct attendance for any homeroom and day, and see who hasn't taken it" },
  ],
  fieldSensitivity: {
    attendance_daily: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      studentId: "standard", date: "standard", codeId: "standard", note: "standard", source: "standard", arrivedAt: "standard",
    },
  },
});
