/**
 * mu-api Provider for Generate API Route
 *
 * Handles video generation using mu-api (muapi.ai).
 * Currently supports: seedance-v2.0-i2v (image-to-video)
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { validateMediaUrl } from "@/utils/urlValidation";
import { detectImageType } from "./kie";

const MUAPI_BASE = "https://api.muapi.ai/api/v1";
const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Upload a base64 image to mu-api's file upload endpoint and get a public URL.
 * Uses POST /api/v1/upload_file with multipart/form-data.
 */
async function uploadImageToMuapi(
  requestId: string,
  apiKey: string,
  base64Image: string
): Promise<string> {
  let imageData = base64Image;

  if (base64Image.startsWith("data:")) {
    const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      imageData = matches[2];
    }
  }

  const binaryData = Buffer.from(imageData, "base64");

  if (binaryData.length > MAX_UPLOAD_SIZE) {
    throw new Error(
      `[API:${requestId}] Image too large to upload (${(binaryData.length / (1024 * 1024)).toFixed(1)}MB, max ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB)`
    );
  }

  const detected = detectImageType(binaryData);
  const filename = `upload_${Date.now()}.${detected.ext}`;

  console.log(
    `[API:${requestId}] Uploading image to mu-api: ${filename} (${(binaryData.length / 1024).toFixed(1)}KB, ${detected.mimeType})`
  );

  // Build multipart/form-data
  const formData = new FormData();
  const blob = new Blob([binaryData], { type: detected.mimeType });
  formData.append("file", blob, filename);

  const response = await fetch(`${MUAPI_BASE}/upload_file`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload image to mu-api: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const url = result.url;

  if (!url) {
    console.error(`[API:${requestId}] mu-api upload response has no URL:`, result);
    throw new Error(`No URL in mu-api upload response. Response: ${JSON.stringify(result).substring(0, 200)}`);
  }

  console.log(`[API:${requestId}] Image uploaded to mu-api: ${url.substring(0, 80)}...`);
  return url;
}

/**
 * Poll mu-api prediction status until completion.
 * GET /api/v1/predictions/{request_id}/result
 */
