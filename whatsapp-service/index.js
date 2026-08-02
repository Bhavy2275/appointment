require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const express   = require('express');
const qrcode    = require('qrcode-terminal');
const path      = require('path');
const fs        = require('fs');
const { Boom }  = require('@hapi/boom');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT              = parseInt(process.env.WHATSAPP_PORT || '3001', 10);
const WHATSAPP_ENABLED  = process.env.WHATSAPP_ENABLED === 'true';
const DAILY_LIMIT       = parseInt(process.env.WHATSAPP_DAILY_SEND_LIMIT || '200', 10);
const AUTH_DIR          = path.join(__dirname, 'auth_info_baileys');
const MIN_DELAY_MS      = 1500;   // minimum inter-message delay (ms)
const MAX_DELAY_MS      = 3000;   // maximum inter-message delay (ms)
const MAX_RECONNECTS    = 3;

// ─── ⚠️  Ban-risk warning ─────────────────────────────────────────────────────
console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️   UNOFFICIAL WHATSAPP INTEGRATION — BAN RISK                ║
║                                                                  ║
║  This service uses Baileys, an unofficial reverse-engineered     ║
║  WhatsApp library. Meta (WhatsApp) can detect and permanently    ║
║  ban the linked number at any time without warning.              ║
║                                                                  ║
║  Set WHATSAPP_ENABLED=false to stop sending immediately.         ║
╚══════════════════════════════════════════════════════════════════╝
`);

// ─── Daily send counter ───────────────────────────────────────────────────────
let dailySendCount = 0;
let dailyResetDate = new Date().toDateString();

function checkAndIncrementDailyCount() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailySendCount = 0;
    dailyResetDate = today;
    console.log('[WhatsApp] Daily send counter reset to 0.');
  }
  if (dailySendCount >= DAILY_LIMIT) {
    return false;
  }
  dailySendCount++;
  return true;
}

// ─── Random jitter delay to avoid spam patterns ───────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitterDelay() {
  const ms = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  return sleep(ms);
}

// ─── Baileys socket ───────────────────────────────────────────────────────────
let sock = null;
let isConnected = false;
let reconnectAttempts = 0;

async function connectToWhatsApp() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version }          = await fetchLatestBaileysVersion();

  console.log(`[WhatsApp] Using Baileys v${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, console),
    },
    printQRInTerminal: false, // we print it ourselves via qrcode-terminal
    browser: ['Reminder Service', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Print QR for first-time auth
    if (qr) {
      console.log('\n[WhatsApp] Scan this QR code with the business WhatsApp number:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      isConnected      = true;
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
        console.error('[WhatsApp] ✗ Logged out — QR re-scan required. Deleting old session...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.error('[WhatsApp] Session cleared. Restart this service to scan a new QR code.');
        // Do not reconnect — wait for operator to restart
        return;
      }

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECTS) {
        reconnectAttempts++;
        const backoffMs = reconnectAttempts * 5000;
        console.warn(`[WhatsApp] Disconnected (code ${statusCode}). Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECTS} in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
        connectToWhatsApp();
      } else if (reconnectAttempts >= MAX_RECONNECTS) {
        console.error(`[WhatsApp] ✗ Failed to reconnect after ${MAX_RECONNECTS} attempts. Email & SMS reminders are unaffected. Restart this service manually.`);
        isConnected = false;
      }
    }
  });
}

// ─── Express HTTP server ──────────────────────────────────────────────────────
const app = express();
app.use(express.json());

/**
 * GET /health
 * Quick health check for Railway / uptime monitors.
 */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    whatsappEnabled:  WHATSAPP_ENABLED,
    connected:        isConnected,
    dailySendCount,
    dailyLimit:       DAILY_LIMIT,
  });
});

/**
 * POST /send
 * Body: { phone: "919876543210", message: "Your appointment is tomorrow..." }
 * phone should be in E.164 format (with country code, no +).
 * The reminder-service will call this endpoint.
 */
app.post('/send', async (req, res) => {
  if (!WHATSAPP_ENABLED) {
    return res.json({ ok: false, reason: 'WHATSAPP_ENABLED is false' });
  }

  if (!isConnected || !sock) {
    console.error('[WhatsApp] /send called but socket is not connected.');
    return res.status(503).json({ ok: false, reason: 'WhatsApp socket not connected' });
  }

  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ ok: false, reason: 'phone and message are required' });
  }

  // Normalise phone → strip non-digits, ensure country code
  const normalised = phone.replace(/\D/g, '');
  if (normalised.length < 10) {
    return res.status(400).json({ ok: false, reason: `Invalid phone number: ${phone}` });
  }

  // Check daily limit
  if (!checkAndIncrementDailyCount()) {
    console.warn(`[WhatsApp] Daily send limit of ${DAILY_LIMIT} reached. Message to ${normalised} not sent.`);
    return res.status(429).json({ ok: false, reason: 'Daily send limit reached', limit: DAILY_LIMIT });
  }

  const jid = `${normalised}@s.whatsapp.net`;

  try {
    // Jitter delay before each send to avoid spam detection
    await jitterDelay();

    await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] ✓ Message sent to ${normalised} (daily count: ${dailySendCount}/${DAILY_LIMIT})`);
    return res.json({ ok: true, phone: normalised, dailySendCount });
  } catch (err) {
    console.error(`[WhatsApp] ✗ Failed to send to ${normalised}:`, err.message);
    dailySendCount = Math.max(0, dailySendCount - 1); // roll back count on failure
    return res.status(500).json({ ok: false, reason: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WhatsApp] HTTP server listening on port ${PORT}`);
  if (WHATSAPP_ENABLED) {
    console.log('[WhatsApp] Initialising Baileys connection...');
    connectToWhatsApp().catch((err) => {
      console.error('[WhatsApp] Fatal error during initialisation:', err);
    });
  } else {
    console.log('[WhatsApp] WHATSAPP_ENABLED=false — Baileys not started. /send will return disabled.');
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[WhatsApp] SIGTERM received — shutting down gracefully...');
  if (sock) {
    try { await sock.logout(); } catch (_) { /* ignore */ }
  }
  process.exit(0);
});
