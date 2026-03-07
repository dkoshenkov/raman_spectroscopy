import React from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  aggregateSeriesKeys,
  slicePlotRowsByWaveWindow,
  SpectralRegion,
  SpectrumPlotRow,
  SpectrumSeries,
} from "@/lib/spectra";

interface SpectrumChartProps {
  rows: SpectrumPlotRow[];
  selectedSpectra: SpectrumSeries[];
  visibleRegions: SpectralRegion[];
  showRegions: boolean;
  showAggregate: boolean;
  waveWindow: [number, number];
  onWaveWindowChange: (next: [number, number]) => void;
}

const SPECTRUM_COLORS = [
  "hsl(var(--teal))",
  "#5eead4",
  "#38bdf8",
  "#f59e0b",
  "#f97316",
  "#22c55e",
];

function clampWindow(
  center: number,
  span: number,
  domain: [number, number],
): [number, number] {
  const safeSpan = Math.max(span, (domain[1] - domain[0]) * 0.02);
  let start = center - safeSpan / 2;
  let end = center + safeSpan / 2;

  if (start < domain[0]) {
    end += domain[0] - start;
    start = domain[0];
  }
  if (end > domain[1]) {
    start -= end - domain[1];
    end = domain[1];
  }

  return [Math.max(domain[0], start), Math.min(domain[1], end)];
}

function isFullWindow(window: [number, number], domain: [number, number]): boolean {
  const epsilon = Math.max(1e-9, (domain[1] - domain[0]) * 1e-6);
  return Math.abs(window[0] - domain[0]) <= epsilon && Math.abs(window[1] - domain[1]) <= epsilon;
}

