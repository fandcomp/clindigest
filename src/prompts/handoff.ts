/**
 * Handoff Summary Prompt — SBAR Format
 *
 * Generates a clinical handoff summary for shift changes.
 * Uses SBAR (Situation, Background, Assessment, Recommendation),
 * the gold standard for clinical communication.
 */

import type { PatientContext, RecipientRole } from "../types.js";
import { CLINICAL_GUARDRAILS, serializePatientContext } from "./shared.js";

const ROLE_INSTRUCTIONS: Record<RecipientRole, string> = {
  nurse:
    "Use clinical language appropriate for an experienced registered nurse. " +
    "Emphasize nursing-relevant details: vital sign trends, I/O balance, medication administration times, " +
    "pain assessment, mobility status, skin integrity, and pending nursing tasks.",
  physician:
    "Use physician-level clinical language with standard medical abbreviations. " +
    "Emphasize clinical decision points: diagnostic workup status, treatment response, " +
    "pending consults, disposition planning, and any deterioration in clinical status.",
  resident:
    "Use clinical language appropriate for a medical resident. " +
    "Be thorough — include both the high-level clinical picture and actionable details. " +
    "Highlight learning-relevant context: differential diagnoses being considered, " +
    "rationale for current treatment plan, and overnight contingency plans.",
};

export function buildHandoffPrompt(
  ctx: PatientContext,
  options: {
    shiftHours: number;
    recipientRole: RecipientRole;
    priorityFocus?: string;
  }
): { system: string; user: string } {
  const roleInstr = ROLE_INSTRUCTIONS[options.recipientRole];
  const focusLine = options.priorityFocus
    ? `\nPRIORITY FOCUS: "${options.priorityFocus}" — give this extra attention and highlight it prominently.\n`
    : "";

  const system = `You are a clinical documentation assistant generating a shift handoff summary.

AUDIENCE: ${options.recipientRole}
${roleInstr}

FORMAT: Structure the summary using SBAR:

## Situation
Who is this patient? One-liner: name, age, sex, primary reason for current encounter.

## Background
Relevant medical history, current admission/visit reason, key diagnoses, allergies, and current medications. Keep it concise — only what the incoming clinician needs to know.

## Assessment
Current clinical status based on the most recent data:
- Vital signs trends (flag any that are abnormal)
- Lab results (especially flagged/critical values)
- Changes in condition during the shift window
- Response to treatments
- Current pain level / functional status if relevant

## Recommendation
- Pending tasks and orders
- Things to monitor closely
- Anticipated changes or escalation triggers
- Follow-up items from the care plan
${focusLine}
SHIFT WINDOW: Focus on events and changes within the last ${options.shiftHours} hours, but include essential background context.

${CLINICAL_GUARDRAILS}`;

  const user = `Generate a shift handoff summary for the following patient. The incoming ${options.recipientRole} needs to quickly understand who this patient is, what happened recently, and what to watch for.

${serializePatientContext(ctx)}`;

  return { system, user };
}
