export const SENSITIVITY_LEVELS = ["standard", "restricted", "sensitive", "confidential"] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

/** Field name → sensitivity, for one table. Every column of a student-data table must be listed. */
export type FieldSensitivity = Readonly<Record<string, Sensitivity>>;
