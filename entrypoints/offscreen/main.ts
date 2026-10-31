import { pipeline, env } from '@huggingface/transformers';
import { browser } from 'wxt/browser';
import type { WhisperModelId, DownloadProgressPayload } from '../../utils/types';
import { setModelDownloaded } from '../../utils/storage';

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

async function handleDownloadModel(modelId: WhisperModelId) {
  if (isDownloading) return;
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
    // Tenta carregar com WebGPU se disponível
    if (navigator.gpu) {
      try {
        p = await pipeline('automatic-speech-recognition', modelId, {
          dtype: 'q8',
          device: 'webgpu',
          progress_callback: progressCallback,
        });
        console.log('[AudioTranscriber Engine] Pipeline carregado via WebGPU.');
      } catch (e) {
        console.warn('[AudioTranscriber Engine] WebGPU indisponível, recorrendo ao WASM CPU:', e);
      }
    }

    // Fallback universal: WASM CPU
    if (!p) {
      p = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: progressCallback,
      });
      console.log('[AudioTranscriber Engine] Pipeline carregado via WASM CPU.');
    }

    activeTranscriber = p;
    currentModelId = modelId;
    await setModelDownloaded(modelId, true);

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

    await setModelDownloaded(modelId, false);
    console.log(`[AudioTranscriber Engine] Modelo ${modelId} removido do cache.`);
    return { success: true };
  } catch (error: any) {
    console.error('[AudioTranscriber Engine] Erro ao excluir modelo:', error);
    throw error;
  }
}

// Ouvinte de mensagens da extensão
browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message.type === 'START_DOWNLOAD') {
    handleDownloadModel(message.modelId)
      .then((res) => {
        sendResponse(res);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return Promise.resolve({ received: true });
  }

  if (message.type === 'DELETE_MODEL') {
    handleDeleteModel(message.modelId)
      .then((res) => {
        sendResponse(res);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return Promise.resolve({ received: true });
  }
});
