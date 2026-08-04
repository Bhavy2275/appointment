require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Boom } = require('@hapi/boom');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || process.env.WHATSAPP_PORT || '3001', 10);
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const DAILY_LIMIT = parseInt(process.env.WHATSAPP_DAILY_SEND_LIMIT || '200', 10);
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3000;
const MAX_RECONNECTS = 5;

let dailySendCount = 0;
let dailyResetDate = new Date().toDateString();
let latestQrDataUrl = null;

function checkAndIncrementDailyCount() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailySendCount = 0;
    dailyResetDate = today;
  }
  if (dailySendCount >= DAILY_LIMIT) return false;
  dailySendCount++;
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitterDelay() {
  const ms = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  return sleep(ms);
}

let sock = null;
let isConnected = false;
let reconnectAttempts = 0;

async function connectToWhatsApp() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[WhatsApp] Using Baileys v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console),
    },
    printQRInTerminal: false,
    browser: ['Reminder Service', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        latestQrDataUrl = await qrcode.toDataURL(qr);
        console.log('[WhatsApp] New QR code generated. Open /qr in your browser to scan!');
      } catch (err) {
        console.error('[WhatsApp] Failed to generate QR data URL:', err);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      latestQrDataUrl = null;
      reconnectAttempts = 0;
      console.log('[WhatsApp] ✓ Connected and ready to send messages.');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode
        : 0;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('[WhatsApp] Logged out — QR re-scan required. Clearing session contents...');
        if (fs.existsSync(AUTH_DIR)) {
          const files = fs.readdirSync(AUTH_DIR);
          for (const file of files) {
            fs.rmSync(path.join(AUTH_DIR, file), { recursive: true, force: true });
          }
        }
        console.error('[WhatsApp] Session cleared. Reconnecting for new QR scan...');
        latestQrDataUrl = null;
        connectToWhatsApp();
        return;
      }

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECTS) {
        reconnectAttempts++;
        const backoffMs = reconnectAttempts * 3000;
        console.warn(`[WhatsApp] Reconnecting (${reconnectAttempts}/${MAX_RECONNECTS}) in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
        connectToWhatsApp();
      } else {
        console.error('[WhatsApp] Max reconnects reached. Restarting socket...');
        reconnectAttempts = 0;
        await sleep(5000);
        connectToWhatsApp();
      }
    }
  });
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whatsappEnabled: WHATSAPP_ENABLED,
    connected: isConnected,
    dailySendCount,
    dailyLimit: DAILY_LIMIT,
  });
});

/**
 * GET /logout
 * Clears old session credentials and forces fresh QR code generation.
 */
app.get('/logout', async (_req, res) => {
  try {
    isConnected = false;
    latestQrDataUrl = null;
    if (sock) {
      try { sock.end(undefined); } catch (_) { }
    }
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        fs.rmSync(path.join(AUTH_DIR, file), { recursive: true, force: true });
      }
    }
    console.log('[WhatsApp] Session reset requested. Initialising clean connection...');
    setTimeout(() => {
      connectToWhatsApp().catch((err) => console.error('Reset error:', err));
    }, 1000);
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #3b82f6;">Session Cleared!</h2>
          <p>Redirecting to QR scanner in 3 seconds...</p>
          <script>setTimeout(() => location.href = '/qr', 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send('Error resetting session: ' + err.message);
  }
});

/**
 * GET /qr
 * Displays a clean webpage with an image QR code for scanning.
 */
app.get('/qr', (_req, res) => {
  if (isConnected) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #22c55e;">✓ WhatsApp is Connected & Ready!</h2>
          <p>Your session is active. No QR scan needed.</p>
        </body>
      </html>
    `);
  }

  if (!latestQrDataUrl) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2>Generating QR Code...</h2>
          <p>Please refresh this page in 5 seconds.</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding-top: 40px; background: #f8fafc;">
        <h1 style="color: #0f172a;">Scan with WhatsApp</h1>
        <p style="color: #475569;">Open WhatsApp on your phone → Linked Devices → Link a Device</p>
        <div style="background: white; display: inline-block; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <img src="${latestQrDataUrl}" style="width: 300px; height: 300px;" />
        </div>
        <p style="color: #94a3b8; font-size: 0.875rem; margin-top: 20px;">Page auto-refreshes every 15 seconds for fresh QR codes.</p>
        <script>setTimeout(() => location.reload(), 15000);</script>
      </body>
    </html>
  `);
});

app.post('/send', async (req, res) => {
  if (!WHATSAPP_ENABLED) {
    return res.json({ ok: false, reason: 'WHATSAPP_ENABLED is false' });
  }

  if (!isConnected || !sock) {
    return res.status(503).json({ ok: false, reason: 'WhatsApp socket not connected' });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ ok: false, reason: 'phone and message required' });
  }

  let normalised = phone.replace(/\D/g, '');
  if (normalised.length === 10) {
    normalised = '91' + normalised;
  }
  if (normalised.length < 10) {
    return res.status(400).json({ ok: false, reason: `Invalid phone: ${phone}` });
  }

  if (!checkAndIncrementDailyCount()) {
    return res.status(429).json({ ok: false, reason: 'Daily send limit reached' });
  }

  const jid = `${normalised}@s.whatsapp.net`;

  try {
    await jitterDelay();
    await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] ✓ Message sent to ${normalised}`);
    return res.json({ ok: true, phone: normalised });
  } catch (err) {
    console.error(`[WhatsApp] Failed to send to ${normalised}:`, err.message);
    dailySendCount = Math.max(0, dailySendCount - 1);
    return res.status(500).json({ ok: false, reason: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[WhatsApp] Server listening on port ${PORT}`);
  if (WHATSAPP_ENABLED) {
    connectToWhatsApp().catch((err) => console.error('Init error:', err));
  }
});
