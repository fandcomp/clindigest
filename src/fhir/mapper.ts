/**
 * FHIR → PatientContext Mapper
 *
 * Transforms raw FHIR R4 resources into the clean PatientContext structure
 * that our summary tools consume. Handles missing fields gracefully.
 */

import type {
  FHIRPatient,
  FHIRCondition,
  FHIRMedicationRequest,
  FHIRObservation,
  FHIRAllergyIntolerance,
  FHIREncounter,
  FHIRProcedure,
  FHIRCarePlan,
  PatientContext,
} from "../types.js";
import {
  calculateAge,
  extractPatientName,
  extractMRN,
  formatDate,
  formatDateTime,
} from "../utils/formatting.js";

// ──────────────────────────────────────────────
// Vital sign LOINC codes → friendly labels
// ──────────────────────────────────────────────

const VITAL_SIGN_CODES: Record<string, string> = {
  "8310-5": "Body Temperature",
  "8867-4": "Heart Rate",
  "9279-1": "Respiratory Rate",
  "2708-6": "SpO2",
  "55284-4": "Blood Pressure",
  "85354-9": "Blood Pressure",
  "8480-6": "Systolic BP",
  "8462-4": "Diastolic BP",
  "29463-7": "Body Weight",
  "8302-2": "Body Height",
  "39156-5": "BMI",
};

const VITAL_SIGN_CATEGORIES = new Set([
  "vital-signs",
  "http://terminology.hl7.org/CodeSystem/observation-category|vital-signs",
]);

// ──────────────────────────────────────────────
// Individual resource mappers
// ──────────────────────────────────────────────

function mapPatient(patient: FHIRPatient): PatientContext["patient"] {
  return {
    id: patient.id,
    name: extractPatientName(patient.name),
    age: calculateAge(patient.birthDate),
    gender: patient.gender ?? "unknown",
    mrn: extractMRN(patient.identifier),
  };
}

function mapConditions(
  conditions: FHIRCondition[]
): PatientContext["activeConditions"] {
  return conditions.map((c) => {
    const coding = c.code?.coding?.[0];
    return {
      code: coding?.code ?? "unknown",
      display: coding?.display ?? c.code?.text ?? "Unknown condition",
      onsetDate: formatDate(c.onsetDateTime ?? c.recordedDate),
      severity: c.severity?.coding?.[0]?.display ?? c.severity?.text,
    };
  });
}

function mapMedications(
  meds: FHIRMedicationRequest[]
): PatientContext["medications"] {
  return meds.map((m) => {
    const name =
      m.medicationCodeableConcept?.coding?.[0]?.display ??
      m.medicationCodeableConcept?.text ??
      "Unknown medication";

    const dosageInstr = m.dosageInstruction?.[0];
    const doseQty = dosageInstr?.doseAndRate?.[0]?.doseQuantity;
    const dosage = doseQty
      ? `${doseQty.value ?? "?"} ${doseQty.unit ?? ""}`
      : dosageInstr?.text ?? "As directed";

    const timing = dosageInstr?.timing;
    let frequency = "As directed";
    if (timing?.code?.text) {
      frequency = timing.code.text;
    } else if (timing?.repeat) {
      const r = timing.repeat;
      if (r.frequency && r.period && r.periodUnit) {
        frequency = `${r.frequency}x per ${r.period} ${r.periodUnit}`;
      }
    }

    return {
      name,
      dosage: dosage.trim(),
      frequency,
      startDate: formatDate(m.authoredOn),
    };
  });
}

function isVitalSign(obs: FHIRObservation): boolean {
  if (!obs.category) return false;
  return obs.category.some((cat) =>
    cat.coding?.some(
      (c) =>
        VITAL_SIGN_CATEGORIES.has(c.code ?? "") ||
        VITAL_SIGN_CATEGORIES.has(`${c.system}|${c.code}`)
    )
  );
}

function mapVitals(
  observations: FHIRObservation[]
): PatientContext["recentVitals"] {
  return observations
    .filter(isVitalSign)
    .map((obs) => {
      const coding = obs.code?.coding?.[0];
      const loincCode = coding?.code ?? "";
      const friendlyName =
        VITAL_SIGN_CODES[loincCode] ?? coding?.display ?? obs.code?.text ?? "Vital Sign";

      let value: string;
      let unit: string;
      if (obs.valueQuantity) {
        value = String(obs.valueQuantity.value ?? "?");
        unit = obs.valueQuantity.unit ?? "";
      } else if (obs.valueString) {
        value = obs.valueString;
        unit = "";
      } else {
        value = "N/A";
        unit = "";
      }

      return {
        type: friendlyName,
        value,
        unit,
        timestamp: formatDateTime(obs.effectiveDateTime ?? obs.issued),
      };
    });
}

