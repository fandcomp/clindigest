/**
 * FHIR R4 REST Client
 *
 * Handles all communication with FHIR R4 servers. Uses native fetch (Node 18+).
 * Provides typed methods for each resource type we need.
 */

import {
  DEFAULT_FHIR_SERVER_URL,
  FHIR_FETCH_TIMEOUT_MS,
  DEFAULT_OBSERVATION_COUNT,
  DEFAULT_ENCOUNTER_COUNT,
} from "../constants.js";
import { FHIRFetchError, PatientNotFoundError } from "../utils/errors.js";
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

export class FHIRClient {
  private baseUrl: string;
  private accessToken?: string;

  /**
   * @param baseUrl    FHIR R4 server URL (default: HAPI FHIR public test server)
   * @param accessToken  Bearer token from SHARP context / SMART-on-FHIR launch.
   *                     When provided, it is sent as Authorization header on every request.
   */
  constructor(baseUrl?: string, accessToken?: string) {
    // Remove trailing slash if present
    this.baseUrl = (baseUrl ?? DEFAULT_FHIR_SERVER_URL).replace(/\/+$/, "");
    this.accessToken = accessToken;
  }

  // ──────────────────────────────────────────
  // Core fetch helper
  // ──────────────────────────────────────────

  private async fhirFetch<T>(path: string, resourceType?: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FHIR_FETCH_TIMEOUT_MS);

      const headers: Record<string, string> = {
        Accept: "application/fhir+json",
        "Content-Type": "application/fhir+json",
      };

