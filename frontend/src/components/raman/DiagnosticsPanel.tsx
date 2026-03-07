import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { RamanDiagnostic } from "@/lib/raman/api";

interface DiagnosticsPanelProps {
  diagnostics: RamanDiagnostic[];
  suggestedQuestions: string[];
}

function iconForSeverity(severity: RamanDiagnostic["severity"]) {
  if (severity === "error") {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-warn" />;
  }
  return <Info className="h-4 w-4 text-teal" />;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  suggestedQuestions,
}) => (
  <div className="space-y-4">
    <div className="card-surface rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground">Диагностика</h3>
      {diagnostics.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Парсер не вернул предупреждений для этого файла.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {diagnostics.map((diagnostic) => (
            <div
              key={`${diagnostic.code}-${diagnostic.message}`}
              className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/30 px-3 py-3"
            >
              {iconForSeverity(diagnostic.severity)}
              <div>
                <div className="text-sm font-medium text-foreground">{diagnostic.code}</div>
                <div className="mt-1 text-sm text-muted-foreground">{diagnostic.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="card-surface rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground">Уточняющие вопросы</h3>
      {suggestedQuestions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Дополнительных уточнений не требуется.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {suggestedQuestions.map((question) => (
            <li key={question} className="rounded-lg border border-border/70 bg-background/30 px-3 py-2">
              {question}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
