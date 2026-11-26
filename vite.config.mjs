import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function localVercelApiPlugin(env) {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      // Disponibiliza as variáveis do .env para as funções locais em /api
      Object.entries(env).forEach(([key, value]) => {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      });

      server.middlewares.use(async (req, res, next) => {
        const cleanPath = (req.url || '').split('?')[0];

        // Espelha os rewrites do vercel.json e mantém /admin.html por compatibilidade.
        if (cleanPath === '/admin' || cleanPath === '/admin/' || cleanPath === '/admin.html') {
          req.url = '/admin/index.html';
          return next();
        }

        if (!cleanPath.startsWith('/api/')) {
          return next();
        }

        const apiRoot = path.resolve(process.cwd(), 'api');
        const apiRootWithSep = apiRoot.endsWith(path.sep) ? apiRoot : `${apiRoot}${path.sep}`;
        const relativePath = cleanPath.replace(/^\/api\//, '');
        const filePath = path.resolve(apiRoot, `${relativePath}.js`);

        // Evita acesso fora da pasta /api (incluindo diretórios irmãos com prefixo parecido)
        if (!filePath.startsWith(apiRootWithSep) || !fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Rota ${cleanPath} não encontrada` }));
          return;
        }

        try {
          req.body = ['POST', 'PUT', 'PATCH'].includes(req.method)
            ? await readJsonBody(req)
            : {};

          const vercelRes = {
            statusCode: 200,
            setHeader: (k, v) => res.setHeader(k, v),
            status(code) {
              this.statusCode = code;
              res.statusCode = code;
              return this;
            },
            json(payload) {
              if (!res.headersSent) {
                res.statusCode = this.statusCode;
                res.setHeader('Content-Type', 'application/json');
              }
              res.end(JSON.stringify(payload));
              return this;
            },
            send(payload) {
              if (!res.headersSent) res.statusCode = this.statusCode;
              res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
              return this;
            }
          };

          // Limpa cache para refletir alterações em /api sem reiniciar o servidor
          delete require.cache[require.resolve(filePath)];
          const handler = require(filePath);
          await handler(req, vercelRes);
        } catch (err) {
          console.error(`Erro local em ${cleanPath}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor local' }));
          }
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), localVercelApiPlugin(env)],
    envPrefix: ['VITE_', 'REACT_APP_'],
    server: {
      port: 3000,
      open: true
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rolldownOptions: {
        output: {
          minify: {
            compress: {
              dropConsole: true,
              dropDebugger: true
            }
          }
        }
      }
    }
  };
});