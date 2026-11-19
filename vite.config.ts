import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { spawn } from 'child_process';
import http from 'http';

function apiServerAutoStartPlugin() {
  let apiProcess: ReturnType<typeof spawn> | null = null;
  return {
    name: 'api-server-auto-start',
    configureServer(server) {
      const startApi = () => {
        if (apiProcess && !apiProcess.killed) return;
        try {
          apiProcess = spawn('node', ['server/index.mjs'], {
            env: { ...process.env, PORT: '4000', API_PORT: '4000', NODE_ENV: 'development' },
            stdio: ['ignore', 'inherit', 'inherit'],
            detached: false,
          });
          apiProcess.on('error', (err) => {
            console.warn('[vite] Failed to spawn API server:', err.message);
          });
          apiProcess.on('exit', (code, signal) => {
            if (code !== 0 && code !== null) {
              console.warn(`[vite] API server exited with code ${code}, signal ${signal}`);
            }
            apiProcess = null;
          });
        } catch (err) {
          console.error('[vite] Failed to spawn API server:', err);
        }
      };
      const req = http.get('http://127.0.0.1:4000/health/live', (res) => {
        res.resume();
      });
      req.on('error', () => {
        startApi();
      });
      req.setTimeout(1500, () => {
        req.destroy();
      });
      server.httpServer?.on('close', () => {
        if (apiProcess) {
          try { apiProcess.kill(); } catch {}
          apiProcess = null;
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiServerAutoStartPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.warn('[vite proxy warning]:', err.message);
            });
          },
        },
        '/health': {
          target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

