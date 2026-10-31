import { browser } from 'wxt/browser';
import type { WhisperModelId, DownloadProgressPayload } from '../../utils/types';
import { AVAILABLE_MODELS } from '../../utils/types';
import { getSettings, saveSettings, isModelReady } from '../../utils/storage';
import { getStoredTranscriptionsCount, clearAllTranscriptions } from '../../utils/db';

const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
const modelDescription = document.getElementById('modelDescription') as HTMLDivElement;
const modelStatusPill = document.getElementById('modelStatusPill') as HTMLSpanElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const deleteBtn = document.getElementById('deleteBtn') as HTMLButtonElement;
const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
const progressBarFill = document.getElementById('progressBarFill') as HTMLDivElement;
const progressFileText = document.getElementById('progressFileText') as HTMLSpanElement;
const progressPercentText = document.getElementById('progressPercentText') as HTMLSpanElement;
const transcriptionsCount = document.getElementById('transcriptionsCount') as HTMLElement;
const clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;

async function updateUI() {
  const selectedModel = modelSelect.value as WhisperModelId;
  const isReady = await isModelReady(selectedModel);

  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
  if (modelInfo) {
    modelDescription.textContent = `${modelInfo.description} (Tamanho: ${modelInfo.sizeLabel})`;
  }

  if (isReady) {
    modelStatusPill.textContent = 'Pronto (Offline)';
    modelStatusPill.className = 'status-pill status-ready';
    downloadBtn.style.display = 'none';
    deleteBtn.style.display = 'inline-flex';
    progressContainer.style.display = 'none';
  } else {
    modelStatusPill.textContent = 'Não baixado';
    modelStatusPill.className = 'status-pill status-missing';
    downloadBtn.style.display = 'inline-flex';
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = '<span>📥 Baixar Modelo Agora</span>';
    deleteBtn.style.display = 'none';
  }

  // Atualiza contagem de transcrições salvas
  try {
    const count = await getStoredTranscriptionsCount();
    transcriptionsCount.textContent = count.toString();
  } catch {
    transcriptionsCount.textContent = '0';
  }
}

async function init() {
  const settings = await getSettings();

  if (settings.selectedModel) {
    modelSelect.value = settings.selectedModel;
  }
  if (settings.language) {
    languageSelect.value = settings.language;
  }

  await updateUI();

  // Troca de modelo
  modelSelect.addEventListener('change', async () => {
    const newModel = modelSelect.value as WhisperModelId;
    await saveSettings({ selectedModel: newModel });
    await updateUI();
  });

  // Troca de idioma
  languageSelect.addEventListener('change', async () => {
    await saveSettings({ language: languageSelect.value });
  });

  // Iniciar download
  downloadBtn.addEventListener('click', async () => {
    const selectedModel = modelSelect.value as WhisperModelId;

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<span>⏳ Conectando aos servidores HuggingFace...</span>';
    modelStatusPill.textContent = 'Baixando...';
    modelStatusPill.className = 'status-pill status-downloading';

    progressContainer.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressPercentText.textContent = '0%';
    progressFileText.textContent = 'Iniciando download dos pesos do modelo...';

    try {
      await browser.runtime.sendMessage({
        type: 'START_DOWNLOAD',
        modelId: selectedModel,
      });
    } catch (err: any) {
      console.warn('[AudioTranscriber Popup] Aviso ao iniciar download:', err);
    }
  });

  // Excluir modelo
  deleteBtn.addEventListener('click', async () => {
    const selectedModel = modelSelect.value as WhisperModelId;
    const confirmDelete = confirm('Deseja realmente remover os arquivos deste modelo do cache?');
    if (confirmDelete) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '<span>Excluindo...</span>';
      try {
        await browser.runtime.sendMessage({
          type: 'DELETE_MODEL',
          modelId: selectedModel,
        });
      } catch (err) {
        console.warn('Erro ao enviar mensagem de exclusão:', err);
      }
      await setModelDownloaded(selectedModel, false);
      setTimeout(async () => {
        deleteBtn.disabled = false;
        await updateUI();
      }, 600);
    }
  });

  // Limpar histórico de transcrições
  clearCacheBtn.addEventListener('click', async () => {
    const confirmClear = confirm('Deseja limpar todo o histórico de transcrições salvas localmente?');
    if (confirmClear) {
      await clearAllTranscriptions();
      await updateUI();
    }
  });

  // Ouvinte de progresso e finalização
  browser.runtime.onMessage.addListener((message: any) => {
    if (message.type === 'DOWNLOAD_PROGRESS') {
      const payload: DownloadProgressPayload = message.payload;
      if (payload.modelId === modelSelect.value) {
        if (payload.status === 'error') {
          progressFileText.textContent = `Erro: ${payload.error || 'Falha no download'}`;
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = '<span>Tentar novamente</span>';
          modelStatusPill.textContent = 'Erro';
          modelStatusPill.className = 'status-pill status-missing';
          return;
        }

        const pct = Math.min(100, Math.max(0, payload.progress ?? 0));
        progressBarFill.style.width = `${pct}%`;
        progressPercentText.textContent = `${pct}%`;

        if (payload.file) {
          const shortName = payload.file.split('/').pop() || payload.file;
          progressFileText.textContent = `Baixando ${shortName}...`;
        }
      }
    }

    if (message.type === 'DOWNLOAD_COMPLETE') {
      if (message.modelId === modelSelect.value) {
        setModelDownloaded(message.modelId, true).then(() => updateUI());
      }
    }
  });

  // Ouvinte de alterações no armazenamento local (atualiza contador de transcrições em tempo real)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes['wa_transcriptions_cache'] || changes['wa_downloaded_models'] || changes['wa_settings'])) {
      updateUI();
    }
  });
}

init();
