/**
 * ImageUpscaler Executor
 *
 * Executes imageUpscaler nodes using the Kie.ai Topaz image upscale API.
 * Used by both executeWorkflow and regenerateNode.
 */

import type { ImageUpscalerNodeData } from "@/types";
import { buildGenerateHeaders } from "@/store/utils/buildApiHeaders";
import type { NodeExecutionContext } from "./types";

export interface ImageUpscalerOptions {
  /** When true, falls back to stored inputImage if no connection provides one. */
  useStoredFallback?: boolean;
}

export async function executeImageUpscaler(
  ctx: NodeExecutionContext,
  options: ImageUpscalerOptions = {}
): Promise<void> {
  const {
    node,
    getConnectedInputs,
    updateNodeData,
    getFreshNode,
    signal,
    providerSettings,
    addIncurredCost,
    generationsPath,
    trackSaveGeneration,
  } = ctx;

  const { useStoredFallback = false } = options;

  const { images: connectedImages } = getConnectedInputs(node.id);

  const freshNode = getFreshNode(node.id);
  const nodeData = (freshNode?.data || node.data) as ImageUpscalerNodeData;

  let image: string | null;
  if (useStoredFallback) {
    image = connectedImages.length > 0 ? connectedImages[0] : nodeData.inputImage;
  } else {
    image = connectedImages.length > 0 ? connectedImages[0] : null;
  }

  if (!image) {
    updateNodeData(node.id, { status: "error", error: "Missing image input" });
    throw new Error("Missing image input");
  }

  updateNodeData(node.id, { inputImage: image, status: "loading", error: null });

  const headers = buildGenerateHeaders("kie", providerSettings);

  const requestPayload = {
    images: [image],
    prompt: "",
    selectedModel: {
      provider: "kie",
      modelId: "topaz/image-upscale",
      displayName: "Topaz Image Upscale",
    },
    parameters: { upscale_factor: nodeData.upscaleFactor },
    dynamicInputs: {},
    mediaType: "image" as const,
  };

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
      }
      updateNodeData(node.id, { status: "error", error: errorMessage });
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const outputImage = result.image || result.imageUrl;

    if (result.success && outputImage) {
      const imageId = `${Date.now()}`;

      updateNodeData(node.id, { outputImage, status: "complete", error: null });

      if (nodeData.upscaleFactor && providerSettings?.kiePricing) {
        addIncurredCost(0);
      }

      if (generationsPath) {
        const savePromise = fetch("/api/save-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directoryPath: generationsPath, image: outputImage, imageId }),
        })
          .then((res) => res.json())
          .catch((err) => { console.error("Failed to save upscaled image:", err); });

        trackSaveGeneration(imageId, savePromise);
      }
    } else {
      const errorMessage = result.error || "Image upscaling failed";
      updateNodeData(node.id, { status: "error", error: errorMessage });
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Image upscaling failed";
    updateNodeData(node.id, { status: "error", error: errorMessage });
    throw new Error(errorMessage);
  }
}
