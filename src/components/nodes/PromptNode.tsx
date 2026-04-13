"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { LLMGenerateNodeData, PromptNodeData, PromptConstructorNodeData, ArrayNodeData } from "@/types";

type PromptNodeType = Node<PromptNodeData, "prompt">;

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  // Local state for prompt to prevent cursor jumping during typing
  const [localPrompt, setLocalPrompt] = useState(nodeData.prompt);
  const [isEditing, setIsEditing] = useState(false);

  // Variable naming dialog state
  const [showVarDialog, setShowVarDialog] = useState(false);
  const [varNameInput, setVarNameInput] = useState(nodeData.variableName || "");

  // Check if this node has any incoming text connections
  const hasIncomingTextConnection = useWorkflowStore(
    useCallback((state) => state.edges.some((e) => e.target === id && e.targetHandle === "text"), [id])
  );

  // Reactively read the upstream node's current text output.
  // This selector re-runs whenever nodes or edges change, so the Prompt node
  // automatically picks up new LLM output without needing to disconnect/reconnect.
  const connectedText = useWorkflowStore(
    useCallback((state) => {
      const incomingEdge = state.edges.find((e) => e.target === id && e.targetHandle === "text");
      if (!incomingEdge) return null;
      const sourceNode = state.nodes.find((n) => n.id === incomingEdge.source);
      if (!sourceNode) return null;
      const d = sourceNode.data;
      switch (sourceNode.type) {
        case "llmGenerate":
          return (d as LLMGenerateNodeData).outputText ?? null;
        case "promptConstructor":
          return (d as PromptConstructorNodeData).outputText ?? null;
        case "array":
          return (d as ArrayNodeData).outputText ?? null;
        case "prompt":
          return (d as PromptNodeData).prompt ?? null;
        default:
          return null;
      }
    }, [id])
  );

  // Track the last text we propagated so we don't loop on our own updates
  const lastReceivedTextRef = useRef<string | null>(null);

  // Propagate upstream text changes into this node's prompt (and local state)
  useEffect(() => {
    if (!hasIncomingTextConnection) {
      lastReceivedTextRef.current = null;
      return;
    }
    if (connectedText !== null && connectedText !== lastReceivedTextRef.current) {
      lastReceivedTextRef.current = connectedText;
      updateNodeData(id, { prompt: connectedText });
      if (!isEditing) setLocalPrompt(connectedText);
    }
  }, [connectedText, hasIncomingTextConnection, id, updateNodeData, isEditing]);

  // Sync from props when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalPrompt(nodeData.prompt);
    }
  }, [nodeData.prompt, isEditing]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalPrompt(e.target.value);
    },
    []
  );

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localPrompt !== nodeData.prompt) {
      updateNodeData(id, { prompt: localPrompt });
    }
  }, [id, localPrompt, nodeData.prompt, updateNodeData]);

  const handleSaveVariableName = useCallback(() => {
    updateNodeData(id, { variableName: varNameInput || undefined });
    setShowVarDialog(false);
  }, [id, varNameInput, updateNodeData]);

  const handleClearVariableName = useCallback(() => {
    setVarNameInput("");
    updateNodeData(id, { variableName: undefined });
    setShowVarDialog(false);
  }, [id, updateNodeData]);

  const handleVariableNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only alphanumeric and underscore, max 30 chars
    const sanitized = e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
    setVarNameInput(sanitized);
  }, []);

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
      >
        {/* Text input handle - for receiving text from LLM nodes */}
        <Handle
          type="target"
          position={Position.Left}
          id="text"
          data-handletype="text"
          style={{ zIndex: 10 }}
        />

        <textarea
          value={localPrompt}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={hasIncomingTextConnection ? "Text from connected node (editable)..." : nodeData.isOptional ? "Optional prompt (leave empty to skip)..." : "Describe what to generate..."}
          className="nodrag nopan nowheel w-full h-full p-3 pb-7 text-xs leading-relaxed text-neutral-100 bg-neutral-800 rounded-t-lg resize-none focus:outline-none placeholder:text-neutral-500"
        />
        <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-1.5 bg-neutral-900/90 rounded-b-lg">
          <button
            onClick={() => setShowVarDialog(true)}
            className="nodrag nopan text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            title="Set variable name"
          >
            {nodeData.variableName ? `@${nodeData.variableName}` : "Add variable"}
          </button>
        </div>

        {/* Text output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="text"
          data-handletype="text"
          style={{ zIndex: 10 }}
        />
      </BaseNode>

      {/* Variable Naming Dialog - rendered via portal */}
      {showVarDialog && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
          <div className="bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-4 w-96">
            <h3 className="text-sm font-semibold text-neutral-100 mb-3">Set Variable Name</h3>
            <p className="text-xs text-neutral-400 mb-3">
              Use this prompt as a variable in PromptConstructor nodes
            </p>
            <div className="mb-4">
              <label className="block text-xs text-neutral-300 mb-1">Variable name</label>
              <input
                type="text"
                value={varNameInput}
                onChange={handleVariableNameChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && varNameInput) {
                    handleSaveVariableName();
                  }
                }}
                placeholder="e.g. color, style, subject"
                className="w-full px-3 py-2 text-sm text-neutral-100 bg-neutral-900 border border-neutral-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              {varNameInput && (
                <div className="mt-2 text-xs text-blue-400">
                  Preview: <span className="font-mono">@{varNameInput}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              {nodeData.variableName && (
                <button
                  onClick={handleClearVariableName}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setShowVarDialog(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVariableName}
                disabled={!varNameInput}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
