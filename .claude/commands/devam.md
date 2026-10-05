---
description: Eşleme/fiyat işini buluttan çekip DURUM.md'deki sıradaki yerel pencereyle devam ettirir
---
Yerel oturumdasın (proje kökü ENTEGRASYONIK_FACTORY). Sırayla:

1. Buluttan çek: `scripts/cloud-sync.sh pull feature/eslesme-fiyat-yeniden-yapilandirma` (bulut deposu geçmişsiz kopyadır, `git merge` ile birleştirilmez; bkz. docs/CLOUD_BRIEFS.md adım 4). Yerelde commit'lenmemiş değişiklik varsa çekmeden önce DUR ve sor. Ardından `feature/eslesme-fiyat-yeniden-yapilandirma` dalına geç.
2. `git config core.hooksPath scripts/githooks` çalıştır. `git config user.email` yasaklı adres (K85, `scripts/githooks/banned-email.sh` özet karşılaştırması) ise DUR ve kullanıcıya `git config --global user.email` değiştirmesini söyle.
3. `docs/eslesme-fiyat/DURUM.md`'yi oku; "Yerel pencere planı" tablosunda durumu "sıradaki" olan İLK satırı yap — yalnız onu. Tablodaki kurallar (yedek, onay, Fable hatırlatma, K85) bağlayıcıdır.
4. Bitince: satırı TAMAM, sonrakini "sıradaki" yap, DURUM.md'yi güncelle, dosyaları yol yol ekleyip commit et, 5 satırlık özet yaz, "Lx bitti" de ve DUR. Bir sonraki pencereye geçme; kullanıcı oturumu sıfırlayıp yine `/devam` yazar.
