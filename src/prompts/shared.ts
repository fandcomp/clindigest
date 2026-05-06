/**
 * Shared Prompt Utilities
 *
 * Common building blocks used across all summary prompt templates:
 * - Clinical safety guardrails
 * - PatientContext serialization
 * - Formatting rules
 */

import type { PatientContext } from "../types.js";
import { SAFETY_DISCLAIMER } from "../constants.js";

/**
 * Clinical safety rules injected into every summary prompt.
 */
export const CLINICAL_GUARDRAILS = `
CRITICAL SAFETY RULES — follow these without exception:
1. NEVER invent, infer, or hallucinate clinical data. Only reference information present in the patient context below.
2. If data seems incomplete or a section has no entries, explicitly state "No data available" rather than guessing.
3. Do NOT provide differential diagnoses, suggest new treatments, or make clinical recommendations beyond what is documented in the care plan.
4. Flag any critical or abnormal values prominently — these could be life-threatening.
5. End every summary with: "${SAFETY_DISCLAIMER}"
`.trim();

/**
 * Serialize PatientContext into a structured text block for prompt injection.
 * Uses a concise format that's token-efficient but still readable by the LLM.
 */
export function serializePatientContext(ctx: PatientContext): string {
  const sections: string[] = [];

  // Demographics
  sections.push(`PATIENT: ${ctx.patient.name} | ${ctx.patient.age}yo ${ctx.patient.gender} | MRN: ${ctx.patient.mrn}`);

  // Active Conditions
  if (ctx.activeConditions.length > 0) {
    const items = ctx.activeConditions
      .map((c) => `- ${c.display} (onset: ${c.onsetDate}${c.severity ? ", severity: " + c.severity : ""})`)
      .join("\n");
    sections.push(`ACTIVE CONDITIONS:\n${items}`);
  } else {
    sections.push("ACTIVE CONDITIONS: None documented");
  }

  // Medications
  if (ctx.medications.length > 0) {
    const items = ctx.medications
      .map((m) => `- ${m.name} | ${m.dosage} | ${m.frequency} | since ${m.startDate}`)
      .join("\n");
    sections.push(`CURRENT MEDICATIONS:\n${items}`);
  } else {
    sections.push("CURRENT MEDICATIONS: None active");
  }

  // Vital Signs
  if (ctx.recentVitals.length > 0) {
    const items = ctx.recentVitals
      .map((v) => `- ${v.type}: ${v.value} ${v.unit} (${v.timestamp})`)
      .join("\n");
    sections.push(`RECENT VITAL SIGNS:\n${items}`);
  } else {
    sections.push("RECENT VITAL SIGNS: None recorded");
  }

  // Lab Results
  if (ctx.recentLabs.length > 0) {
    const items = ctx.recentLabs
      .map((l) => {
        const flag = l.flag ? ` ⚠️ [${l.flag.toUpperCase()}]` : "";
        return `- ${l.test}: ${l.value} ${l.unit} (ref: ${l.referenceRange})${flag} — ${l.timestamp}`;
      })
      .join("\n");
    sections.push(`RECENT LAB RESULTS:\n${items}`);
  } else {
    sections.push("RECENT LAB RESULTS: None available");
  }

  // Allergies
  if (ctx.allergies.length > 0) {
    const items = ctx.allergies
      .map((a) => `- ${a.substance} → ${a.reaction} (severity: ${a.severity})`)
      .join("\n");
    sections.push(`ALLERGIES:\n${items}`);
  } else {
    sections.push("ALLERGIES: No known allergies documented");
  }

  // Recent Encounters
  if (ctx.recentEncounters.length > 0) {
    const items = ctx.recentEncounters
      .map((e) => `- ${e.type}: ${e.reason} (${e.date}, ${e.status})`)
      .join("\n");
    sections.push(`RECENT ENCOUNTERS:\n${items}`);
  } else {
    sections.push("RECENT ENCOUNTERS: None");
  }

  // Procedures
  if (ctx.procedures.length > 0) {
    const items = ctx.procedures
      .map((p) => `- ${p.name} (${p.date}, ${p.status})`)
      .join("\n");
    sections.push(`PROCEDURES:\n${items}`);
  } else {
    sections.push("PROCEDURES: None documented");
  }

  // Care Plans
  if (ctx.carePlans.length > 0) {
    const items = ctx.carePlans
      .map((cp) => {
        const activities = cp.activities.length > 0
          ? cp.activities.map((a) => `    • ${a}`).join("\n")
          : "    • No activities listed";
        return `- ${cp.title} (${cp.status}):\n${activities}`;
      })
      .join("\n");
    sections.push(`ACTIVE CARE PLANS:\n${items}`);
  } else {
    sections.push("ACTIVE CARE PLANS: None");
  }

  return sections.join("\n\n");
}
