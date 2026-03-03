import React from "react";
import { useState } from "react";
import { Activity, FlaskConical, ArrowRight, ShieldAlert, ToggleLeft, ToggleRight } from "lucide-react";
import { UploadZone } from "./UploadZone";
import { ApiConfigPanel } from "./ApiConfigPanel";
import type { FileInfo } from "@/lib/mockGenerator";

interface LandingPageProps {
  onAnalyze: (fileInfo: FileInfo, file: File, apiMode: boolean, apiUrl: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onAnalyze }) => {
  const [file, setFile] = useState<File | null>(null);
  const [contentPreview, setContentPreview] = useState("");
  const [apiMode, setApiMode] = useState(false);
  const [apiUrl, setApiUrl] = useState("/api/predict");

  const handleFile = (f: File, preview: string) => {
    setFile(f);
    setContentPreview(preview);
  };

  const handleStart = () => {
    if (!file) return;
    onAnalyze(
      { name: file.name, size: file.size, contentPreview },
      file,
      apiMode,
      apiUrl
    );
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
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <FlaskConical className="h-3 w-3" />
            Research prototype · v0.1
          </div>
        </header>

        {/* Hero content */}
        <main className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-8 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-4 py-1.5 text-xs font-medium text-teal mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
            Deep Learning · Raman Spectroscopy
          </div>

          <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-foreground mb-6">
            Raman Spectra{" "}
            <span className="text-teal">Classification</span>
            <br />
            Visualization Platform
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed mb-3">
            DeepPick leverages convolutional neural networks to classify Raman spectra and distinguish
            tumor-like signatures from healthy tissue. Upload your spectral dataset to explore
            per-spectrum probability scores, interactive classification thresholds, and population-level statistics.
          </p>

          {/* Upload section */}
          <div className="w-full max-w-2xl mt-10 space-y-4 text-left">
            <UploadZone onFile={handleFile} />

            {file && (
              <div className="flex items-center gap-3 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3 text-sm animate-fade-in">
                <div className="h-2 w-2 rounded-full bg-teal flex-shrink-0" />
                <span className="text-foreground font-medium truncate">{file.name}</span>
                <span className="text-muted-foreground font-mono ml-auto flex-shrink-0">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Analysis Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {apiMode ? "Live API — real predictions via POST request" : "Mock mode — stable seeded random probabilities"}
                </p>
              </div>
              <button
                onClick={() => setApiMode(!apiMode)}
                className="flex items-center gap-2 text-sm font-medium transition-colors"
              >
                {apiMode ? (
                  <>
                    <ToggleRight className="h-6 w-6 text-teal" />
                    <span className="text-teal">API</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    <span className="text-muted-foreground">Mock</span>
                  </>
                )}
              </button>
            </div>

            {apiMode && (
              <ApiConfigPanel apiUrl={apiUrl} onApiUrlChange={setApiUrl} />
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
              Start Analysis
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          {/* Disclaimer */}
          <div className="w-full max-w-2xl mt-8 flex items-start gap-3 rounded-lg border border-amber-warn/30 bg-amber-warn/5 px-4 py-3 text-left">
            <ShieldAlert className="h-4 w-4 text-amber-warn flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-warn/90 leading-relaxed">
              <strong>Disclaimer:</strong> DeepPick is a research prototype and is{" "}
              <strong>not a certified medical device</strong>. Results must not be used for clinical
              diagnosis, treatment decisions, or patient management. For investigational use only.
            </p>
          </div>
        </main>
      </div>

      {/* Feature strips */}
      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { label: "Per-spectrum", sub: "probability scores" },
            { label: "Interactive", sub: "threshold slider" },
            { label: "Distribution", sub: "histogram & charts" },
            { label: "Sortable", sub: "detailed table" },
          ].map((f) => (
            <div key={f.label}>
              <p className="text-sm font-semibold text-teal">{f.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.sub}</p>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};
