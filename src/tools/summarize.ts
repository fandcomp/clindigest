/**
 * Summarization Engine
 *
 * Calls an LLM to generate clinical summaries from prompt templates.
 *
 * Supports two modes:
 *   1. LLM mode:     When ANTHROPIC_API_KEY is set, calls Claude API directly
 *   2. Prompt mode:   Returns the constructed prompt so the calling agent
 *                     (on Prompt Opinion) can generate the summary itself
 *
 * In the Prompt Opinion platform, the agent host provides LLM capability,
 * so prompt mode is perfectly valid. LLM mode is useful for standalone
 * testing and demos.
 */

import { SummaryGenerationError } from "../utils/errors.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;

interface LLMPrompt {
  system: string;
  user: string;
}

interface SummaryResult {
  /** The generated summary text (Markdown) */
  summary: string;
  /** How the summary was generated */
  mode: "llm" | "prompt-passthrough";
  /** The model used (if LLM mode) */
  model?: string;
}

/**
 * Generate a clinical summary using the best available method.
 *
 * 1. If ANTHROPIC_API_KEY is set → call Claude API
 * 2. Otherwise → return structured prompt for the calling agent
 */
export async function generateSummary(
  prompt: LLMPrompt,
  summaryType: string
): Promise<SummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    return await callLLM(prompt, apiKey, summaryType);
  }

  // Prompt passthrough mode — the calling agent will generate the summary
  return {
    summary: buildPassthroughResponse(prompt, summaryType),
    mode: "prompt-passthrough",
  };
}

/**
 * Call the Anthropic Claude API directly.
 */
async function callLLM(
  prompt: LLMPrompt,
  apiKey: string,
  summaryType: string
): Promise<SummaryResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown error");
      throw new SummaryGenerationError(
        `Claude API returned HTTP ${response.status}: ${errorBody}`,
        summaryType
      );
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");

    if (!text) {
      throw new SummaryGenerationError(
        "Claude API returned empty response",
        summaryType
      );
    }

    return {
      summary: text,
      mode: "llm",
      model: MODEL,
    };
  } catch (error) {
    if (error instanceof SummaryGenerationError) throw error;

    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("AbortError") || msg.includes("abort")) {
      throw new SummaryGenerationError(
        "LLM request timed out after 30 seconds",
        summaryType
      );
    }

    throw new SummaryGenerationError(msg, summaryType);
  }
}

/**
 * Build a structured passthrough response when no API key is available.
 * The calling agent on Prompt Opinion can use this to generate the summary.
 */
function buildPassthroughResponse(prompt: LLMPrompt, summaryType: string): string {
  return [
    `# ${summaryType}`,
    "",
    "> **Note:** No ANTHROPIC_API_KEY configured on this MCP server. " +
      "Below is the structured prompt and patient context. " +
      "As the calling agent, you can generate the summary using the system prompt and patient data below.",
    "",
    "## System Prompt",
    "```",
    prompt.system,
    "```",
    "",
    "## Patient Context & Instructions",
    "```",
    prompt.user,
    "```",
    "",
    "Please generate the clinical summary based on the system prompt and patient context above.",
  ].join("\n");
}
