#!/usr/bin/env node
/**
 * ClinDigest MCP Server
 *
 * An MCP server that generates contextual clinical summaries from FHIR R4
 * patient data. Exposes 4 tools: get_patient_context, generate_handoff_summary,
 * generate_referral_summary, and generate_discharge_summary.
 *
 * Supports both stdio (local dev) and Streamable HTTP (remote deployment).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { formatErrorForAgent } from "./utils/errors.js";

// ──────────────────────────────────────────────
// Initialize MCP Server
// ──────────────────────────────────────────────

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// ──────────────────────────────────────────────
// Tool: get_patient_context
// ──────────────────────────────────────────────

server.registerTool(
  "get_patient_context",
  {
    title: "Get Patient Context",
    description: `Fetch and aggregate all relevant FHIR R4 data for a patient into a structured clinical context object.

Returns a comprehensive view including: demographics, active conditions, current medications, recent vital signs, lab results, allergies, encounters, procedures, and active care plans.

This tool is the foundation — call it first before generating any summaries.

Args:
  - patient_id (string): FHIR Patient resource ID
  - fhir_server_url (string, optional): Base URL of FHIR R4 server (default: HAPI FHIR public test server)
  - include_history (boolean, optional): Include resolved/inactive conditions (default: false)

Returns: Structured PatientContext JSON with all aggregated clinical data.

Error Handling:
  - Returns actionable error if patient not found
  - Falls back to synthetic fixtures if FHIR server is unreachable`,
    inputSchema: {
      patient_id: z
        .string()
        .min(1, "patient_id is required")
        .describe("FHIR Patient resource ID"),
      fhir_server_url: z
        .string()
        .url("Must be a valid URL")
        .optional()
        .describe("Base URL of the FHIR R4 server (default: HAPI FHIR public test server)"),
      include_history: z
        .boolean()
        .default(false)
        .describe("Include resolved/inactive conditions and past encounters"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      // Resolve context: SHARP headers (from platform) merged with tool params
      const sharp = (await import("./utils/sharp.js")).resolveContext(
        sharpContextStore.getStore() ?? {},
        { patient_id: params.patient_id, fhir_server_url: params.fhir_server_url }
      );

      const patientId = sharp.patientId ?? params.patient_id;
      const fhirUrl = sharp.fhirServerUrl;
      const token = sharp.fhirAccessToken;

      const { FHIRClient } = await import("./fhir/client.js");
      const { mapToPatientContext } = await import("./fhir/mapper.js");
      const { loadFixture, isSyntheticPatient } = await import("./fhir/fixtures.js");

      let resources;

      // If it's a synthetic patient ID, load from fixture directly
      if (isSyntheticPatient(patientId)) {
        resources = await loadFixture(patientId);
        if (!resources) {
          return {
            content: [{ type: "text" as const, text: `Error: Failed to load synthetic fixture for ${patientId}` }],
          };
        }
      } else {
        // Try live FHIR server; fall back to fixtures if unreachable
        try {
          const client = new FHIRClient(fhirUrl, token);
          resources = await client.getAllResources(patientId, params.include_history);
        } catch (fetchError) {
          // Attempt fixture fallback
          const fixture = await loadFixture(patientId);
          if (fixture) {
            resources = fixture;
            resources.warnings.push(
              `Live FHIR server unreachable — loaded from synthetic fixture. ` +
              `Original error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
            );
          } else {
            throw fetchError; // No fixture available, re-throw original error
          }
        }
      }

      // Map to clean PatientContext
      const context = mapToPatientContext(resources);

      const result: Record<string, unknown> = { ...context };
      if (resources.warnings.length > 0) {
        result._warnings = resources.warnings;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatErrorForAgent(error) }],
      };
    }
  }
);

// ──────────────────────────────────────────────
// Tool: generate_handoff_summary
// ──────────────────────────────────────────────

server.registerTool(
  "generate_handoff_summary",
  {
    title: "Generate Handoff Summary",
    description: `Generate a clinical handoff summary for shift change using SBAR format (Situation, Background, Assessment, Recommendation).

Focuses on the most recent care window, highlighting changes in condition, pending tasks, and critical alerts. Adapts terminology and detail level to the recipient's role.

Args:
  - patient_id (string): FHIR Patient resource ID
  - shift_hours (number, optional): Hours to look back for recent events (default: 12)
  - recipient_role (string, optional): Role of handoff recipient — "nurse", "physician", or "resident"
  - priority_focus (string, optional): Specific concern to highlight (e.g., "post-op monitoring")
  - fhir_server_url (string, optional): Base URL of FHIR R4 server

Returns: Structured SBAR handoff narrative in Markdown format.`,
    inputSchema: {
      patient_id: z.string().min(1).describe("FHIR Patient resource ID"),
      shift_hours: z
        .number()
        .min(1)
        .max(48)
        .default(12)
        .describe("Hours to look back for recent events (default: 12)"),
      recipient_role: z
        .enum(["nurse", "physician", "resident"])
        .default("nurse")
        .describe("Role of the person receiving the handoff"),
      priority_focus: z
        .string()
        .optional()
        .describe("Specific concern to highlight (e.g., 'fluid balance', 'pain management')"),
      fhir_server_url: z.string().url().optional().describe("Base URL of FHIR R4 server"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const { fetchPatientContext, formatToolResponse } = await import("./tools/shared.js");
      const { buildHandoffPrompt } = await import("./prompts/handoff.js");
      const { generateSummary } = await import("./tools/summarize.js");

      const { context, warnings } = await fetchPatientContext(
        sharpContextStore.getStore(),
        { patient_id: params.patient_id, fhir_server_url: params.fhir_server_url }
      );

      const prompt = buildHandoffPrompt(context, {
        shiftHours: params.shift_hours,
        recipientRole: params.recipient_role,
        priorityFocus: params.priority_focus,
      });

      const result = await generateSummary(prompt, "Shift Handoff Summary");

      return formatToolResponse(result.summary, {
        mode: result.mode,
        model: result.model,
        warnings,
        summaryType: "handoff",
      });
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatErrorForAgent(error) }],
      };
    }
  }
);

// ──────────────────────────────────────────────
// Tool: generate_referral_summary
// ──────────────────────────────────────────────

server.registerTool(
  "generate_referral_summary",
  {
    title: "Generate Referral Summary",
    description: `Generate a referral summary for a specialist. Includes relevant history filtered by specialty, reason for referral, treatments already attempted, and specific clinical questions.

Adapts content depth based on target specialty — e.g., a cardiology referral emphasizes cardiac history, BP trends, and cholesterol labs.

Args:
  - patient_id (string): FHIR Patient resource ID
  - target_specialty (string): Specialty being referred to (e.g., "cardiology", "endocrinology")
  - referral_reason (string): Primary reason for referral
  - urgency (string, optional): "routine", "urgent", or "emergent" (default: "routine")
  - fhir_server_url (string, optional): Base URL of FHIR R4 server

Returns: Structured referral letter in Markdown format.`,
    inputSchema: {
      patient_id: z.string().min(1).describe("FHIR Patient resource ID"),
      target_specialty: z
        .string()
        .min(1)
        .describe("Specialty being referred to (e.g., 'cardiology', 'endocrinology', 'orthopedics')"),
      referral_reason: z
        .string()
        .min(1)
        .describe("Primary reason for referral"),
      urgency: z
        .enum(["routine", "urgent", "emergent"])
        .default("routine")
        .describe("Urgency level of the referral"),
      fhir_server_url: z.string().url().optional().describe("Base URL of FHIR R4 server"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const { fetchPatientContext, formatToolResponse } = await import("./tools/shared.js");
      const { buildReferralPrompt } = await import("./prompts/referral.js");
      const { generateSummary } = await import("./tools/summarize.js");

      const { context, warnings } = await fetchPatientContext(
        sharpContextStore.getStore(),
        { patient_id: params.patient_id, fhir_server_url: params.fhir_server_url }
      );

      const prompt = buildReferralPrompt(context, {
        targetSpecialty: params.target_specialty,
        referralReason: params.referral_reason,
        urgency: params.urgency,
      });

      const result = await generateSummary(prompt, "Referral Summary");

      return formatToolResponse(result.summary, {
        mode: result.mode,
        model: result.model,
        warnings,
        summaryType: "referral",
      });
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatErrorForAgent(error) }],
      };
    }
  }
);

// ──────────────────────────────────────────────
// Tool: generate_discharge_summary
// ──────────────────────────────────────────────

server.registerTool(
  "generate_discharge_summary",
  {
    title: "Generate Discharge Summary",
    description: `Generate a discharge summary with dual output: a clinical summary for medical records and patient-friendly instructions.

The patient-facing section uses plain language appropriate for the selected reading level, including: diagnosis explanation, medication instructions, follow-up schedule, warning signs, and activity/diet guidance.

Args:
  - patient_id (string): FHIR Patient resource ID
  - discharge_diagnosis (string, optional): Primary discharge diagnosis
  - reading_level (string, optional): "simple" (5th-grade), "standard", or "clinical" (default: "simple")
  - output_language (string, optional): Language for patient instructions (default: "en")
  - fhir_server_url (string, optional): Base URL of FHIR R4 server

Returns: Markdown with two sections — Clinical Summary and Patient Instructions.`,
    inputSchema: {
      patient_id: z.string().min(1).describe("FHIR Patient resource ID"),
      discharge_diagnosis: z
        .string()
        .optional()
        .describe("Primary discharge diagnosis (auto-detected from conditions if not provided)"),
      reading_level: z
        .enum(["simple", "standard", "clinical"])
        .default("simple")
        .describe("Reading level for patient instructions (default: 'simple')"),
      output_language: z
        .string()
        .default("en")
        .describe("Language for patient-facing summary (default: 'en')"),
      fhir_server_url: z.string().url().optional().describe("Base URL of FHIR R4 server"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const { fetchPatientContext, formatToolResponse } = await import("./tools/shared.js");
      const { buildDischargePrompt } = await import("./prompts/discharge.js");
      const { generateSummary } = await import("./tools/summarize.js");

      const { context, warnings } = await fetchPatientContext(
        sharpContextStore.getStore(),
        { patient_id: params.patient_id, fhir_server_url: params.fhir_server_url }
      );

      const prompt = buildDischargePrompt(context, {
        dischargeDiagnosis: params.discharge_diagnosis,
        readingLevel: params.reading_level,
        outputLanguage: params.output_language,
      });

      const result = await generateSummary(prompt, "Discharge Summary");

      return formatToolResponse(result.summary, {
        mode: result.mode,
        model: result.model,
        warnings,
        summaryType: "discharge",
      });
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatErrorForAgent(error) }],
      };
    }
  }
);

// ──────────────────────────────────────────────
// Transport: stdio (local dev) or HTTP (remote)
// ──────────────────────────────────────────────

import { AsyncLocalStorage } from "node:async_hooks";
import { extractSharpContext, type SharpContext } from "./utils/sharp.js";

/**
 * AsyncLocalStorage to propagate SHARP context from the HTTP layer
 * down into MCP tool handlers without threading it manually.
 */
