/**
 * SHARP Context — Standardised Healthcare Agent Remote Protocol
 *
 * SHARP defines a headers-based context model for MCP servers in healthcare.
 * The agent host (e.g., Prompt Opinion platform via SMART-on-FHIR launch)
 * obtains the FHIR token and forwards it on every MCP request via headers.
 *
 * The MCP server NEVER runs an OAuth dance itself.
 *
 * Headers:
 *   X-FHIR-Server-URL:   Base URL of the FHIR R4 server
 *   X-FHIR-Access-Token:  Bearer token from the SMART-on-FHIR launch
 *   X-Patient-ID:         Current patient in context (optional)
 *
 * Reference: SHARP §3.2, sharp-on-fhir-mcp implementation
 */

import type { Request } from "express";

export interface SharpContext {
  /** FHIR R4 server base URL provided by the agent host */
  fhirServerUrl?: string;
  /** Bearer token for authenticated FHIR requests */
  fhirAccessToken?: string;
  /** Patient ID currently in context */
  patientId?: string;
}

/**
 * Extract SHARP context from incoming HTTP request headers.
 * Returns an object with whatever context was provided; fields
 * will be undefined if the corresponding header is absent.
 */
export function extractSharpContext(req: Request): SharpContext {
  const fhirServerUrl = getHeader(req, "x-fhir-server-url");
  const fhirAccessToken = getHeader(req, "x-fhir-access-token");
  const patientId = getHeader(req, "x-patient-id");

  return {
    fhirServerUrl: fhirServerUrl || undefined,
    fhirAccessToken: fhirAccessToken || undefined,
    patientId: patientId || undefined,
  };
}

/**
 * Safely read a single header value (handles string | string[] | undefined).
 */
function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Merge SHARP context with explicit tool parameters.
 * Tool params take precedence over SHARP headers, allowing
 * the agent to override context when needed.
 */
export function resolveContext(
  sharp: SharpContext,
  toolParams: {
    patient_id?: string;
    fhir_server_url?: string;
  }
): { fhirServerUrl?: string; fhirAccessToken?: string; patientId?: string } {
  return {
    fhirServerUrl: toolParams.fhir_server_url || sharp.fhirServerUrl,
    fhirAccessToken: sharp.fhirAccessToken,
    patientId: toolParams.patient_id || sharp.patientId,
  };
}
