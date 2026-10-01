// FE-CFG (ADR-0031) — `GET /api/public-config` sahte yanıtı (sözleşme docs/cloud-contracts/API_PUBLIC_CONFIG.md).
export function publicConfigFixture(settings: Record<string, unknown> = {}) {
  return {
    version: 7,
    env: { images: { productBaseUrl: 'https://cdn.example.test/products/', uploadMaxBytes: 10485760 } },
    settings: {
      'support.email': '',
      'support.phone': '',
      'announcement.enabled': false,
      'announcement.level': 'info',
      'announcement.text': '',
      'maintenance.enabled': false,
      'maintenance.message': '',
      'ui.listPageSize': 25,
      'ui.reportPollMs': 5000,
      ...settings,
    },
  }
}
