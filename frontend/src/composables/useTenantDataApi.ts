/**
 * frontend/src/composables/useTenantDataApi.ts
 *
 * ADR-0015 B4-P0 (N4 "Veri ve gizlilik / KVKK") — `docs/API_TENANT_SURFACE.md` §5:
 *  (1) `POST TenantDataService/exportTenantData` (owner) → `{ success, jobId, key, downloadToken, expiresAt }`
 *  (2) `GET tenant-data/export/download?token=<downloadToken>` (oturum çerezi ZORUNLU, owner, TEK kullanımlık) → zip.
 * Backend karşılığı (salt-okunur, grep): `backend/src/api/services/tenant-data-service.ts:70`,
 * `backend/src/api/ExportDownloadApiManager.ts:18` (`EXPORT_DOWNLOAD_ROUTE`).
 *
 * İndirme neden `fetch`/`blob` ile (düz `<a href>` DEĞİL): hata yanıtları (400/403/410/429) JSON'dur;
 * tarayıcı gezinmesiyle açılsa kullanıcı ham JSON sayfası görürdü. Blob yolu hatayı ekranda insan-okunur
 * mesaja çevirir. Token yalnızca bellekte tutulur (URL/geçmiş/depolama/log'a YAZILMAZ).
 */
import axios from 'axios'
import useRestApi from '@/composables/restapi'
import { apiBaseUrl } from '@/config/env'

export interface ExportResult {
  success: boolean
  jobId?: string
  downloadToken: string
  expiresAt?: string
}

export const EXPORT_FALLBACK_FILENAME = 'entegrasyonik-veri-disa-aktarma.zip'

/** `Content-Disposition: attachment; filename="…"` → güvenli dosya adı (yalnızca `.zip`, yol/ayırıcı YOK). Saf. */
export function exportFilenameFromDisposition(header: string | null | undefined): string {
  const match = /filename="?([^";]+)"?/i.exec(header ?? '')
  const name = match?.[1]?.trim() ?? ''
  return /^[A-Za-z0-9._-]{1,128}\.zip$/.test(name) ? name : EXPORT_FALLBACK_FILENAME
}

/** Dışa aktarma HAZIRLAMA hatası → i18n anahtarı (`privacyData.export.errors.*`). Saf. */
export function exportErrorKey(status: number | undefined): string {
  if (status === 403) return 'privacyData.export.errors.ownerOnly'
  if (status === 400) return 'privacyData.export.errors.noTenant'
  return 'privacyData.export.errors.generic'
}

/** İNDİRME hatası → i18n anahtarı (§5 "Hatalar" tablosu). Saf. */
export function downloadErrorKey(status: number | undefined): string {
  switch (status) {
    case 400: return 'privacyData.download.errors.invalid'
    case 403: return 'privacyData.export.errors.ownerOnly'
    case 410: return 'privacyData.download.errors.gone'
    case 429: return 'privacyData.download.errors.rateLimited'
    default: return 'privacyData.download.errors.generic'
  }
}

export function useTenantDataApi() {
  const restApi = useRestApi()

  return {
    exportTenantData: () => restApi.post('TenantDataService/exportTenantData', {}) as Promise<any>,

    /** Başarıda `{ ok: true, filename }` (dosya kaydetme tetiklenir), aksi `{ ok: false, status }`. */
    async downloadExport(downloadToken: string): Promise<{ ok: true; filename: string } | { ok: false; status?: number }> {
      try {
        const res = await axios.get(`${apiBaseUrl}tenant-data/export/download`, {
          params: { token: downloadToken },
          responseType: 'blob',
          withCredentials: true,
        })
        const filename = exportFilenameFromDisposition(res.headers?.['content-disposition'])
        const url = URL.createObjectURL(res.data as Blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.rel = 'noopener'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return { ok: true, filename }
      } catch (error: any) {
        return { ok: false, status: error?.response?.status }
      }
    },
  }
}
