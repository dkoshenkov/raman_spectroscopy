import React from "react";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SpectrumSeries } from "@/lib/spectra";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CoordinateMapProps {
  spectra: SpectrumSeries[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  chartHeightClassName?: string;
}

type ColorMetric = "meanIntensity" | "areaUnderCurve" | "peakIntensity";
const CHART_MARGIN = { top: 0, right: 16, bottom: 12, left: 0 };
const X_AXIS_HEIGHT = 52;
const Y_AXIS_WIDTH = 96;
const CELL_GAP_PX = 2;

function getMinStep(values: number[]) {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.length < 2) {
    return 1;
  }

  let minStep = Number.POSITIVE_INFINITY;
  for (let index = 1; index < unique.length; index += 1) {
    const diff = unique[index] - unique[index - 1];
    if (diff > 0 && diff < minStep) {
      minStep = diff;
    }
  }

  return Number.isFinite(minStep) ? minStep : 1;
}

export const CoordinateMap: React.FC<CoordinateMapProps> = ({
  spectra,
  selectedKey,
  onSelect,
  chartHeightClassName = "h-[28rem]",
}) => {
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = React.useState({ width: 0, height: 0 });
  const [metric, setMetric] = React.useState<ColorMetric>("meanIntensity");
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const xStep = React.useMemo(() => getMinStep(spectra.map((item) => item.x)), [spectra]);
  const yStep = React.useMemo(() => getMinStep(spectra.map((item) => item.y)), [spectra]);
  const fullXDomain = React.useMemo<[number, number]>(() => {
    if (spectra.length === 0) {
      return [0, 1];
    }
    return [
      Math.min(...spectra.map((item) => item.x)) - xStep / 2,
      Math.max(...spectra.map((item) => item.x)) + xStep / 2,
    ];
  }, [spectra, xStep]);
  const fullYDomain = React.useMemo<[number, number]>(() => {
    if (spectra.length === 0) {
      return [0, 1];
    }
    return [
      Math.min(...spectra.map((item) => item.y)) - yStep / 2,
      Math.max(...spectra.map((item) => item.y)) + yStep / 2,
    ];
  }, [spectra, yStep]);
  const xDomain = fullXDomain;
  const yDomain = fullYDomain;

  React.useEffect(() => {
    const node = chartRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setChartSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const colorDomain = React.useMemo<[number, number]>(() => {
    const values = spectra
      .map((item) => item[metric] ?? 0)
      .filter((value): value is number => Number.isFinite(value));
    if (values.length === 0) {
      return [0, 1];
    }
    return [Math.min(...values), Math.max(...values)];
  }, [metric, spectra]);
  const data = React.useMemo(
    () =>
      spectra.map((spectrum) => ({
        key: spectrum.key,
        x: spectrum.x,
        y: spectrum.y,
        label: spectrum.label,
        points: spectrum.pointCount,
        meanIntensity: spectrum.meanIntensity ?? 0,
        areaUnderCurve: spectrum.areaUnderCurve ?? 0,
        peakIntensity: spectrum.peakIntensity ?? 0,
        selected: spectrum.key === selectedKey,
        hovered: spectrum.key === hoveredKey,
      })),
    [hoveredKey, selectedKey, spectra],
  );

  const metricLabel =
    metric === "meanIntensity" ? "Средняя интенсивность" : metric === "areaUnderCurve" ? "Площадь под кривой" : "Пиковая интенсивность";

  const colorForValue = (value: number) => {
    const [minValue, maxValue] = colorDomain;
    if (maxValue <= minValue) {
      return "hsl(var(--muted-foreground))";
    }
    const normalized = (value - minValue) / (maxValue - minValue);
    const hue = 185 - normalized * 145;
    return `hsl(${hue} 78% 52%)`;
  };

  const legendScaleColors = React.useMemo(
    () => {
      const [minValue, maxValue] = colorDomain;
      const span = maxValue - minValue;
      return Array.from({ length: 6 }, (_, index) => {
        const ratio = 5 === 0 ? 0 : index / 5;
        const value = span <= 0 ? minValue : minValue + span * ratio;
        return colorForValue(value);
      });
    },
    [colorDomain],
  );

  const cellPixelSize = React.useMemo(() => {
    const plotWidth = Math.max(1, chartSize.width - Y_AXIS_WIDTH - CHART_MARGIN.right);
    const plotHeight = Math.max(1, chartSize.height - X_AXIS_HEIGHT - CHART_MARGIN.bottom);
    const xSpan = Math.max(xDomain[1] - xDomain[0], xStep);
    const ySpan = Math.max(yDomain[1] - yDomain[0], yStep);
    const widthPerCell = (plotWidth * xStep) / xSpan;
    const heightPerCell = (plotHeight * yStep) / ySpan;

    return {
      width: Math.max(6, Math.ceil(widthPerCell)),
      height: Math.max(6, Math.ceil(heightPerCell)),
    };
  }, [chartSize.height, chartSize.width, xDomain, xStep, yDomain, yStep]);

  const cellGap = React.useMemo(
    () => ({
      x: Math.max(CELL_GAP_PX, Math.min(10, Math.round(cellPixelSize.width * 0.08))),
      y: Math.max(CELL_GAP_PX, Math.min(10, Math.round(cellPixelSize.height * 0.08))),
    }),
    [cellPixelSize],
  );

  const renderSquareCell = React.useCallback((props: {
    cx?: number;
    cy?: number;
    fill?: string;
    payload?: { selected?: boolean; hovered?: boolean };
  }) => {
    const { cx, cy, fill, payload } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return null;
    }

    const width = Math.max(4, cellPixelSize.width - cellGap.x);
    const height = Math.max(4, cellPixelSize.height - cellGap.y);
    const x = Math.round((cx ?? 0) - width / 2);
    const y = Math.round((cy ?? 0) - height / 2);
    const selected = payload?.selected === true;
    const hovered = payload?.hovered === true;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          shapeRendering="crispEdges"
        />
        {hovered && !selected && (
          <rect
            x={x - 0.5}
            y={y - 0.5}
            width={width + 1}
            height={height + 1}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        )}
        {selected && (
          <>
            <rect
              x={x - 1}
              y={y - 1}
              width={width + 2}
              height={height + 2}
              fill="none"
              stroke="rgba(45,212,191,0.95)"
              strokeWidth={2}
              shapeRendering="crispEdges"
            />
            <rect
              x={x + 1}
              y={y + 1}
              width={Math.max(1, width - 2)}
              height={Math.max(1, height - 2)}
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          </>
        )}
      </g>
    );
  }, [cellGap, cellPixelSize]);

  return (
    <div className="card-surface rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Карта координат</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Нажмите на квадрат, чтобы выбрать спектр, измеренный в этой координате X/Y.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={metric} onValueChange={(value) => setMetric(value as ColorMetric)}>
            <SelectTrigger className="h-9 w-[15rem] border-border text-xs text-foreground transition-colors hover:border-teal/60 hover:bg-teal/80 hover:text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meanIntensity">Средняя интенсивность</SelectItem>
              <SelectItem value="areaUnderCurve">Площадь под кривой</SelectItem>
              <SelectItem value="peakIntensity">Пиковая интенсивность</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 border border-white bg-teal" />
          Выбран
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span>{metricLabel}</span>
          <span className="text-white/55">меньше</span>
          <div className="flex items-center gap-1">
            {legendScaleColors.map((color, index) => (
              <span
                key={`${color}-${index}`}
                className="h-2.5 w-2.5"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-white/55">больше</span>
        </div>
      </div>

      <div ref={chartRef} className={`${chartHeightClassName} w-full`}>
        <ResponsiveContainer>
          <ScatterChart margin={CHART_MARGIN}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              name="X"
              unit=""
              height={X_AXIS_HEIGHT}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              label={{ value: "Координата X", position: "insideBottom", offset: -4, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={yDomain}
              name="Y"
              width={Y_AXIS_WIDTH}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              label={{ value: "Координата Y", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              cursor={{ stroke: "transparent", fill: "transparent" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !point) {
                  return null;
                }

                return (
                  <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-2xl">
                    <div className="font-medium text-white">{point.label}</div>
                    <div className="mt-1 text-white/80">
                      X={point.x.toFixed(3)}, Y={point.y.toFixed(3)}
                    </div>
                    <div className="mt-1 text-white">
                      {metricLabel}: {point[metric].toFixed(3)}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              data={data}
              shape={renderSquareCell}
              activeShape={renderSquareCell}
              legendType="square"
              isAnimationActive={false}
              onMouseEnter={(point) => setHoveredKey((point?.key as string | undefined) ?? null)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={(point) => point?.key && onSelect(point.key as string)}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={colorForValue(entry[metric])}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
