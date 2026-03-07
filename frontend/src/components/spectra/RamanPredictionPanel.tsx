import React from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import type { RamanPrediction } from "@/lib/raman/api";

interface RamanPredictionPanelProps {
  prediction: RamanPrediction | null;
  loading: boolean;
  error: string | null;
}

const CLASS_COLORS: Record<string, string> = {
  control: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  exo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  endo: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export const RamanPredictionPanel: React.FC<RamanPredictionPanelProps> = ({ prediction, loading, error }) => {
  if (loading) {
    return (
      <div className="card-surface rounded-xl p-4">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Классифицируем спектр и считаем вклад областей...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-destructive">
          <TriangleAlert className="h-4 w-4" />
          ML-классификация недоступна
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!prediction) {
    return null;
  }

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Классификация спектра</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Результат модели для выбранного спектра и объяснение важных интервалов.
          </p>
        </div>
        <div
          className={[
            "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.14em]",
            CLASS_COLORS[prediction.predictedClass] ?? "border-border bg-background/40 text-foreground",
          ].join(" ")}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {prediction.predictedClass}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          {prediction.probabilities.map((item) => (
            <div key={item.label} className="rounded-lg border border-border/70 bg-background/30 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{item.label}</span>
                <span className="font-mono text-foreground">{(item.probability * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal to-sky-400"
                  style={{ width: `${(item.probability * 100).toFixed(2)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
            <div className="text-xs text-muted-foreground">Важных интервалов</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{prediction.importantRegions.length}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
            <div className="text-xs text-muted-foreground">Пиков</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{prediction.peaks.length}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
            <div className="text-xs text-muted-foreground">Главный интервал</div>
            <div className="mt-1 font-mono text-sm text-foreground">
              {prediction.importantRegions[0]
                ? `${prediction.importantRegions[0].startNu.toFixed(0)}-${prediction.importantRegions[0].endNu.toFixed(0)}`
                : "н/д"}
            </div>
          </div>
        </div>
      </div>

      {(prediction.importantRegions.length > 0 || prediction.peaks.length > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Важные интервалы</h4>
            <div className="mt-3 space-y-2">
              {prediction.importantRegions.slice(0, 4).map((region) => (
                <div key={`${region.startIdx}-${region.endIdx}`} className="rounded-md border border-border/60 px-3 py-2">
                  <div className="text-sm text-foreground">
                    {region.startNu.toFixed(0)}-{region.endNu.toFixed(0)} см⁻¹
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                    peak {region.peakNu.toFixed(1)} · score {region.scoreMax.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ключевые пики</h4>
            <div className="mt-3 space-y-2">
              {prediction.peaks.slice(0, 4).map((peak) => (
                <div key={`${peak.peakIdx}-${peak.peakNu}`} className="rounded-md border border-border/60 px-3 py-2">
                  <div className="text-sm text-foreground">{peak.peakNu.toFixed(1)} см⁻¹</div>
                  <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                    intensity {peak.intensity.toFixed(4)} · prominence {peak.prominence.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
