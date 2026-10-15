import { defineModule } from "@/core/modules/define";
import { attendanceStudentFields } from "./source-fields";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "attendance",
  schema,
  sourceFields: { students: attendanceStudentFields },
  notifications: [
    {
      type: "attendance.not_taken",
      label: "Attendance not taken",
      description: "Each school morning, the homeroom teacher of every homeroom that isn't finished (counts only, no names). Send it as a DM to the staff member it's about.",
    },
  ],
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
