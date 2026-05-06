/**
 * Fixture Loader
 *
 * Loads synthetic FHIR patient bundles from JSON files.
 * Used as fallback when live FHIR server is unreachable,
 * and as the primary data source during demos.
 *
 * Patient IDs:
 *   synth-maria-001  → Diabetes / hypertension / CKD
 *   synth-john-002   → Post-CABG day 3 / AFib / anticoagulation
 *   synth-emma-003   → Community-acquired pneumonia / COPD / approaching discharge
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  FHIRBundle,
  FHIRPatient,
  FHIRCondition,
  FHIRMedicationRequest,
  FHIRObservation,
  FHIRAllergyIntolerance,
  FHIREncounter,
  FHIRProcedure,
  FHIRCarePlan,
} from "../types.js";

// Resolve fixtures directory relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures");

/**
 * Map of synthetic patient IDs → fixture file names.
 */
const FIXTURE_MAP: Record<string, string> = {
  "synth-maria-001": "patient-diabetes.json",
  "synth-john-002": "patient-cardiac.json",
  "synth-emma-003": "patient-pneumonia.json",
};

/**
 * List all available synthetic patient IDs.
 */
export function listSyntheticPatients(): string[] {
  return Object.keys(FIXTURE_MAP);
}

/**
 * Check if a patient ID corresponds to a synthetic fixture.
 */
export function isSyntheticPatient(patientId: string): boolean {
  return patientId in FIXTURE_MAP;
}

/**
 * Load a fixture bundle from disk and extract resources by type.
 * Returns the same shape as FHIRClient.getAllResources() so it can
 * be used as a drop-in fallback.
 */
export async function loadFixture(patientId: string): Promise<{
  patient: FHIRPatient;
  conditions: FHIRCondition[];
  medications: FHIRMedicationRequest[];
  observations: FHIRObservation[];
  allergies: FHIRAllergyIntolerance[];
  encounters: FHIREncounter[];
  procedures: FHIRProcedure[];
  carePlans: FHIRCarePlan[];
  warnings: string[];
} | null> {
  const fileName = FIXTURE_MAP[patientId];
  if (!fileName) return null;

  try {
    const filePath = join(FIXTURES_DIR, fileName);
    const raw = await readFile(filePath, "utf-8");
    const bundle: FHIRBundle = JSON.parse(raw);

    if (!bundle.entry || bundle.entry.length === 0) {
      return null;
    }

    const byType = <T>(type: string): T[] =>
      bundle.entry!
        .filter((e) => e.resource?.resourceType === type)
        .map((e) => e.resource as T);

    const patients = byType<FHIRPatient>("Patient");
    if (patients.length === 0) return null;

    return {
      patient: patients[0],
      conditions: byType<FHIRCondition>("Condition"),
      medications: byType<FHIRMedicationRequest>("MedicationRequest"),
      observations: byType<FHIRObservation>("Observation"),
      allergies: byType<FHIRAllergyIntolerance>("AllergyIntolerance"),
      encounters: byType<FHIREncounter>("Encounter"),
      procedures: byType<FHIRProcedure>("Procedure"),
      carePlans: byType<FHIRCarePlan>("CarePlan"),
      warnings: ["Data loaded from synthetic fixture (not a live FHIR server)"],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load fixture for ${patientId}: ${msg}`);
    return null;
  }
}
