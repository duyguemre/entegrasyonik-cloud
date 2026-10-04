// [eslesme-fiyat WP6-kalan, D-PZ-10/12/13, Ek E F-P2-3] Pazarama mesaj listesi Search POST, otherfinancials, ölü uçların kaldırılması.
// Ağ YOK: Service sahte.
import { describe, it, expect, jest } from '@jest/globals';
import { MessageService } from '@integration/modules/marketplace/pazarama/services/MessageService';
import { FinancialService } from '@integration/modules/marketplace/pazarama/services/FinancialService';
import { ClaimConnector } from '@integration/modules/marketplace/pazarama/api/ClaimConnector';
import { ClaimService } from '@integration/modules/marketplace/pazarama/services/ClaimService';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

const params = { clientId: 7, integrationSettings: { urls: {} } };

describe('Pazarama retrieveMessages (D-PZ-13, F-P2-3)', () => {
  it('liste kanıtlı Search POST\'undan (idempotent okuma); metni olan kayıtta detay GET yok', async () => {
    const service: any = {
      post: jest.fn(async (..._a: any[]) => ({ data: { data: { approvalAnswersByMerchantSearchs: [
        { questionId: 'q1', question: 'Beden?', questionStatus: 0 },
        { questionId: 'q2', questionStatus: 1 },
      ] } } })),
      get: jest.fn(async (..._a: any[]) => ({ data: { data: { questionId: 'q2', question: 'Renk?', answer: 'Mavi', questionStatus: 1 } } })),
    };
    const msgs = await new MessageService(params, service).retrieveMessages({ startDate: new Date('2026-10-01T00:00:00Z') });
    expect(service.post).toHaveBeenCalledWith('QuestionAnswer/getApprovalAnswersByMerchantSearch', { startDate: new Date('2026-10-01T00:00:00Z') }, { idempotent: true, operation: 'searchMessages' });
    expect(service.get).toHaveBeenCalledTimes(1);
    expect(String(service.get.mock.calls[0][0])).toContain('questionId=q2');
    expect(msgs.map(m => [m.externalMessageId, m.text, m.status])).toEqual([['q1', 'Beden?', 'WAITING_SELLER'], ['q2', 'Renk?', 'ANSWERED']]);
  });

  it('detay çağrıları en çok 5 eşzamanlı', async () => {
    let inFlight = 0; let peak = 0;
    const list = Array.from({ length: 12 }, (_, i) => ({ questionId: `q${i}`, questionStatus: 0 }));
    const service: any = {
      post: jest.fn(async () => ({ data: list })),
      get: jest.fn(async (url: any) => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 2));
        inFlight--;
        return { data: { questionId: String(url).split('=')[1], question: 'x', questionStatus: 0 } };
      }),
    };
    const msgs = await new MessageService(params, service).retrieveMessages();
    expect(msgs).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(5);
    expect(msgs[11].externalMessageId).toBe('q11');
  });
});

describe('Pazarama fetchFinancials + otherfinancials (D-PZ-12)', () => {
  const agreement = { data: { transactionList: [{ trxId: 'T1', orderId: 'O1', status: 'Satış', amount: 100, commissionAmount: 10, allowanceAmount: 90 }] } };
  const q = { startDate: new Date('2026-10-01'), endDate: new Date('2026-10-02') };

  it('ödeme mutabakatı + diğer finansal hareketler birleşir; tür/borç/alacak eşlemesi, kimliksiz satır boş kimlik', async () => {
    const service: any = {
      post: jest.fn(async (url: any) => url === 'order/paymentAgreement' ? { data: agreement } : { data: { data: [
        { id: 55, transactionType: 'DeductionInvoices', debt: 12.5, credit: 0, transactionDate: '2026-10-01T10:00:00Z', orderNumber: 'O1' },
        { Id: 56, TransactionType: 'PaymentOrder', Amount: 500, PaymentOrderId: 9 },
        { transactionType: 'CreditNote', amount: -3 },
      ] } }),
    };
    const rows = await new FinancialService(params, service).fetchFinancials(q);
    expect(service.post).toHaveBeenCalledWith('finance/getotherfinancials', { startDate: q.startDate, endDate: q.endDate }, { idempotent: true, operation: 'fetchOtherFinancials' });
    expect(rows.map(r => [r.externalId, r.transactionType, r.debt, r.credit, r.netAmount])).toEqual([
      ['T1', 'SALE', 10, 100, 90],
      ['other:55', 'DEDUCTION', 12.5, 0, -12.5],
      ['other:56', 'PAYOUT', 0, 500, 500],
      ['', 'CORRECTION', 3, 0, -3],
    ]);
    expect(rows[2].paymentOrderId).toBe('9');
  });

  it('uç yok (NOT_FOUND) → mutabakat korunur; geçici hata (UNAVAILABLE) fırlatılır', async () => {
    const err = (code: any) => new IntegrationError(code, 'x', { integrationCode: 'pazarama', operation: 'fetchOtherFinancials' } as any);
    const mk = (code: any): any => ({ post: jest.fn(async (url: any) => { if (url === 'order/paymentAgreement') return { data: agreement }; throw err(code); }) });
    expect((await new FinancialService(params, mk('NOT_FOUND')).fetchFinancials(q)).map(r => r.externalId)).toEqual(['T1']);
    await expect(new FinancialService(params, mk('UNAVAILABLE')).fetchFinancials(q)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('Pazarama sendToReview / sendRevision (D-PZ-10)', () => {
  it('ulaşılamayan, kanıtsız uçlar kaldırıldı', () => {
    expect((ClaimConnector.prototype as any).sendToReview).toBeUndefined();
    expect((ClaimConnector.prototype as any).sendRevision).toBeUndefined();
    expect((ClaimService.prototype as any).sendToReview).toBeUndefined();
  });
});
