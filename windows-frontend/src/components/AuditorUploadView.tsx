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

  const renderCompactProgress = ({
    icon,
    title,
    detail,
    value,
    trailingLabel,
  }: {
    icon: React.ReactNode;
    title: string;
    detail: string;
    value: number;
    trailingLabel: string;
  }) => {
    const progressWidth = Math.min(100, Math.max(value, 6));

    return (
      <div className="flex h-full items-center gap-3 px-4 py-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/8 bg-white/[0.04]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-zinc-100">{title}</p>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {trailingLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{detail}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/85 transition-all duration-300"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  const processingTitle = currentPhase?.trim() || "Queued";
  const processingDetail =
    statusMessage === "Processing started..."
      ? "Waiting for the worker to pick up your document."
      : statusMessage;

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
        return renderCompactProgress({
          icon: <Upload className="h-4 w-4 animate-pulse text-zinc-200" />,
          title: "Uploading document",
          detail: statusMessage,
          value: progress,
          trailingLabel: `${Math.round(progress)}%`,
        });

      case UploadState.PROCESSING:
        return renderCompactProgress({
          icon: <Loader2 className="h-4 w-4 animate-spin text-zinc-200" />,
          title: processingTitle,
          detail: processingDetail,
          value: progress,
          trailingLabel: progress > 0 ? `${Math.round(progress)}%` : "Live",
        });

      case UploadState.COMPLETED:
        return (
          <div className="flex h-full items-center gap-3 px-4 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-emerald-400/20 bg-emerald-400/10">
              <CheckCircle className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-100">
                Audit complete
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {statusMessage}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  void viewModel.openReport().catch((error) => {
                    console.error("Failed to open report:", error);
                  });
                }}
                disabled={!reportReady}
                className="flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-[11px] font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Report
              </button>
              <button
                onClick={() => {
                  setReportReady(false);
                  viewModel.reset();
                }}
                className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-white/5"
              >
                New
              </button>
            </div>
          </div>
        );

      case UploadState.FAILED:
        return (
          <div className="flex h-full items-center gap-3 px-4 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-orange-400/20 bg-orange-400/10">
              <AlertCircle className="h-4 w-4 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-100">
                Upload failed
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {statusMessage}
              </p>
            </div>
            <div className="shrink-0">
              <button
                onClick={() => viewModel.reset()}
                className="rounded-md bg-white px-3 py-2 text-[11px] font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Retry
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



