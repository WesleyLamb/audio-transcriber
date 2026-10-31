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
  language: string; // 'pt', 'auto', 'en', 'es', etc.
  autoTranscribe: boolean; // Transcrever automaticamente quando novo áudio chegar?
}

export const DEFAULT_SETTINGS: AppSettings = {
  selectedModel: 'onnx-community/whisper-tiny',
  language: 'pt',
  autoTranscribe: false,
};

export interface DownloadProgressPayload {
  modelId: string;
  file?: string;
  progress?: number; // 0 to 100
  loaded?: number;
  total?: number;
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready' | 'error';
  error?: string;
}

export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'START_DOWNLOAD'; modelId: WhisperModelId }
  | { type: 'DELETE_MODEL'; modelId: WhisperModelId }
  | { type: 'SAVE_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'DOWNLOAD_PROGRESS'; payload: DownloadProgressPayload }
  | { type: 'DOWNLOAD_COMPLETE'; modelId: WhisperModelId }
  | { type: 'TRANSCRIBE_AUDIO'; audioBlobUrl: string; messageId: string }
  | { type: 'TRANSCRIBE_AUDIO_DATA'; audioData: number[]; messageId: string }
  | { type: 'CLEAR_TRANSCRIPTIONS_CACHE' };

export interface ExtensionState {
  settings: AppSettings;
  downloadedModels: Record<string, boolean>;
  isDownloading: boolean;
  downloadProgress?: DownloadProgressPayload;
  transcriptionCount: number;
}

