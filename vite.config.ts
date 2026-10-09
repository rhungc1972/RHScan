import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import crypto from 'crypto';
import {defineConfig, Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Middleware para desarrollo local de la función OTP
function localOtpApiPlugin(): Plugin {
  const HMAC_SECRET = 'pocketscan-zero-secret-salt-2026';
  return {
    name: 'local-otp-api',
    configureServer(server) {
      server.middlewares.use('/api/send-otp', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const {action = 'send', email, name = 'Usuario', code, token} = data;

            if (!email || !email.includes('@')) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({error: 'Dirección de correo no válida'}));
              return;
            }

            if (action === 'send') {
              const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
              const expiresAt = Date.now() + 10 * 60 * 1000;
              const payload = `${email}:${generatedCode}:${expiresAt}`;
              const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
              const verificationToken = Buffer.from(JSON.stringify({email, expiresAt, hmac})).toString('base64');

              console.log(`[PocketScan Dev OTP] Código para ${email}: ${generatedCode}`);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Código de 6 dígitos generado en modo seguro.',
                token: verificationToken,
                demoCode: generatedCode,
              }));
              return;
            }

            if (action === 'verify') {
              try {
                const json = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
                if (json.email !== email || Date.now() > json.expiresAt) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({error: 'Token expirado o inválido'}));
                  return;
                }
                const expectedPayload = `${email}:${code}:${json.expiresAt}`;
                const expectedHmac = crypto.createHmac('sha256', HMAC_SECRET).update(expectedPayload).digest('hex');
                if (json.hmac !== expectedHmac) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({error: 'Código incorrecto. Intenta nuevamente.'}));
                  return;
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  message: '¡Verificación exitosa! Límite ampliado a 10 escaneos diarios.',
                }));
                return;
              } catch (e) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({error: 'Error validando token.'}));
                return;
              }
            }

            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({error: 'Acción no soportada'}));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({error: 'Error procesando solicitud'}));
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      localOtpApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'PocketScan Zero - Escáner Privado',
          short_name: 'PocketScan',
          description: 'Escáner móvil PWA Zero-Knowledge 100% en el dispositivo con corrección de perspectiva homográfica.',
          theme_color: '#0a0f18',
          background_color: '#0a0f18',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
