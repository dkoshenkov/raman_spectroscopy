import React from "react";
import { Download, Eye, EyeOff, Layers3 } from "lucide-react";
import {
  DEFAULT_PREPROCESSING,
  getDefaultVisibleSpectralRegionIds,
  mergeSpectralRegions,
  PreprocessingOptions,
  serializeCoordinateSummaryToCsv,
  serializePlotRowsToCsv,
  SpectraDataset,
  SpectrumSeries,
  buildSpectrumPlotRows,
} from "@/lib/spectra";
import { CoordinateMap } from "@/components/spectra/CoordinateMap";
import { SpectrumChart } from "@/components/spectra/SpectrumChart";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { RamanMetadata } from "@/lib/raman/api";
import {
  formatBand,
  formatBrainRegion,
  formatParseStatus,
} from "@/lib/raman/labels";

interface SpectraExplorerProps {
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

function useSelectedSpectra(dataset: SpectraDataset) {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dataset.spectra.length) {
      setSelectedKey(null);
      return;
    }

    setSelectedKey((current) => current && dataset.coordinateKeys.includes(current) ? current : null);
  }, [dataset.coordinateKeys, dataset.spectra]);

  const spectraByKey = React.useMemo(
    () => new Map(dataset.spectra.map((spectrum) => [spectrum.key, spectrum])),
    [dataset.spectra],
  );

  const overlayKeys = React.useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);

  const orderedSelection = React.useMemo(() => {
    if (!selectedKey) {
      return [];
    }

    const selectedSpectrum = spectraByKey.get(selectedKey);
    return selectedSpectrum ? [selectedSpectrum] : [];
  }, [selectedKey, spectraByKey]);

  const toggleOverlayKey = React.useCallback((key: string, checked: boolean) => {
    setSelectedKey((current) => {
      if (!checked && current === key) {
        return null;
      }
      return checked ? key : current;
    });
  }, []);

  const selectOnly = React.useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  return {
    selectedKey,
    overlayKeys,
    orderedSelection,
    toggleOverlayKey,
    selectOnly,
  };
}

