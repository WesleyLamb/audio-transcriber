import { defineConfig } from 'wxt';

// Configuração do WXT (Web Extension Framework)
export default defineConfig({
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: {
    name: 'Transcritor de Áudio para WhatsApp (IA Local)',
    description: 'Transcreva áudios do WhatsApp Web diretamente no seu navegador usando IA local e privada.',
    version: '1.0.0',
    permissions: [
      'storage',
      'unlimitedStorage',
      'offscreen',
    ],
    host_permissions: [
      'https://web.whatsapp.com/*',
      'https://huggingface.co/*',
      'https://*.hf.co/*',
    ],
    web_accessible_resources: [
      {
        resources: ['wasm/*', 'offscreen.html', 'inject.js'],
        matches: ['https://web.whatsapp.com/*'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    browser_specific_settings: {
      gecko: {
        id: 'whatsapp-audio-transcriber@local',
        strict_min_version: '109.0',
      },
    },
  },
  vite: () => ({
    build: {
      target: 'esnext',
    },
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },
  }),
});
