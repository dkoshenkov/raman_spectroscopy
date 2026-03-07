export interface FileInfo {
  name: string;
  size: number;
  contentPreview: string;
}

export interface SpectrumResult {
  id: string;
  label: string;
  probability: number;
  cls: number;
}

export function runSelfChecks() {
  return [];
}
