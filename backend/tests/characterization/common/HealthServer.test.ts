/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 3/5): `worker` rolü için minimal, bağımsız `/health` `/ready` HTTP sunucusu.
 * Kaynak: backend/src/health/HealthServer.ts
 * Gerçek ağ YOK — yalnızca loopback (127.0.0.1, ephemeral port) üzerinde in-process bir HTTP sunucusu; DB/Redis
 * gerçek bağlantı YOK (`checkReadiness` mock'lanır).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import http from 'http';

jest.mock('@health/HealthCheck', () => ({ checkReadiness: jest.fn() }));
jest.mock('@services/redis', () => ({ RedisService: { getInstance: jest.fn(() => ({ ping: jest.fn() })) } }));

import { startHealthOnlyServer } from '@health/HealthServer';
import { checkReadiness } from '@health/HealthCheck';

let handle: { server: http.Server; close: () => Promise<void> } | undefined;

function get(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

beforeEach(() => {
  (checkReadiness as jest.Mock<any>).mockReset();
});

afterEach(async () => {
  if (handle) { await handle.close(); handle = undefined; }
});

describe('startHealthOnlyServer', () => {
  it('[YENİ DAVRANIŞ] /health her zaman 200 {status:"ok"} döner', async () => {
    handle = startHealthOnlyServer(0, '127.0.0.1', 'worker');
    await new Promise((r) => handle!.server.once('listening', r));
    const port = (handle.server.address() as any).port;
    const res = await get(port, '/health');
    expect(res).toEqual({ status: 200, body: { status: 'ok' } });
  });

  it('[YENİ DAVRANIŞ] /ready checkReadiness("worker", ...) sonucuna göre 200/503 döner', async () => {
    (checkReadiness as jest.Mock<any>).mockResolvedValue({ ready: true, mongo: 'ok', redis: 'ok' });
    handle = startHealthOnlyServer(0, '127.0.0.1', 'worker');
    await new Promise((r) => handle!.server.once('listening', r));
    const port = (handle.server.address() as any).port;
    const res = await get(port, '/ready');
    expect(res).toEqual({ status: 200, body: { ready: true, mongo: 'ok', redis: 'ok' } });
    expect(checkReadiness).toHaveBeenCalledWith('worker', expect.any(Function));

    (checkReadiness as jest.Mock<any>).mockResolvedValue({ ready: false, mongo: 'fail', redis: 'fail' });
    const res2 = await get(port, '/ready');
    expect(res2.status).toBe(503);
  });

  it('[YENİ DAVRANIŞ] tanımsız yol/metot 404 döner (auth/CORS/statik dosya sunumu İÇERMEZ)', async () => {
    handle = startHealthOnlyServer(0, '127.0.0.1', 'all');
    await new Promise((r) => handle!.server.once('listening', r));
    const port = (handle.server.address() as any).port;
    const res = await get(port, '/anything-else');
    expect(res.status).toBe(404);
  });

  it('[YENİ DAVRANIŞ] checkReadiness reddederse (beklenmeyen hata) 503 ile fail-closed döner, sunucu çökmez', async () => {
    (checkReadiness as jest.Mock<any>).mockRejectedValue(new Error('boom'));
    handle = startHealthOnlyServer(0, '127.0.0.1', 'worker');
    await new Promise((r) => handle!.server.once('listening', r));
    const port = (handle.server.address() as any).port;
    const res = await get(port, '/ready');
    expect(res.status).toBe(503);
  });
});
