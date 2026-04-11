/**
 * VideoUpscaler Executor
 *
 * Executes videoUpscaler nodes using the Kie.ai Topaz video upscale API.
 * Used by both executeWorkflow and regenerateNode.
 */

import type { VideoUpscalerNodeData } from "@/types";
import { buildGenerateHeaders } from "@/store/utils/buildApiHeaders";
import type { NodeExecutionContext } from "./types";

export interface VideoUpscalerOptions {
  /** When true, falls back to stored inputVideo if no connection provides one. */
  useStoredFallback?: boolean;
}

export async function executeVideoUpscaler(
  ctx: NodeExecutionContext,
  options: VideoUpscalerOptions = {}
): Promise<void> {
  const {
    node,
    getConnectedInputs,
    updateNodeData,
    getFreshNode,
    signal,
    providerSettings,
    addIncurredCost,
    trackSaveGeneration,
  } = ctx;

  const { useStoredFallback = false } = options;

  const { videos: connectedVideos } = getConnectedInputs(node.id);

  const freshNode = getFreshNode(node.id);
  const nodeData = (freshNode?.data || node.data) as VideoUpscalerNodeData;

  let video: string | null;
  if (useStoredFallback) {
    video = connectedVideos.length > 0 ? connectedVideos[0] : nodeData.inputVideo;
  } else {
    video = connectedVideos.length > 0 ? connectedVideos[0] : null;
  }

  if (!video) {
    updateNodeData(node.id, { status: "error", error: "Missing video input" });
    throw new Error("Missing video input");
  }

  updateNodeData(node.id, { inputVideo: video, status: "loading", error: null });

  const provider = nodeData.selectedProvider ?? "kie";
  const headers = buildGenerateHeaders(provider as "kie" | "muapi", providerSettings);

  const selectedModel =
    provider === "muapi"
      ? { provider: "muapi", modelId: "topaz-video-upscale", displayName: "Topaz Video Upscale (MuAPI)" }
      : { provider: "kie", modelId: "topaz/video-upscale", displayName: "Topaz Video Upscale" };

  const requestPayload = {
    images: [],
    videos: [video],
    prompt: "",
    selectedModel,
    parameters: { upscale_factor: nodeData.upscaleFactor },
    dynamicInputs: {},
    mediaType: "video" as const,
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
    const outputVideo = result.video || result.videoUrl;

    if (result.success && outputVideo) {
      updateNodeData(node.id, { outputVideo, status: "complete", error: null });

      if (trackSaveGeneration) {
        // No file saving for video upscaler outputs for now
        void trackSaveGeneration;
      }
    } else {
      const errorMessage = result.error || "Video upscaling failed";
      updateNodeData(node.id, { status: "error", error: errorMessage });
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Video upscaling failed";
    updateNodeData(node.id, { status: "error", error: errorMessage });
    throw new Error(errorMessage);
  }
}
