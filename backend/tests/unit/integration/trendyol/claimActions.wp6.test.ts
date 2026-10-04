// [eslesme-fiyat WP6, Ek E F-P1-10] Trendyol iade onay/red: hata `{success:false}` değil IntegrationError (UNKNOWN_OUTCOME/ret ayrımı).
import { describe, it, expect, jest } from '@jest/globals';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';

const params = { clientId: 1, integrationSettings: { settings: { SELLERID: '9' }, urls: {
  claimApproveUrl: 'https://x/<SELLERID>/claims/<CLAIMID>/items/approve',
  claimRejectUrl: 'https://x/<SELLERID>/claims/<CLAIMID>/issue?claimIssueReasonId=<CLAIMISSUEREASONID>&claimItemIdList=<CLAIMITEMIDLIST>&description=<DESCRIPTION>',
} } };
const httpErr = (status?: number, code?: string) => Object.assign(new Error('boom'), status ? { response: { status, data: { message: 'bad' } } } : { code });

describe('Trendyol iade eylemleri (WP6)', () => {
  it('400 → IntegrationError (ret); zaman aşımı → UNKNOWN_OUTCOME (yazma, idempotent değil)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const put = jest.fn(async () => { throw httpErr(400); });
    const post = jest.fn(async () => { throw httpErr(undefined, 'ECONNABORTED'); });
    const c = new ClaimConnector({ put, post } as any, params);
    await expect(c.approveClaim('C1', { claimItemIdList: ['L1'] })).rejects.toMatchObject({ name: 'IntegrationError', retryable: false });
    await expect(c.rejectClaim('C1', { reasonId: '1', claimItemIdList: ['L1'], description: 'x' } as any)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
  });
  it('başarıda IPlatformResponse aynen', async () => {
    const put = jest.fn(async () => ({ status: 200, data: {} }));
    const c = new ClaimConnector({ put } as any, params);
    await expect(c.approveClaim('C1', { claimItemIdList: ['L1'] })).resolves.toMatchObject({ success: true, platformId: 'C1' });
  });
});
