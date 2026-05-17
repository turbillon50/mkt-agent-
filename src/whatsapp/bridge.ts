import { config } from '../config';

function bridgeUrl(): string {
  const url = config.whatsapp.bridgeUrl;
  if (!url) throw new Error('WHATSAPP_BRIDGE_URL is not set.');
  return url.replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const secret = config.whatsapp.bridgeSecret;
  if (!secret) throw new Error('WHATSAPP_BRIDGE_SECRET is not set.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`,
  };
}

export interface BridgeStatus {
  connected: boolean;
  jid: string | null;
  hasQR: boolean;
  uptimeSec: number;
}

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const res = await fetch(`${bridgeUrl()}/status`, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`bridge /status failed: ${res.status}`);
  return res.json();
}

export async function getBridgeQR(): Promise<{ qr: string | null }> {
  const res = await fetch(`${bridgeUrl()}/qr`, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`bridge /qr failed: ${res.status}`);
  return res.json();
}

export async function sendViaBridge(to: string, message: string): Promise<{ id?: string }> {
  const res = await fetch(`${bridgeUrl()}/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`bridge /send failed: ${res.status} ${text}`);
  }
  return res.json();
}
