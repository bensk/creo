import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "students",
  schema,
  permissions: [
    { key: "students.view", description: "Look up any student and their standard information" },
    { key: "students.edit_identity", description: "Edit preferred name, pronouns, and pronunciation" },
    { key: "students.manage_enrollment", description: "Enroll and withdraw students, change grade" },
    { key: "students.edit_contacts", description: "Edit family contacts and portal access" },
  ],
  // Access matrix draft 1 (docs/PLAN.md decisions 12 and 20). Contact details are standard.
  fieldSensitivity: {
    students: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      userId: "standard", legalFirstName: "standard", legalLastName: "standard", preferredFirstName: "standard",
      preferredLastName: "standard", pronouns: "standard", googleEmail: "standard", custom: "standard",
      osis: "restricted", dateOfBirth: "restricted",
    },
    contacts: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      userId: "standard", firstName: "standard", lastName: "standard", email: "standard", phonePrimary: "standard",
      phoneSecondary: "standard", language: "standard", preferredChannel: "standard",
    },
  },
});
