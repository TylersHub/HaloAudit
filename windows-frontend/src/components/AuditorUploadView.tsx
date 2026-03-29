import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Play,
  ScanSearch,
} from "lucide-react";
import { AuditorViewModel } from "../services/AuditorViewModel";
import { UploadState } from "../types/UploadState";

export const AuditorUploadView: React.FC = () => {
  const [viewModel] = useState(() => AuditorViewModel.getInstance());
  const [uploadState, setUploadState] = useState(viewModel.uploadState);
  const [statusMessage, setStatusMessage] = useState(viewModel.statusMessage);
  const [progress, setProgress] = useState(viewModel.progress);
  const [currentPhase, setCurrentPhase] = useState(viewModel.currentPhase);
  const [reportReady, setReportReady] = useState(Boolean(viewModel.reportUrl));

  useEffect(() => {
    const handleStateChange = (data: any) => {
      setUploadState(data.state);
      setStatusMessage(data.message);
      if (data.progress !== undefined) {
        setProgress(data.progress);
      }
      if (data.state === UploadState.IDLE || data.state === UploadState.FAILED) {
        setReportReady(false);
      }
    };

    const handleProgress = (data: any) => {
      setCurrentPhase(data.phase);
      setProgress(data.percent);
      setStatusMessage(data.lastMessage);
    };

    const handleReportReady = () => {
      setReportReady(true);
    };

    const handleError = (error: any) => {
      setUploadState(UploadState.FAILED);
      setStatusMessage(`Error: ${error}`);
    };

    viewModel.on("stateChange", handleStateChange);
    viewModel.on("progress", handleProgress);
    viewModel.on("reportReady", handleReportReady);
    viewModel.on("error", handleError);

    return () => {
      viewModel.off("stateChange", handleStateChange);
      viewModel.off("progress", handleProgress);
      viewModel.off("reportReady", handleReportReady);
      viewModel.off("error", handleError);
    };
  }, [viewModel]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        await viewModel.uploadFile(file);
      }
    },
    [viewModel]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/csv": [".csv"],
    },
    multiple: false,
    disabled:
      uploadState === UploadState.UPLOADING ||
      uploadState === UploadState.PROCESSING,
  });

  const handleFilePicker = async () => {
    try {
      const result = await window.electronAPI.showFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileData = await window.electronAPI.readFile(filePath);
        const extension = fileData.name.split(".").pop()?.toLowerCase();
        const mimeType =
          extension === "csv" ? "text/csv" : extension === "pdf" ? "application/pdf" : "";
        const blob = new Blob([new Uint8Array(fileData.data)], {
          type: mimeType || "application/octet-stream",
        });
        const file = new File([blob], fileData.name, {
          type: blob.type,
        });
        await viewModel.uploadFile(file);
      }
    } catch (error) {
      console.error("File picker error:", error);
    }
  };

  const renderContent = () => {
    switch (uploadState) {
      case UploadState.IDLE:
        return (
          <div className="flex h-full gap-2 px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={handleFilePicker}
              className="replica-audit-action group flex w-[106px] shrink-0 flex-col items-center justify-center rounded-[13px]"
            >
              <div className="replica-audit-action-icon">
                <Play className="h-3 w-3 fill-zinc-200 text-zinc-200 transition-transform duration-200 group-hover:scale-105" />
              </div>
              <div className="text-center">
                <div className="text-[11px] font-medium text-zinc-300">Run Audit</div>
              </div>
            </button>

            <div
              {...getRootProps()}
              className={`upload-zone replica-audit-dropzone h-full flex-1 ${
                isDragActive ? "drag-over" : ""
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center space-y-2">
                <ScanSearch className="h-4 w-4 text-zinc-500" />
                <div className="text-center">
                  <h3 className="text-[11px] font-medium text-zinc-400">
                    {isDragActive ? "Drop to upload" : "Drop PDF or CSV here"}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        );

      case UploadState.UPLOADING:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-5 px-8 py-6">
            <div className="text-center">
              <h3 className="text-lg font-medium text-zinc-100">
                {statusMessage}
              </h3>
              <div className="mt-5 h-1.5 w-56 rounded-full bg-white/15">
                <div
                  className="h-1.5 rounded-full bg-white transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        );

      case UploadState.PROCESSING:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-5 px-8 py-6">
            <div className="relative">
              <svg className="progress-ring h-24 w-24" viewBox="0 0 100 100">
                <circle
                  className="progress-ring-circle stroke-zinc-700"
                  strokeWidth="8"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="progress-ring-circle stroke-white"
                  strokeWidth="8"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 40 * (1 - progress / 100)
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base font-semibold text-zinc-100">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-zinc-100">
                {currentPhase || "Processing"}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">{statusMessage}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-300" />
                <span className="text-xs text-zinc-400">
                  Live
                </span>
              </div>
            </div>
          </div>
        );

      case UploadState.COMPLETED:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <CheckCircle className="h-12 w-12 text-green-400" />
            <div className="text-center">
              <h3 className="text-xl font-semibold text-zinc-100">
                Audit Complete!
              </h3>
              <p className="mt-2 text-sm text-zinc-400">{statusMessage}</p>
              {viewModel.currentRun && (
                <p className="mt-2 text-xs text-zinc-600">
                  Run ID: {viewModel.currentRun.runId}
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  void viewModel.openReport().catch((error) => {
                    console.error("Failed to open report:", error);
                  });
                }}
                disabled={!reportReady}
                className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ExternalLink className="h-4 w-4" />
                Show Report
              </button>
              <button
                onClick={() => {
                  setReportReady(false);
                  viewModel.reset();
                }}
                className="rounded-md border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
              >
                Upload Another
              </button>
            </div>
          </div>
        );

      case UploadState.FAILED:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <AlertCircle className="h-12 w-12 text-orange-400" />
            <div className="text-center">
              <h3 className="text-xl font-semibold text-zinc-100">
                Upload Failed
              </h3>
              <p className="mt-1 text-sm text-zinc-500">{statusMessage}</p>
              <button
                onClick={() => viewModel.reset()}
                className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Try Again
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[16px]">
        {renderContent()}
      </div>
    </div>
  );
};



