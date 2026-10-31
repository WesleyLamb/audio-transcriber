export type WhisperModelId = 'onnx-community/whisper-tiny' | 'onnx-community/whisper-base';

export interface ModelInfo {
  id: WhisperModelId;
  name: string;
  sizeLabel: string;
  description: string;
  recommended: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'onnx-community/whisper-tiny',
    name: 'Whisper Tiny (Quantizado)',
    sizeLabel: '~75 MB',
    description: 'Mais rápido e leve. Ideal para computadores modestos.',
    recommended: true,
  },
  {
    id: 'onnx-community/whisper-base',
    name: 'Whisper Base (Quantizado)',
    sizeLabel: '~140 MB',
    description: 'Maior precisão em português e termos técnicos.',
    recommended: false,
  },
];

export interface AppSettings {
  selectedModel: WhisperModelId;
  language: string; // 'pt', 'auto', 'en', 'es'
}

export const DEFAULT_SETTINGS: AppSettings = {
  selectedModel: 'onnx-community/whisper-tiny',
  language: 'pt',
};

export interface DownloadProgressPayload {
  modelId: string;
  file?: string;
  progress?: number; // 0 a 100
  loaded?: number;
  total?: number;
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready' | 'error';
  error?: string;
}

