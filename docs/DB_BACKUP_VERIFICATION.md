# DB Yedek Doğrulama ve Restore Tatbikatı Kaydı

**Tarih:** 2026-09-26 · **Kaynak dump:** `backup/atlas/20260926/` · **Hedef:** kullanıcının local MongoDB'si (`127.0.0.1:27017`)

## Yöntem
Atlas'a bu doğrulamada bağlanılmadı. Dump dosyalarındaki (`*.bson`) doküman sayısı, local Mongo'daki koleksiyon `countDocuments()` değeriyle karşılaştırıldı. Yalnızca izinli 7 DB'ye dokunuldu (bkz. `CLAUDE.md` kural 2). Betik çıktısında kimlik bilgisi/URL yazdırılmadı.

## Sonuç: 168 koleksiyon — doküman sayıları birebir eşit, eksik koleksiyon yok

| DB | Dump koleksiyon | Local koleksiyon | Not |
|---|---|---|---|
| `entegrasyonik` | 26 | 26 | |
| `entegrasyonik_client` | 14 | 14 | |
| `entegrasyonik_client_2` | 30 | 31 | fazla: `Statistics` |
| `entegrasyonik_client_24` | 30 | 31 | fazla: `statistics` |
| `entegrasyonik_client_25` | 27 | 27 | |
| `entegrasyonikClient_1` | 26 | 26 | |
| `entegrasyonikDB` | 15 | 15 | uygulama DB'si |

Fazladan 2 koleksiyon, henüz commit'lenmemiş `backend/src/services/statistics` kodunun local çalışmasından gelmektedir (yedek sonrası oluşmuş); veri kaybı değil.

## Restore sonrası yapılan tek veri değişikliği
`entegrasyonikDB.Clients` (1 doküman, `order=1`): `dbConfig` alanı Atlas'ı gösteriyordu; tenant bağlantıları `.env`'den değil bu alandan geldiği için, local dev'in yanlışlıkla Atlas'a bağlanmaması amacıyla `dbConfig.url/user/password` local'e çevrildi (`dbname` değişmedi). Geri alma: `backup/atlas/20260926/entegrasyonikDB/Clients.bson` içinden orijinal doküman geri yüklenir.

Yönlendirme sonrası doğrulama (uygulamanın kullandığı bağlantı yoluyla): uygulama DB'si `entegrasyonikDB` (1 client) ve tenant DB'si `entegrasyonikClient_1` (26 koleksiyon) `127.0.0.1` üzerinden bağlandı.

## Bilinen eksikler
- `backup/local/` boş: restore öncesi local Mongo'nun ayrı yedeği alınmamıştı. Aynı isimli DB'ler local'de daha önce varsa üzerine yazılmış olabilir — doğrulanamadı.
- Dump'ın Atlas'la birebir örtüştüğü (Atlas'a karşı sayım) bu kayıtta doğrulanmadı.
- Local kopya gerçek müşteri verisi içerir; maskeleme BACKLOG'dadır.

---

## 2026-09-30 yerel yedek (`backup/local/20260930-1920/`)

Yerel MongoDB'nin (izinli 7 DB, 191 koleksiyon) DB-göçleri/mock-temizliği öncesi alınan yedeği; `counts.txt` ile canlı yerel sayılar (`countDocuments`, salt okuma) karşılaştırıldı. Değer/sır yok, yalnız sayılar.

Sonuç: 191 koleksiyonun 187'si birebir eşit. Yedekten sonra çalışan (kullanıcının) backend'in yazdığı 4 koleksiyonda küçük artış (kabul; yalnız uygulama günlük/metrik koleksiyonları):

| Koleksiyon | Yedek | Canlı |
|---|---|---|
| entegrasyonikDB.DeadLetterQueue | 9928 | 9932 |
| entegrasyonikDB.IntegrationOperationLogs | 25253 | 25277 |
| entegrasyonikDB.JobRuns | 1382 | 1383 |
| entegrasyonikDB.MetricRollups | 688 | 696 |

Ayrıntılı doğrulama kaydı (göç çalıştırıcısı `--backup-ref` için): `docs/DB_BACKUP_VERIFICATION_LOCAL_20260930.md`.
