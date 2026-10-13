import { defineModule } from "@/core/modules/define";
import { studentFields, studentsSource } from "./source";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "students",
  schema,
  sources: [studentsSource],
  sourceFields: { students: studentFields },
  permissions: [
    { key: "students.view", description: "Look up any student and their standard information" },
    { key: "students.edit_identity", description: "Edit preferred name, pronouns, and pronunciation" },
    { key: "students.manage_enrollment", description: "Enroll and withdraw students, change grade" },
    { key: "students.edit_contacts", description: "Edit family contacts and portal access" },
    { key: "students.edit_supports", description: "Add and edit IEP, 504, ELL, and other supports" },
    { key: "students.manage_fields", description: "Add, change, and archive custom fields" },
    { key: "students.edit_alerts", description: "Edit a student's medical alert and photo consent" },
  ],
  // Access matrix draft 1 (docs/PLAN.md decisions 12 and 20). Contact details are standard.
  fieldSensitivity: {
    students: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      userId: "standard", legalFirstName: "standard", legalLastName: "standard", preferredFirstName: "standard",
      preferredLastName: "standard", pronouns: "standard", googleEmail: "standard", custom: "standard",
      osis: "restricted", dateOfBirth: "restricted", photoObjectKey: "standard", version: "standard",
      // Everyone who takes photos or supervises needs these (access matrix question 1, approved by Ben).
      mediaConsent: "standard", medicalAlert: "standard",
    },
    contacts: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      userId: "standard", firstName: "standard", lastName: "standard", email: "standard", phonePrimary: "standard",
      phoneSecondary: "standard", language: "standard", preferredChannel: "standard",
    },
    // Staff say names out loud, so pronunciation is standard.
    name_pronunciations: {
      id: "standard", schoolId: "standard", createdAt: "standard", updatedAt: "standard", createdBy: "standard",
      studentId: "standard", phonetic: "standard", audioObjectKey: "standard", language: "standard",
      recordedByKind: "standard",
    },
    // Every column is sensitive: the row's existence discloses a support.
    student_supports: {
      id: "sensitive", schoolId: "sensitive", createdAt: "sensitive", updatedAt: "sensitive", createdBy: "sensitive",
      studentId: "sensitive", type: "sensitive", details: "sensitive", accommodations: "sensitive",
      startsOn: "sensitive", endsOn: "sensitive", source: "sensitive",
    },
    student_health: {
      id: "sensitive", schoolId: "sensitive", createdAt: "sensitive", updatedAt: "sensitive", createdBy: "sensitive",
      studentId: "sensitive", hasAllergies: "sensitive", allergyDetails: "sensitive", epipen: "sensitive",
      allergyMedication: "sensitive", foodRestrictions: "sensitive", lunchAccommodations: "sensitive",
      allergyForm: "sensitive", asthmaForm: "sensitive", generalForm: "sensitive", immunizationStatus: "sensitive",
      immunizationDate: "sensitive", physicalStatus: "sensitive", physicalDate: "sensitive", source: "sensitive",
    },
    student_demographics: {
      id: "restricted", schoolId: "restricted", createdAt: "restricted", updatedAt: "restricted", createdBy: "restricted",
      studentId: "restricted", gender: "restricted", ethnicity: "restricted", homeAddress: "restricted",
      mealFormStatus: "restricted", source: "restricted",
    },
  },
});
