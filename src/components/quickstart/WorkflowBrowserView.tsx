"use client";

import { useState, useEffect, useCallback } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { QuickstartBackButton } from "./QuickstartBackButton";
import {
  getWorkflowsDirectory,
  setWorkflowsDirectory,
} from "@/store/utils/localStorage";

interface WorkflowListEntry {
  name: string;
  directoryPath: string;
  nodeCount: number;
  lastModified: number;
}

interface WorkflowBrowserViewProps {
  onBack?: () => void;
  onWorkflowLoaded: (workflow: WorkflowFile, directoryPath: string) => void;
  onClose?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function WorkflowBrowserView({
  onBack,
  onWorkflowLoaded,
  onClose,
}: WorkflowBrowserViewProps) {
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingWorkflow, setLoadingWorkflow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDefaultDir(getWorkflowsDirectory());
  }, []);

  const fetchWorkflows = useCallback(async (dirPath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/list-workflows?path=${encodeURIComponent(dirPath)}`
      );
      const result = await res.json();
      if (result.success) {
        setWorkflows(result.workflows);
        if (result.workflows.length === 0) {
          setError("No workflows found in this folder");
        }
      } else {
        setError(result.error || "Failed to list workflows");
      }
    } catch {
      setError("Failed to fetch workflows");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch workflows when default directory is set
  useEffect(() => {
    if (defaultDir) {
      fetchWorkflows(defaultDir);
    }
  }, [defaultDir, fetchWorkflows]);

  const handleChooseFolder = useCallback(async () => {
    try {
      const res = await fetch("/api/browse-directory");
      const result = await res.json();
      if (result.success && !result.cancelled && result.path) {
        setWorkflowsDirectory(result.path);
        setDefaultDir(result.path);
      }
    } catch {
      setError("Failed to open directory picker");
    }
  }, []);

  const handleChangeFolder = useCallback(async () => {
    try {
      const res = await fetch("/api/browse-directory");
      const result = await res.json();
      if (result.success && !result.cancelled && result.path) {
        setWorkflowsDirectory(result.path);
        setDefaultDir(result.path);
      }
    } catch {
      setError("Failed to open directory picker");
    }
  }, []);

  const handleBrowseOther = useCallback(async () => {
    try {
      const browseRes = await fetch("/api/browse-directory");
      const browseResult = await browseRes.json();

      if (
        !browseResult.success ||
        browseResult.cancelled ||
        !browseResult.path
      ) {
        if (!browseResult.success && !browseResult.cancelled) {
          setError(browseResult.error || "Failed to open directory picker");
        }
        return;
      }

      const dirPath = browseResult.path;

      setLoadingWorkflow(dirPath);
      const loadRes = await fetch(
        `/api/workflow?path=${encodeURIComponent(dirPath)}&load=true`
      );
      const loadResult = await loadRes.json();
      setLoadingWorkflow(null);

      if (!loadResult.success) {
        setError(loadResult.error || "No workflow file found in directory");
        return;
      }

      onWorkflowLoaded(loadResult.workflow as WorkflowFile, dirPath);
      onClose?.();
    } catch {
      setLoadingWorkflow(null);
      setError("Failed to open workflow");
    }
  }, [onWorkflowLoaded, onClose]);

  const handleSelectWorkflow = useCallback(
    async (entry: WorkflowListEntry) => {
      setLoadingWorkflow(entry.directoryPath);
      setError(null);
      try {
        const res = await fetch(
          `/api/workflow?path=${encodeURIComponent(entry.directoryPath)}&load=true`
        );
        const result = await res.json();

        if (!result.success) {
          setError(result.error || "Failed to load workflow");
          setLoadingWorkflow(null);
          return;
        }

        onWorkflowLoaded(
          result.workflow as WorkflowFile,
          entry.directoryPath
        );
        onClose?.();
      } catch {
        setError("Failed to load workflow");
        setLoadingWorkflow(null);
      }
    },
    [onWorkflowLoaded, onClose]
  );

  // State A: No default directory configured
  if (defaultDir === null) {
    return (
      <div className="p-8 flex flex-col items-center">
        {onBack && (
          <div className="w-full mb-4">
            <QuickstartBackButton onClick={onBack} />
          </div>
        )}
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
              />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-medium text-neutral-200 mb-1">
              Your Workflows
            </h2>
            <p className="text-sm text-neutral-500 max-w-xs">
              Choose a folder that contains your workflow projects
            </p>
          </div>
          <button
            onClick={handleChooseFolder}
            className="px-4 py-2 text-sm font-medium text-neutral-200 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
          >
            Choose folder
          </button>
        </div>
      </div>
    );
  }

  // State B: Default directory configured — show listing
  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-700/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && <QuickstartBackButton onClick={onBack} />}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-neutral-200">
              Your Workflows
            </h2>
            <p
              className="text-xs text-neutral-500 truncate"
              title={defaultDir}
            >
              {defaultDir}
            </p>
          </div>
        </div>
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
          </div>
        ) : error && workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-neutral-500">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {workflows.map((entry) => (
              <button
                key={entry.directoryPath}
                onClick={() => handleSelectWorkflow(entry)}
                disabled={loadingWorkflow !== null}
                className="group text-left px-4 py-3 rounded-lg hover:bg-neutral-700/40 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100 transition-colors">
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-neutral-500">
                        {entry.nodeCount} node{entry.nodeCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-neutral-700">·</span>
                      <span className="text-xs text-neutral-500">
                        {formatRelativeTime(entry.lastModified)}
                      </span>
                    </div>
                  </div>
                  {loadingWorkflow === entry.directoryPath ? (
                    <div className="w-4 h-4 border-2 border-neutral-600 border-t-neutral-300 rounded-full animate-spin" />
                  ) : (
                    <svg
                      className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {error && workflows.length > 0 && (
          <p className="text-xs text-red-400 mt-2 px-4">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-neutral-700/50 flex-shrink-0 flex items-center gap-3">
        <button
          onClick={handleBrowseOther}
          disabled={loadingWorkflow !== null}
          className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
        >
          Browse other location...
        </button>
        <span className="text-neutral-700">·</span>
        <button
          onClick={handleChangeFolder}
          disabled={loadingWorkflow !== null}
          className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
        >
          Change folder
        </button>
      </div>
    </div>
  );
}
