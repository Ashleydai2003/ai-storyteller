/**
 * AI client abstraction supporting both Anthropic and OpenAI.
 *
 * Provides a unified interface for AI operations regardless of provider.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AIServiceConfig, AIProvider } from "./types";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 2048;

/** Unified response from either provider */
export interface AIResponse {
  text: string;
}

/** Unified client interface */
export interface AIClient {
  provider: AIProvider;
  complete(systemPrompt: string, userPrompt: string): Promise<AIResponse>;
}

/**
 * Create a configured AI client for the specified provider.
 */
export function createClient(config: AIServiceConfig): AIClient {
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (config.provider === "openai") {
    const client = new OpenAI({ apiKey: config.apiKey });
    const model = config.model ?? DEFAULT_OPENAI_MODEL;

    return {
      provider: "openai",
      async complete(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
        const response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        return { text: response.choices[0]?.message?.content ?? "" };
      },
    };
  }

  // Default: Anthropic
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_ANTHROPIC_MODEL;

  return {
    provider: "anthropic",
    async complete(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const textBlock = response.content.find((block) => block.type === "text");
      return { text: textBlock?.type === "text" ? textBlock.text : "" };
    },
  };
}

/**
 * Get the model to use from config or provider default.
 */
export function getModel(config: AIServiceConfig): string {
  if (config.model) return config.model;
  return config.provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
}

/**
 * Get max tokens from config or default.
 */
export function getMaxTokens(config: AIServiceConfig): number {
  return config.maxTokens ?? DEFAULT_MAX_TOKENS;
}
