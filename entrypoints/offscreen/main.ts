import { pipeline, env } from '@huggingface/transformers';
import { browser } from 'wxt/browser';
import type { WhisperModelId, DownloadProgressPayload } from '../../utils/types';
import { setModelDownloaded, getSettings, isModelReady } from '../../utils/storage';

// Configurações do Transformers.js para extensão
env.allowLocalModels = false;
env.useBrowserCache = true;

try {
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('/wasm/' as any);
  }
} catch (e) {
  console.warn('[AudioTranscriber] Falha ao configurar wasmPaths:', e);
}

let activeTranscriber: any = null;
let currentModelId: string | null = null;
let isDownloading = false;

const fileProgressMap = new Map<string, { loaded: number; total: number; progress: number }>();

async function getOrLoadPipeline(modelId: WhisperModelId) {
  if (activeTranscriber && currentModelId === modelId) {
    return activeTranscriber;
  }

  console.log(`[AudioTranscriber Engine] Inicializando pipeline: ${modelId}...`);

  let p = null;
  if (navigator.gpu) {
    try {
      p = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'webgpu',
      });
      console.log('[AudioTranscriber Engine] Pipeline carregado via WebGPU.');
    } catch (e) {
      console.warn('[AudioTranscriber Engine] WebGPU indisponível, usando WASM CPU:', e);
    }
  }

  if (!p) {
    p = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      device: 'wasm',
    });
    console.log('[AudioTranscriber Engine] Pipeline carregado via WASM CPU.');
  }

  activeTranscriber = p;
  currentModelId = modelId;
  return activeTranscriber;
}

async function handleDownloadModel(modelId: WhisperModelId) {
  if (isDownloading) return { success: false, error: 'Já está em download' };
  isDownloading = true;
  fileProgressMap.clear();

  console.log(`[AudioTranscriber Engine] Iniciando download do modelo: ${modelId}`);

  try {
    const progressCallback = (data: any) => {
      if (data.file && typeof data.progress === 'number') {
        fileProgressMap.set(data.file, {
          loaded: data.loaded || 0,
          total: data.total || 0,
          progress: data.progress,
        });

        let sumProgress = 0;
        fileProgressMap.forEach((f) => {
          sumProgress += f.progress;
        });
        const avgProgress = Math.round(sumProgress / fileProgressMap.size);

        const payload: DownloadProgressPayload = {
          modelId,
          file: data.file,
          progress: avgProgress,
          loaded: data.loaded,
          total: data.total,
          status: 'progress',
        };

        browser.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS',
          payload,
        }).catch(() => {});
      }
    };

    let p = null;
    if (navigator.gpu) {
      try {
        p = await pipeline('automatic-speech-recognition', modelId, {
          dtype: 'q8',
          device: 'webgpu',
          progress_callback: progressCallback,
        });
      } catch {
        // Fallback para wasm
      }
    }

    if (!p) {
      p = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressCallback,
      });
    }

    activeTranscriber = p;
    currentModelId = modelId;
    try {
      await setModelDownloaded(modelId, true);
    } catch (e) {
      console.warn('[AudioTranscriber Engine] Aviso ao registrar modelo baixado:', e);
    }

    console.log(`[AudioTranscriber Engine] Download e inicialização concluídos: ${modelId}`);

    browser.runtime.sendMessage({
      type: 'DOWNLOAD_COMPLETE',
      modelId,
    }).catch(() => {});

    return { success: true };
  } catch (error: any) {
    console.error('[AudioTranscriber Engine] Erro durante o download do modelo:', error);
    browser.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      payload: {
        modelId,
        status: 'error',
        error: error?.message || 'Falha ao baixar modelo',
      },
    }).catch(() => {});
    throw error;
  } finally {
    isDownloading = false;
  }
}

async function handleDeleteModel(modelId: WhisperModelId) {
  try {
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes('transformers') || name.includes('whisper')) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          for (const req of requests) {
            if (req.url.includes(modelId.replace('onnx-community/', ''))) {
              await cache.delete(req);
            }
          }
        }
      }
    }

    if (currentModelId === modelId) {
      activeTranscriber = null;
      currentModelId = null;
    }

    try {
      await setModelDownloaded(modelId, false);
    } catch (e) {
      console.warn('[AudioTranscriber Engine] Aviso ao desmarcar modelo:', e);
    }
    console.log(`[AudioTranscriber Engine] Modelo ${modelId} removido do cache.`);
    return { success: true };
  } catch (error: any) {
    console.error('[AudioTranscriber Engine] Erro ao excluir modelo:', error);
    throw error;
  }
}

async function handleTranscribe(
  audioData: number[] | Float32Array,
  language?: string,
  modelIdParam?: WhisperModelId
) {
  let modelId = modelIdParam;
  let lang = language;

  if (!modelId) {
    try {
      const settings = await getSettings();
      modelId = settings.selectedModel;
      lang = lang || settings.language || 'pt';
    } catch {
      modelId = 'onnx-community/whisper-tiny';
      lang = lang || 'pt';
    }
  }

  const ready = await isModelReady(modelId);
  if (!ready) {
    console.warn(`[AudioTranscriber Engine] Modelo ${modelId} não marcado como baixado, inicializando sob demanda...`);
  }

  const transcriber = await getOrLoadPipeline(modelId);

  const float32Audio = audioData instanceof Float32Array
    ? audioData
    : new Float32Array(audioData);

  const options: Record<string, any> = {
    task: 'transcribe',
    chunk_length_s: 30,
    return_timestamps: false,
  };

  if (lang && lang !== 'auto') {
    options.language = lang;
  }

  console.log(`[AudioTranscriber Engine] Executando inferência Whisper (modelo: ${modelId}, idioma: ${lang}, amostras: ${float32Audio.length})...`);
  const result = await transcriber(float32Audio, options);

  const text = (Array.isArray(result) ? result[0]?.text : result?.text) || '';
  console.log('[AudioTranscriber Engine] Transcrição concluída:', text);
  return text.trim();
}

// Ouvinte de mensagens da extensão: retorna Promises reais para aguardar o término da operação!
browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type === 'START_DOWNLOAD') {
    return handleDownloadModel(message.modelId)
      .then((res) => {
        sendResponse(res);
        return res;
      })
      .catch((err) => {
        const res = { success: false, error: err.message };
        sendResponse(res);
        return res;
      });
  }

  if (message.type === 'DELETE_MODEL') {
    return handleDeleteModel(message.modelId)
      .then((res) => {
        sendResponse(res);
        return res;
      })
      .catch((err) => {
        const res = { success: false, error: err.message };
        sendResponse(res);
        return res;
      });
  }

  if (message.type === 'TRANSCRIBE_AUDIO_DATA') {
    return handleTranscribe(message.audioData, message.language, message.modelId)
      .then((text) => {
        const res = { success: true, text };
        sendResponse(res);
        return res;
      })
      .catch((err) => {
        const res = { success: false, error: err.message || 'Falha na inferência' };
        sendResponse(res);
        return res;
      });
  }
});
