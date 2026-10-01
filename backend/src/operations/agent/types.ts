// Sohbet araci ortak tipleri (dongusel bagimlilik olmasin diye AgentBroker ve tools.ts'in ORTAK tarafi).
import type { AuthzActor } from '@platform/core/authz/can';
import type { InvokeContext } from '../../capabilities/invoke';

/** Arac katmani icin oturum (HTTP katmaninda kurulur: sunucuda cozulmus kimlik; govdeden ASLA gelmez). Yoksa arac listesi bostur (BR-1 davranisi). */
export interface AgentSession {
    actor: AuthzActor;
    invoke: InvokeContext;
}

export interface AgentCtx {
    tid: number;
    userId: string;
    canConfigure: boolean;
    canConsent: boolean;
    /** LIVE_READONLY / impersonation: yazma onerilmez (rozet). */
    readOnly: boolean;
    session?: AgentSession;
    /** Denetim/metrik yuzeyi (BR-4 `backoffice_chat`, MCP-3 `mcp`); varsayilan `chat`. */
    surface?: 'chat' | 'backoffice_chat' | 'mcp';
    /** MCP-4: etkin kapsamda `mcp:write` var (token kapsami ∩ tenant tavani). Yok/false: MCP'de yalniz okuma araclari listelenir. */
    mcpWrite?: boolean;
}
