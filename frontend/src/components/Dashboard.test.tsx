import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Dashboard } from "@/components/Dashboard";
import type { RamanUpload } from "@/lib/raman/api";

const { parseRamanFile, confirmRamanUpload } = vi.hoisted(() => ({
  parseRamanFile: vi.fn(),
  confirmRamanUpload: vi.fn(),
}));

vi.mock("@/lib/raman/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/raman/api")>("@/lib/raman/api");
  return {
    ...actual,
    parseRamanFile,
    confirmRamanUpload,
  };
});

vi.mock("@/components/raman/RamanMetadataReview", () => ({
  RamanMetadataReview: ({
    onConfirm,
  }: {
    onConfirm: (payload: {
      band: "1500" | "2900" | "unknown";
      brainRegion: "cortex" | "striatum" | "cerebellum" | "other" | "unknown";
      classLabel: "control" | "endo" | "exo" | "unknown";
      animalId: string | null;
      side: "left" | "right" | "unknown";
      place: string | null;
      repetition: string | null;
      mapId: string | null;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onConfirm({
          band: "1500",
          brainRegion: "cortex",
          classLabel: "control",
          animalId: null,
          side: "unknown",
          place: null,
          repetition: null,
          mapId: null,
        })
      }
    >
      confirm-metadata
    </button>
  ),
}));

vi.mock("@/components/spectra/SingleSpectrumViewer", () => ({
  SingleSpectrumViewer: () => <div data-testid="single-spectrum-viewer">single spectrum viewer</div>,
}));

vi.mock("@/components/spectra/SpectraExplorer", () => ({
  SpectraExplorer: () => <div data-testid="spectra-explorer">spectra explorer</div>,
}));

function buildUpload(dataMode: "map" | "single_spectrum", userConfirmed: boolean): RamanUpload {
  return {
    uploadId: "upload-1",
    fileName: "sample.txt",
    metadata: {
      sourceFileName: "sample.txt",
      parseStatus: "success",
      band: "1500",
      brainRegion: "cortex",
      classLabel: "control",
      animalId: null,
      side: "unknown",
      place: null,
      repetition: null,
      mapId: null,
      diagnostics: [],
      suggestedQuestions: [],
      userConfirmed,
      userOverrides: {},
    },
    ramanMap: {
      spatialMapAvailable: dataMode === "map",
      dataMode,
      spectrumCount: dataMode === "map" ? 2 : 1,
      totalRows: dataMode === "map" ? 4 : 2,
      waveMin: 1000,
      waveMax: 1001,
      xMin: dataMode === "map" ? 0 : null,
      xMax: dataMode === "map" ? 1 : null,
      yMin: dataMode === "map" ? 0 : null,
      yMax: dataMode === "map" ? 1 : null,
      points: dataMode === "map"
        ? [
            {
              pointKey: "0.000000000|0.000000000",
              x: 0,
              y: 0,
              spectrumWave: [1000, 1001],
              spectrumIntensity: [10, 11],
              meanIntensity: 10.5,
              areaUnderCurve: 10.5,
              peakIntensity: 11,
            },
            {
              pointKey: "1.000000000|1.000000000",
              x: 1,
              y: 1,
              spectrumWave: [1000, 1001],
              spectrumIntensity: [8, 9],
              meanIntensity: 8.5,
              areaUnderCurve: 8.5,
              peakIntensity: 9,
            },
          ]
        : [
            {
              pointKey: "single-spectrum",
              x: 0,
              y: 0,
              spectrumWave: [1000, 1001],
              spectrumIntensity: [10, 11],
              meanIntensity: 10.5,
              areaUnderCurve: 10.5,
              peakIntensity: 11,
            },
          ],
    },
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    parseRamanFile.mockReset();
    confirmRamanUpload.mockReset();
  });

  it("opens the single-spectrum viewer after metadata confirmation", async () => {
    parseRamanFile.mockResolvedValue(buildUpload("single_spectrum", false));
    confirmRamanUpload.mockResolvedValue(buildUpload("single_spectrum", true));

    render(
      <Dashboard
        fileInfo={{ name: "sample.txt", size: 128, contentPreview: "" }}
        file={new File(["#Wave #Intensity"], "sample.txt", { type: "text/plain" })}
        onBack={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "confirm-metadata" }));

    await waitFor(() => {
      expect(screen.getByTestId("single-spectrum-viewer")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("spectra-explorer")).not.toBeInTheDocument();
  });

  it("keeps the map explorer for map uploads", async () => {
    parseRamanFile.mockResolvedValue(buildUpload("map", true));

    render(
      <Dashboard
        fileInfo={{ name: "map.txt", size: 256, contentPreview: "" }}
        file={new File(["#X #Y #Wave #Intensity"], "map.txt", { type: "text/plain" })}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("spectra-explorer")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("single-spectrum-viewer")).not.toBeInTheDocument();
  });
});
