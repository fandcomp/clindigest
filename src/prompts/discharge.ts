/**
 * Discharge Summary Prompt — Dual Output
 *
 * Generates two sections:
 *   1. Clinical summary for the medical record
 *   2. Patient-friendly instructions adapted to reading level
 */

import type { PatientContext, ReadingLevel } from "../types.js";
import { CLINICAL_GUARDRAILS, serializePatientContext } from "./shared.js";

const READING_LEVEL_INSTRUCTIONS: Record<ReadingLevel, string> = {
  simple:
    "Write at a 5th-grade reading level. Use short sentences. " +
    "Avoid ALL medical jargon — replace every medical term with a plain-language explanation. " +
    "Use analogies when helpful (e.g., 'Your kidneys are like filters for your blood'). " +
    "Format medication instructions as simple steps a person can follow at home.",
  standard:
    "Write at a general adult reading level. You may use common medical terms " +
    "(like 'blood pressure' or 'infection') but explain specialized terms. " +
    "Be clear and direct without being patronizing.",
  clinical:
    "Write at a health-literate level appropriate for a patient with medical knowledge " +
    "(e.g., a nurse, medical student, or well-informed patient). " +
    "Standard medical terminology is acceptable.",
};

export function buildDischargePrompt(
  ctx: PatientContext,
  options: {
    dischargeDiagnosis?: string;
    readingLevel: ReadingLevel;
    outputLanguage: string;
  }
): { system: string; user: string } {
  const readingInstr = READING_LEVEL_INSTRUCTIONS[options.readingLevel];

  const diagnosisLine = options.dischargeDiagnosis
    ? `PRIMARY DISCHARGE DIAGNOSIS: ${options.dischargeDiagnosis}`
    : "PRIMARY DISCHARGE DIAGNOSIS: Determine from the active conditions listed in the patient context.";

  const languageLine =
    options.outputLanguage !== "en"
      ? `\nLANGUAGE: Write the PATIENT INSTRUCTIONS section in language code "${options.outputLanguage}". The clinical section should remain in English.\n`
      : "";

  const system = `You are a clinical documentation assistant generating a discharge summary with two distinct sections.

${diagnosisLine}
${languageLine}

FORMAT: Generate exactly two sections separated by a horizontal rule (---):

# SECTION 1: Clinical Discharge Summary
(For the medical record — written in standard clinical language)

## Discharge Summary

**Patient:** Name, age, sex, MRN
**Admission Date:** (from encounter data)
**Discharge Date:** Today
**Primary Diagnosis:** (discharge diagnosis)
**Secondary Diagnoses:** (other active conditions)

### Hospital Course
Brief narrative of what happened during this encounter:
- Why the patient was admitted/seen
- Key findings and test results
- Treatments provided
- Clinical response and progress

### Discharge Medications
Full list with dose, route, and frequency. Note any NEW medications
started during this encounter or CHANGES to existing medications.

### Follow-Up Plan
- Scheduled appointments
- Pending results to follow up on
- Referrals made

### Discharge Condition
Patient's clinical status at time of discharge.

---

# SECTION 2: Patient Instructions
(For the patient to take home — adapted to reading level)

READING LEVEL: ${options.readingLevel}
${readingInstr}

## What Happened
Explain the diagnosis and what was done in simple terms.
Help the patient understand WHY they were in the hospital/clinic.

## Your Medications
For EACH medication, provide:
- **Name** of the medicine
- **What it's for** (in plain language)
- **How to take it** (dose, time of day, with/without food)
- **Watch out for** (key side effects to be aware of)

Format as a clear, numbered list. If a medication is NEW or CHANGED, mark it clearly.

## Your Follow-Up Appointments
When and where to go. Include what to bring (insurance card, medication list, etc.).

## Warning Signs — When to Get Help
Split into two categories:
📞 **Call your doctor if:** (non-emergency but needs attention within 24-48h)
🚨 **Go to the Emergency Room if:** (potentially dangerous symptoms)
Make these specific to the patient's conditions, not generic.

## Activity & Diet
What the patient can and cannot do. Be specific:
- Physical activity restrictions
- Dietary guidelines relevant to their conditions
- How long restrictions apply
- When they can return to normal activities

${CLINICAL_GUARDRAILS}`;

  const user = `Generate a discharge summary for the following patient.

${serializePatientContext(ctx)}`;

  return { system, user };
}
