
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis para plugins/servidor se necessário,
  // mas não expõe automaticamente ao cliente.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 3000,
      // Configuração de Proxy para Desenvolvimento
      // Redireciona chamadas /api para o backend local rodando o server.js
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
