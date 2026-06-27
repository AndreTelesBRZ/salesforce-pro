import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const HOST = '0.0.0.0';
const PORT = 3000;

async function startClient() {
  const server = await createServer({
    configFile: false,
    plugins: [react()],
    server: {
      host: HOST,
      port: PORT,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  });

  await server.listen();
  server.printUrls();
}

startClient().catch((err) => {
  console.error(err);
  process.exit(1);
});
