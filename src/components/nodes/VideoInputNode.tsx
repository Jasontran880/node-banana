"use client";

import { useCallback, useRef } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { VideoInputNodeData } from "@/types";

type VideoInputNodeType = Node<VideoInputNodeData, "videoInput">;

export function VideoInputNode({ id, data, selected }: NodeProps<VideoInputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^video\//)) {
        alert("Unsupported format. Use MP4, WebM, MOV, or other video formats.");
        return;
      }

      if (file.size > 500 * 1024 * 1024) {
        alert("Video file too large. Maximum size is 500MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;

        // Extract duration using HTML Video element
        const video = document.createElement("video");
        video.onloadedmetadata = () => {
          updateNodeData(id, {
            videoFile: base64,
            filename: file.name,
            format: file.type,
            duration: video.duration,
          });
        };
        video.onerror = () => {
          updateNodeData(id, {
            videoFile: base64,
            filename: file.name,
            format: file.type,
            duration: null,
          });
        };
        video.src = base64;
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemove = useCallback(() => {
    updateNodeData(id, {
      videoFile: null,
      filename: null,
      duration: null,
      format: null,
    });
  }, [id, updateNodeData]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <BaseNode
      id={id}
      selected={selected}
      minWidth={250}
      minHeight={150}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/mov,video/quicktime,video/avi,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.videoFile ? (
        <div className="relative group flex-1 flex flex-col min-h-0 gap-2">
          {/* Filename and duration */}
          <div className="flex items-center justify-between shrink-0">
            <span className="text-[10px] text-neutral-400 truncate max-w-[180px]" title={nodeData.filename || ""}>
              {nodeData.filename}
            </span>
            {nodeData.duration != null && isFinite(nodeData.duration) && (
              <span className="text-[10px] text-neutral-500 bg-neutral-700/50 px-1.5 py-0.5 rounded">
                {formatTime(nodeData.duration)}
              </span>
            )}
          </div>

          {/* Video preview */}
          <div className="flex-1 min-h-[80px] bg-neutral-900/50 rounded overflow-hidden">
            <video
              src={nodeData.videoFile}
              className="w-full h-full object-contain"
              controls
              preload="metadata"
            />
          </div>

          {/* Remove button */}
          <button
            onClick={handleRemove}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800/60 transition-colors"
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">
            Drop video or click
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
        style={{ background: "rgb(147, 51, 234)" }}
      />
    </BaseNode>
  );
}