export const sharpContextStore = new AsyncLocalStorage<SharpContext>();

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running via stdio`);
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // CORS — allow Prompt Opinion platform and any agent host
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-FHIR-Server-URL, X-FHIR-Access-Token, X-Patient-ID");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Root info endpoint
  app.get("/", (_req, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: "MCP server that generates contextual clinical summaries from FHIR R4 patient data",
      mcp_endpoint: "/mcp",
      health_endpoint: "/health",
      sharp_enabled: true,
      tools: [
        "get_patient_context",
        "generate_handoff_summary",
        "generate_referral_summary",
        "generate_discharge_summary",
      ],
      synthetic_patients: [
        "synth-maria-001 (diabetes/hypertension/CKD)",
        "synth-john-002 (post-CABG/AFib/anticoagulation)",
        "synth-emma-003 (pneumonia/COPD/discharge)",
      ],
    });
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      sharp: true,
      llm_mode: process.env.ANTHROPIC_API_KEY ? "active" : "passthrough",
      uptime_seconds: Math.floor(process.uptime()),
    });
  });

  // GET /mcp — browser-friendly info page
  app.get("/mcp", (_req, res) => {
    res.json({
      endpoint: "/mcp",
      method: "POST",
      protocol: "MCP Streamable HTTP (JSON-RPC 2.0)",
      usage: "Send POST requests with Content-Type: application/json and Accept: application/json, text/event-stream",
      tools: ["get_patient_context", "generate_handoff_summary", "generate_referral_summary", "generate_discharge_summary"],
      docs: "https://github.com/fandcomp/clindigest",
    });
  });

  // MCP endpoint (stateless Streamable HTTP + SHARP context)
  app.post("/mcp", async (req, res) => {
    // Extract SHARP healthcare context from request headers
    const sharpCtx = extractSharpContext(req);

    // Run the entire MCP request inside the SHARP context scope
    // so tool handlers can read it via sharpContextStore.getStore()
    await sharpContextStore.run(sharpCtx, async () => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on http://localhost:${port}/mcp`);
    console.error(`SHARP context propagation: enabled`);
    console.error(`LLM mode: ${process.env.ANTHROPIC_API_KEY ? "active (Claude API)" : "passthrough (no API key)"}`);
  });
}

// Choose transport based on TRANSPORT env var
const transportMode = process.env.TRANSPORT || "stdio";
if (transportMode === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
