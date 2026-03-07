import React from "react";
import { useState } from "react";
import { Activity, FlaskConical, ArrowRight, ShieldAlert, X } from "lucide-react";
import { UploadZone } from "./UploadZone";
import type { FileInfo } from "@/lib/mockGenerator";

interface LandingPageProps {
  onAnalyze: (fileInfo: FileInfo, file: File) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onAnalyze }) => {
  const [file, setFile] = useState<File | null>(null);
  const [contentPreview, setContentPreview] = useState("");

  const handleFile = (f: File, preview: string) => {
    setFile(f);
    setContentPreview(preview);
  };

  const handleStart = () => {
    if (!file) return;
    onAnalyze({ name: file.name, size: file.size, contentPreview }, file);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setContentPreview("");
  };

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* Hero */}
      <div className="relative overflow-hidden flex-1 flex flex-col">
        {/* Background image overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--teal) / 0.35) 0%, transparent 45%), radial-gradient(circle at 80% 30%, hsl(var(--teal) / 0.2) 0%, transparent 40%), radial-gradient(circle at 50% 80%, hsl(var(--teal) / 0.15) 0%, transparent 40%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/90 to-background" />

        {/* Nav */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/15 border border-teal/30">
              <Activity className="h-4 w-4 text-teal" />
            </div>
            <span className="font-semibold text-lg tracking-tight">
              Deep<span className="text-teal">Pick</span>
            </span>
          </div>
        </header>

        {/* Hero content */}
        <main className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-8 flex-1">

          <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-foreground mb-6">
            Платформа{" "}
            <span className="text-teal">анализа</span>
            <br />
            спектров Рамана
          </h1>

          {/* Upload section */}
          <div className="w-full max-w-2xl mt-10 space-y-4 text-left">
            <UploadZone onFile={handleFile} />

            {file && (
              <div className="flex items-center gap-3 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 text-sm animate-fade-in">
                <div className="h-2 w-2 rounded-full bg-teal flex-shrink-0" />
                <span className="min-w-0 flex-1 text-foreground font-medium truncate">{file.name}</span>
                <span className="text-muted-foreground font-mono ml-auto flex-shrink-0">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-teal/30 text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Удалить выбранный файл"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={!file}
              className={[
                "w-full flex items-center justify-center gap-3 rounded-xl py-4 text-base font-semibold transition-all duration-200",
                file
                  ? "bg-gradient-teal text-primary-foreground shadow-teal hover:shadow-[0_0_32px_-4px_hsl(175_80%_42%/0.6)] hover:scale-[1.01] active:scale-[0.99]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              ].join(" ")}
            >
              <FlaskConical className="h-5 w-5" />
              Начать анализ
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          {/* Disclaimer */}
          <div className="w-full max-w-2xl mt-8 flex items-start gap-3 rounded-lg border border-amber-warn/30 bg-amber-warn/5 px-4 py-3 text-left">
            <ShieldAlert className="h-4 w-4 text-amber-warn flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-warn/90 leading-relaxed">
              <strong>Важно:</strong> приложение является исследовательским прототипом и{" "}
              <strong>не является сертифицированным медицинским изделием</strong>. Результаты нельзя
              использовать для клинической диагностики, принятия решений о лечении или ведения пациента.
              Только для исследовательского применения.
            </p>
          </div>
        </main>
      </div>

    </div>
  );
};
