import React from "react";
import { CheckCircle, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Finding } from "../types/UploadState";

interface AuditorFindingsViewProps {
  findings: Finding[];
}

export const AuditorFindingsView: React.FC<AuditorFindingsViewProps> = ({
  findings,
}) => {
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high":
      case "critical":
        return "text-red-600 bg-red-50 border-red-200";
      case "medium":
        return "text-orange-600 bg-orange-50 border-orange-200";
      default:
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high":
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case "medium":
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      default:
        return <Info className="w-5 h-5 text-yellow-600" />;
    }
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No Issues Found
      </h3>
      <p className="text-sm text-gray-500 text-center">
        Your document looks good!
      </p>
    </div>
  );

  const findingCard = (finding: Finding) => (
    <div
      key={finding.id}
      className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getSeverityIcon(finding.severity)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {finding.title}
            </h4>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(
                finding.severity
              )}`}
            >
              {finding.severity.toUpperCase()}
            </span>
          </div>

          {finding.detail && (
            <p className="text-sm text-gray-600 mb-2">{finding.detail}</p>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Code: {finding.code}</span>
            {finding.createdAt && (
              <span>{new Date(finding.createdAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center space-x-2 p-4 pb-2">
        <CheckCircle className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-semibold text-gray-800">Audit Results</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {findings.length === 0 ? (
          emptyState
        ) : (
          <div className="h-full overflow-y-auto p-4 space-y-3">
            {findings.map(findingCard)}
          </div>
        )}
      </div>
    </div>
  );
};