      // SHARP: forward the access token from the agent host
      if (this.accessToken) {
        headers["Authorization"] = this.accessToken.startsWith("Bearer ")
          ? this.accessToken
          : `Bearer ${this.accessToken}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new FHIRFetchError(
          `FHIR server returned HTTP ${response.status} for ${path}`,
          response.status,
          resourceType
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof FHIRFetchError) throw error;

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new FHIRFetchError(
            `Request to ${path} timed out after ${FHIR_FETCH_TIMEOUT_MS}ms`,
            undefined,
            resourceType
          );
        }
        throw new FHIRFetchError(error.message, undefined, resourceType);
      }

      throw new FHIRFetchError(String(error), undefined, resourceType);
    }
  }

  /**
   * Extract resources of a given type from a FHIR Bundle.
   */
  private extractFromBundle<T>(bundle: FHIRBundle, resourceType: string): T[] {
    if (!bundle.entry || bundle.entry.length === 0) return [];
    return bundle.entry
      .filter((e) => e.resource?.resourceType === resourceType)
      .map((e) => e.resource as T);
  }

  // ──────────────────────────────────────────
  // Resource-specific fetchers
  // ──────────────────────────────────────────

  /**
   * Fetch a single Patient by ID.
   * Throws PatientNotFoundError if not found.
   */
  async getPatient(patientId: string): Promise<FHIRPatient> {
    try {
      return await this.fhirFetch<FHIRPatient>(`/Patient/${patientId}`, "Patient");
    } catch (error) {
      if (error instanceof FHIRFetchError && error.statusCode === 404) {
        throw new PatientNotFoundError(patientId);
      }
      throw error;
    }
  }

  /**
   * Fetch conditions for a patient.
   * When includeHistory=false, only returns active/recurrence/relapse conditions.
   */
  async getConditions(patientId: string, includeHistory = false): Promise<FHIRCondition[]> {
    const statusFilter = includeHistory ? "" : "&clinical-status=active,recurrence,relapse";
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/Condition?patient=${patientId}${statusFilter}&_sort=-recorded-date&_count=50`,
      "Condition"
    );
    return this.extractFromBundle<FHIRCondition>(bundle, "Condition");
  }

  /**
   * Fetch active medication requests for a patient.
   */
  async getMedicationRequests(patientId: string): Promise<FHIRMedicationRequest[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/MedicationRequest?patient=${patientId}&status=active,on-hold&_sort=-authoredon&_count=50`,
      "MedicationRequest"
    );
    return this.extractFromBundle<FHIRMedicationRequest>(bundle, "MedicationRequest");
  }

  /**
   * Fetch recent observations (vital signs + lab results).
   */
  async getObservations(
    patientId: string,
    count = DEFAULT_OBSERVATION_COUNT
  ): Promise<FHIRObservation[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/Observation?patient=${patientId}&_sort=-date&_count=${count}`,
      "Observation"
    );
    return this.extractFromBundle<FHIRObservation>(bundle, "Observation");
  }

  /**
   * Fetch allergy intolerances for a patient.
   */
  async getAllergyIntolerances(patientId: string): Promise<FHIRAllergyIntolerance[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/AllergyIntolerance?patient=${patientId}&_count=50`,
      "AllergyIntolerance"
    );
    return this.extractFromBundle<FHIRAllergyIntolerance>(bundle, "AllergyIntolerance");
  }

  /**
   * Fetch recent encounters for a patient.
   */
  async getEncounters(
    patientId: string,
    count = DEFAULT_ENCOUNTER_COUNT
  ): Promise<FHIREncounter[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/Encounter?patient=${patientId}&_sort=-date&_count=${count}`,
      "Encounter"
    );
    return this.extractFromBundle<FHIREncounter>(bundle, "Encounter");
  }

  /**
   * Fetch procedures for a patient.
   */
  async getProcedures(patientId: string): Promise<FHIRProcedure[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/Procedure?patient=${patientId}&_sort=-date&_count=20`,
      "Procedure"
    );
    return this.extractFromBundle<FHIRProcedure>(bundle, "Procedure");
  }

  /**
   * Fetch active care plans for a patient.
   */
  async getCarePlans(patientId: string): Promise<FHIRCarePlan[]> {
    const bundle = await this.fhirFetch<FHIRBundle>(
      `/CarePlan?patient=${patientId}&status=active&_count=20`,
      "CarePlan"
    );
    return this.extractFromBundle<FHIRCarePlan>(bundle, "CarePlan");
  }

  /**
   * Fetch ALL resources in parallel for a given patient.
   * Returns partial results if some fetches fail (logs warnings).
   */
  async getAllResources(
    patientId: string,
    includeHistory = false
  ): Promise<{
    patient: FHIRPatient;
    conditions: FHIRCondition[];
    medications: FHIRMedicationRequest[];
    observations: FHIRObservation[];
    allergies: FHIRAllergyIntolerance[];
    encounters: FHIREncounter[];
    procedures: FHIRProcedure[];
    carePlans: FHIRCarePlan[];
    warnings: string[];
  }> {
    // Patient is required — if this fails, we throw
    const patient = await this.getPatient(patientId);

    // Fetch everything else in parallel; collect warnings for failures
    const warnings: string[] = [];

    const safeCall = async <T>(
      fn: () => Promise<T[]>,
      label: string
    ): Promise<T[]> => {
      try {
        return await fn();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        warnings.push(`Could not fetch ${label}: ${msg}`);
        return [];
      }
    };

    const [conditions, medications, observations, allergies, encounters, procedures, carePlans] =
      await Promise.all([
        safeCall(() => this.getConditions(patientId, includeHistory), "Conditions"),
        safeCall(() => this.getMedicationRequests(patientId), "Medications"),
        safeCall(() => this.getObservations(patientId), "Observations"),
        safeCall(() => this.getAllergyIntolerances(patientId), "Allergies"),
        safeCall(() => this.getEncounters(patientId), "Encounters"),
        safeCall(() => this.getProcedures(patientId), "Procedures"),
        safeCall(() => this.getCarePlans(patientId), "Care Plans"),
      ]);

    return {
      patient,
      conditions,
      medications,
      observations,
      allergies,
      encounters,
      procedures,
      carePlans,
      warnings,
    };
  }
}
