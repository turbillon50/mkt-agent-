import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import qrcodeLib from 'qrcode';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const PORT = Number(process.env.PORT ?? 3001);
const SECRET = process.env.WHATSAPP_BRIDGE_SECRET ?? '';
const WEBHOOK_URL = process.env.GOOSSIP_INBOUND_WEBHOOK ?? '';
const SESSION_DIR = process.env.SESSION_DIR ?? './sessions';

if (!SECRET) {
  log.error('WHATSAPP_BRIDGE_SECRET is required.');
  process.exit(1);
}

let sock: WASocket | null = null;
let latestQR: string | null = null;
let connected = false;
let connectedJid: string | null = null;
let startedAt = Date.now();
let reconnectTimer: NodeJS.Timeout | null = null;

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();
  log.info({ version }, 'starting baileys');

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, log as any),
    },
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: log as any,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQR = await qrcodeLib.toDataURL(qr).catch(() => null);
      log.info('new QR available at /qr');
    }
    if (connection === 'open') {
      connected = true;
      connectedJid = sock?.user?.id ?? null;
      latestQR = null;
      log.info({ jid: connectedJid }, 'WhatsApp connected');
    }
    if (connection === 'close') {
      connected = false;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log.warn({ statusCode, shouldReconnect }, 'WhatsApp disconnected');
      if (shouldReconnect) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connect().catch((err) => log.error({ err }, 'reconnect failed'));
        }, 3_000);
      } else {
        latestQR = null;
        connectedJid = null;
        log.error('session was logged out. Delete sessions/ and restart to re-pair.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid ?? '';
      if (jid.endsWith('@g.us')) continue;
      const from = jid.split('@')[0] ?? '';
      const body =
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        msg.message.imageMessage?.caption ??
        msg.message.videoMessage?.caption ??
        '';
      if (!body.trim()) continue;

      const payload = {
        messageId: msg.key.id ?? '',
        from,
        body: body.trim(),
        timestamp: typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000)),
        pushName: msg.pushName ?? undefined,
      };
      log.info({ from, len: payload.body.length }, 'inbound message');
      forwardInbound(payload).catch((err) => log.error({ err }, 'webhook forward failed'));
    }
  });
}

async function forwardInbound(payload: unknown): Promise<void> {
  if (!WEBHOOK_URL) {
    log.warn('GOOSSIP_INBOUND_WEBHOOK is empty — skipping forward.');
    return;
  }
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, 'webhook returned non-2xx');
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, connected, jid: connectedJid, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
});

app.get('/status', requireAuth, (_req, res) => {
  res.json({
    connected,
    jid: connectedJid,
    hasQR: latestQR !== null,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

app.get('/qr', requireAuth, (_req, res) => {
  res.json({ qr: latestQR });
});

app.post('/send', requireAuth, async (req, res) => {
  const to = String(req.body?.to ?? '').replace(/[^\d]/g, '');
  const message = String(req.body?.message ?? '');
  if (!to || !message) {
    res.status(400).json({ error: 'to and message required' });
    return;
  }
  if (!sock || !connected) {
    res.status(503).json({ error: 'whatsapp not connected' });
    return;
  }
  try {
    const jid = `${to}@s.whatsapp.net`;
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ id: sent?.key?.id ?? null, jid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send error';
    log.error({ err: msg }, 'send failed');
    res.status(500).json({ error: msg });
  }
});

app.post('/logout', requireAuth, async (_req, res) => {
  try {
    await sock?.logout();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'logout error' });
  }
});

app.listen(PORT, () => {
  log.info({ port: PORT }, 'baileys bridge listening');
  connect().catch((err) => log.error({ err }, 'initial connect failed'));
});

process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing');
  try {
    await sock?.end(undefined);
  } catch {}
  process.exit(0);
});