export const SpectrumChart: React.FC<SpectrumChartProps> = ({
  rows,
  selectedSpectra,
  visibleRegions,
  showRegions,
  showAggregate,
  waveWindow,
  onWaveWindowChange,
}) => {
  const fullDomain = React.useMemo<[number, number]>(() => {
    if (rows.length === 0) {
      return [0, 1];
    }
    return [rows[0].wave, rows[rows.length - 1].wave];
  }, [rows]);

  const brushIndexes = React.useMemo(() => {
    const startIndex = rows.findIndex((row) => row.wave >= waveWindow[0]);
    const endIndex = [...rows].reverse().findIndex((row) => row.wave <= waveWindow[1]);
    return {
      startIndex: Math.max(0, startIndex),
      endIndex: endIndex === -1 ? rows.length - 1 : Math.max(0, rows.length - 1 - endIndex),
    };
  }, [rows, waveWindow]);

  const visibleRows = React.useMemo(() => slicePlotRowsByWaveWindow(rows, waveWindow), [rows, waveWindow]);
  const aggregateKeys = React.useMemo(() => aggregateSeriesKeys(), []);
  const brushPreviewKey =
    showAggregate && selectedSpectra.length > 1 ? aggregateKeys.mean : (selectedSpectra[0]?.key ?? null);

  const span = waveWindow[1] - waveWindow[0];
  const center = waveWindow[0] + span / 2;
  const panBy = span * 0.2;
  const fullSpan = fullDomain[1] - fullDomain[0];

  const zoom = (factor: number) => {
    onWaveWindowChange(clampWindow(center, span * factor, fullDomain));
  };

  const pan = (direction: -1 | 1) => {
    if (fullSpan <= 0) {
      return;
    }

    if (isFullWindow(waveWindow, fullDomain)) {
      const overviewSpan = Math.max(fullSpan * 0.65, fullSpan * 0.02);
      if (direction < 0) {
        onWaveWindowChange([fullDomain[0], Math.min(fullDomain[1], fullDomain[0] + overviewSpan)]);
      } else {
        onWaveWindowChange([Math.max(fullDomain[0], fullDomain[1] - overviewSpan), fullDomain[1]]);
      }
      return;
    }

    onWaveWindowChange(clampWindow(center + direction * panBy, span, fullDomain));
  };

  const reset = () => {
    onWaveWindowChange(fullDomain);
  };

  if (rows.length === 0) {
    return (
      <div className="card-surface rounded-xl p-6">
        <p className="text-sm text-muted-foreground">Для построения графика не выбраны спектры.</p>
      </div>
    );
  }

  return (
    <div className="card-surface rounded-xl p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Интерактивный просмотрщик спектров</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            По оси X отложен Raman shift (см⁻¹), по оси Y интенсивность. Если показан весь диапазон, сдвиг
            влево/вправо сначала сужает окно и переносит фокус.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => zoom(0.6)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ZoomIn className="h-3.5 w-3.5" />
              Приблизить
            </span>
          </button>
          <button
            type="button"
            onClick={() => zoom(1.6)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ZoomOut className="h-3.5 w-3.5" />
              Отдалить
            </span>
          </button>
          <button
            type="button"
            onClick={() => pan(-1)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ChevronLeft className="h-3.5 w-3.5" />
              Сдвиг влево
            </span>
          </button>
          <button
            type="button"
            onClick={() => pan(1)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              Сдвиг вправо
            </span>
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Сброс
            </span>
          </button>
        </div>
      </div>

      <div className="h-[28rem] w-full">
        <ResponsiveContainer>
          <LineChart data={visibleRows} margin={{ top: 12, right: 20, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            {showRegions &&
              visibleRegions.map((region) => (
                <ReferenceArea
                  key={region.id}
                  x1={region.waveMin}
                  x2={region.waveMax}
                  fill={region.color}
                  ifOverflow="extendDomain"
                  strokeOpacity={0}
                />
              ))}
            <XAxis
              dataKey="wave"
              type="number"
              domain={waveWindow}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => value.toFixed(0)}
              label={{ value: "Raman shift (см⁻¹)", position: "insideBottom", offset: -10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => value.toFixed(2)}
              width={78}
              label={{ value: "Интенсивность (a.u.)", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: 12,
              }}
              labelFormatter={(value) => `Волновое число: ${Number(value).toFixed(3)} см⁻¹`}
              formatter={(value, name) => [Number(value).toFixed(6), name]}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: "12px" }} />
            {showAggregate && selectedSpectra.length > 1 && (
              <>
                <Line
                  type="monotone"
                  name="Среднее"
                  dataKey={(row: SpectrumPlotRow) => row.values[aggregateKeys.mean]}
                  stroke="#f8fafc"
                  strokeWidth={2.4}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  name="Мин. огибающая"
                  dataKey={(row: SpectrumPlotRow) => row.values[aggregateKeys.min]}
                  stroke="rgba(248, 250, 252, 0.45)"
                  strokeWidth={1.4}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  name="Макс. огибающая"
                  dataKey={(row: SpectrumPlotRow) => row.values[aggregateKeys.max]}
                  stroke="rgba(248, 250, 252, 0.45)"
                  strokeWidth={1.4}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            )}
            {selectedSpectra.map((spectrum, index) => (
              <Line
                key={spectrum.key}
                type="monotone"
                name={spectrum.label}
                dataKey={(row: SpectrumPlotRow) => row.values[spectrum.key]}
                stroke={SPECTRUM_COLORS[index % SPECTRUM_COLORS.length]}
                strokeWidth={index === 0 ? 2.4 : 1.8}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {rows.length > 1 && (
        <div className="mt-3 rounded-xl border border-border/70 bg-background/30 p-4">
          <div className="mb-3 flex flex-col gap-1">
            <h4 className="text-sm font-medium text-foreground">Окно обзора</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Нижняя полоса управляет диапазоном основного графика. Перетаскивайте края, чтобы менять масштаб,
              или двигайте выделенную область целиком, чтобы смещаться по спектру.
            </p>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-1">
              Текущий диапазон: {waveWindow[0].toFixed(1)}-{waveWindow[1].toFixed(1)} см⁻¹
            </span>
            <span className="rounded-full border border-border px-2 py-1">
              Полный диапазон: {fullDomain[0].toFixed(1)}-{fullDomain[1].toFixed(1)} см⁻¹
            </span>
          </div>
          <div className="h-20 w-full">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                {brushPreviewKey && (
                  <Line
                    type="monotone"
                    dataKey={(row: SpectrumPlotRow) => row.values[brushPreviewKey]}
                    stroke="rgba(45, 212, 191, 0.9)"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                <Brush
                  dataKey="wave"
                  height={36}
                  travellerWidth={8}
                  fill="rgba(148, 163, 184, 0.16)"
                  stroke="hsl(var(--teal))"
                  startIndex={brushIndexes.startIndex}
                  endIndex={brushIndexes.endIndex}
                  onChange={(range) => {
                    if (range?.startIndex === undefined || range?.endIndex === undefined) {
                      return;
                    }
                    onWaveWindowChange([rows[range.startIndex].wave, rows[range.endIndex].wave]);
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
