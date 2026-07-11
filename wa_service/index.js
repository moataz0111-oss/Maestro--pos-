/**
 * خدمة الواتساب المجاني لإرسال رموز التحقق (Baileys — واتساب متعدد الأجهزة).
 * تتصل بواتساب عبر ربط جهاز (QR)، وتُرسل رسائل نصية مجاناً من رقم المالك.
 * يستدعيها الباك إند (FastAPI) عبر HTTP محلي محميّ بترويسة سرية.
 */
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const PORT = process.env.WA_SERVICE_PORT || 3002;
const HOST = process.env.WA_SERVICE_HOST || '127.0.0.1';
const AUTH_TOKEN = process.env.WA_SERVICE_TOKEN || '';
const AUTH_DIR = process.env.WA_AUTH_DIR || '/app/wa_service/auth';

const logger = pino({ level: 'warn' });

let sock = null;
let connected = false;
let currentQR = null; // dataURL
let lastError = null;
let starting = false;
let reconnectDelay = 5000;  // backoff exponential (max 60s)
let reconnectTimer = null;

function resetAuthDir() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    for (const f of fs.readdirSync(AUTH_DIR)) {
      try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch (_) {}
    }
    console.log('WA auth dir reset for fresh pairing');
  } catch (e) { console.error('resetAuthDir error:', e.message); }
}

async function tearDownSock() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { if (sock) { sock.end && sock.end(undefined); sock.ev && sock.ev.removeAllListeners && sock.ev.removeAllListeners(); } } catch (_) {}
  sock = null;
  connected = false;
  currentQR = null;
}

async function startSock() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Maestro EGP', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          currentQR = await QRCode.toDataURL(qr);
          lastError = null;
          reconnectDelay = 5000;  // Reset on successful QR
        } catch (e) { currentQR = null; }
      }
      if (connection === 'open') {
        connected = true;
        currentQR = null;
        lastError = null;
        reconnectDelay = 5000;
        console.log('WA connected ✅');
      }
      if (connection === 'close') {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const msg = lastDisconnect?.error?.message || null;
        // 408 = timeout بلا مسح — طبيعي، لا نعرضه كخطأ للمستخدم
        if (code !== 408 && msg !== 'Connection Closed') {
          lastError = msg;
        }
        console.log('WA closed. code=', code, 'msg=', msg);
        if (code === DisconnectReason.loggedOut) {
          currentQR = null;
          lastError = 'تم تسجيل الخروج — أعد ربط الجهاز';
        } else {
          starting = false;
          // exponential backoff: 5s → 10s → 20s → 40s → 60s (capped)
          const delay = reconnectDelay;
          reconnectDelay = Math.min(reconnectDelay * 2, 60000);
          reconnectTimer = setTimeout(() => startSock().catch(() => {}), delay);
          return;
        }
      }
    });
  } catch (e) {
    lastError = e.message;
    console.error('startSock error:', e.message);
  } finally {
    starting = false;
  }
}

function auth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  if (req.headers['x-wa-token'] !== AUTH_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

const app = express();
app.use(express.json());

app.get('/status', auth, (req, res) => {
  res.json({ connected, qr: currentQR, error: lastError });
});

app.post('/send', auth, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) return res.status(400).json({ ok: false, error: 'phone_and_message_required' });
    if (!connected || !sock) return res.status(503).json({ ok: false, error: 'not_connected' });
    const digits = String(phone).replace(/[^0-9]/g, '');
    const jid = `${digits}@s.whatsapp.net`;
    // تحقق أن الرقم مسجّل في واتساب
    let exists = true;
    try {
      const r = await sock.onWhatsApp(jid);
      exists = Array.isArray(r) && r.length > 0 && r[0]?.exists;
    } catch (e) { /* تجاهل الفحص وحاول الإرسال */ }
    if (!exists) return res.status(422).json({ ok: false, error: 'not_on_whatsapp' });
    await sock.sendMessage(jid, { text: message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/logout', auth, async (req, res) => {
  try {
    if (sock) { try { await sock.logout(); } catch (e) {} }
    connected = false; currentQR = null; sock = null;
    // احذف ملفات الجلسة لإجبار QR جديد
    try {
      const fs = require('fs');
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (e) {}
    setTimeout(() => startSock().catch(() => {}), 1000);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/reconnect', auth, async (req, res) => {
  try { await startSock(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ربط برقم الهاتف (Pairing Code) — بديل مسح QR: المالك يُدخل رقمه ويحصل على رمز يُدخله في واتساب
app.post('/pair', auth, async (req, res) => {
  try {
    const { phone, force } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: 'phone_required' });
    if (connected) return res.status(400).json({ ok: false, error: 'already_connected' });
    const digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.length < 8) return res.status(400).json({ ok: false, error: 'invalid_phone' });
    
    // إعادة تهيئة كاملة (إن طلب المستخدم force أو الجلسة تالفة)
    if (force || (sock && sock.authState?.creds?.registered)) {
      await tearDownSock();
      resetAuthDir();
    }
    if (!sock) {
      await startSock();
      // انتظر حتى يستقر الـsocket ويسمح بطلب الرمز
      for (let i = 0; i < 15 && !sock?.authState; i++) {
        await new Promise((r) => setTimeout(r, 500));
      }
      // انتظر إضافي لضمان أن الـsocket جاهز لاستقبال طلب رمز الربط
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (sock?.authState?.creds?.registered) return res.status(400).json({ ok: false, error: 'already_registered' });
    
    // جرّب requestPairingCode مع إعادة محاولة عند فشل مؤقت
    let code = null, attempts = 0, lastErr = null;
    while (!code && attempts < 5) {
      try {
        code = await sock.requestPairingCode(digits);
      } catch (e) {
        lastErr = e;
        attempts++;
        console.log(`pair attempt ${attempts} failed:`, e.message);
        // إذا الـsocket مغلق، ابدأ واحدة جديدة
        if (e.message && (e.message.includes('Connection Closed') || e.message.includes('closed'))) {
          starting = false;
          await new Promise((r) => setTimeout(r, 1000));
          try { await startSock(); } catch (_) {}
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    if (!code) {
      const em = (lastErr && lastErr.message) ? lastErr.message : 'pairing_failed';
      // ترجم رسالة Baileys المزعجة لرسالة عربية أوضح
      const friendly = em.includes('Connection Closed')
        ? 'الخدمة تُعيد الاتصال — انتظر 15 ثانية ثم اضغط "توليد الرمز" مرة أخرى.'
        : em;
      return res.status(500).json({ ok: false, error: friendly });
    }
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;
    res.json({ ok: true, code: formatted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// تصفير كامل للجلسة — يُطهّر مجلد auth ويُعيد التشغيل
app.post('/reset', auth, async (req, res) => {
  try {
    await tearDownSock();
    resetAuthDir();
    lastError = null;
    reconnectDelay = 5000;
    startSock().catch(() => {});
    res.json({ ok: true, message: 'reset scheduled' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`WA service listening on ${HOST}:${PORT}`);
  startSock().catch((e) => console.error(e.message));
});
