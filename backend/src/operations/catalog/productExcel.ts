import ExcelJS from 'exceljs';

/**
 * ADR-0024 Dalga 3 (P3-CAT): ürün listesi dışa aktarma satırlarından base64 xlsx üretir (ProductService.exportExcel'den taşındı).
 * [C18b] xlsx (bakımsız, açıklı) -> exceljs. Yalnız YAZMA; değerler düz veri (formül nesnesi üretilmez: '=...' metin kalır).
 */
export async function buildProductExcelBase64(data: Array<Record<string, unknown>>): Promise<string> {
    const headers: string[] = [];
    for (const row of data) for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ürünler');
    worksheet.addRow(headers);
    for (const row of data) worksheet.addRow(headers.map((h) => row[h] ?? null));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer).toString('base64');
}
