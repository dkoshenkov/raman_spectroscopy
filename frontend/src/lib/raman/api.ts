import type { SpectraDataset, SpectrumSeries } from "@/lib/spectra";

export type RamanBand = "1500" | "2900" | "unknown";
export type RamanBrainRegion = "cortex" | "striatum" | "cerebellum" | "other" | "unknown";
export type RamanClassLabel = "control" | "endo" | "exo" | "unknown";
export type RamanSide = "left" | "right" | "unknown";

export interface RamanDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string | null;
}

export interface RamanMetadata {
  sourceFileName: string;
  parseStatus: "success" | "partial" | "failed";
  band: RamanBand;
  brainRegion: RamanBrainRegion;
  classLabel: RamanClassLabel;
  animalId: string | null;
  side: RamanSide;
  place: string | null;
  repetition: string | null;
  mapId: string | null;
  diagnostics: RamanDiagnostic[];
  suggestedQuestions: string[];
  userConfirmed: boolean;
  userOverrides: Record<string, string>;
}

export interface RamanPoint {
  pointKey: string;
  x: number;
  y: number;
  spectrumWave: number[];
  spectrumIntensity: number[];
  meanIntensity: number;
  areaUnderCurve: number;
  peakIntensity: number;
}

export interface RamanMap {
  spatialMapAvailable: boolean;
  dataMode: "map" | "single_spectrum";
  spectrumCount: number;
  totalRows: number;
  waveMin: number | null;
  waveMax: number | null;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  points: RamanPoint[];
}

export interface RamanUpload {
  uploadId: string;
  fileName: string;
  metadata: RamanMetadata;
  ramanMap: RamanMap | null;
}

export interface RamanMetadataConfirmPayload {
  band: RamanBand;
  brainRegion: RamanBrainRegion;
  classLabel: RamanClassLabel;
  animalId: string | null;
  side: RamanSide;
  place: string | null;
  repetition: string | null;
  mapId: string | null;
}

export interface RamanPredictionSeries {
  x: number[];
  y: number[];
  label: string;
}

export interface RamanPredictionProbability {
  label: string;
  probability: number;
}

export interface RamanPredictionPeak {
  peakIdx: number;
  peakNu: number;
  intensity: number;
  prominence: number;
}

export interface RamanPredictionRegion {
  startIdx: number;
  endIdx: number;
  startNu: number;
  endNu: number;
  peakIdx: number;
  peakNu: number;
  scoreSum: number;
  scoreMax: number;
}

export interface RamanPrediction {
  uploadId: string;
  pointKey: string;
  predictedClass: "control" | "endo" | "exo" | string;
  predictedClassId: number;
  probabilities: RamanPredictionProbability[];
  processedSpectrum: RamanPredictionSeries;
  attribution: RamanPredictionSeries | null;
  peaks: RamanPredictionPeak[];
  importantRegions: RamanPredictionRegion[];
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (payload.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function parseRamanFile(file: File): Promise<RamanUpload> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/raman/uploads/parse", {
    method: "POST",
    body: formData,
  });
  return readJson<RamanUpload>(response);
}

export async function confirmRamanUpload(
  uploadId: string,
  payload: RamanMetadataConfirmPayload,
): Promise<RamanUpload> {
  const response = await fetch(`/api/raman/uploads/${uploadId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<RamanUpload>(response);
}

export async function predictRamanSpectrum(uploadId: string, pointKey: string): Promise<RamanPrediction> {
  const response = await fetch(
    `/api/raman/uploads/${uploadId}/predict?${new URLSearchParams({ point_key: pointKey }).toString()}`,
  );
  return readJson<RamanPrediction>(response);
}

function toSpectrumSeries(point: RamanPoint, index: number): SpectrumSeries {
  const intensityMin = Math.min(...point.spectrumIntensity);
  const intensityMax = Math.max(...point.spectrumIntensity);
  const waveMin = Math.min(...point.spectrumWave);
  const waveMax = Math.max(...point.spectrumWave);
  return {
    key: point.pointKey,
    label: `Спектр ${index + 1}`,
    x: point.x,
    y: point.y,
    wave: point.spectrumWave,
    intensity: point.spectrumIntensity,
    pointCount: point.spectrumWave.length,
    waveMin,
    waveMax,
    intensityMin,
    intensityMax,
    meanIntensity: point.meanIntensity,
    areaUnderCurve: point.areaUnderCurve,
    peakIntensity: point.peakIntensity,
  };
}

export function toSpectraDataset(upload: RamanUpload): SpectraDataset {
  const points = upload.ramanMap?.points ?? [];
  const spectra = points.map((point, index) => toSpectrumSeries(point, index));
  return {
    spatialMapAvailable: upload.ramanMap?.spatialMapAvailable ?? false,
    spectra,
    coordinateKeys: spectra.map((item) => item.key),
  };
}
