import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, FileSearch, Loader2, Sparkles } from "lucide-react";
import { AuditorUploadView } from "./components/AuditorUploadView";
import { AuditorViewModel } from "./services/AuditorViewModel";
import { UploadState } from "./types/UploadState";

const App: React.FC = () => {
  const [viewModel] = useState(() => AuditorViewModel.getInstance());
  const [uploadState, setUploadState] = useState(viewModel.uploadState);
  const [statusMessage, setStatusMessage] = useState(viewModel.statusMessage);
  const [currentPhase, setCurrentPhase] = useState(viewModel.currentPhase);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [peekOpen, setPeekOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setPeekOpen(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleStateChange = (data: {
      state: UploadState;
      message: string;
    }) => {
      setUploadState(data.state);
      setStatusMessage(data.message);

      if (
        data.state === UploadState.UPLOADING ||
        data.state === UploadState.PROCESSING
      ) {
        setIsPinned(true);
      }
    };

    const handleProgress = (data: {
      phase: string;
      lastMessage: string;
    }) => {
      setCurrentPhase(data.phase);
      setStatusMessage(data.lastMessage);
    };

    viewModel.on("stateChange", handleStateChange);
    viewModel.on("progress", handleProgress);

    return () => {
      viewModel.off("stateChange", handleStateChange);
      viewModel.off("progress", handleProgress);
    };
  }, [viewModel]);

  const isBusy =
    uploadState === UploadState.UPLOADING ||
    uploadState === UploadState.PROCESSING;
  const isExpanded = isHovered || isPinned || peekOpen || isBusy;

  const compactLabel = useMemo(() => {
    if (uploadState === UploadState.PROCESSING) {
      return currentPhase || "Scanning document";
    }
    if (uploadState === UploadState.UPLOADING) {
      return "Uploading securely";
    }
    if (uploadState === UploadState.COMPLETED) {
      return "Audit complete";
    }
    if (uploadState === UploadState.FAILED) {
      return "Retry audit";
    }
    return "Drop a file to audit";
  }, [currentPhase, uploadState]);

  const statusIcon = useMemo(() => {
    if (uploadState === UploadState.PROCESSING) {
      return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
    }
    if (uploadState === UploadState.COMPLETED) {
      return <Sparkles className="h-4 w-4 text-emerald-300" />;
    }
    if (uploadState === UploadState.FAILED) {
      return <AlertTriangle className="h-4 w-4 text-rose-300" />;
    }
    return <FileSearch className="h-4 w-4 text-slate-200" />;
  }, [uploadState]);

  const handleTogglePin = () => {
    if (isBusy) {
      return;
    }
    setIsPinned((current) => !current);
  };

  return (
    <div className="flex h-full w-full items-start justify-center bg-transparent pt-1">
      <motion.div
        className="notch-shell relative overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        animate={{
          width: isExpanded ? 560 : 320,
          height: isExpanded ? 236 : 44,
          borderRadius: isExpanded ? 30 : 22,
        }}
        transition={{ type: "spring", damping: 28, stiffness: 260, mass: 0.9 }}
      >
        <div className="notch-noise pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-white/20" />
        <div className="pointer-events-none absolute left-1/2 top-3 h-2.5 w-24 -translate-x-1/2 rounded-full bg-black/55 blur-[1px]" />

        <motion.button
          type="button"
          className="relative z-10 flex h-11 w-full items-center justify-between px-4 text-left"
          onClick={handleTogglePin}
          whileTap={{ scale: 0.995 }}
        >
          <div className="flex items-center gap-3">
            <div className="notch-camera-cluster">
              <span className="notch-camera-dot notch-camera-dot-primary" />
              <span className="notch-camera-dot" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
                HaloAudit
              </span>
              <span className="text-sm font-medium text-slate-100">
                {compactLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="hidden text-xs text-slate-400 sm:block">
              {isPinned && !isBusy ? "Pinned" : statusMessage}
            </span>
          </div>
        </motion.button>

        <div className="pointer-events-none absolute inset-x-5 top-11 h-px bg-white/10" />

        <div className="relative h-full w-full">
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className="absolute inset-x-0 bottom-0 top-11"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
                exit={{ opacity: 0, y: -10 }}
              >
                <AuditorUploadView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default App;


