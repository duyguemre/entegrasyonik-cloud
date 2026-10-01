// ADR-0035 Karar 6: tenant MCP erisim ayari (`Settings.mcp.access`). MCP-1'de OKUYUCU sabit `off` (MCP-2 gelene dek karar 403 MCP_TENANT_OFF);
// MCP-2 `mcpSettings` gercek okuyucuyu `setMcpAccessReader` ile baglar. Testler okuyucuyu yardimciyla acar.
import type { McpAccess } from '@operations/mcp/mcpSettings';
export type { McpAccess };

export type McpAccessReader = (tid: number) => Promise<McpAccess>;

const DEFAULT_READER: McpAccessReader = async () => 'off';
let reader: McpAccessReader = DEFAULT_READER;

export function setMcpAccessReader(fn: McpAccessReader | undefined): void { reader = fn ?? DEFAULT_READER; }

export async function getMcpAccess(tid: number): Promise<McpAccess> { return reader(tid); }
