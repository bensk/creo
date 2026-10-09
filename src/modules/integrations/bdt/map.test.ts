import { describe, expect, it } from "vitest";
import type { NotionPage } from "../notion/client";
import { flattenProperty } from "../notion/client";
import { mapBdtRow, parseHomeroom, splitName } from "./map";

// Synthetic rows only.
const page = (properties: NotionPage["properties"]): NotionPage => ({ id: "page-1", properties });
const base = {
  First: "Test", Last: "Student", Grade: "7", OSIS: 999123456, Homeroom: "7 - Albany Shaniah & Lily",
  DOB: { start: "2013-04-02", end: null }, "Start Date": { start: "2026-09-08", end: null },
};

describe("parseHomeroom", () => {
  it.each([
    ["7 - Albany Shaniah & Lily", { name: "Albany", grade: 7, ict: false }],
    ["7 - Farmingdale (ICT) Emily/ Elisha", { name: "Farmingdale", grade: 7, ict: true }],
    ["8 - USC (ICT)", { name: "USC", grade: 8, ict: true }],
    ["8 - Morgan State", { name: "Morgan State", grade: 8, ict: false }],
    ["5 - JSU (ICT)", { name: "JSU", grade: 5, ict: true }],
    ["6 - SJU", { name: "SJU", grade: 6, ict: false }],
  ])("%s", (label, expected) => {
    expect(parseHomeroom(label)).toEqual(expected);
  });

  it("rejects labels without a grade", () => {
    expect(parseHomeroom("Albany")).toBeNull();
  });
});

