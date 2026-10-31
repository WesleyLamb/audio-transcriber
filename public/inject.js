// Script injetado no contexto nativo da página do WhatsApp Web
(function() {
  console.log('[AudioTranscriber Hook] Interceptor de mídia carregado no WhatsApp Web.');

  // 1. Intercepta criação de Blob URLs de áudio (quando o WhatsApp descriptografa a mensagem)
  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function(blob) {
    const url = origCreateObjectURL.apply(this, arguments);
    try {
      if (blob && (blob.type?.includes('audio') || blob.type?.includes('ogg') || blob.type?.includes('opus') || blob.size > 500)) {
        console.log('[AudioTranscriber Hook] Blob de áudio capturado via createObjectURL:', url, blob.type, blob.size);
        window.postMessage({
          type: 'WA_AUDIO_BLOB_CAPTURED',
          url: url,
          mimeType: blob.type,
          size: blob.size,
          timestamp: Date.now(),
        }, '*');
      }
    } catch (e) {
      console.warn('[AudioTranscriber Hook] Erro ao analisar blob:', e);
    }
    return url;
  };

  // 2. Intercepta chamadas de play() em elementos de mídia
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    try {
      const src = this.src || this.currentSrc;
      if (src && src.startsWith('blob:')) {
        console.log('[AudioTranscriber Hook] HTMLMediaElement.play interceptado:', src);
        window.postMessage({
          type: 'WA_AUDIO_PLAY_CAPTURED',
          src: src,
          duration: this.duration,
          timestamp: Date.now(),
        }, '*');
      }
    } catch (e) {
      console.warn('[AudioTranscriber Hook] Erro ao interceptar play:', e);
    }
    return origPlay.apply(this, arguments);
  };

  // 3. Intercepta instâncias de Audio() criadas diretamente
  const OrigAudio = window.Audio;
  window.Audio = function(src) {
    const audio = new OrigAudio(src);
    if (src && src.startsWith('blob:')) {
      console.log('[AudioTranscriber Hook] new Audio() interceptado:', src);
      window.postMessage({
        type: 'WA_AUDIO_PLAY_CAPTURED',
        src: src,
        timestamp: Date.now(),
      }, '*');
    }
    return audio;
  };
  window.Audio.prototype = OrigAudio.prototype;
})();

