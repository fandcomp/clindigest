/**
 * Referral Summary Prompt — Specialty-Aware
 *
 * Generates a referral letter for a specialist. Adapts content
 * based on the target specialty, emphasizing the data most
 * relevant to that specialist's domain.
 */

import type { PatientContext, Urgency } from "../types.js";
import { CLINICAL_GUARDRAILS, serializePatientContext } from "./shared.js";

/**
 * Specialty-specific guidance for what data to emphasize.
 */
const SPECIALTY_FOCUS: Record<string, string> = {
  cardiology:
    "Emphasize: cardiac history, blood pressure trends, heart rate, cholesterol/lipid labs, " +
    "ECG findings, cardiac medications (anticoagulants, antihypertensives, statins), chest pain history, " +
    "exercise tolerance, and any cardiac imaging results.",
  endocrinology:
    "Emphasize: diabetes management (HbA1c trends, glucose readings, insulin regimen), " +
    "thyroid function, metabolic labs, weight changes, diabetic complications " +
    "(retinopathy, neuropathy, nephropathy), and current endocrine medications.",
  nephrology:
    "Emphasize: kidney function (creatinine, eGFR, BUN), electrolytes, urinalysis results, " +
    "blood pressure control, nephrotoxic medications, fluid balance, " +
    "and any imaging of kidneys/urinary tract.",
  pulmonology:
    "Emphasize: respiratory symptoms, SpO2 trends, respiratory rate, " +
    "chest imaging results, pulmonary function data, inhaler regimen, " +
    "oxygen requirements, smoking history, and infection markers (WBC, CRP, procalcitonin).",
  orthopedics:
    "Emphasize: musculoskeletal complaints, mobility/functional status, " +
    "imaging results (X-ray, MRI, CT), surgical history, pain management, " +
    "fall risk factors, and relevant medications (NSAIDs, steroids, bone health).",
  oncology:
    "Emphasize: cancer history, pathology/staging, prior treatments (chemo, radiation, surgery), " +
    "tumor markers, imaging results, performance status, and symptom burden.",
  neurology:
    "Emphasize: neurological symptoms, mental status changes, seizure history, " +
    "headache patterns, motor/sensory deficits, neuroimaging results, " +
    "and relevant medications (anticonvulsants, neuropathic pain agents).",
  psychiatry:
    "Emphasize: mental health history, current psychiatric symptoms, " +
    "psychotropic medications, substance use history, functional status, " +
    "safety concerns, and relevant social history.",
  gastroenterology:
    "Emphasize: GI symptoms, liver function tests, abdominal imaging, " +
    "endoscopy history, diet/nutrition status, GI medications " +
    "(PPIs, antiemetics, laxatives), and relevant surgical history.",
};

const URGENCY_LANGUAGE: Record<Urgency, string> = {
  routine:
    "This is a routine referral. Use standard professional tone.",
  urgent:
    "This is an URGENT referral. Open with the urgency level. " +
    "Clearly state why timely evaluation is needed and what could worsen if delayed.",
  emergent:
    "This is an EMERGENT referral. Lead with the urgency. " +
    "State the immediate clinical concern, what has been done so far, " +
    "and what the specialist needs to address immediately.",
};

function getSpecialtyFocus(specialty: string): string {
  const key = specialty.toLowerCase().trim();
  if (key in SPECIALTY_FOCUS) {
    return SPECIALTY_FOCUS[key];
  }
  // Fuzzy match
  for (const [k, v] of Object.entries(SPECIALTY_FOCUS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return (
    "Include all clinically relevant information. Prioritize the data most " +
    "pertinent to this specialty, including relevant history, labs, medications, and imaging."
  );
}

export function buildReferralPrompt(
  ctx: PatientContext,
  options: {
    targetSpecialty: string;
    referralReason: string;
    urgency: Urgency;
  }
): { system: string; user: string } {
  const specialtyFocus = getSpecialtyFocus(options.targetSpecialty);
  const urgencyInstr = URGENCY_LANGUAGE[options.urgency];

  const system = `You are a clinical documentation assistant generating a referral summary letter addressed to a ${options.targetSpecialty} specialist.

URGENCY: ${options.urgency.toUpperCase()}
${urgencyInstr}

SPECIALTY FILTERING:
${specialtyFocus}
De-emphasize (but don't omit if relevant) data outside this specialty's primary domain.

FORMAT: Structure the referral as follows:

## Referral to ${options.targetSpecialty}
**Urgency:** ${options.urgency}
**Reason for Referral:** (one clear sentence)

## Patient Summary
Brief demographics + one-liner on current clinical picture.

## Relevant History
Conditions, procedures, and timeline relevant to THIS specialty.
Include onset dates and severity where available.

## Current Medications
Full medication list (the specialist needs this for drug interaction awareness),
but highlight medications most relevant to their specialty.

## Relevant Lab Results & Vitals
Only the data this specialist would want to see.
Flag abnormal values clearly.

## Allergies
Full allergy list — always critical for any specialist.

## What Has Been Tried
Treatments already attempted for the condition being referred.
Include response/outcome if known.

## Specific Questions for the Specialist
2-3 specific clinical questions the referring provider would want answered.
These should be realistic and based on the clinical data.

## Current Care Plan
Relevant active care plan items and pending actions.

${CLINICAL_GUARDRAILS}`;

  const user = `Generate a referral summary for the following patient being referred to ${options.targetSpecialty}.

REASON FOR REFERRAL: ${options.referralReason}

${serializePatientContext(ctx)}`;

  return { system, user };
}
