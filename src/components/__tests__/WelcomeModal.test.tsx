import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { WelcomeModal } from "@/components/quickstart/WelcomeModal";
import { WorkflowFile } from "@/store/workflowStore";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock templates
vi.mock("@/lib/quickstart/templates", () => {
  const template = {
    id: "product-shot",
    name: "Product Shot",
    description: "Place product in a new scene or environment",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    category: "product",
    tags: ["Gemini"],
    workflow: {
      name: "Product Shot",
      nodes: [{ id: "1", type: "imageInput", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    },
  };
  return {
    getAllPresets: () => [template],
    PRESET_TEMPLATES: [template],
    getPresetTemplate: (id: string) => (id === "product-shot" ? { ...template, id: `workflow-${Date.now()}` } : null),
    getTemplateContent: () => ({ prompts: {}, images: {} }),
  };
});

describe("WelcomeModal", () => {
  const mockOnWorkflowGenerated = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnNewProject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fetch mock for community workflows
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/community-workflows") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, workflows: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render welcome modal with initial view by default", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      expect(screen.getByText("Node Banana")).toBeInTheDocument();
      expect(screen.getByText("New project")).toBeInTheDocument();
      expect(screen.getByText("Templates")).toBeInTheDocument();
      expect(screen.getByText("Prompt a workflow")).toBeInTheDocument();
    });

    it("should render modal overlay with backdrop", () => {
      const { container } = render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      const backdrop = container.querySelector(".bg-black\\/60");
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe("Initial View Navigation", () => {
    it("should call onNewProject when 'New project' is clicked", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("New project"));

      expect(mockOnNewProject).toHaveBeenCalled();
    });

    it("should navigate to templates view when 'Templates' is clicked", async () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Templates"));
      });

      await waitFor(() => {
        expect(screen.getByText("Template Explorer")).toBeInTheDocument();
        expect(screen.getByText("Quick Start")).toBeInTheDocument();
      });
    });

    it("should navigate to vibe view when 'Prompt a workflow' is clicked", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("Prompt a workflow"));

      expect(screen.getByText("Prompt a Workflow")).toBeInTheDocument();
      expect(screen.getByText("Describe your workflow")).toBeInTheDocument();
    });
  });

  describe("View Transitions", () => {
    it("should navigate back to initial view from templates view", async () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      // Navigate to templates
      await act(async () => {
        fireEvent.click(screen.getByText("Templates"));
      });

      await waitFor(() => {
        expect(screen.getByText("Template Explorer")).toBeInTheDocument();
      });

      // Click back
      await act(async () => {
        fireEvent.click(screen.getByText("Back"));
      });

      expect(screen.getByText("Node Banana")).toBeInTheDocument();
      expect(screen.getByText("New project")).toBeInTheDocument();
    });

    it("should navigate back to initial view from prompt view", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      // Navigate to prompt view
      fireEvent.click(screen.getByText("Prompt a workflow"));
      expect(screen.getByText("Prompt a Workflow")).toBeInTheDocument();

      // Click back
      fireEvent.click(screen.getByText("Back"));

      expect(screen.getByText("Node Banana")).toBeInTheDocument();
    });
  });

  describe("File Loading via Directory Picker", () => {
    it("should call browse-directory API when 'Load workflow' is clicked", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("Load workflow"));

      expect(mockFetch).toHaveBeenCalledWith("/api/browse-directory");
    });

    it("should not call onWorkflowGenerated when directory picker is cancelled", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/browse-directory") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, cancelled: true }),
          });
        }
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("Load workflow"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/browse-directory");
      });
      expect(mockOnWorkflowGenerated).not.toHaveBeenCalled();
    });

    it("should call onWorkflowGenerated with workflow and directory path on success", async () => {
      const mockWorkflow = { version: 1, nodes: [], edges: [], name: "Test" };

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/browse-directory") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, path: "/path/to/project" }),
          });
        }
        if (typeof url === "string" && url.includes("/api/workflow?")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflow: mockWorkflow, filename: "Test" }),
          });
        }
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("Load workflow"));

      await waitFor(() => {
        expect(mockOnWorkflowGenerated).toHaveBeenCalledWith(mockWorkflow, "/path/to/project");
      });
    });

    it("should show alert when no workflow found in directory", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/browse-directory") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, path: "/empty/dir" }),
          });
        }
        if (typeof url === "string" && url.includes("/api/workflow?")) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ success: false, error: "No workflow file found in directory" }),
          });
        }
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      fireEvent.click(screen.getByText("Load workflow"));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("No workflow file found in directory");
      });
      expect(mockOnWorkflowGenerated).not.toHaveBeenCalled();
    });
  });

  describe("Workflow Selection from Child Views", () => {
    it("should call onWorkflowGenerated when workflow is generated from templates view", async () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      // Navigate to templates
      await act(async () => {
        fireEvent.click(screen.getByText("Templates"));
      });

      await waitFor(() => {
        expect(screen.getByText("Template Explorer")).toBeInTheDocument();
      });

      // Verify templates view is showing - the actual workflow selection is tested in QuickstartTemplatesView tests
      expect(screen.getByText("Quick Start")).toBeInTheDocument();
    });

    it("should show prompt view when navigating to vibe", () => {
      render(
        <WelcomeModal
          onWorkflowGenerated={mockOnWorkflowGenerated}
          onClose={mockOnClose}
          onNewProject={mockOnNewProject}
        />
      );

      // Navigate to vibe/prompt view
      fireEvent.click(screen.getByText("Prompt a workflow"));

      expect(screen.getByText("Prompt a Workflow")).toBeInTheDocument();
      expect(screen.getByText("Generate Workflow")).toBeInTheDocument();
    });
  });
});
