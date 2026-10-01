// MCP-4: bant disi onay servisinin URETIM baglantisi (tekil). `McpServer` (propose) ve `/api/mcp/approvals` rotasi (karar) AYNI servisi kullanir.
// Katman: `src/mcp` api'ye bagimlidir (OAuth calisma zamani/FamilyGate); `operations/mcp/mcpApprovals` api'yi BILMEZ (kancalar buradan enjekte edilir).
import { config } from '@config';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { NotificationService } from '@services/notification/NotificationService';
import { getAgentKv } from '@operations/agent/kv';
import { dbPreviewChanges, dbVerifyRefs } from '@operations/agent/refVerifiers';
import { createToolRuntime } from '@operations/agent/tools';
import { McpApprovals } from '@operations/mcp/mcpApprovals';
import { getOAuthRuntime } from '../api/oauth/routes';
import { getMcpAccess } from '../api/oauth/tenantAccess';

const isMaintenance = (): boolean => { try { return getPlatformSetting<boolean>('maintenance.enabled') === true; } catch { return false; } };

let singleton: McpApprovals | undefined;
export function getMcpApprovals(): McpApprovals {
    return (singleton ??= new McpApprovals({
        kv: getAgentKv,
        tools: createToolRuntime({ isMaintenance, verifyRefs: dbVerifyRefs, previewChanges: dbPreviewChanges }),
        isMaintenance,
        familyActive: (fam) => getOAuthRuntime().gate.isActive(fam),
        access: getMcpAccess,
        clientName: async (clientId) => (await getOAuthRuntime().store.getClient(clientId))?.clientName,
        // ADR-0029 katalogu; NOTIFY_V2 kapaliyken cephe/sink bir sey yazmaz. Onizleme/girdi bildirime girmez.
        notify: async (e) => {
            await NotificationService.notify(
                'SYSTEM_MCP_APPROVAL_PENDING', e.tid, { approvalId: e.approvalId, clientName: e.clientName, title: e.title },
                { recipients: { userIds: [e.userId] }, actorUserId: e.userId, module: 'mcp.approvals', idempotencyKey: `mcp-approval-pending-${e.approvalId}` },
            );
        },
        appOrigin: () => config.mcp.appOrigin ?? '',
    }));
}
