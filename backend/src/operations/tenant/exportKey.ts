/**
 * KVKK dışa aktarma arşivi nesne anahtarı (TenantDataService.exportTenantData): `exports/<clientId>/export_<clientId>_<epochMs>.zip`.
 * İndirme/silme yolları anahtarı BU biçime ve İSTEK SAHİBİ tenant'a doğrulamadan R2'ye dokunmaz (yol gezinme/çapraz-tenant koruması).
 */
const EXPORT_KEY_RE = /^exports\/(\d{1,9})\/export_(\d{1,9})_(\d{10,16})\.zip$/;

/** Anahtar biçime uyuyorsa ve iki tenant numarası aynıysa tenant'ı (string) döner; aksi halde null. */
export function parseExportArchiveKey(key: unknown): { clientId: string; directory: string; fileName: string } | null {
    if (typeof key !== 'string' || key.length > 200) return null;
    const m = EXPORT_KEY_RE.exec(key);
    if (!m || m[1] !== m[2]) return null;
    const directory = `exports/${m[1]}`;
    return { clientId: m[1], directory, fileName: key.slice(directory.length + 1, -'.zip'.length) };
}
