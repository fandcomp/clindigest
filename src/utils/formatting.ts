/**
 * Shared formatting utilities for clinical summaries.
 */

import { SAFETY_DISCLAIMER } from "../constants.js";

/**
 * Format a date string into a human-readable format.
 */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown date";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a datetime string with time included.
 */
export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calculate age from birth date string.
 */
export function calculateAge(birthDate: string | undefined): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Extract a human-readable name from a FHIR Patient name array.
 */
export function extractPatientName(
  names: Array<{ use?: string; family?: string; given?: string[]; text?: string }> | undefined
): string {
  if (!names || names.length === 0) return "Unknown Patient";

  // Prefer "official" name, fall back to first entry
  const official = names.find((n) => n.use === "official") ?? names[0];

  if (official.text) return official.text;

  const given = official.given?.join(" ") ?? "";
  const family = official.family ?? "";
  const fullName = `${given} ${family}`.trim();

  return fullName || "Unknown Patient";
}

/**
 * Extract MRN (Medical Record Number) from patient identifiers.
 */
export function extractMRN(
  identifiers: Array<{ system?: string; value?: string; type?: { text?: string } }> | undefined
): string {
  if (!identifiers || identifiers.length === 0) return "N/A";

  // Look for MRN identifier
  const mrn = identifiers.find(
    (id) =>
      id.type?.text?.toLowerCase().includes("mrn") ||
      id.type?.text?.toLowerCase().includes("medical record") ||
      id.system?.includes("mrn")
  );

  if (mrn?.value) return mrn.value;

  // Fall back to first identifier
  return identifiers[0]?.value ?? "N/A";
}

/**
 * Wrap a generated summary with the standard safety disclaimer.
 */
export function wrapWithDisclaimer(summary: string): string {
  return `${summary}\n\n---\n${SAFETY_DISCLAIMER}`;
}

/**
 * Check if a timestamp is within the last N hours.
 */
export function isWithinHours(dateStr: string | undefined, hours: number): boolean {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return date >= cutoff;
  } catch {
    return false;
  }
}
