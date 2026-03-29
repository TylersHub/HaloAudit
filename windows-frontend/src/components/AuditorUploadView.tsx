import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
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
          <div
            {...getRootProps()}
            className={`upload-zone h-full ${isDragActive ? "drag-over" : ""}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-cyan-400/12 ring-1 ring-inset ring-cyan-200/20">
                <Upload className="h-8 w-8 text-cyan-200" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-slate-50">
                  {isDragActive
                    ? "Drop your file here"
                    : "Drop a PDF or CSV into the notch"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Fast upload, live progress, and an instant report link.
                </p>
                <button
                  onClick={handleFilePicker}
                  className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200"
                >
                  Choose File
                </button>
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Supported: PDF, CSV | Max 100MB
              </p>
            </div>
          </div>
        );

      case UploadState.UPLOADING:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-cyan-400/12 ring-1 ring-inset ring-cyan-200/20">
              <Upload className="h-8 w-8 text-cyan-200" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-50">
                {statusMessage}
              </h3>
              <div className="mt-4 h-2 w-72 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        );

      case UploadState.PROCESSING:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <div className="relative">
              <div className="absolute inset-2 rounded-full bg-cyan-300/10 blur-xl" />
              <svg className="progress-ring h-20 w-20" viewBox="0 0 100 100">
                <circle
                  className="progress-ring-circle stroke-white/10"
                  strokeWidth="8"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="progress-ring-circle stroke-cyan-300"
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
                <Loader2 className="h-8 w-8 animate-spin text-cyan-200" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-50">
                {currentPhase}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs uppercase tracking-[0.22em] text-emerald-300">
                  Live
                </span>
              </div>
            </div>
          </div>
        );

      case UploadState.COMPLETED:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-emerald-400/12 ring-1 ring-inset ring-emerald-200/20">
              <CheckCircle className="h-8 w-8 text-emerald-200" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-50">
                Audit Complete!
              </h3>
              <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>
              {viewModel.currentRun && (
                <p className="mt-2 text-xs text-slate-500">
                  Run ID: {viewModel.currentRun.runId}
                </p>
              )}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    void viewModel.openReport().catch((error) => {
                      console.error("Failed to open report:", error);
                    });
                  }}
                  disabled={!reportReady}
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ExternalLink className="h-4 w-4" />
                  Show Report
                </button>
                <button
                  onClick={() => {
                    setReportReady(false);
                    viewModel.reset();
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10"
                >
                  Upload Another
                </button>
              </div>
            </div>
          </div>
        );

      case UploadState.FAILED:
        return (
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-8 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-rose-400/12 ring-1 ring-inset ring-rose-200/20">
              <AlertCircle className="h-8 w-8 text-rose-200" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-50">
                Upload Failed
              </h3>
              <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>
              <button
                onClick={() => viewModel.reset()}
                className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200"
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
    <div className="flex h-full flex-1 flex-col px-4 pb-4 pt-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center space-x-2">
          <FileText className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
            Auditor
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
          Desktop
        </span>
      </div>

      <div className="notch-panel flex flex-1 items-center justify-center overflow-hidden rounded-[26px]">
        {renderContent()}
      </div>
    </div>
  );
};



