// ADR-0019 §4.3 / ADR-0034 BR-2: yetenek kimligi -> arac adi (LLM yuzeyleri: sohbet + MCP AYNI fonksiyonu kullanir).
// `orders.list` -> `orders_list`: sag saglayici regex'i (`^[a-zA-Z0-9_-]{1,128}$`) nokta kabul etmez; kimlikteki `.` -> `_`.
import type { CapabilityId } from '../types';

export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;

/** Deterministik arac adi. Gecerlilik/tekillik `findRegistryInvariantViolations` ile dogrulanir (TOOL_NAME_INVALID/COLLISION). */
export function toolNameOf(id: CapabilityId | string): string {
    return id.replace(/\./g, '_');
}
