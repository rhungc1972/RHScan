// netlify/functions/send-otp.js
// PocketScan Zero - Zero-Knowledge Registration OTP Dispatcher
// No almacena datos de usuario, ni archivos, ni documentos en ningún servidor.

const crypto = require('crypto');

// Clave secreta efímera para firma HMAC sin base de datos
const HMAC_SECRET = process.env.OTP_SECRET || 'pocketscan-zero-secret-salt-2026';

function createToken(email, code) {
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos
  const payload = `${email}:${code}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ email, expiresAt, hmac })).toString('base64');
}

function verifyToken(token, email, code) {
  try {
    const json = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (json.email !== email) return false;
    if (Date.now() > json.expiresAt) return false;
    const expectedPayload = `${email}:${code}:${json.expiresAt}`;
    const expectedHmac = crypto.createHmac('sha256', HMAC_SECRET).update(expectedPayload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(json.hmac), Buffer.from(expectedHmac));
  } catch (err) {
    return false;
  }
}

exports.handler = async function (event) {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido. Solo se acepta POST.' }),
    };
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { action = 'send', email, name = 'Usuario', code, token } = data;

    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Dirección de correo electrónico no válida.' }),
      };
    }

    // Acción 1: Enviar OTP
    if (action === 'send') {
      // Generar código OTP de 6 dígitos
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationToken = createToken(email, generatedCode);

      console.log(`[PocketScan Zero] Código OTP generado para ${email}: ${generatedCode}`);

      // Si existe integración SMTP o proveedor (e.g. RESEND_API_KEY o SENDGRID_API_KEY)
      // se puede despachar directamente. En entorno Netlify o sin API Key,
      // se entrega en modo seguro con simulación transparente.
      let deliveredViaProvider = false;
      if (process.env.RESEND_API_KEY) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'PocketScan Zero <auth@pocketscanzero.app>',
              to: email,
              subject: 'Tu código de verificación PocketScan Zero',
              html: `
                <div style="font-family: sans-serif; background: #0c0f14; color: #fff; padding: 24px; border-radius: 12px;">
                  <h2 style="color: #10b981;">PocketScan Zero</h2>
                  <p>Hola <strong>${name}</strong>,</p>
                  <p>Tu código de verificación para desbloquear 10 escaneos diarios es:</p>
                  <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #34d399; margin: 20px 0;">
                    ${generatedCode}
                  </div>
                  <p style="color: #94a3b8; font-size: 13px;">Válido durante 10 minutos. Este correo fue enviado bajo arquitectura Zero-Knowledge.</p>
                </div>
              `,
            }),
          });
          if (res.ok) deliveredViaProvider = true;
        } catch (mailErr) {
          console.warn('[PocketScan Zero] Error enviando correo vía proveedor:', mailErr);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: deliveredViaProvider
            ? 'Código OTP enviado exitosamente a tu bandeja de entrada.'
            : 'Código OTP generado (modo demostración activo).',
          token: verificationToken,
          // Se incluye demoCode para que el usuario pueda probar y validar de inmediato en cualquier dispositivo
          demoCode: generatedCode,
        }),
      };
    }

    // Acción 2: Verificar OTP
    if (action === 'verify') {
      if (!code || code.length !== 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'El código OTP debe ser de 6 dígitos numéricos.' }),
        };
      }

      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Token de sesión expirado o ausente. Solicita un nuevo código.' }),
        };
      }

      const isValid = verifyToken(token, email, code);

      if (!isValid) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Código incorrecto o ha expirado. Verifica el número e intenta nuevamente.' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '¡Verificación exitosa! Tu cuenta ha sido activada con 10 escaneos diarios.',
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Acción no reconocida.' }),
    };
  } catch (error) {
    console.error('[PocketScan Zero] Error en función OTP:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno en el servidor.' }),
    };
  }
};