describe("mapBdtRow", () => {
  it("maps identity, grade, homeroom, and dates", () => {
    const r = mapBdtRow(page(base), 1);
    expect(r).toMatchObject({
      ok: true,
      student: {
        legalFirstName: "Test", legalLastName: "Student", osis: "999123456", dateOfBirth: "2013-04-02", grade: 7,
        homeroom: { name: "Albany", grade: 7, ict: false }, entryDate: "2026-09-08", withdrawn: false, support: null,
      },
    });
  });

  it("maps guardians and the emergency contact, dropping creoprep.org emails", () => {
    const r = mapBdtRow(page({
      ...base,
      "Guardian Name": "Ana María López", "Guardian Relation": "Mother", "Guardian Phone 1": "(718) 555-0101",
      "Guardian Email": "teacher@creoprep.org",
      "2nd Guardian Name": "José López", "2nd Guardian Relation": "Father", "2nd Guardian Email": "jose@example.com",
      "Emergency Contact Name": "Rosa Pérez", "Emergency Contact Relation": "Aunt", "Emergency Contact Phone": "(347) 555-0102",
    }), 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.student.contacts).toEqual([
      expect.objectContaining({ slot: "guardian1", firstName: "Ana María", lastName: "López", relationship: "mother", email: null, isGuardian: true }),
      expect.objectContaining({ slot: "guardian2", firstName: "José", email: "jose@example.com", isGuardian: true }),
      expect.objectContaining({ slot: "emergency", relationship: "aunt", phonePrimary: "(347) 555-0102", isGuardian: false }),
    ]);
    expect(r.student.droppedStaffEmails).toBe(1);
  });

  it.each([
    ["Received", { type: "iep", details: null }],
    ["Missing IEP", { type: "iep", details: "IEP not yet received from the previous school" }],
    ["504", { type: "504", details: null }],
    ["N/A", null],
    ["No IEP - interested in evaluation", null],
  ] as const)("maps IEP %s", (value, support) => {
    const r = mapBdtRow(page({ ...base, IEP: value, "Testing Accommodation(s)": ["Extended Time", "Breaks"] }), 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.student.support).toEqual(support);
    expect(r.student.accommodations).toEqual(["Extended Time", "Breaks"]);
  });

  it("marks withdrawn students", () => {
    const r = mapBdtRow(page({ ...base, "ATS Status": "Withdrawn" }), 1);
    expect(r.ok && r.student.withdrawn).toBe(true);
  });

  it.each([
    [{ First: null }, /row 3: First\/Last is empty/],
    [{ Grade: "9" }, /row 3: Grade/],
    [{ OSIS: 12345678901 }, /row 3: OSIS is not nine digits/],
    [{ Homeroom: "Albany" }, /row 3: Homeroom doesn't look like/],
    [{ Homeroom: "8 - USC (ICT)" }, /row 3: Homeroom is for a different grade/],
  ])("reports problems by row number only: %o", (change, error) => {
    const r = mapBdtRow(page({ ...base, ...change }), 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(error);
      expect(r.error).not.toMatch(/Test|Student|999/);
    }
  });

  it("splits names on the last word", () => {
    expect(splitName("Maria Del Carmen Rodríguez")).toEqual({ firstName: "Maria Del Carmen", lastName: "Rodríguez" });
  });
});

describe("flattenProperty", () => {
  it("flattens the Notion property types the tracker uses", () => {
    expect(flattenProperty({ type: "title", title: [{ plain_text: "A " }, { plain_text: "B" }] })).toBe("A B");
    expect(flattenProperty({ type: "select", select: { name: "7" } })).toBe("7");
    expect(flattenProperty({ type: "select", select: null })).toBeNull();
    expect(flattenProperty({ type: "multi_select", multi_select: [{ name: "Breaks" }] })).toEqual(["Breaks"]);
    expect(flattenProperty({ type: "number", number: 999123456 })).toBe(999123456);
    expect(flattenProperty({ type: "checkbox", checkbox: true })).toBe(true);
    expect(flattenProperty({ type: "date", date: { start: "2013-04-02", end: null } })).toEqual({ start: "2013-04-02", end: null });
    expect(flattenProperty({ type: "people", people: [] })).toBeNull();
  });
});

describe("health, demographics, and consent", () => {
  it("reads the enrollment-form answers into health fields", () => {
    const r = mapBdtRow(page({
      ...base,
      Allergies: ["My child has allergies", "My child has an EpiPen which I will be providing."],
      "Allergen/Reaction/Treatment": "Peanuts / hives / EpiPen",
      Asthma: ["My child has the following food restrictions"],
      "Lunch Accommodations": ["Dairy Free"],
      "Allergy MAF": "Recieved", "Asthma MAF": "Missing Asthma MAF", "General MAF": "N/A",
      Immunization: ["ATS Done", "Received"], "Immunization Date": { start: "2026-08-20", end: null },
      Physical: ["ATS Needed", "Appt Scheduled"],
    }), 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.student.health).toEqual({
      hasAllergies: true, allergyDetails: "Peanuts / hives / EpiPen", epipen: true, allergyMedication: false,
      foodRestrictions: true, lunchAccommodations: ["Dairy Free"], allergyForm: "received", asthmaForm: "missing",
      generalForm: "not_needed", immunizationStatus: "received", immunizationDate: "2026-08-20",
      physicalStatus: "appointment_scheduled", physicalDate: null,
    });
  });

  it("records 'no known allergies' as false and leaves empty health as null", () => {
    const none = mapBdtRow(page({ ...base, Allergies: ["My child has NO known allergies."], Asthma: ["My child has NO specific food restrictions."] }), 1);
    expect(none.ok && none.student.health).toMatchObject({ hasAllergies: false, foodRestrictions: false });
    const empty = mapBdtRow(page(base), 1);
    expect(empty.ok && empty.student.health).toBeNull();
  });

  it("reads demographics; the meal column is the form's status, not eligibility", () => {
    const r = mapBdtRow(page({ ...base, Gender: "F", Ethnicity: ["Hispanic/Latino"], "Home Address": "1 Test Pl, Bronx, NY 10454", "FRP (meals)": ["ATS Done", "Received"] }), 1);
    expect(r.ok && r.student.demographics).toEqual({ gender: "F", ethnicity: ["Hispanic/Latino"], homeAddress: "1 Test Pl, Bronx, NY 10454", mealFormStatus: "received" });
  });

  it.each([["No", "no"], ["Ask first", "ask_first"], [null, null]] as const)("maps media consent %s", (value, expected) => {
    const r = mapBdtRow(page({ ...base, "Social Media": value }), 1);
    expect(r.ok && r.student.mediaConsent).toBe(expected);
  });
});
