import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SpectrumResult } from "@/lib/mockGenerator";

interface ProbHistogramProps {
  results: SpectrumResult[];
  threshold: number;
  bins?: number;
}

export const ProbHistogram: React.FC<ProbHistogramProps> = ({ results, threshold, bins = 20 }) => {
  const data = useMemo(() => {
    const counts = Array(bins).fill(0);
    for (const r of results) {
      const idx = Math.min(bins - 1, Math.floor(r.probability * bins));
      counts[idx]++;
    }
    return counts.map((count, i) => ({
      bin: `${((i / bins) * 100).toFixed(0)}`,
      count,
      midpoint: (i + 0.5) / bins,
    }));
  }, [results, bins]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-card">
        <p className="text-muted-foreground">
          p ∈ [{(d.midpoint - 0.5 / bins).toFixed(2)}, {(d.midpoint + 0.5 / bins).toFixed(2)})
        </p>
        <p className="font-mono font-semibold text-foreground mt-0.5">{d.count} spectra</p>
      </div>
    );
  };

  return (
    <div className="card-surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Probability Distribution</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Histogram over all spectra · {bins} bins</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-success" />
            cls = 0
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-danger" />
            cls = 1
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="8%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis
            dataKey="bin"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
          <ReferenceLine
            x={`${Math.round(threshold * 100)}`}
            stroke="hsl(var(--amber-warn))"
            strokeDasharray="4 3"
            strokeWidth={2}
            label={{ value: `τ=${threshold.toFixed(2)}`, fill: "hsl(var(--amber-warn))", fontSize: 10, position: "insideTopRight" }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.midpoint > threshold
                    ? "hsl(var(--red-neg))"
                    : "hsl(var(--teal))"
                }
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

