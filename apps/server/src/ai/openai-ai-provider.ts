import { Injectable } from "@nestjs/common";
import type { AiProvider } from "./ai-provider.interface";
import { normalizeAiAuctionInsightOutput } from "./ai-output.schema";
import {
  buildAiAuctionInsightPrompt,
  openAiAuctionInsightResponseFormat
} from "./prompt-builder";
import type {
  AiAuctionInsightCore,
  AiInsightSource,
  AiProviderInput,
  PriceInferenceResult
} from "./dto/ai-auction-insight.response";

type AiProviderMode = "openai" | "ark";
type AiApiMode = "responses" | "chat_completions";

interface ResponsesApiBody {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
      type?: unknown;
    }>;
  }>;
}

interface ChatCompletionsBody {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

@Injectable()
export class OpenAiProvider implements AiProvider {
  isConfigured(): boolean {
    return readProviderMode() !== null && readEnv("AI_API_KEY").length > 0;
  }

  async generate(input: AiProviderInput): Promise<AiAuctionInsightCore> {
    const apiKey = readEnv("AI_API_KEY");
    if (!apiKey) {
      throw new Error("AI_API_KEY is not configured");
    }

    const providerMode = readProviderMode() ?? "openai";
    const apiMode = readApiMode(providerMode);
    const { systemPrompt, userPrompt } = buildAiAuctionInsightPrompt(input);
    const response =
      apiMode === "responses"
        ? await this.fetchResponsesApi({
            providerMode,
            body: {
              model: readModel(providerMode),
              input: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content: userPrompt
                }
              ],
              text: {
                format: openAiAuctionInsightResponseFormat
              }
            }
          })
        : await this.fetchChatCompletions({
            providerMode,
            body: {
              model: readModel(providerMode),
              messages: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content: userPrompt
                }
              ],
              response_format: readChatResponseFormat(providerMode),
              temperature: 0.2
            }
          });
    const outputText =
      apiMode === "responses"
        ? extractResponsesOutputText(response as ResponsesApiBody)
        : extractChatCompletionsOutputText(response as ChatCompletionsBody);
    const parsed = JSON.parse(extractJsonDocument(outputText)) as unknown;

    return normalizeAiAuctionInsightOutput(
      withBackendPriceRange(parsed, input.priceRange),
      toInsightSource(providerMode)
    );
  }

  private async fetchResponsesApi(input: {
    providerMode: AiProviderMode;
    body: Record<string, unknown>;
  }): Promise<ResponsesApiBody> {
    return this.fetchWithRetries<ResponsesApiBody>(
      buildEndpointUrl(input.providerMode, "responses"),
      input.body,
      input.providerMode
    );
  }

  private async fetchChatCompletions(input: {
    providerMode: AiProviderMode;
    body: Record<string, unknown>;
  }): Promise<ChatCompletionsBody> {
    return this.fetchWithRetries<ChatCompletionsBody>(
      buildEndpointUrl(input.providerMode, "chat/completions"),
      input.body,
      input.providerMode
    );
  }

  private async fetchWithRetries<T>(
    url: string,
    body: Record<string, unknown>,
    providerMode: AiProviderMode
  ): Promise<T> {
    const maxRetries = readNonNegativeEnvInteger("AI_MAX_RETRIES", 1);
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.fetchOnce<T>(url, body, providerMode);
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`${providerMode} request failed`);
  }

  private async fetchOnce<T>(
    url: string,
    body: Record<string, unknown>,
    providerMode: AiProviderMode
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      readPositiveEnvInteger("AI_TIMEOUT_MS", 8000)
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${readEnv("AI_API_KEY")}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => null)) as T | null;
      if (!response.ok) {
        throw new Error(`${providerMode} request failed with HTTP ${response.status}`);
      }

      if (!payload) {
        throw new Error(`${providerMode} response body is empty`);
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractResponsesOutputText(body: ResponsesApiBody): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }

  throw new Error("Responses API body did not contain output text");
}

function extractChatCompletionsOutputText(body: ChatCompletionsBody): string {
  const content = body.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  throw new Error("Chat Completions body did not contain message content");
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function readProviderMode(): AiProviderMode | null {
  const provider = readEnv("AI_PROVIDER").toLowerCase();
  return provider === "openai" || provider === "ark" ? provider : null;
}

function readApiMode(providerMode: AiProviderMode): AiApiMode {
  const configured = readEnv("AI_API_MODE").toLowerCase();
  if (configured === "responses" || configured === "chat_completions") {
    return configured;
  }

  return providerMode === "ark" ? "chat_completions" : "responses";
}

function readModel(providerMode: AiProviderMode): string {
  const configured = readEnv("AI_MODEL");
  if (configured) {
    return configured;
  }

  if (providerMode === "ark") {
    throw new Error("AI_MODEL is not configured");
  }

  return "gpt-4.1-mini";
}

function readBaseUrl(providerMode: AiProviderMode): string {
  const configured = readEnv("AI_BASE_URL") || readEnv("AI_PROVIDER_BASE_URL");
  if (configured) {
    return trimTrailingSlash(configured);
  }

  return providerMode === "ark"
    ? "https://ark.cn-beijing.volces.com/api/v3"
    : "https://api.openai.com/v1";
}

function buildEndpointUrl(providerMode: AiProviderMode, path: string): string {
  const baseUrl = readBaseUrl(providerMode);
  if (baseUrl.endsWith("/responses") || baseUrl.endsWith("/chat/completions")) {
    return baseUrl;
  }

  return `${baseUrl}/${path}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readChatResponseFormat(providerMode: AiProviderMode): Record<string, unknown> | undefined {
  const mode = readEnv("AI_CHAT_RESPONSE_FORMAT").toLowerCase();
  if (mode === "none") {
    return undefined;
  }

  if (mode === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: openAiAuctionInsightResponseFormat.name,
        strict: openAiAuctionInsightResponseFormat.strict,
        schema: openAiAuctionInsightResponseFormat.schema
      }
    };
  }

  if (mode === "json_object") {
    return { type: "json_object" };
  }

  if (providerMode === "ark") {
    return undefined;
  }

  return { type: "json_object" };
}

function toInsightSource(providerMode: AiProviderMode): AiInsightSource {
  return providerMode === "ark" ? "ark" : "openai";
}

function withBackendPriceRange(
  value: unknown,
  priceRange: PriceInferenceResult
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  return {
    ...value,
    suggestedStartPriceFen: priceRange.suggestedStartPriceFen,
    suggestedDealMinFen: priceRange.suggestedDealMinFen,
    suggestedDealMaxFen: priceRange.suggestedDealMaxFen,
    suggestedCapPriceFen: priceRange.suggestedCapPriceFen,
    cautionPriceFen: priceRange.cautionPriceFen
  };
}

function extractJsonDocument(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }

  return candidate;
}

function readPositiveEnvInteger(name: string, fallback: number): number {
  const value = Number(readEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeEnvInteger(name: string, fallback: number): number {
  const value = Number(readEnv(name));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
