// ──────────────────────────────────────────────
// FHIR R4 Resource Types (simplified for our use)
// ──────────────────────────────────────────────

export interface FHIRBundle {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: FHIRBundleEntry[];
}

export interface FHIRBundleEntry {
  resource: FHIRResource;
}

export type FHIRResource =
  | FHIRPatient
  | FHIRCondition
  | FHIRMedicationRequest
  | FHIRObservation
  | FHIRAllergyIntolerance
  | FHIREncounter
  | FHIRProcedure
  | FHIRCarePlan;

export interface FHIRPatient {
  resourceType: "Patient";
  id: string;
  name?: Array<{
    use?: string;
    family?: string;
    given?: string[];
    text?: string;
  }>;
  gender?: string;
  birthDate?: string;
  identifier?: Array<{
    system?: string;
    value?: string;
    type?: { text?: string };
  }>;
}

export interface FHIRCondition {
  resourceType: "Condition";
  id: string;
  code?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
    text?: string;
  };
  clinicalStatus?: {
    coding?: Array<{ code?: string }>;
  };
  severity?: {
    coding?: Array<{ display?: string }>;
    text?: string;
  };
  onsetDateTime?: string;
  recordedDate?: string;
}

export interface FHIRMedicationRequest {
  resourceType: "MedicationRequest";
  id: string;
  status?: string;
  medicationCodeableConcept?: {
    coding?: Array<{ display?: string; code?: string }>;
    text?: string;
  };
  dosageInstruction?: Array<{
    text?: string;
    timing?: {
      repeat?: {
        frequency?: number;
        period?: number;
        periodUnit?: string;
      };
      code?: { text?: string };
    };
    doseAndRate?: Array<{
      doseQuantity?: { value?: number; unit?: string };
    }>;
  }>;
  authoredOn?: string;
}

export interface FHIRObservation {
  resourceType: "Observation";
  id: string;
  status?: string;
  category?: Array<{
    coding?: Array<{ system?: string; code?: string; display?: string }>;
  }>;
  code?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
    text?: string;
  };
  valueQuantity?: {
    value?: number;
    unit?: string;
  };
  valueString?: string;
  effectiveDateTime?: string;
  issued?: string;
  referenceRange?: Array<{
    low?: { value?: number; unit?: string };
    high?: { value?: number; unit?: string };
    text?: string;
  }>;
  interpretation?: Array<{
    coding?: Array<{ code?: string; display?: string }>;
  }>;
}

export interface FHIRAllergyIntolerance {
  resourceType: "AllergyIntolerance";
  id: string;
  code?: {
    coding?: Array<{ display?: string }>;
    text?: string;
  };
  reaction?: Array<{
    manifestation?: Array<{
      coding?: Array<{ display?: string }>;
      text?: string;
    }>;
    severity?: string;
  }>;
  criticality?: string;
}

export interface FHIREncounter {
  resourceType: "Encounter";
  id: string;
  status?: string;
  class?: {
    code?: string;
    display?: string;
  };
  type?: Array<{
    coding?: Array<{ display?: string }>;
    text?: string;
  }>;
  reasonCode?: Array<{
    coding?: Array<{ display?: string }>;
    text?: string;
  }>;
  period?: {
    start?: string;
    end?: string;
  };
}

export interface FHIRProcedure {
  resourceType: "Procedure";
  id: string;
  status?: string;
  code?: {
    coding?: Array<{ display?: string }>;
    text?: string;
  };
  performedDateTime?: string;
  performedPeriod?: {
    start?: string;
    end?: string;
  };
}

export interface FHIRCarePlan {
  resourceType: "CarePlan";
  id: string;
  status?: string;
  title?: string;
  description?: string;
  activity?: Array<{
    detail?: {
      description?: string;
      status?: string;
    };
  }>;
}

// ──────────────────────────────────────────────
// PatientContext — aggregated clinical view
// ──────────────────────────────────────────────

export interface PatientContext {
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    mrn: string;
  };
  activeConditions: Array<{
    code: string;
    display: string;
    onsetDate: string;
    severity?: string;
  }>;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
  }>;
  recentVitals: Array<{
    type: string;
    value: string;
    unit: string;
    timestamp: string;
  }>;
  recentLabs: Array<{
    test: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag?: "high" | "low" | "critical";
    timestamp: string;
  }>;
  allergies: Array<{
    substance: string;
    reaction: string;
    severity: string;
  }>;
  recentEncounters: Array<{
    type: string;
    reason: string;
    date: string;
    status: string;
  }>;
  procedures: Array<{
    name: string;
    date: string;
    status: string;
  }>;
  carePlans: Array<{
    title: string;
    status: string;
    activities: string[];
  }>;
}

// ──────────────────────────────────────────────
// Tool input/output types
// ──────────────────────────────────────────────

export type RecipientRole = "nurse" | "physician" | "resident";
export type Urgency = "routine" | "urgent" | "emergent";
export type ReadingLevel = "simple" | "standard" | "clinical";
