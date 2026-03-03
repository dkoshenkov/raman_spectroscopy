import React from "react";
import { TrendingUp, Hash, AlertTriangle, Maximize2 } from "lucide-react";

interface KPICardsProps {
  total: number;
  tumorCount: number;
  meanP: number;
  maxP: number;
  threshold: number;
}

interface KPIItem {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}

export const KPICards: React.FC<KPICardsProps> = ({ total, tumorCount, meanP, maxP, threshold }) => {
  const tumorPct = total > 0 ? ((tumorCount / total) * 100).toFixed(1) : "0.0";

  const items: KPIItem[] = [
    {
      icon: Hash,
      label: "Total Spectra",
      value: total.toString(),
      sub: "samples analyzed",
    },
    {
      icon: AlertTriangle,
      label: "Tumor-like (cls=1)",
      value: tumorCount.toString(),
      sub: `${tumorPct}% of total · p > ${threshold.toFixed(2)}`,
      highlight: tumorCount > 0,
    },
    {
      icon: TrendingUp,
      label: "Mean Probability",
      value: meanP.toFixed(4),
      sub: "population average",
    },
    {
      icon: Maximize2,
      label: "Max Probability",
      value: maxP.toFixed(4),
      sub: "highest score in set",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={[
            "card-surface rounded-xl p-5 flex flex-col gap-3 transition-all duration-200",
            item.highlight ? "border-danger/30 shadow-[0_0_20px_-8px_hsl(0_70%_55%/0.3)]" : "",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {item.label}
            </span>
            <div
              className={[
                "flex h-8 w-8 items-center justify-center rounded-lg",
                item.highlight
                  ? "bg-danger/10 border border-danger/30"
                  : "bg-teal/10 border border-teal/20",
              ].join(" ")}
            >
              <item.icon
                className={`h-4 w-4 ${item.highlight ? "text-danger" : "text-teal"}`}
              />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-foreground tabular-nums">
              {item.value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

