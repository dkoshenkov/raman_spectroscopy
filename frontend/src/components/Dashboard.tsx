import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  ArrowLeft,
  Download,
  ShieldAlert,
  FlaskConical,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { FileInfo, SpectrumResult } from "@/lib/mockGenerator";
import { generateMockResults, applyThreshold } from "@/lib/mockGenerator";
import { KPICards } from "./KPICards";
import { ProbHistogram } from "./ProbHistogram";
import { TopBarChart } from "./TopBarChart";
import { SpectraTable } from "./SpectraTable";

interface DashboardProps {
  fileInfo: FileInfo;
  file: File;
  apiMode: boolean;
  apiUrl: string;
  onBack: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  fileInfo,
  file,
  apiMode,
  apiUrl,
  onBack,
}) => {
  const [results, setResults] = useState<SpectrumResult[]>([]);
  const [threshold, setThreshold] = useState(0.5);
  const [shuffleSalt, setShuffleSalt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApiMode, setIsApiMode] = useState(apiMode);

  // Fetch or generate results
  const loadResults = useCallback(
    async (salt: number, useApi: boolean) => {
      setLoading(true);
      setError(null);
      try {
        if (useApi) {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(apiUrl, { method: "POST", body: form });
          if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
          const json = await res.json();
          const probs: number[] = json.probabilities ?? json.scores ?? Object.values(json);
          const mapped: SpectrumResult[] = probs.map((p, i) => ({
            id: `spectrum-${String(i + 1).padStart(4, "0")}`,
            label: `Spectrum ${i + 1}`,
            probability: Math.max(0, Math.min(1, p)),
            cls: p > threshold ? 1 : 0,
          }));
          setResults(mapped);
        } else {
          // Small artificial delay to show loading state
          await new Promise((r) => setTimeout(r, 350));
          const r = generateMockResults(fileInfo, salt, threshold);
          setResults(r);
        }
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
        // Fallback to mock on API failure
        const r = generateMockResults(fileInfo, salt, threshold);
        setResults(r);
      } finally {
        setLoading(false);
      }
    },
    [file, fileInfo, apiUrl, threshold]
  );

  useEffect(() => {
    loadResults(shuffleSalt, isApiMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute cls labels when threshold changes (without re-randomizing)
  const displayResults = useMemo(
    () => applyThreshold(results, threshold),
    [results, threshold]
  );

  const kpi = useMemo(() => {
    const n = displayResults.length;
    const tumorCount = displayResults.filter((r) => r.cls === 1).length;
    const meanP = n > 0 ? displayResults.reduce((s, r) => s + r.probability, 0) / n : 0;
    const maxP = n > 0 ? Math.max(...displayResults.map((r) => r.probability)) : 0;
    return { n, tumorCount, meanP, maxP };
  }, [displayResults]);

  const handleRegenerate = () => {
    const next = shuffleSalt + 1;
    setShuffleSalt(next);
    loadResults(next, isApiMode);
  };

  const handleModeToggle = () => {
    const next = !isApiMode;
    setIsApiMode(next);
    loadResults(shuffleSalt, next);
  };

  const handleExportCSV = () => {
    const header = "id,label,probability,cls\n";
    const rows = displayResults
      .map((r) => `${r.id},${r.label},${r.probability.toFixed(6)},${r.cls}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeppick_results_${fileInfo.name.replace(/\.[^.]+$/, "")}_t${threshold.toFixed(2)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-4 sm:px-6 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal/15 border border-teal/30">
              <Activity className="h-3.5 w-3.5 text-teal" />
            </div>
            <span className="font-semibold tracking-tight hidden sm:block">
              Deep<span className="text-teal">Pick</span>
            </span>
            <span className="text-border mx-1 hidden sm:block">/</span>
            <span className="text-sm text-muted-foreground truncate font-mono">{fileInfo.name}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <button
              onClick={handleModeToggle}
              className="flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 hover:border-teal/50 transition-colors"
            >
              {isApiMode ? (
                <><ToggleRight className="h-3.5 w-3.5 text-teal" /><span className="text-teal">API</span></>
              ) : (
                <><ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Mock</span></>
              )}
            </button>

            {!isApiMode && (
              <button
                onClick={handleRegenerate}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-teal/50 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            )}

            <button
              onClick={handleExportCSV}
              disabled={loading || displayResults.length === 0}
              className="flex items-center gap-1.5 text-xs rounded-md bg-teal/10 border border-teal/30 text-teal px-2.5 py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Threshold slider */}
        <div className="card-surface rounded-xl px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  Classification Threshold <span className="text-muted-foreground font-normal">(τ)</span>
                </label>
                <span className="font-mono font-bold text-teal text-lg tabular-nums">
                  {threshold.toFixed(2)}
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, hsl(var(--teal)) ${threshold * 100}%, hsl(var(--muted)) ${threshold * 100}%)`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1 font-mono">
                <span>0.00</span>
                <span>cls = 1 if p &gt; τ</span>
                <span>1.00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Loading / Error state */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="h-10 w-10 text-teal animate-spin" />
            <p className="text-muted-foreground text-sm">
              {isApiMode ? "Sending to API…" : "Generating mock results…"}
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-warn/30 bg-amber-warn/5 px-5 py-4 text-sm animate-fade-in">
                <ShieldAlert className="h-4 w-4 text-amber-warn flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-warn">API request failed — showing mock data</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="animate-fade-in">
              <KPICards
                total={kpi.n}
                tumorCount={kpi.tumorCount}
                meanP={kpi.meanP}
                maxP={kpi.maxP}
                threshold={threshold}
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
              <ProbHistogram results={displayResults} threshold={threshold} />
              <TopBarChart results={displayResults} threshold={threshold} topN={Math.min(20, displayResults.length)} />
            </div>

            {/* Table */}
            <div className="animate-fade-in">
              <SpectraTable results={displayResults} />
            </div>
          </>
        )}

        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-5 py-4">
          <FlaskConical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Research disclaimer:</strong> DeepPick is a prototype visualization tool and is{" "}
            <strong>not a certified medical device</strong>. Outputs must not be used for clinical diagnosis,
            treatment decisions, or patient management. For investigational and research purposes only.
          </p>
        </div>
      </main>
    </div>
  );
};

