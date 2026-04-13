/**
 * Higgsfield Provider for Generate API Route
 *
 * Handles image generation using Higgsfield Soul Standard.
 * API: https://platform.higgsfield.ai
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { validateMediaUrl } from "@/utils/urlValidation";

const HIGGSFIELD_BASE = "https://platform.higgsfield.ai";
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Poll the Higgsfield status endpoint until the generation is complete.
 * GET /requests/{request_id}/status
 *
 * Auth: Authorization: Key {api_key}:{api_key_secret}
 * Completed responses include an `images` array: [{ url: string }]
 */
async function pollHiggsfieldCompletion(
  requestId: string,
  apiKey: string,
  higgsfieldRequestId: string
): Promise<{ success: boolean; imageUrls?: string[]; error?: string }> {
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();
  let lastStatus = "";

  const pollUrl = `${HIGGSFIELD_BASE}/requests/${encodeURIComponent(higgsfieldRequestId)}/status`;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return { success: false, error: "Generation timed out after 5 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const response = await fetch(pollUrl, {
        method: "GET",
        headers: {
          "Authorization": `Key ${apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Poll failed: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      const status = data.status as string | undefined;

      if (status && status !== lastStatus) {
        console.log(`[API:${requestId}] Higgsfield status: ${status}`);
        lastStatus = status;
      }

      if (status === "completed") {
        const images = data.images as Array<{ url: string }> | undefined;
        if (!images || images.length === 0) {
          return { success: false, error: "Completed but no images in response" };
        }
        const urls = images.map((img) => img.url).filter(Boolean);
        if (urls.length === 0) {
          return { success: false, error: "Completed but image URLs are empty" };
        }
        return { success: true, imageUrls: urls };
      }

      if (status === "failed") {
        return { success: false, error: "Generation failed" };
      }

      if (status === "nsfw") {
        return { success: false, error: "Content was flagged as NSFW" };
      }

      if (status === "canceled") {
        return { success: false, error: "Generation was canceled" };
      }
    } catch (err) {
      console.warn(`[API:${requestId}] Higgsfield poll error (retrying):`, err);
    }
  }
}

/**
 * Generate an image using Higgsfield Soul Standard.
 */
export async function generateWithHighsfield(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  console.log(
    `[API:${requestId}] Higgsfield generation - Model: ${input.model.id}, Prompt: ${input.prompt.length} chars`
  );

  // Build request body — only documented parameters from the API spec
  const body: Record<string, unknown> = {
    prompt: input.prompt || "",
  };

  const params = input.parameters || {};

  if (params.aspect_ratio !== undefined) {
    body.aspect_ratio = params.aspect_ratio;
  } else {
    body.aspect_ratio = "4:3";
  }

  if (params.batch_size !== undefined) {
    body.batch_size = Number(params.batch_size);
  } else {
    body.batch_size = 1;
  }

  if (params.enhance_prompt !== undefined) {
    body.enhance_prompt = params.enhance_prompt;
  } else {
    body.enhance_prompt = true;
  }

  if (params.resolution !== undefined) {
    body.resolution = params.resolution;
  } else {
    body.resolution = "720p";
  }

  // seed: integer (min 1, max 1000000), null means random
  if (params.seed !== undefined && params.seed !== null && params.seed !== "") {
    body.seed = Number(params.seed);
  } else {
    body.seed = null;
  }

  // style_id: UUID string or null
  if (params.style_id !== undefined && params.style_id !== null && params.style_id !== "") {
    body.style_id = params.style_id;
  } else {
    body.style_id = null;
  }

  // style_strength: float (min 0, max 1)
  if (params.style_strength !== undefined) {
    body.style_strength = Number(params.style_strength);
  } else {
    body.style_strength = 1;
  }

  console.log(`[API:${requestId}] Calling Higgsfield: POST ${HIGGSFIELD_BASE}/higgsfield-ai/soul/standard`);
  console.log(`[API:${requestId}] Request body:`, JSON.stringify({
    ...body,
    prompt: typeof body.prompt === "string" && body.prompt.length > 200
      ? body.prompt.substring(0, 200) + "...[truncated]"
      : body.prompt,
  }, null, 2));

  // Submit generation request
  // Auth format: Authorization: Key {api_key}:{api_key_secret}
  const submitResponse = await fetch(`${HIGGSFIELD_BASE}/higgsfield-ai/soul/standard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    let errorDetail = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetail = errorJson.message || errorJson.error || errorJson.detail || errorText;
    } catch {
      // Keep original text
    }

    if (submitResponse.status === 401) {
      return { success: false, error: "Higgsfield: Invalid credentials. HIGGSFIELD_API_KEY must be in the format key:secret." };
    }
    if (submitResponse.status === 422) {
      return { success: false, error: `Higgsfield: Invalid request parameters — ${errorDetail}` };
    }
    if (submitResponse.status === 429) {
      return { success: false, error: "Higgsfield: Rate limit exceeded. Try again in a moment." };
    }

    return { success: false, error: `Higgsfield: ${errorDetail}` };
  }

  const submitResult = await submitResponse.json();
  const higgsfieldRequestId = submitResult.request_id as string | undefined;

  if (!higgsfieldRequestId) {
    console.error(`[API:${requestId}] No request_id in Higgsfield response:`, submitResult);
    return { success: false, error: "No request_id in Higgsfield response" };
  }

  console.log(`[API:${requestId}] Higgsfield task created: ${higgsfieldRequestId}`);

  // Poll for completion
  const pollResult = await pollHiggsfieldCompletion(requestId, apiKey, higgsfieldRequestId);

  if (!pollResult.success) {
    return { success: false, error: `Higgsfield: ${pollResult.error}` };
  }

  const imageUrl = pollResult.imageUrls![0];

  // Validate URL before fetching
  const urlCheck = validateMediaUrl(imageUrl);
  if (!urlCheck.valid) {
    return { success: false, error: `Invalid image URL: ${urlCheck.error}` };
  }

  // Fetch the image and convert to base64 data URI
  console.log(`[API:${requestId}] Fetching Higgsfield output: ${imageUrl.substring(0, 80)}...`);
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    return { success: false, error: `Failed to fetch generated image: ${imageResponse.status}` };
  }

  const contentLength = parseInt(imageResponse.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_IMAGE_SIZE) {
    return { success: false, error: `Image too large: ${(contentLength / (1024 * 1024)).toFixed(0)}MB > 50MB limit` };
  }

  const contentType = imageResponse.headers.get("content-type") || "image/png";
  const imageArrayBuffer = await imageResponse.arrayBuffer();

  if (imageArrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    return { success: false, error: `Image too large: ${(imageArrayBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 50MB limit` };
  }

  const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
  const dataUri = `data:${contentType};base64,${imageBase64}`;

  console.log(`[API:${requestId}] SUCCESS - Higgsfield image (${contentType}, ${(imageArrayBuffer.byteLength / 1024).toFixed(1)}KB)`);

  return {
    success: true,
    outputs: [{ type: "image", data: dataUri, url: imageUrl }],
  };
}
