import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  FlaskConical,
  Loader2,
} from "lucide-react";
import type { FileInfo } from "@/lib/mockGenerator";
import { SpectraExplorer } from "@/components/spectra/SpectraExplorer";
import { SingleSpectrumViewer } from "@/components/spectra/SingleSpectrumViewer";
import {
  confirmRamanUpload,
  parseRamanFile,
  RamanMetadataConfirmPayload,
  RamanUpload,
  toSpectraDataset,
} from "@/lib/raman/api";
import { RamanMetadataReview } from "@/components/raman/RamanMetadataReview";

interface DashboardProps {
  fileInfo: FileInfo;
  file: File;
  onBack: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  fileInfo,
  file,
  onBack,
}) => {
  const [ramanUpload, setRamanUpload] = useState<RamanUpload | null>(null);
  const [ramanLoading, setRamanLoading] = useState(true);
  const [ramanError, setRamanError] = useState<string | null>(null);
  const [confirmingMetadata, setConfirmingMetadata] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadRamanUpload = async () => {
      setRamanLoading(true);
      setRamanError(null);
      try {
        const parsed = await parseRamanFile(file);
        if (!cancelled) {
          setRamanUpload(parsed);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setRamanUpload(null);
          setRamanError(e instanceof Error ? e.message : "Не удалось разобрать Raman mapping данные.");
        }
      } finally {
        if (!cancelled) {
          setRamanLoading(false);
        }
      }
    };

    loadRamanUpload();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const spectraDataset = useMemo(() => (ramanUpload ? toSpectraDataset(ramanUpload) : null), [ramanUpload]);

  const handleMetadataConfirm = async (payload: RamanMetadataConfirmPayload) => {
    if (!ramanUpload) {
      return;
    }
    setConfirmingMetadata(true);
    setRamanError(null);
    try {
      const confirmed = await confirmRamanUpload(ramanUpload.uploadId, payload);
      setRamanUpload(confirmed);
    } catch (e: unknown) {
      setRamanError(e instanceof Error ? e.message : "Не удалось подтвердить метаданные Raman.");
    } finally {
      setConfirmingMetadata(false);
    }
  };

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-4 sm:px-6 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Назад</span>
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal/15 border border-teal/30">
              <Activity className="h-3.5 w-3.5 text-teal" />
            </div>
            <span className="font-semibold tracking-tight hidden sm:block">
              Deep<span className="text-teal">Pick</span>
            </span>
            <span className="text-border mx-1 hidden sm:block">/</span>
            <span className="text-sm text-muted-foreground truncate font-mono">{fileInfo.name}</span>
          </div>

        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Рабочая область спектров</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Разбор Raman-файла, подтверждение метаданных и визуализация как карты спектров, так и одиночного спектра.
          </p>
        </div>

        {ramanLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="h-10 w-10 text-teal animate-spin" />
            <p className="text-muted-foreground text-sm">Загружаем `.txt` файл и разбираем Raman-метаданные…</p>
          </div>
        ) : (
          <>
            {ramanError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
                <p className="text-sm font-medium text-destructive">В Raman-потоке возникла ошибка</p>
                <p className="mt-1 text-sm text-muted-foreground">{ramanError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ожидается один `.txt` файл с таблицей `Wave/Intensity`, либо `X/Y/Wave/Intensity`.
                </p>
              </div>
            )}

            {!ramanUpload ? (
              <div className="rounded-xl border border-border bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
                Нет доступной сессии загрузки Raman-файла.
              </div>
            ) : !ramanUpload.metadata.userConfirmed ? (
              <RamanMetadataReview
                metadata={ramanUpload.metadata}
                fileName={ramanUpload.fileName}
                canConfirm={Boolean(ramanUpload.ramanMap)}
                confirming={confirmingMetadata}
                onConfirm={handleMetadataConfirm}
              />
            ) : ramanUpload.ramanMap?.dataMode === "single_spectrum" && spectraDataset ? (
              <SingleSpectrumViewer
                dataset={spectraDataset}
                fileName={ramanUpload.fileName}
                metadata={ramanUpload.metadata}
              />
            ) : spectraDataset ? (
              <SpectraExplorer
                dataset={spectraDataset}
                fileName={ramanUpload.fileName}
                metadata={ramanUpload.metadata}
              />
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4">
                <p className="text-sm font-medium text-destructive">Визуализация недоступна</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Файл разобран, но нормализованные спектральные данные для рендера отсутствуют.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-5 py-4">
          <FlaskConical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Важно:</strong> DeepPick является прототипом инструмента визуализации и{" "}
            <strong>не является сертифицированным медицинским изделием</strong>. Результаты нельзя использовать
            для клинической диагностики, принятия решений о лечении или ведения пациента. Только для
            исследований.
          </p>
        </div>
      </main>
    </div>
  );
};
