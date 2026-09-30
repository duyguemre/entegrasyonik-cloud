// ADR-0024 P0-LIFE / ADR-0006 Karar 3: APP_ROLE cozumu ve rol kapilari (tek yer).
// Gecersiz APP_ROLE -> uyari + "all" (eski `entegrasyonik.ts` `resolveAppRole` davranisi BIREBIR).
// Varsayilan rol `all`: mevcut davranis DEGISMEZ. Yeni bir rol (ornegin ayri `scheduler` pod'u) eklemek `AppRole`
// tipi (src/health) + `config/env.ts` APP_ROLES icin ayri karar/is olarak birakildi.
import type { AppRole } from '@health/HealthCheck';
import { eventLog } from '@platform/core/logger';

const VALID_ROLES: AppRole[] = ['web', 'worker', 'all'];

/** `APP_ROLE` (web|worker|all, varsayilan all). Gecersiz deger -> uyari + "all". */
export function resolveAppRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const raw = (env.APP_ROLE || '').trim().toLowerCase();
  if (!raw) return 'all';
  if ((VALID_ROLES as string[]).includes(raw)) return raw as AppRole;
  eventLog('api', 'bootstrap.roles').warn('APP_ROLE_INVALID', `[System] Geçersiz APP_ROLE="${env.APP_ROLE}" (izinli: web|worker|all); "all" kullanılıyor.`);
  return 'all';
}

/** Tam Express API (+ /health, /ready) bu rolde calisir mi. */
export const runsWeb = (role: AppRole): boolean => role === 'web' || role === 'all';

/** IntegrationEngine, BullMQ worker ve arka plan zamanlayicilari bu rolde calisir mi. */
export const runsWorker = (role: AppRole): boolean => role === 'worker' || role === 'all';