async function pollMuapiCompletion(
  requestId: string,
  apiKey: string,
  predictionId: string
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes for video
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();
  let lastStatus = "";

  const pollUrl = `${MUAPI_BASE}/predictions/${encodeURIComponent(predictionId)}/result`;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return { success: false, error: "Generation timed out after 10 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const response = await fetch(pollUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Task may not be available yet, keep polling
          continue;
        }
        const errorText = await response.text();
        return { success: false, error: `Poll failed: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      const output = result.output;

      if (!output) {
        continue;
      }

      const status = output.status;
      if (status && status !== lastStatus) {
        console.log(`[API:${requestId}] mu-api status: ${status}`);
        lastStatus = status;
      }

      if (status === "completed") {
        const outputs = output.outputs as string[] | undefined;
        if (outputs && outputs.length > 0) {
          return { success: true, videoUrl: outputs[0] };
        }
        return { success: false, error: "Completed but no output URLs found" };
      }

      if (status === "failed") {
        const errorMsg = output.error || "Generation failed";
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      console.warn(`[API:${requestId}] mu-api poll error (retrying):`, err);
    }
  }
}

/**
 * Generate video using mu-api.
 */
export async function generateWithMuapi(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  const modelId = input.model.id;

  console.log(
    `[API:${requestId}] mu-api generation - Model: ${modelId}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`
  );

  // Upload base64 images to get public URLs
  const imageUrls: string[] = [];

  // Handle dynamic inputs first (schema-mapped connections)
  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (key === "images_list" && value) {
        if (typeof value === "string") {
          if (value.startsWith("http")) {
            imageUrls.push(value);
          } else if (value.startsWith("data:")) {
            const url = await uploadImageToMuapi(requestId, apiKey, value);
            imageUrls.push(url);
          }
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "string" && item.startsWith("http")) {
              imageUrls.push(item);
            } else if (typeof item === "string" && item.startsWith("data:")) {
              const url = await uploadImageToMuapi(requestId, apiKey, item);
              imageUrls.push(url);
            }
          }
        }
      }
    }
  }

  // Fallback: use input.images if dynamicInputs didn't provide images_list
  if (imageUrls.length === 0 && input.images && input.images.length > 0) {
    for (const image of input.images) {
      if (image.startsWith("http")) {
        imageUrls.push(image);
      } else {
        const url = await uploadImageToMuapi(requestId, apiKey, image);
        imageUrls.push(url);
      }
    }
  }

  if (imageUrls.length === 0) {
    return { success: false, error: "seedance-v2.0-i2v requires at least one image" };
  }

  // Build request body per API spec
  const body: Record<string, unknown> = {
    prompt: input.prompt || "",
    images_list: imageUrls,
  };

  // Apply user parameters (aspect_ratio, duration, quality, remove_watermark)
  if (input.parameters) {
    if (input.parameters.aspect_ratio !== undefined) {
      body.aspect_ratio = input.parameters.aspect_ratio;
    }
    if (input.parameters.duration !== undefined) {
      body.duration = Number(input.parameters.duration);
    }
    if (input.parameters.quality !== undefined) {
      body.quality = input.parameters.quality;
    }
    if (input.parameters.remove_watermark !== undefined) {
      body.remove_watermark = input.parameters.remove_watermark;
    }
  }

  // Apply defaults for fields not set by user
  if (body.aspect_ratio === undefined) body.aspect_ratio = "16:9";
  if (body.duration === undefined) body.duration = 5;
  if (body.quality === undefined) body.quality = "basic";
  if (body.remove_watermark === undefined) body.remove_watermark = false;

  const submitUrl = `${MUAPI_BASE}/${encodeURIComponent(modelId)}`;

  console.log(`[API:${requestId}] Calling mu-api: ${submitUrl}`);
  console.log(`[API:${requestId}] Request body:`, JSON.stringify({
    ...body,
    prompt: typeof body.prompt === "string" && body.prompt.length > 200
      ? body.prompt.substring(0, 200) + "...[truncated]"
      : body.prompt,
    images_list: `[${imageUrls.length} URLs]`,
  }, null, 2));

  // Submit task
  const createResponse = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    let errorDetail = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetail = errorJson.message || errorJson.error || errorJson.detail || errorText;
    } catch {
      // Keep original text
    }

    if (createResponse.status === 429) {
      return { success: false, error: `${input.model.name}: Rate limit exceeded. Try again in a moment.` };
    }

    return { success: false, error: `${input.model.name}: ${errorDetail}` };
  }

  const createResult = await createResponse.json();
  const predictionId = createResult.request_id;

  if (!predictionId) {
    console.error(`[API:${requestId}] No request_id in mu-api response:`, createResult);
    return { success: false, error: "No request_id in mu-api response" };
  }

  console.log(`[API:${requestId}] mu-api task created: ${predictionId}`);

  // Poll for completion
  const pollResult = await pollMuapiCompletion(requestId, apiKey, predictionId);

  if (!pollResult.success) {
    return { success: false, error: `${input.model.name}: ${pollResult.error}` };
  }

  const mediaUrl = pollResult.videoUrl!;

  // Validate URL before fetching
  const mediaUrlCheck = validateMediaUrl(mediaUrl);
  if (!mediaUrlCheck.valid) {
    return { success: false, error: `Invalid media URL: ${mediaUrlCheck.error}` };
  }

  // Fetch the video and convert to base64
  console.log(`[API:${requestId}] Fetching mu-api output from: ${mediaUrl.substring(0, 80)}...`);
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    return { success: false, error: `Failed to fetch output: ${mediaResponse.status}` };
  }

  const mediaContentLength = parseInt(mediaResponse.headers.get("content-length") || "0", 10);
  if (mediaContentLength > MAX_MEDIA_SIZE) {
    return { success: false, error: `Media too large: ${(mediaContentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
  }

  const contentType = mediaResponse.headers.get("content-type") || "video/mp4";
  const mediaArrayBuffer = await mediaResponse.arrayBuffer();
  if (mediaArrayBuffer.byteLength > MAX_MEDIA_SIZE) {
    return { success: false, error: `Media too large: ${(mediaArrayBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
  }
  const mediaSizeMB = mediaArrayBuffer.byteLength / (1024 * 1024);

  console.log(`[API:${requestId}] mu-api output: ${contentType}, ${mediaSizeMB.toFixed(2)}MB`);

  // For very large videos (>20MB), return URL only
  if (mediaSizeMB > 20) {
    console.log(`[API:${requestId}] SUCCESS - Returning URL for large mu-api video`);
    return {
      success: true,
      outputs: [{ type: "video", data: "", url: mediaUrl }],
    };
  }

  const mediaBase64 = Buffer.from(mediaArrayBuffer).toString("base64");
  console.log(`[API:${requestId}] SUCCESS - Returning mu-api video`);
  return {
    success: true,
    outputs: [{ type: "video", data: `data:${contentType};base64,${mediaBase64}`, url: mediaUrl }],
  };
}
