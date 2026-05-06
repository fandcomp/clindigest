// Default FHIR R4 test server (HAPI FHIR - public, no auth required)
export const DEFAULT_FHIR_SERVER_URL = "https://hapi.fhir.org/baseR4";

// Server configuration
export const SERVER_NAME = "clindigest-mcp-server";
export const SERVER_VERSION = "1.0.0";

// FHIR fetch defaults
export const FHIR_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_OBSERVATION_COUNT = 20;
export const DEFAULT_ENCOUNTER_COUNT = 5;

// Summary defaults
export const DEFAULT_SHIFT_HOURS = 12;
export const DEFAULT_READING_LEVEL = "simple" as const;
export const DEFAULT_URGENCY = "routine" as const;

// Safety disclaimer appended to all generated summaries
export const SAFETY_DISCLAIMER =
  "⚠️ AI-generated draft — verify all clinical details before acting on this summary.";
