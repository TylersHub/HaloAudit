import React from "react";
import { AuditorUploadView } from "./components/AuditorUploadView";

const App: React.FC = () => {
  return (
    <div className="flex h-full w-full items-start justify-center bg-transparent pt-0.5">
      <div className="replica-notch-wrapper relative h-[124px] w-[448px] overflow-visible">
        <div className="replica-notch-shell replica-notch-shell-expanded absolute inset-x-0 top-0 h-[96px] w-[448px] overflow-hidden">
          <div className="replica-notch-bridge">
            <span className="replica-notch-lens replica-notch-lens-primary" />
            <span className="replica-notch-lens" />
          </div>

          <div className="absolute inset-x-0 bottom-0 top-[12px]">
            <AuditorUploadView />
          </div>
        </div>

        <div className="replica-notch-stem" />
      </div>
    </div>
  );
};

export default App;


