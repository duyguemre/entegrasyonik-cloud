// ADR-0035 Karar 1 / MCP_PLAN MCP-3: desteklenen MCP spesifikasyon revizyonlari TEK yerde. Spesifikasyon surum farki YALNIZ `src/mcp/`'de kalir.
//
// Dogrulama (2026-10-01, resmi `@modelcontextprotocol/sdk@1.31.0` -- npm `latest`, MIT): SDK `SUPPORTED_PROTOCOL_VERSIONS` =
// [2025-11-25 (LATEST), 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07]; baslik yokken varsayilan 2025-03-26. 2026-07-28 revizyonu (durumsuz
// `initialize`siz akis, MRTR) SDK'nin kararli surumunde YOK -> desteklenmez; gelince bu liste + `negotiate` + testi birlikte genisler.
// `MCP-Protocol-Version` basligi yoksa spesifikasyon geriye uyum varsayimi 2025-03-26'dir (durumsuz: yalniz kabul edilir). Biz: en yeni kararli (2025-11-25) + bir onceki (2025-06-18) + baslik yokken spesifikasyonun varsayimi (2025-03-26). Toplu (batch) JSON-RPC
// 2025-06-18'de kaldirildi; 2025-03-26 istemcisi batch gonderirse acik hata alir (durumsuz, tek istek/yanit).
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
export type ProtocolVersion = typeof SUPPORTED_PROTOCOL_VERSIONS[number];

export const LATEST_PROTOCOL_VERSION: ProtocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];
export function isSupportedVersion(v: unknown): v is ProtocolVersion {
    return typeof v === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(v);
}

/** `initialize`: istemci surumu destekleniyorsa aynisi, aksi halde sunucunun en yenisi (istemci uyusmazsa baglantiyi keser). */
export function negotiateVersion(clientVersion: unknown): ProtocolVersion {
    return isSupportedVersion(clientVersion) ? clientVersion : LATEST_PROTOCOL_VERSION;
}
