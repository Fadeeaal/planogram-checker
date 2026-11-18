import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ShelfCategory } from "@/lib/validation";
import { ANALYSIS_SCHEMA, buildPrompt, normalizeOutput, type AnalysisOutput } from "./prompts";

export const ANALYSIS_MODEL = "claude-opus-5-5";

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the server environment.
  // 2 attempts x 120s stays inside the 300s function limit.
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return client;
}

export type ShelfAnalysis = {
  output: AnalysisOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function analyzeShelfPhoto(
  category: ShelfCategory,
  image: { base64: string; mediaType: ImageMediaType },
): Promise<ShelfAnalysis> {
  const response = await getClient().beta.messages.parse({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    // On a safety-classifier refusal, the API re-runs the request on
    // Anthropic's recommended fallback model instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "high",
      format: betaZodOutputFormat(ANALYSIS_SCHEMA),
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
          { type: "text", text: buildPrompt(category) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude refused to analyze the photo (${response.stop_details?.category ?? "unknown"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude output was cut off at max_tokens");
  }
  if (!response.parsed_output) {
    throw new Error("Claude returned no parseable analysis");
  }

  return {
    output: normalizeOutput(category, response.parsed_output),
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
