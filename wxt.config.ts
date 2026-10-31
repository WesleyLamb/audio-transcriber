import { defineConfig } from 'wxt';

// Configuração do WXT (Web Extension Framework)
export default defineConfig({
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: {
    name: 'Transcritor de Áudio para WhatsApp',
    description: 'Extensão para transcrição local de áudios no WhatsApp Web.',
    version: '1.0.0',
    permissions: ['storage'],
    host_permissions: ['https://web.whatsapp.com/*'],
    browser_specific_settings: {
      gecko: {
        id: 'whatsapp-audio-transcriber@local',
        strict_min_version: '109.0',
      },
    },
  },
});

