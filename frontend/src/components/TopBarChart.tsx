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

interface TopBarChartProps {
  results: SpectrumResult[];
  threshold: number;
  topN?: number;
}

export const TopBarChart: React.FC<TopBarChartProps> = ({ results, threshold, topN = 20 }) => {
  const data = useMemo(() => {
    return [...results]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, topN)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label.replace("Spectrum ", "S"),
        probability: r.probability,
        cls: r.cls,
      }));
  }, [results, topN]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-card">
        <p className="text-muted-foreground">{d.label} · rank #{d.rank}</p>
        <p className="font-mono font-semibold text-foreground mt-0.5">p = {d.probability.toFixed(4)}</p>
        <p className={d.cls === 1 ? "text-danger mt-0.5" : "text-success mt-0.5"}>
          cls = {d.cls}
        </p>
      </div>
    );
  };

  return (
    <div className="card-surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top-{topN} Highest Probabilities</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by descending score</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis
            type="number"
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={36}
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.4)" }} />
          <ReferenceLine
            x={threshold}
            stroke="hsl(var(--amber-warn))"
            strokeDasharray="4 3"
            strokeWidth={2}
          />
          <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.cls === 1 ? "hsl(var(--red-neg))" : "hsl(var(--teal))"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

