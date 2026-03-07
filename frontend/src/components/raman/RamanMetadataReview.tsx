import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RamanMetadata, RamanMetadataConfirmPayload } from "@/lib/raman/api";
import { DiagnosticsPanel } from "@/components/raman/DiagnosticsPanel";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  BAND_OPTIONS,
  BRAIN_REGION_OPTIONS,
  CLASS_LABEL_OPTIONS,
  formatParseStatus,
  SIDE_OPTIONS,
} from "@/lib/raman/labels";

interface RamanMetadataReviewProps {
  metadata: RamanMetadata;
  fileName: string;
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: (payload: RamanMetadataConfirmPayload) => void;
}

export const RamanMetadataReview: React.FC<RamanMetadataReviewProps> = ({
  metadata,
  fileName,
  canConfirm,
  confirming,
  onConfirm,
}) => {
  const [form, setForm] = useState<RamanMetadataConfirmPayload>({
    band: metadata.band,
    brainRegion: metadata.brainRegion,
    classLabel: metadata.classLabel,
    animalId: metadata.animalId,
    side: metadata.side,
    place: metadata.place,
    repetition: metadata.repetition,
    mapId: metadata.mapId,
  });

  useEffect(() => {
    setForm({
      band: metadata.band,
      brainRegion: metadata.brainRegion,
      classLabel: metadata.classLabel,
      animalId: metadata.animalId,
      side: metadata.side,
      place: metadata.place,
      repetition: metadata.repetition,
      mapId: metadata.mapId,
    });
  }, [metadata]);

  const setField = <K extends keyof RamanMetadataConfirmPayload>(key: K, value: RamanMetadataConfirmPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="card-surface rounded-xl p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Подтверждение метаданных</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Правильно ли распарсены данные? Проверьте автодетект и исправьте поля до перехода к визуализации.
              </p>
            </div>
            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              Статус: <span className="font-medium text-foreground">{formatParseStatus(metadata.parseStatus)}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Имя файла</span>
              <Input value={fileName} readOnly />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Диапазон</span>
              <Select value={form.band} onValueChange={(value) => setField("band", value as RamanMetadata["band"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Область мозга</span>
              <Select
                value={form.brainRegion}
                onValueChange={(value) => setField("brainRegion", value as RamanMetadata["brainRegion"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAIN_REGION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Класс / группа</span>
              <Select
                value={form.classLabel}
                onValueChange={(value) => setField("classLabel", value as RamanMetadata["classLabel"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_LABEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">ID животного</span>
              <Input value={form.animalId ?? ""} onChange={(event) => setField("animalId", event.target.value || null)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Сторона</span>
              <Select value={form.side} onValueChange={(value) => setField("side", value as RamanMetadata["side"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIDE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Место</span>
              <Input value={form.place ?? ""} onChange={(event) => setField("place", event.target.value || null)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Повтор</span>
              <Input
                value={form.repetition ?? ""}
                onChange={(event) => setField("repetition", event.target.value || null)}
              />
            </label>
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-muted-foreground">ID карты</span>
              <Input value={form.mapId ?? ""} onChange={(event) => setField("mapId", event.target.value || null)} />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => onConfirm(form)} disabled={!canConfirm || confirming}>
              {confirming ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Подтверждаем
                </span>
              ) : (
                "Подтвердить и продолжить"
              )}
            </Button>
            {!canConfirm && (
              <span className="text-sm text-destructive">
                Визуализация недоступна, пока строки `Wave/Intensity` не приведены к корректному виду.
              </span>
            )}
          </div>
        </div>

        <DiagnosticsPanel
          diagnostics={metadata.diagnostics}
          suggestedQuestions={metadata.suggestedQuestions}
        />
      </div>
    </div>
  );
};
