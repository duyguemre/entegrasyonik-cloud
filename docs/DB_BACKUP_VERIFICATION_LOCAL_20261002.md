# DB Yedek Doğrulama Kaydı — yerel yedek 2026-10-02

**Tarih:** 2026-10-02 · **Kaynak dump:** `backup/local/20261002-1446/` · **Hedef:** kullanıcının local MongoDB'si (`127.0.0.1`)

**Neden:** Backend'i en son koda (`faz3-arayuz`) geçirmeden önce (açılışta `auditIpMask` işi `AuditLogs`'a yazar; bekleyen göçler 0021–0024) — CLAUDE.md kural 3.

**Nasıl alındı:** Kullanıcı `node scripts/backup-local.cjs` çalıştırdı (mongodump kurulu değil; betik salt okuma, yalnız izinli 7 DB, bağlantı `backend/.env` → `LOCAL_DB_URL`, yerel değilse durur).

**Doğrulama (2026-10-02, otomatik sayım):**
- 7 DB, 213 koleksiyon; 213 `.bson` + 213 `.metadata.json` dosyası.
- Her `.bson` dosyasındaki BSON belge sayısı `counts.txt` ile birebir (0 uyuşmazlık); toplam **114.593** belge.
- Önceki yedekle (`20261001-1126`) fark yalnız işletim kaynaklı artışlar (`JobRuns`, `IntegrationOperationLogs`, `DeadLetterQueue`, `AuditLogs` vb.).

**Düzeltilen sorun:** İlk deneme (`20261002-1444`, silindi) Windows'un büyük/küçük harf duyarsız dosya sistemi yüzünden `entegrasyonik_client_2` ve `entegrasyonik_client_24` içindeki `Statistics`/`statistics` çiftlerini aynı dosyaya yazıp birini eziyordu (`entegrasyonik_client_2.statistics` 1 belge kayboluyordu; `20261001-1126` yedeğinde de aynı kusur var). `scripts/backup-local.cjs` artık çakışan ikinci adı `<ad>.__case<n>.bson` olarak yazar; gerçek ad `metadata.json` → `collectionName`'de. Geri yüklemede bu dosyalar `mongorestore --nsFrom/--nsTo` ile asıl ada çevrilir.
