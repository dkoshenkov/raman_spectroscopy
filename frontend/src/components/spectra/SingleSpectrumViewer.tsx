import React from "react";
import { Download, Eye, EyeOff, MapPin } from "lucide-react";
import {
  DEFAULT_PREPROCESSING,
  getDefaultVisibleSpectralRegionIds,
  mergeSpectralRegions,
  PreprocessingOptions,
  serializePlotRowsToCsv,
  SpectraDataset,
  buildSpectrumPlotRows,
} from "@/lib/spectra";
import { SpectrumChart } from "@/components/spectra/SpectrumChart";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { RamanMetadata } from "@/lib/raman/api";
import {
  formatBand,
  formatBrainRegion,
  formatParseStatus,
} from "@/lib/raman/labels";

interface SingleSpectrumViewerProps {
  dataset: SpectraDataset;
  fileName: string;
  metadata?: RamanMetadata;
}

type ViewMode = "raw" | "processed";

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export const SingleSpectrumViewer: React.FC<SingleSpectrumViewerProps> = ({ dataset, fileName, metadata }) => {
  const spectrum = dataset.spectra[0] ?? null;
  const [viewMode, setViewMode] = React.useState<ViewMode>("processed");
  const [preprocessing, setPreprocessing] = React.useState<PreprocessingOptions>(DEFAULT_PREPROCESSING);
  const [showRegions, setShowRegions] = React.useState(true);
  const regions = React.useMemo(() => mergeSpectralRegions(), []);
  const [visibleRegionIds, setVisibleRegionIds] = React.useState<string[]>(() => getDefaultVisibleSpectralRegionIds(regions));

  const plotRows = React.useMemo(
    () => (spectrum ? buildSpectrumPlotRows([spectrum], viewMode, preprocessing, false) : []),
    [preprocessing, spectrum, viewMode],
  );
  const visibleRegions = React.useMemo(
    () => regions.filter((region) => visibleRegionIds.includes(region.id)),
    [regions, visibleRegionIds],
  );

  const [waveWindow, setWaveWindow] = React.useState<[number, number]>([0, 1]);

  React.useEffect(() => {
    if (!plotRows.length) {
      setWaveWindow([0, 1]);
      return;
    }
    setWaveWindow([plotRows[0].wave, plotRows[plotRows.length - 1].wave]);
  }, [plotRows]);

  const toggleRegion = React.useCallback((regionId: string, checked: boolean) => {
    setVisibleRegionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(regionId);
      } else {
        next.delete(regionId);
      }
      return Array.from(next);
    });
  }, []);

  if (!spectrum) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
        <p className="text-sm font-medium text-destructive">Одиночный спектр недоступен</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Нормализованные данные для просмотра одного спектра отсутствуют.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="single-spectrum-viewer">
      {metadata && (
        <div className="card-surface rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Файл: <span className="text-foreground">{fileName}</span>
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Диапазон: <span className="text-foreground">{formatBand(metadata.band)}</span>
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Область мозга: <span className="text-foreground">{formatBrainRegion(metadata.brainRegion)}</span>
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Статус разбора: <span className="text-foreground">{formatParseStatus(metadata.parseStatus)}</span>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <div className="card-surface rounded-xl p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Одиночный спектр</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Режим для файлов с одним логическим спектром. Доступны исходное представление, обработка и экспорт.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("raw")}
                  className={[
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "raw"
                      ? "border-teal/40 bg-teal/10 text-teal"
                      : "border-border text-muted-foreground hover:border-teal/50 hover:text-foreground",
                  ].join(" ")}
                >
                  Исходный спектр
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("processed")}
                  className={[
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "processed"
                      ? "border-teal/40 bg-teal/10 text-teal"
                      : "border-border text-muted-foreground hover:border-teal/50 hover:text-foreground",
                  ].join(" ")}
                >
                  Обработанный спектр
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `single_spectrum_${fileName.replace(/\.[^.]+$/, "")}_${viewMode}.csv`,
                      serializePlotRowsToCsv(plotRows),
                    )
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-teal/50 hover:text-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Экспорт данных графика
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
              <label className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background/30 p-3 text-sm">
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <span className="min-w-0 text-foreground leading-tight">Сглаживание</span>
                  <Switch
                    checked={preprocessing.smoothingEnabled}
                    onCheckedChange={(checked) =>
                      setPreprocessing((current) => ({ ...current, smoothingEnabled: checked }))
                    }
                  />
                </span>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Убирает мелкий шум. По умолчанию окно минимальное, чтобы не сглаживать пики сильнее нужного.
                </p>
                <input
                  type="range"
                  min={3}
                  max={21}
                  step={2}
                  value={preprocessing.smoothingWindow}
                  onChange={(event) =>
                    setPreprocessing((current) => ({
                      ...current,
                      smoothingWindow: Number.parseInt(event.target.value, 10),
                    }))
                  }
                  className="mt-3 w-full"
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Окно: {preprocessing.smoothingWindow} точек</div>
              </label>

              <label className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background/30 p-3 text-sm">
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <span className="min-w-0 text-foreground leading-tight">Базовая линия</span>
                  <Switch
                    checked={preprocessing.baselineCorrectionEnabled}
                    onCheckedChange={(checked) =>
                      setPreprocessing((current) => ({ ...current, baselineCorrectionEnabled: checked }))
                    }
                  />
                </span>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Убирает фоновый наклон спектра. По умолчанию окно максимально широкое для более агрессивной коррекции.
                </p>
                <input
                  type="range"
                  min={11}
                  max={81}
                  step={2}
                  value={preprocessing.baselineWindow}
                  onChange={(event) =>
                    setPreprocessing((current) => ({
                      ...current,
                      baselineWindow: Number.parseInt(event.target.value, 10),
                    }))
                  }
                  className="mt-3 w-full"
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Окно: {preprocessing.baselineWindow} точек</div>
              </label>

              <label className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-background/30 p-3 text-sm">
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <span className="min-w-0 text-foreground leading-tight">Нормализация</span>
                  <Switch
                    checked={preprocessing.normalizationEnabled}
                    onCheckedChange={(checked) =>
                      setPreprocessing((current) => ({ ...current, normalizationEnabled: checked }))
                    }
                  />
                </span>
                <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                  <div>Приводит интенсивности к общей шкале, чтобы удобнее сравнивать форму спектра.</div>
                  <div>Метод: максимум абсолютной интенсивности</div>
                  <div>Исходные точки всегда доступны без модификации файла.</div>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-background/30 px-3 py-2 text-xs">
              <label className="inline-flex items-center gap-2 text-foreground">
                <Switch checked={showRegions} onCheckedChange={setShowRegions} />
                Подсвечивать спектральные области
              </label>
              <span className="text-muted-foreground">
                {viewMode === "raw" ? "Показаны исходные измерения." : "Показан выбранный конвейер обработки."}
              </span>
            </div>
          </div>

          <SpectrumChart
            rows={plotRows}
            selectedSpectra={[spectrum]}
            visibleRegions={visibleRegions}
            showRegions={showRegions}
            showAggregate={false}
            waveWindow={waveWindow}
            onWaveWindowChange={setWaveWindow}
          />

          <div className="card-surface rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Сводка по спектру</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ключевые параметры загруженного спектра и координаты, если они были в исходном файле.
                </p>
              </div>
              {dataset.spatialMapAvailable && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Координаты доступны
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Точек</div>
                <div className="mt-1 font-mono text-sm text-foreground">{spectrum.pointCount}</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Диапазон волновых чисел</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {spectrum.waveMin.toFixed(1)}-{spectrum.waveMax.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Диапазон интенсивности</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {spectrum.intensityMin.toFixed(1)}-{spectrum.intensityMax.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <div className="text-xs text-muted-foreground">Пиковая интенсивность</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {(spectrum.peakIntensity ?? spectrum.intensityMax).toFixed(1)}
                </div>
              </div>
              {dataset.spatialMapAvailable && (
                <div className="rounded-lg border border-border/70 bg-background/30 p-3 md:col-span-2 xl:col-span-4">
                  <div className="text-xs text-muted-foreground">Координаты спектра</div>
                  <div className="mt-1 font-mono text-sm text-foreground">
                    X={spectrum.x.toFixed(3)}, Y={spectrum.y.toFixed(3)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card-surface rounded-xl p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Спектральные области</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Области можно скрывать по отдельности, не меняя исходные данные спектра.
              </p>
            </div>
            {showRegions ? (
              <Eye className="h-4 w-4 text-teal" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-3">
            {regions.map((region) => {
              const checked = visibleRegionIds.includes(region.id);
              return (
                <div key={region.id} className="rounded-lg border border-border/70 bg-background/30 p-3">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleRegion(region.id, value === true)}
                      aria-label={`Переключить область ${region.name}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: region.color }}
                        />
                        <span className="text-sm font-medium text-foreground">{region.name}</span>
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                        {region.waveMin.toFixed(0)}-{region.waveMax.toFixed(0)} cm⁻¹
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{region.description}</p>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
