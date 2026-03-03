import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";

interface UploadZoneProps {
  onFile: (file: File, contentPreview: string) => void;
  disabled?: boolean;
}

const ACCEPTED = ".csv,.txt,.json,.tsv,.dat,.xlsx,.xls,.npy,.mat";

export const UploadZone: React.FC<UploadZoneProps> = ({ onFile, disabled }) => {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = typeof e.target?.result === "string" ? e.target.result : "";
        onFile(file, text.slice(0, 256));
      };
      reader.onerror = () => {
        // Binary file — still proceed with empty preview
        onFile(file, "");
      };
      try {
        reader.readAsText(file);
      } catch {
        onFile(file, "");
      }
    },
    [onFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [disabled, processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // reset so same file can be re-selected
      e.target.value = "";
    },
    [processFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200 select-none",
        dragging
          ? "border-teal bg-teal/5 shadow-teal scale-[1.01]"
          : "border-border hover:border-teal/50 hover:bg-teal/[0.03]",
        disabled ? "opacity-50 pointer-events-none" : "",
      ].join(" ")}
      style={{ minHeight: 200 }}
    >
      <input ref={inputRef} type="file" accept={ACCEPTED} className="sr-only" onChange={handleChange} />

      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 border border-teal/30">
        {dragging ? (
          <FileText className="h-8 w-8 text-teal animate-bounce" />
        ) : (
          <Upload className="h-8 w-8 text-teal" />
        )}
      </div>

      <div className="text-center">
        <p className="text-base font-medium text-foreground">
          {dragging ? "Drop your file here" : "Drag & drop your spectrum file"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          or <span className="text-teal font-medium">browse</span> — CSV, TXT, JSON, TSV, DAT and more
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
};

