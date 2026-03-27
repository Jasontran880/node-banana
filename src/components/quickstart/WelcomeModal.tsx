"use client";

import { useState, useCallback } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { QuickstartView } from "@/types/quickstart";
import { QuickstartInitialView } from "./QuickstartInitialView";
import { TemplateExplorerView } from "./TemplateExplorerView";
import { PromptWorkflowView } from "./PromptWorkflowView";

interface WelcomeModalProps {
  onWorkflowGenerated: (workflow: WorkflowFile, directoryPath?: string) => void;
  onClose: () => void;
  onNewProject: () => void;
}

export function WelcomeModal({
  onWorkflowGenerated,
  onClose,
  onNewProject,
}: WelcomeModalProps) {
  const [currentView, setCurrentView] = useState<QuickstartView>("initial");

  const handleNewProject = useCallback(() => {
    onNewProject();
  }, [onNewProject]);

  const handleSelectTemplates = useCallback(() => {
    setCurrentView("templates");
  }, []);

  const handleSelectVibe = useCallback(() => {
    setCurrentView("vibe");
  }, []);

  const handleSelectLoad = useCallback(async () => {
    try {
      const browseRes = await fetch("/api/browse-directory");
      const browseResult = await browseRes.json();

      if (!browseResult.success || browseResult.cancelled || !browseResult.path) {
        if (!browseResult.success && !browseResult.cancelled) {
          alert(browseResult.error || "Failed to open directory picker");
        }
        return;
      }

      const dirPath = browseResult.path;

      const loadRes = await fetch(`/api/workflow?path=${encodeURIComponent(dirPath)}&load=true`);
      const loadResult = await loadRes.json();

      if (!loadResult.success) {
        alert(loadResult.error || "No workflow file found in directory");
        return;
      }

      const workflow = loadResult.workflow as WorkflowFile;
      onWorkflowGenerated(workflow, dirPath);
    } catch (error) {
      console.error("Failed to open workflow:", error);
      alert("Failed to open workflow. Please try again.");
    }
  }, [onWorkflowGenerated]);

  const handleBack = useCallback(() => {
    setCurrentView("initial");
  }, []);

  const handleWorkflowSelected = useCallback(
    (workflow: WorkflowFile) => {
      onWorkflowGenerated(workflow);
    },
    [onWorkflowGenerated]
  );

  // Template explorer needs more width for two-column layout
  const dialogWidth = currentView === "templates" ? "max-w-6xl" : "max-w-2xl";
  const dialogHeight = currentView === "templates" ? "max-h-[85vh]" : "max-h-[80vh]";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onWheelCapture={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div className={`w-full ${dialogWidth} mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl overflow-clip ${dialogHeight} flex flex-col`} onClick={(e) => e.stopPropagation()}>
        {currentView === "initial" && (
          <QuickstartInitialView
            onNewProject={handleNewProject}
            onSelectTemplates={handleSelectTemplates}
            onSelectVibe={handleSelectVibe}
            onSelectLoad={handleSelectLoad}
          />
        )}
        {currentView === "templates" && (
          <TemplateExplorerView
            onBack={handleBack}
            onWorkflowSelected={handleWorkflowSelected}
          />
        )}
        {currentView === "vibe" && (
          <PromptWorkflowView
            onBack={handleBack}
            onWorkflowGenerated={handleWorkflowSelected}
          />
        )}
      </div>
    </div>
  );
}
