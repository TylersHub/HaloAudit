import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { AuditorViewModel } from "../services/AuditorViewModel";
import { UploadState } from "../types/UploadState";

export const AuditorUploadView: React.FC = () => {
  const [viewModel] = useState(() => AuditorViewModel.getInstance());
  const [uploadState, setUploadState] = useState(viewModel.uploadState);
  const [statusMessage, setStatusMessage] = useState(viewModel.statusMessage);
  const [progress, setProgress] = useState(viewModel.progress);
  const [currentPhase, setCurrentPhase] = useState(viewModel.currentPhase);

  useEffect(() => {
    const handleStateChange = (data: any) => {
      setUploadState(data.state);
      setStatusMessage(data.message);
      if (data.progress !== undefined) {
        setProgress(data.progress);
      }
    };

    const handleProgress = (data: any) => {
      setCurrentPhase(data.phase);
      setProgress(data.percent);
      setStatusMessage(data.lastMessage);
    };

    const handleError = (error: any) => {
      setUploadState(UploadState.FAILED);
      setStatusMessage(`Error: ${error}`);
    };

    viewModel.on("stateChange", handleStateChange);
    viewModel.on("progress", handleProgress);
    viewModel.on("error", handleError);

    return () => {
      viewModel.off("stateChange", handleStateChange);
      viewModel.off("progress", handleProgress);
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
        // Convert file path to File object
        const filePath = result.filePaths[0];
        const response = await fetch(`file://${filePath}`);
        const blob = await response.blob();
        const file = new File([blob], filePath.split("\\").pop() || "file", {
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
            className={`upload-zone ${isDragActive ? "drag-over" : ""}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {isDragActive
                    ? "Drop your file here"
                    : "Drag & drop PDF or CSV"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">or</p>
                <button
                  onClick={handleFilePicker}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Choose File
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Supported: PDF, CSV • Max 100MB
              </p>
            </div>
          </div>
        );

      case UploadState.UPLOADING:
        return (
          <div className="flex flex-col items-center space-y-4 p-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                {statusMessage}
              </h3>
              <div className="w-64 bg-gray-200 rounded-full h-2 mt-4">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        );

      case UploadState.PROCESSING:
        return (
          <div className="flex flex-col items-center space-y-4 p-8">
            <div className="relative">
              <svg className="w-20 h-20 progress-ring" viewBox="0 0 100 100">
                <circle
                  className="progress-ring-circle stroke-gray-200"
                  strokeWidth="8"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="progress-ring-circle stroke-blue-600"
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
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                {currentPhase}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
              <div className="flex items-center justify-center mt-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
                <span className="text-xs text-green-600">Live</span>
              </div>
            </div>
          </div>
        );

      case UploadState.COMPLETED:
        return (
          <div className="flex flex-col items-center space-y-4 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                Audit Complete!
              </h3>
              <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
              {viewModel.currentRun && (
                <p className="text-xs text-gray-400 mt-2">
                  Run ID: {viewModel.currentRun.runId}
                </p>
              )}
              <button
                onClick={() => viewModel.reset()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload Another
              </button>
            </div>
          </div>
        );

      case UploadState.FAILED:
        return (
          <div className="flex flex-col items-center space-y-4 p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">
                Upload Failed
              </h3>
              <p className="text-sm text-gray-500 mt-1">{statusMessage}</p>
              <button
                onClick={() => viewModel.reset()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center space-x-2 p-4 pb-2">
        <FileText className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-800">Audit Assistant</h2>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center">
        {renderContent()}
      </div>
    </div>
  );
};