function mapLabs(observations: FHIRObservation[]): PatientContext["recentLabs"] {
  return observations
    .filter((obs) => !isVitalSign(obs))
    .map((obs) => {
      const coding = obs.code?.coding?.[0];
      const test = coding?.display ?? obs.code?.text ?? "Lab Test";

      let value: string;
      let unit: string;
      if (obs.valueQuantity) {
        value = String(obs.valueQuantity.value ?? "?");
        unit = obs.valueQuantity.unit ?? "";
      } else if (obs.valueString) {
        value = obs.valueString;
        unit = "";
      } else {
        value = "N/A";
        unit = "";
      }

      // Reference range
      const ref = obs.referenceRange?.[0];
      let referenceRange = "N/A";
      if (ref?.text) {
        referenceRange = ref.text;
      } else if (ref?.low?.value != null && ref?.high?.value != null) {
        referenceRange = `${ref.low.value}–${ref.high.value} ${ref.low.unit ?? ""}`.trim();
      }

      // Flag (high / low / critical)
      const interpCode = obs.interpretation?.[0]?.coding?.[0]?.code?.toLowerCase();
      let flag: "high" | "low" | "critical" | undefined;
      if (interpCode) {
        if (interpCode === "h" || interpCode === "hh" || interpCode === "high") {
          flag = interpCode === "hh" ? "critical" : "high";
        } else if (interpCode === "l" || interpCode === "ll" || interpCode === "low") {
          flag = interpCode === "ll" ? "critical" : "low";
        } else if (interpCode === "a" || interpCode === "aa" || interpCode === "critical") {
          flag = "critical";
        }
      }

      return {
        test,
        value,
        unit,
        referenceRange,
        flag,
        timestamp: formatDateTime(obs.effectiveDateTime ?? obs.issued),
      };
    });
}

function mapAllergies(
  allergies: FHIRAllergyIntolerance[]
): PatientContext["allergies"] {
  return allergies.map((a) => {
    const substance =
      a.code?.coding?.[0]?.display ?? a.code?.text ?? "Unknown substance";

    const reaction =
      a.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display ??
      a.reaction?.[0]?.manifestation?.[0]?.text ??
      "Unknown reaction";

    const severity = a.criticality ?? a.reaction?.[0]?.severity ?? "unknown";

    return { substance, reaction, severity };
  });
}

function mapEncounters(
  encounters: FHIREncounter[]
): PatientContext["recentEncounters"] {
  return encounters.map((e) => {
    const type =
      e.type?.[0]?.coding?.[0]?.display ??
      e.type?.[0]?.text ??
      e.class?.display ??
      "Encounter";

    const reason =
      e.reasonCode?.[0]?.coding?.[0]?.display ??
      e.reasonCode?.[0]?.text ??
      "Not specified";

    const date = formatDate(e.period?.start);
    const status = e.status ?? "unknown";

    return { type, reason, date, status };
  });
}

function mapProcedures(
  procedures: FHIRProcedure[]
): PatientContext["procedures"] {
  return procedures.map((p) => ({
    name: p.code?.coding?.[0]?.display ?? p.code?.text ?? "Unknown procedure",
    date: formatDate(p.performedDateTime ?? p.performedPeriod?.start),
    status: p.status ?? "unknown",
  }));
}

function mapCarePlans(
  carePlans: FHIRCarePlan[]
): PatientContext["carePlans"] {
  return carePlans.map((cp) => ({
    title: cp.title ?? cp.description ?? "Care Plan",
    status: cp.status ?? "unknown",
    activities:
      cp.activity
        ?.map((a) => a.detail?.description)
        .filter((d): d is string => d != null) ?? [],
  }));
}

// ──────────────────────────────────────────────
// Main mapper: combine everything into PatientContext
// ──────────────────────────────────────────────

export function mapToPatientContext(resources: {
  patient: FHIRPatient;
  conditions: FHIRCondition[];
  medications: FHIRMedicationRequest[];
  observations: FHIRObservation[];
  allergies: FHIRAllergyIntolerance[];
  encounters: FHIREncounter[];
  procedures: FHIRProcedure[];
  carePlans: FHIRCarePlan[];
}): PatientContext {
  return {
    patient: mapPatient(resources.patient),
    activeConditions: mapConditions(resources.conditions),
    medications: mapMedications(resources.medications),
    recentVitals: mapVitals(resources.observations),
    recentLabs: mapLabs(resources.observations),
    allergies: mapAllergies(resources.allergies),
    recentEncounters: mapEncounters(resources.encounters),
    procedures: mapProcedures(resources.procedures),
    carePlans: mapCarePlans(resources.carePlans),
  };
}
