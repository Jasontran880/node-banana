"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore, useProviderApiKeys } from "@/store/workflowStore";
import { ImageUpscalerNodeData } from "@/types";
import { useToast } from "@/components/Toast";

type ImageUpscalerNodeType = Node<ImageUpscalerNodeData, "imageUpscaler">;

export function ImageUpscalerNode({ id, data, selected }: NodeProps<ImageUpscalerNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const { kieEnabled, kieApiKey } = useProviderApiKeys();

  const prevStatusRef = useRef(nodeData.status);
  useEffect(() => {
    if (nodeData.status === "error" && prevStatusRef.current !== "error" && nodeData.error) {
      useToast.getState().show("Upscaling failed", "error", true, nodeData.error);
    }
    prevStatusRef.current = nodeData.status;
  }, [nodeData.status, nodeData.error]);

  const handleUpscaleFactorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { upscaleFactor: e.target.value as "1" | "2" | "4" | "8" });
    },
    [id, updateNodeData]
  );

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const handleClearOutput = useCallback(() => {
    updateNodeData(id, { outputImage: null, status: "idle", error: null });
  }, [id, updateNodeData]);

  const kieConfigured = kieEnabled && !!kieApiKey;
  const isLoading = nodeData.status === "loading";

  return (
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      fullBleed
      aspectFitMedia={nodeData.outputImage}
    >
      {/* Image input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
        style={{ top: "50%", zIndex: 10 }}
        isConnectable={true}
      />
      <div
        className="absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{ right: "calc(100% + 8px)", top: "calc(50% - 18px)", color: "var(--handle-color-image)", zIndex: 10 }}
      >
        Image
      </div>

      {/* Image output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        style={{ zIndex: 10 }}
      />
      <div
        className="absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ left: "calc(100% + 8px)", top: "calc(50% - 18px)", color: "var(--handle-color-image)", zIndex: 10 }}
      >
        Image
      </div>

      {/* Main content area */}
      <div className="relative w-full h-full min-h-0 overflow-hidden rounded-lg flex flex-col">

        {/* Output image or empty state */}
        <div className="flex-1 relative overflow-hidden">
          {nodeData.outputImage ? (
            <img
              src={nodeData.outputImage}
              className="w-full h-full object-cover"
              alt="Upscaled output"
            />
          ) : nodeData.inputImage ? (
            <img
              src={nodeData.inputImage}
              className="w-full h-full object-cover opacity-40"
              alt="Input preview"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-500">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              <span className="text-xs">Connect an image</span>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-neutral-900/70 flex flex-col items-center justify-center gap-2">
              <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-white text-xs">Upscaling {nodeData.upscaleFactor}x...</span>
            </div>
          )}

          {/* Error overlay */}
          {nodeData.status === "error" && !isLoading && (
            <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center gap-1">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white text-xs font-medium">Upscaling failed</span>
              <span className="text-white/70 text-[10px]">See toast for details</span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex-shrink-0 bg-neutral-900/90 backdrop-blur-sm border-t border-neutral-700/50 px-2 py-1.5 flex items-center gap-2">
          {/* Kie badge */}
          <span className="text-[10px] font-medium text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded shrink-0">
            Kie
          </span>

          {/* Topaz label */}
          <span className="text-[10px] text-neutral-400 shrink-0">Topaz</span>

          {/* Upscale factor selector */}
          <select
            value={nodeData.upscaleFactor}
            onChange={handleUpscaleFactorChange}
            disabled={isLoading}
            className="flex-1 min-w-0 bg-neutral-800 border border-neutral-600 rounded text-[11px] text-neutral-200 px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-neutral-400 disabled:opacity-50"
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
          </select>

          {/* Action buttons */}
          {nodeData.outputImage && !isLoading && (
            <button
              onClick={handleRegenerate}
              title="Re-upscale"
              className="text-neutral-400 hover:text-neutral-200 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          )}
          {nodeData.outputImage && !isLoading && (
            <button
              onClick={handleClearOutput}
              title="Clear output"
              className="text-neutral-400 hover:text-neutral-200 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Not configured warning */}
          {!kieConfigured && (
            <span className="text-[10px] text-yellow-400 shrink-0" title="Configure Kie.ai API key in settings">
              ⚠ No key
            </span>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
