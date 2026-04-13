import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { LLMGenerateRequest, LLMGenerateResponse, LLMModelType } from "@/types";
import { logger } from "@/utils/logger";

export const maxDuration = 60; // 1 minute timeout

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Map model types to actual API model IDs
const GOOGLE_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3-pro-preview": "gemini-3-pro-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4.1-nano": "gpt-4.1-nano",
};

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
  "claude-haiku-4.5": "claude-haiku-4-5-20251001",
  "claude-opus-4.6": "claude-opus-4-6",
};

// Kie.ai LLM models — Claude models use /claude/v1/messages, GPT uses /codex/v1/responses
const KIE_CLAUDE_MODELS = new Set(["kie-claude-opus-4.6", "kie-claude-sonnet-4.6"]);
const KIE_GPT_MODELS = new Set(["kie-gpt-5.4"]);

const KIE_MODEL_ID_MAP: Record<string, string> = {
  "kie-claude-opus-4.6": "claude-opus-4-6",
  "kie-claude-sonnet-4.6": "claude-sonnet-4-6",
  "kie-gpt-5.4": "gpt-5-4",
};

async function generateWithGoogle(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string,
  userApiKey?: string | null
): Promise<string> {
  // User-provided key takes precedence over env variable
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'GEMINI_API_KEY not configured', { requestId });
    throw new Error("GEMINI_API_KEY not configured. Add it to .env.local or configure in Settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelId = GOOGLE_MODEL_MAP[model];

  logger.info('api.llm', 'Calling Google AI API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build multimodal content if images are provided
  let contents: string | Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>;
  if (images && images.length > 0) {
    contents = [
      ...images.map((img) => {
        // Extract base64 data and mime type from data URL
        const matches = img.match(/^data:(.+?);base64,(.+)$/);
        if (matches) {
          return {
            inlineData: {
              mimeType: matches[1],
              data: matches[2],
            },
          };
        }
        // Fallback: assume PNG if no data URL prefix
        return {
          inlineData: {
            mimeType: "image/png",
            data: img,
          },
        };
      }),
      { text: prompt },
    ];
  } else {
    contents = prompt;
  }

  const startTime = Date.now();
  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });
  const duration = Date.now() - startTime;

  // Use the convenient .text property that concatenates all text parts
  const text = response.text;
  if (!text) {
    logger.error('api.error', 'No text in Google AI response', { requestId });
    throw new Error("No text in Google AI response");
  }

  logger.info('api.llm', 'Google AI API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

async function generateWithOpenAI(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string,
  userApiKey?: string | null
): Promise<string> {
  // User-provided key takes precedence over env variable
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'OPENAI_API_KEY not configured', { requestId });
    throw new Error("OPENAI_API_KEY not configured. Add it to .env.local or configure in Settings.");
  }

  const modelId = OPENAI_MODEL_MAP[model];

  logger.info('api.llm', 'Calling OpenAI API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build content array for vision if images are provided
  let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  if (images && images.length > 0) {
    content = [
      { type: "text", text: prompt },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img },
      })),
    ];
  } else {
    content = prompt;
  }

  const startTime = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const duration = Date.now() - startTime;

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error('api.error', 'OpenAI API request failed', {
      requestId,
      status: response.status,
      error: error.error?.message,
    });
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    logger.error('api.error', 'No text in OpenAI response', { requestId });
    throw new Error("No text in OpenAI response");
  }

  logger.info('api.llm', 'OpenAI API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

async function generateWithAnthropic(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string,
  userApiKey?: string | null
): Promise<string> {
  const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'ANTHROPIC_API_KEY not configured', { requestId });
    throw new Error("ANTHROPIC_API_KEY not configured. Add it to .env.local or configure in Settings.");
  }

  const modelId = ANTHROPIC_MODEL_MAP[model];

  logger.info('api.llm', 'Calling Anthropic API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build content blocks
  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

  if (images && images.length > 0) {
    for (const img of images) {
      const matches = img.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: matches[1], data: matches[2] },
        });
      } else {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: img },
        });
      }
    }
  }

  content.push({ type: "text", text: prompt });

  const startTime = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const duration = Date.now() - startTime;

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error('api.error', 'Anthropic API request failed', {
      requestId,
      status: response.status,
      error: error.error?.message,
    });
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    logger.error('api.error', 'No text in Anthropic response', { requestId });
    throw new Error("No text in Anthropic response");
  }

  logger.info('api.llm', 'Anthropic API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

const KIE_BASE = "https://api.kie.ai";

async function generateWithKieClaude(
  prompt: string,
  model: LLMModelType,
  temperature: number,
  maxTokens: number,
  images?: string[],
  requestId?: string,
  userApiKey?: string | null
): Promise<string> {
  const apiKey = userApiKey || process.env.KIE_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'KIE_API_KEY not configured', { requestId });
    throw new Error("KIE_API_KEY not configured. Add it to .env.local or configure in Settings.");
  }

  const modelId = KIE_MODEL_ID_MAP[model];

  logger.info('api.llm', 'Calling Kie.ai Claude API', {
    requestId,
    model: modelId,
    temperature,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build content blocks (Anthropic-style messages format)
  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

  if (images && images.length > 0) {
    for (const img of images) {
      const matches = img.match(/^data:(.+?);base64,(.+)$/);
      if (matches) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: matches[1], data: matches[2] },
        });
      } else {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: img },
        });
      }
    }
  }

  content.push({ type: "text", text: prompt });

  const startTime = Date.now();
  const response = await fetch(`${KIE_BASE}/claude/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content }],
      stream: false,
      max_tokens: maxTokens,
    }),
  });
  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('api.error', 'Kie.ai Claude API request failed', {
      requestId,
      status: response.status,
      error: errorText.slice(0, 200),
    });
    throw new Error(`Kie.ai Claude API error: ${response.status}`);
  }

  const rawBody = await response.text();

  let text: string | undefined;

  // The API may return SSE stream even with stream:false — detect and parse
  if (rawBody.startsWith("event:") || rawBody.startsWith("data:")) {
    // Parse SSE: collect all content_block_delta text deltas
    const chunks: string[] = [];
    for (const line of rawBody.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          chunks.push(event.delta.text);
        }
        // Also check for message_stop with full content
        if (event.type === "message_start" && event.message?.content?.[0]?.text) {
          text = event.message.content[0].text;
        }
      } catch {
        // Skip unparseable lines
      }
    }
    if (!text && chunks.length > 0) {
      text = chunks.join("");
    }
  } else {
    // Standard JSON response
    const data = JSON.parse(rawBody);
    text = data.content?.[0]?.text;
  }

  if (!text) {
    logger.error('api.error', 'No text in Kie.ai Claude response', { requestId });
    throw new Error("No text in Kie.ai Claude response");
  }

  logger.info('api.llm', 'Kie.ai Claude API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

async function generateWithKieGPT(
  prompt: string,
  model: LLMModelType,
  maxTokens: number,
  images?: string[],
  requestId?: string,
  userApiKey?: string | null
): Promise<string> {
  const apiKey = userApiKey || process.env.KIE_API_KEY;
  if (!apiKey) {
    logger.error('api.error', 'KIE_API_KEY not configured', { requestId });
    throw new Error("KIE_API_KEY not configured. Add it to .env.local or configure in Settings.");
  }

  const modelId = KIE_MODEL_ID_MAP[model];

  logger.info('api.llm', 'Calling Kie.ai GPT API', {
    requestId,
    model: modelId,
    maxTokens,
    imageCount: images?.length || 0,
    promptLength: prompt.length,
  });

  // Build input content items (OpenAI Responses API format)
  const contentItems: Array<{ type: string; text?: string; image_url?: string }> = [];

  if (images && images.length > 0) {
    for (const img of images) {
      contentItems.push({ type: "input_image", image_url: img });
    }
  }

  contentItems.push({ type: "input_text", text: prompt });

  const input = [{ role: "user", content: contentItems }];

  const startTime = Date.now();
  const response = await fetch(`${KIE_BASE}/codex/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input,
      stream: false,
    }),
  });
  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('api.error', 'Kie.ai GPT API request failed', {
      requestId,
      status: response.status,
      error: errorText.slice(0, 200),
    });
    throw new Error(`Kie.ai GPT API error: ${response.status}`);
  }

  const rawBody = await response.text();

  let text: string | undefined;

  // The API may return SSE stream even with stream:false — detect and parse
  if (rawBody.startsWith("event:") || rawBody.startsWith("data:")) {
    const chunks: string[] = [];
    for (const line of rawBody.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "response.output_text.delta" && event.delta) {
          chunks.push(event.delta);
        }
        if (event.type === "response.completed" && event.response?.output) {
          const msgBlock = event.response.output.find((b: { type: string }) => b.type === "message");
          const fullText = msgBlock?.content?.[0]?.text;
          if (fullText) {
            text = fullText;
            break;
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
    if (!text && chunks.length > 0) {
      text = chunks.join("");
    }
  } else {
    // Standard JSON response
    const data = JSON.parse(rawBody);
    const messageBlock = data.output?.find((block: { type: string }) => block.type === "message");
    text = messageBlock?.content?.[0]?.text;
  }

  if (!text) {
    logger.error('api.error', 'No text in Kie.ai GPT response', { requestId });
    throw new Error("No text in Kie.ai GPT response");
  }

  logger.info('api.llm', 'Kie.ai GPT API response received', {
    requestId,
    duration,
    responseLength: text.length,
  });

  return text;
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    // Get user-provided API keys from headers (override env variables)
    const geminiApiKey = request.headers.get("X-Gemini-API-Key");
    const openaiApiKey = request.headers.get("X-OpenAI-API-Key");
    const anthropicApiKey = request.headers.get("X-Anthropic-API-Key");
    const kieApiKey = request.headers.get("X-Kie-Key");

    const body: LLMGenerateRequest = await request.json();
    const {
      prompt,
      images,
      provider,
      model,
      temperature = 0.7,
      maxTokens = 1024
    } = body;

    logger.info('api.llm', 'LLM generation request received', {
      requestId,
      provider,
      model,
      temperature,
      maxTokens,
      hasImages: !!(images && images.length > 0),
      imageCount: images?.length || 0,
      prompt,
    });

    if (!prompt) {
      logger.warn('api.llm', 'LLM request validation failed: missing prompt', { requestId });
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    let text: string;

    if (provider === "google") {
      text = await generateWithGoogle(prompt, model, temperature, maxTokens, images, requestId, geminiApiKey);
    } else if (provider === "openai") {
      text = await generateWithOpenAI(prompt, model, temperature, maxTokens, images, requestId, openaiApiKey);
    } else if (provider === "anthropic") {
      text = await generateWithAnthropic(prompt, model, temperature, maxTokens, images, requestId, anthropicApiKey);
    } else if (provider === "kie") {
      if (KIE_CLAUDE_MODELS.has(model)) {
        text = await generateWithKieClaude(prompt, model, temperature, maxTokens, images, requestId, kieApiKey);
      } else if (KIE_GPT_MODELS.has(model)) {
        text = await generateWithKieGPT(prompt, model, maxTokens, images, requestId, kieApiKey);
      } else {
        return NextResponse.json<LLMGenerateResponse>(
          { success: false, error: `Unknown Kie.ai model: ${model}` },
          { status: 400 }
        );
      }
    } else {
      logger.warn('api.llm', 'Unknown provider requested', { requestId, provider });
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: `Unknown provider: ${provider}` },
        { status: 400 }
      );
    }

    logger.info('api.llm', 'LLM generation successful', {
      requestId,
      responseLength: text.length,
    });

    return NextResponse.json<LLMGenerateResponse>({
      success: true,
      text,
    });
  } catch (error) {
    logger.error('api.error', 'LLM generation error', { requestId }, error instanceof Error ? error : undefined);

    // Handle rate limiting
    if (error instanceof Error && error.message.includes("429")) {
      return NextResponse.json<LLMGenerateResponse>(
        { success: false, error: "Rate limit reached. Please wait and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json<LLMGenerateResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "LLM generation failed",
      },
      { status: 500 }
    );
  }
}
