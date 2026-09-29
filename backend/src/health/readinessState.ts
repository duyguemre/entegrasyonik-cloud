/**
 * ADR-0006 Karar 5/6: kapanış (SIGTERM/SIGINT) başladığı anda `/ready` 503 dönmelidir (yeni istek/iş almayı bırak),
 * `/health` ise süreç ayaktaysa (event loop yanıt veriyorsa) hep 200'dür (liveness — bağımlılık kontrolü YOK).
 * Süreç boyunca tek paylaşımlı bayrak; DB/Redis'e bağımlı DEĞİL.
 */
let shuttingDown = false;

/** Graceful shutdown adım 1: `/ready`'i hemen 503'e çevirir (server.close()'dan ÖNCE çağrılmalı). */
export function beginShutdown(): void {
    shuttingDown = true;
}

export function isShuttingDown(): boolean {
    return shuttingDown;
}

/** Yalnızca testler için: bayrağı sıfırlar (süreç yeniden başlatılmadıkça normalde GEREKMEZ). */
export function resetShutdownStateForTests(): void {
    shuttingDown = false;
}
