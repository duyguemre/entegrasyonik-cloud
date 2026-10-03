// [eslesme-fiyat WP1] ImportJobReport → issues[] (okumada türetilir; mevcut alanlar değişmez).
import { describe, it, expect, jest } from '@jest/globals';
import { getImportJobReport, importReportIssues } from '@operations/integrations/importJobs';

describe('importReportIssues', () => {
  it('eksik kategori (ürün sayısıyla), eksik özellik, yinelenen barkod', () => {
    const issues = importReportIssues({
      integrationCode: 'hepsiburada',
      missingCategories: ['60001'], missingCategoryProductCounts: [{ platformCategoryId: '60001', productCount: 12 }],
      missingAttributes: [{ category: 'Elbise', attributeName: 'Renk' }], duplicateBarcodes: ['B9'],
    });
    expect(issues.map((i) => i.code)).toEqual(['IMPORT_CATEGORY_UNMAPPED', 'IMPORT_ATTRIBUTE_UNMAPPED', 'IMPORT_DUPLICATE_BARCODE']);
    expect(issues[0].reason).toContain('12 ürün');
    expect(issues[1].reason).toContain('"Renk"');
    expect(issues[2]).toMatchObject({ barcode: 'B9', integrationCode: 'hepsiburada', severity: 'warning' });
  });

  it('boş/eksik rapor → []', () => {
    expect(importReportIssues(null)).toEqual([]);
    expect(importReportIssues({})).toEqual([]);
  });

  it('getImportJobReport mevcut alanları korur ve issues ekler; rapor yoksa data null', async () => {
    const report = { jobId: 'j', duplicateBarcodes: ['X'] };
    const staging: any = { findReport: jest.fn(async () => report) };
    const res = await getImportJobReport(staging, 'j');
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ jobId: 'j', duplicateBarcodes: ['X'] });
    expect(res.data.issues).toHaveLength(1);
    const none = await getImportJobReport({ findReport: jest.fn(async () => null) } as any, 'j');
    expect(none).toEqual({ success: false, data: null });
  });
});
