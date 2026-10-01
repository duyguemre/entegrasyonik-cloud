// ADR-0035 Karar 2 / MCP_UI_CONTRACT S1: onay ekranindaki kullanici duzeyi KVKK bilgilendirmesi (surumlu, duz metin; markdown/HTML degil).
// Tenant duzeyi onay metni (`mcp-v1`, MCP-2) AYRIDIR. Metin degisince surum artar.
export const CONSENT_NOTICE_VERSION = 'mcp-consent-v1';
export const CONSENT_NOTICE_TEXT =
    'Bu uygulamaya verdiğiniz kapsam içindeki mağaza verileri (siparişler, ürünler, stok, raporlar), seçtiğiniz yapay zekâ sağlayıcısına iletilir. ' +
    'Ad, adres ve telefon gibi kişisel veriler maskelenir. Bağlantıyı istediğiniz zaman Hesap > Bağlı uygulamalar ekranından kesebilirsiniz.';
