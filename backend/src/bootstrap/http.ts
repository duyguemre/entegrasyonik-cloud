// ADR-0024 P0-LIFE: rol bazli HTTP yuzeyi. `web`/`all` -> tam Express API; `worker` -> yalniz /health,/ready.
import type { AppRole } from '@health/HealthCheck';
import { startHealthOnlyServer, MinimalHealthServer } from '@health/HealthServer';
import Webserver from './Webserver';
import { runsWeb } from './roles';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'bootstrap.http');

export interface HttpSurface {
  webserver?: { close(): Promise<void> };
  healthServer?: MinimalHealthServer;
}

/**
 * `surface` DISARIDAN verilir ve sunucu referansi `init()` CAGRILMADAN ONCE yazilir: baslatma yarida hata verirse
 * kapanis yine de acilmis/yarim acilmis sunucuyu kapatabilir (eski `activeApp.webserver` davranisi).
 */
export async function startHttp(role: AppRole, surface: HttpSurface): Promise<void> {
  if (runsWeb(role)) {
    const webserver = Webserver.getInstance();
    surface.webserver = webserver;
    await webserver.init(role);
    return;
  }
  const port = Number(process.env.SERVER_PORT) || 5001;
  const host = process.env.SERVER_HOST || '0.0.0.0';
  surface.healthServer = startHealthOnlyServer(port, host, role);
  log.info('HEALTH_SERVER_LISTENING', `[HealthServer] worker rolü: http://${host}:${port} (/health, /ready)`, { role, host, port });
}
