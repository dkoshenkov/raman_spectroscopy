export interface SpectrumSeries {
  key: string;
  label: string;
  x: number;
  y: number;
  wave: number[];
  intensity: number[];
  pointCount: number;
  waveMin: number;
  waveMax: number;
  intensityMin: number;
  intensityMax: number;
  meanIntensity?: number;
  areaUnderCurve?: number;
  peakIntensity?: number;
}

export interface SpectraDataset {
  spatialMapAvailable: boolean;
  spectra: SpectrumSeries[];
  coordinateKeys: string[];
}

export interface PreprocessingOptions {
  smoothingEnabled: boolean;
  smoothingWindow: number;
  baselineCorrectionEnabled: boolean;
  baselineWindow: number;
  normalizationEnabled: boolean;
}

export interface SpectralRegion {
  id: string;
  name: string;
  waveMin: number;
  waveMax: number;
  description: string;
  color: string;
}

export interface SpectrumPlotRow {
  wave: number;
  values: Record<string, number>;
}

export const DEFAULT_PREPROCESSING: PreprocessingOptions = {
  smoothingEnabled: true,
  smoothingWindow: 5,
  baselineCorrectionEnabled: true,
  baselineWindow: 31,
  normalizationEnabled: true,
};

const DEFAULT_SPECTRAL_REGIONS: SpectralRegion[] = [
  {
    id: "fingerprint",
    name: "Fingerprint zone",
    waveMin: 950,
    waveMax: 1800,
    description: "Область, где часто лежат различающие пики для диапазона 1500 см⁻¹.",
    color: "rgba(45, 212, 191, 0.12)",
  },
  {
    id: "lipid",
    name: "Lipid / CH",
    waveMin: 2800,
    waveMax: 3050,
    description: "Типичная область CH-колебаний для диапазона 2900 см⁻¹.",
    color: "rgba(249, 115, 22, 0.12)",
  },
  {
    id: "amide",
    name: "Amide / protein",
    waveMin: 1200,
    waveMax: 1700,
    description: "Белковые и амидные полосы, часто интересны при сравнении классов.",
    color: "rgba(56, 189, 248, 0.12)",
  },
];

function movingAverage(values: number[], window: number) {
  const radius = Math.max(1, Math.floor(window / 2));
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    const slice = values.slice(start, end);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function estimateBaseline(values: number[], window: number) {
  return movingAverage(values, window);
}

function preprocessIntensity(values: number[], options: PreprocessingOptions) {
  let next = [...values];
  if (options.baselineCorrectionEnabled) {
    const baseline = estimateBaseline(next, options.baselineWindow);
    next = next.map((value, index) => value - baseline[index]);
  }
  if (options.smoothingEnabled) {
    next = movingAverage(next, options.smoothingWindow);
  }
  if (options.normalizationEnabled) {
    const scale = Math.max(...next.map((value) => Math.abs(value)), 1e-8);
    next = next.map((value) => value / scale);
  }
  return next;
}

function interpolateSeries(wave: number[], intensity: number[], targetWave: number[]) {
  if (wave.length === targetWave.length && wave.every((value, index) => value === targetWave[index])) {
    return intensity;
  }

  let sourceIndex = 0;
  return targetWave.map((target) => {
    while (sourceIndex < wave.length - 2 && wave[sourceIndex + 1] < target) {
      sourceIndex += 1;
    }
    const leftWave = wave[sourceIndex];
    const rightWave = wave[Math.min(sourceIndex + 1, wave.length - 1)];
    const leftIntensity = intensity[sourceIndex];
    const rightIntensity = intensity[Math.min(sourceIndex + 1, intensity.length - 1)];
    if (rightWave === leftWave) {
      return leftIntensity;
    }
    const ratio = (target - leftWave) / (rightWave - leftWave);
    return leftIntensity + (rightIntensity - leftIntensity) * ratio;
  });
}

export function mergeSpectralRegions() {
  return DEFAULT_SPECTRAL_REGIONS;
}

export function getDefaultVisibleSpectralRegionIds(regions: SpectralRegion[]) {
  return regions.map((region) => region.id);
}

export function aggregateSeriesKeys() {
  return {
    mean: "__aggregate_mean__",
    min: "__aggregate_min__",
    max: "__aggregate_max__",
  };
}

export function buildSpectrumPlotRows(
  spectra: SpectrumSeries[],
  viewMode: "raw" | "processed",
  preprocessing: PreprocessingOptions,
  showAggregate: boolean,
): SpectrumPlotRow[] {
  if (!spectra.length) {
    return [];
  }

  const referenceWave = [...spectra[0].wave].sort((a, b) => a - b);
  const prepared = spectra.map((spectrum) => {
    const intensities =
      viewMode === "processed" ? preprocessIntensity(spectrum.intensity, preprocessing) : [...spectrum.intensity];
    return {
      key: spectrum.key,
      values: interpolateSeries(spectrum.wave, intensities, referenceWave),
    };
  });

  const aggregateKeys = aggregateSeriesKeys();
  return referenceWave.map((wave, rowIndex) => {
    const values: Record<string, number> = {};
    for (const spectrum of prepared) {
      values[spectrum.key] = spectrum.values[rowIndex];
    }
    if (showAggregate && prepared.length > 1) {
      const rowValues = prepared.map((item) => item.values[rowIndex]);
      values[aggregateKeys.mean] = rowValues.reduce((sum, value) => sum + value, 0) / rowValues.length;
      values[aggregateKeys.min] = Math.min(...rowValues);
      values[aggregateKeys.max] = Math.max(...rowValues);
    }
    return { wave, values };
  });
}

export function slicePlotRowsByWaveWindow(rows: SpectrumPlotRow[], waveWindow: [number, number]) {
  return rows.filter((row) => row.wave >= waveWindow[0] && row.wave <= waveWindow[1]);
}

export function serializePlotRowsToCsv(rows: SpectrumPlotRow[]) {
  if (!rows.length) {
    return "wave\n";
  }
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row.values))));
  const header = ["wave", ...keys].join(",");
  const body = rows.map((row) =>
    [row.wave.toString(), ...keys.map((key) => (row.values[key] ?? "").toString())].join(","),
  );
  return [header, ...body].join("\n");
}

export function serializeCoordinateSummaryToCsv(spectra: SpectrumSeries[]) {
  const header = ["key", "label", "x", "y", "pointCount", "meanIntensity", "areaUnderCurve", "peakIntensity"].join(",");
  const body = spectra.map((spectrum) =>
    [
      spectrum.key,
      spectrum.label,
      spectrum.x,
      spectrum.y,
      spectrum.pointCount,
      spectrum.meanIntensity ?? "",
      spectrum.areaUnderCurve ?? "",
      spectrum.peakIntensity ?? "",
    ].join(","),
  );
  return [header, ...body].join("\n");
}
