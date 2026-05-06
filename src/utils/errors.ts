/**
 * Centralized error handling for the ClinDigest MCP server.
 * Provides clear, actionable error messages for agents calling our tools.
 */

export class FHIRFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly resourceType?: string
  ) {
    super(message);
    this.name = "FHIRFetchError";
  }
}

export class PatientNotFoundError extends Error {
  constructor(public readonly patientId: string) {
    super(`Patient with ID "${patientId}" was not found on the FHIR server.`);
    this.name = "PatientNotFoundError";
  }
}

export class SummaryGenerationError extends Error {
  constructor(
    message: string,
    public readonly summaryType: string
  ) {
    super(message);
    this.name = "SummaryGenerationError";
  }
}

/**
 * Format an unknown error into an actionable message for the agent.
 */
export function formatErrorForAgent(error: unknown): string {
  if (error instanceof PatientNotFoundError) {
    return (
      `Error: ${error.message}\n` +
      `Suggestion: Verify the patient_id is correct. ` +
      `You can use FHIR endpoint GET /Patient?name=<name> to search for patients.`
    );
  }

  if (error instanceof FHIRFetchError) {
    if (error.statusCode === 404) {
      return (
        `Error: ${error.resourceType ?? "Resource"} not found.\n` +
        `Suggestion: The patient may not have any ${error.resourceType} records.`
      );
    }
    if (error.statusCode === 429) {
      return "Error: FHIR server rate limit exceeded. Please wait a moment and try again.";
    }
    if (error.statusCode && error.statusCode >= 500) {
      return (
        `Error: FHIR server returned a server error (${error.statusCode}).\n` +
        `Suggestion: The FHIR server may be temporarily unavailable. ` +
        `Try again or use a different fhir_server_url.`
      );
    }
    return `Error: Failed to fetch FHIR data — ${error.message}`;
  }

  if (error instanceof SummaryGenerationError) {
    return (
      `Error: Failed to generate ${error.summaryType} summary — ${error.message}\n` +
      `Suggestion: Ensure patient data was loaded successfully before generating a summary.`
    );
  }

  if (error instanceof Error) {
    if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
      return (
        "Error: Cannot connect to the FHIR server.\n" +
        "Suggestion: Check the fhir_server_url parameter or try the default HAPI FHIR server."
      );
    }
    if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
      return (
        "Error: FHIR server request timed out.\n" +
        "Suggestion: The server may be slow. Try again or use a different fhir_server_url."
      );
    }
    return `Error: ${error.message}`;
  }

  return `Error: An unexpected error occurred — ${String(error)}`;
}
