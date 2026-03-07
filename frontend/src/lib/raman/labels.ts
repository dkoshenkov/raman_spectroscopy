export const BAND_OPTIONS = [
  { value: "1500", label: "1500 см⁻¹" },
  { value: "2900", label: "2900 см⁻¹" },
  { value: "unknown", label: "Неизвестно" },
] as const;

export const BRAIN_REGION_OPTIONS = [
  { value: "cortex", label: "Cortex" },
  { value: "striatum", label: "Striatum" },
  { value: "cerebellum", label: "Cerebellum" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Неизвестно" },
] as const;

export const CLASS_LABEL_OPTIONS = [
  { value: "control", label: "Control" },
  { value: "endo", label: "Endo" },
  { value: "exo", label: "Exo" },
  { value: "unknown", label: "Неизвестно" },
] as const;

export const SIDE_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "unknown", label: "Неизвестно" },
] as const;

export function formatBand(value: string) {
  const match = BAND_OPTIONS.find((item) => item.value === value);
  return match?.label ?? value;
}

export function formatBrainRegion(value: string) {
  const match = BRAIN_REGION_OPTIONS.find((item) => item.value === value);
  return match?.label ?? value;
}

export function formatParseStatus(value: string) {
  if (value === "success") {
    return "Успешно";
  }
  if (value === "partial") {
    return "Частично";
  }
  if (value === "failed") {
    return "Ошибка";
  }
  return value;
}