export const SpectraExplorer: React.FC<SpectraExplorerProps> = ({ dataset, fileName, metadata }) => {
  const { selectedKey, overlayKeys, orderedSelection, toggleOverlayKey, selectOnly } = useSelectedSpectra(dataset);
  const [search, setSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("processed");
  const [preprocessing, setPreprocessing] = React.useState<PreprocessingOptions>(DEFAULT_PREPROCESSING);
  const [showRegions, setShowRegions] = React.useState(true);
  const [showAggregate, setShowAggregate] = React.useState(true);
  const spectrumChartRef = React.useRef<HTMLDivElement | null>(null);
  const shouldScrollToChartRef = React.useRef(false);
  const regions = React.useMemo(() => mergeSpectralRegions(), []);
  const [visibleRegionIds, setVisibleRegionIds] = React.useState<string[]>(() => getDefaultVisibleSpectralRegionIds(regions));

  const filteredSpectra = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return dataset.spectra;
    }
    return dataset.spectra.filter((spectrum) => {
      const haystack = `${spectrum.label} ${spectrum.key} ${spectrum.x} ${spectrum.y}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [dataset.spectra, search]);

  const plotRows = React.useMemo(
    () => buildSpectrumPlotRows(orderedSelection, viewMode, preprocessing, showAggregate),
    [orderedSelection, preprocessing, showAggregate, viewMode],
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

  React.useEffect(() => {
    if (!shouldScrollToChartRef.current || !selectedKey) {
      return;
    }

    shouldScrollToChartRef.current = false;
    spectrumChartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedKey]);

  const selectedSpectrum = orderedSelection[0] ?? null;

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

  const handleMapSelect = React.useCallback((key: string) => {
    shouldScrollToChartRef.current = true;
    selectOnly(key);
  }, [selectOnly]);

  return (
    <div className="space-y-5">
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-5">

          <div className="card-surface rounded-xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Список координат</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ищите координаты и выбирайте одну строку для просмотра спектра.
                </p>
              </div>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по X/Y или ключу координаты"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/40"
            />

            <ScrollArea className="h-80 rounded-lg border border-border/70">
              <div className="divide-y divide-border/60">
                {filteredSpectra.map((spectrum) => {
                  const checked = overlayKeys.includes(spectrum.key);
                  const selected = selectedKey === spectrum.key;
                  return (
                    <div
                      key={spectrum.key}
                      className={[
                        "flex items-start gap-3 px-3 py-3 transition-colors",
                        selected ? "bg-teal/10" : "hover:bg-muted/20",
                      ].join(" ")}
                    >
                      <div
                        className="pt-0.5"
                      >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleOverlayKey(spectrum.key, value === true)}
                            aria-label={`Выбрать ${spectrum.label}`}
                          />
                        </div>
                      <button
                        type="button"
                        onClick={() => selectOnly(spectrum.key)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-foreground">{spectrum.label}</span>
                          {selected && <span className="badge-cls-0">активный</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{spectrum.pointCount} точек</span>
                          <span className="font-mono">{spectrum.waveMin.toFixed(1)}-{spectrum.waveMax.toFixed(1)} cm⁻¹</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="space-y-5">
          {dataset.spatialMapAvailable ? (
            <CoordinateMap
              spectra={dataset.spectra}
              selectedKey={selectedKey}
              onSelect={handleMapSelect}
            />
          ) : (
            <div className="card-surface rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground">Пространственная карта недоступна</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                В этой загрузке есть данные `Wave/Intensity`, но нет надёжных координат `X/Y`, поэтому доступен только просмотрщик спектров.
              </p>
            </div>
          )}

          <div className="card-surface rounded-xl p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-4">
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
                        `spectra_plot_${fileName.replace(/\.[^.]+$/, "")}_${viewMode}.csv`,
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
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Окно: {preprocessing.smoothingWindow} точек
                    </div>
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
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Окно: {preprocessing.baselineWindow} точек
                    </div>
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
                      <div>Приводит интенсивности к общей шкале, чтобы удобнее сравнивать форму спектров.</div>
                      <div>Метод: максимум абсолютной интенсивности</div>
                      <div>Исходные данные всегда остаются доступными.</div>
                    </div>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-background/30 px-3 py-2 text-xs">
                  <label className="inline-flex items-center gap-2 text-foreground">
                    <Switch checked={showRegions} onCheckedChange={setShowRegions} />
                    Подсвечивать спектральные области
                  </label>
                  <label className="inline-flex items-center gap-2 text-foreground">
                    <Switch checked={showAggregate} onCheckedChange={setShowAggregate} />
                    Среднее + min/max огибающая
                  </label>
                  <span className="text-muted-foreground">
                    {viewMode === "raw" ? "Показаны исходные измерения." : "Показан выбранный конвейер обработки."}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/20 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Спектральные области</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Определения областей приходят из конфигурации, поэтому позже можно добавить пользовательские или model-driven диапазоны.
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

          <div ref={spectrumChartRef} className="scroll-mt-24">
            <SpectrumChart
              rows={plotRows}
              selectedSpectra={orderedSelection}
              visibleRegions={visibleRegions}
              showRegions={showRegions}
              showAggregate={showAggregate}
              waveWindow={waveWindow}
              onWaveWindowChange={setWaveWindow}
            />
          </div>

          {selectedSpectrum && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="card-surface rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Сводка по выборке</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Выбранная координата и параметры ее спектра.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                    <Layers3 className="h-3.5 w-3.5" />
                    {orderedSelection.length} на графике
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">Активная координата</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{selectedSpectrum.label}</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">Точек</div>
                    <div className="mt-1 font-mono text-sm text-foreground">{selectedSpectrum.pointCount}</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">Диапазон волновых чисел</div>
                    <div className="mt-1 font-mono text-sm text-foreground">
                      {selectedSpectrum.waveMin.toFixed(1)}-{selectedSpectrum.waveMax.toFixed(1)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">Диапазон интенсивности</div>
                    <div className="mt-1 font-mono text-sm text-foreground">
                      {selectedSpectrum.intensityMin.toFixed(1)}-{selectedSpectrum.intensityMax.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-surface rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground">Примечания</h3>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <p>`Исходный спектр` всегда использует данные файла без изменений.</p>
                  <p>`Обработанный спектр` применяет опциональную коррекцию базовой линии, сглаживание и нормализацию в отдельном слое.</p>
                  <p>До выбора координаты график пустой, после выбора отображается только один спектр.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
