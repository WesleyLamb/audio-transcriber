import { pipeline, env } from '@huggingface/transformers';
import type { WhisperModelId, DownloadProgressPayload } from '../../utils/types';
import { setModelDownloaded, getSettings, isModelReady } from '../../utils/storage';

// Configuração do ambiente Transformers.js para extensão
env.allowLocalModels = false;
env.useBrowserCache = true;

// Define caminho dos arquivos WASM locais
try {
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
  }
} catch (e) {
  console.warn('[AudioTranscriber] Falha ao configurar wasmPaths:', e);
}

let activeTranscriber: any = null;
let currentModelId: string | null = null;
let isDownloading = false;

// Mapa para rastrear progresso individual dos arquivos do modelo
const fileProgressMap = new Map<string, { loaded: number; total: number; progress: number }>();

async function getOrLoadPipeline(modelId: WhisperModelId) {
  if (activeTranscriber && currentModelId === modelId) {
    return activeTranscriber;
  }

  console.log(`[AudioTranscriber] Carregando pipeline do modelo ${modelId}...`);

  let p = null;
  // Tenta carregar com WebGPU se o hardware do usuário suportar
  if (navigator.gpu) {
    try {
      p = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'webgpu',
      });
      console.log('[AudioTranscriber] Modelo carregado com sucesso via WebGPU.');
    } catch (e) {
      console.warn('[AudioTranscriber] WebGPU indisponível, recorrendo ao WASM CPU:', e);
    }
  }

  // Fallback padrão: WASM CPU (compatível com qualquer computador modesto)
  if (!p) {
    p = await pipeline('automatic-speech-recognition', modelId, {
      dtype: 'q8',
      device: 'wasm',
    });
    console.log('[AudioTranscriber] Modelo carregado com sucesso via WASM CPU.');
  }

  activeTranscriber = p;
  currentModelId = modelId;
  return activeTranscriber;
}

// Inicia o download e cache do modelo solicitado
async function handleDownloadModel(modelId: WhisperModelId) {
  if (isDownloading) return;
  isDownloading = true;
  fileProgressMap.clear();

  console.log(`[AudioTranscriber] Iniciando download do modelo: ${modelId}`);

  try {
    const progressCallback = (data: any) => {
      // data: { status, name, file, progress, loaded, total }
      if (data.file && typeof data.progress === 'number') {
        fileProgressMap.set(data.file, {
          loaded: data.loaded || 0,
          total: data.total || 0,
          progress: data.progress,
        });

        // Calcula média de progresso ponderada
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

        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS',
          payload,
        }).catch(() => {
          // Ignora se o popup estiver fechado
        });
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
    await setModelDownloaded(modelId, true);

    console.log(`[AudioTranscriber] Download e inicialização concluídos para: ${modelId}`);

    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_COMPLETE',
      modelId,
    }).catch(() => {});
  } catch (error: any) {
    console.error('[AudioTranscriber] Erro durante o download do modelo:', error);
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      payload: {
        modelId,
        status: 'error',
        error: error?.message || 'Falha ao baixar modelo',
      },
    }).catch(() => {});
  } finally {
    isDownloading = false;
  }
}

// Remove os arquivos do modelo do Cache API
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
    console.log(`[AudioTranscriber] Modelo ${modelId} removido do cache.`);
  } catch (error) {
    console.error('[AudioTranscriber] Erro ao excluir modelo:', error);
  }
}

// Processa a transcrição do áudio bruto PCM (16kHz Float32Array)
async function handleTranscribe(audioData: number[] | Float32Array, language?: string) {
  const settings = await getSettings();
  const modelId = settings.selectedModel;
  const lang = language || settings.language || 'pt';

  const ready = await isModelReady(modelId);
  if (!ready) {
    throw new Error(`O modelo ${modelId} não está baixado. Abra as opções da extensão e realize o download.`);
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

  if (lang !== 'auto') {
    options.language = lang;
  }

  console.log(`[AudioTranscriber] Transcrevendo com idioma: ${lang}...`);
  const result = await transcriber(float32Audio, options);

  const text = (Array.isArray(result) ? result[0]?.text : result?.text) || '';
  return text.trim();
}

// Ouvinte de mensagens
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'START_DOWNLOAD') {
    handleDownloadModel(message.modelId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // resposta assíncrona
  }

  if (message.type === 'DELETE_MODEL') {
    handleDeleteModel(message.modelId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'TRANSCRIBE_AUDIO_DATA') {
    handleTranscribe(message.audioData, message.language)
      .then((text) => sendResponse({ success: true, text }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
