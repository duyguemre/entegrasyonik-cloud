# Backoffice review — 1. tur geri bildirim (kullanıcı, 2026-10-01)

Kullanıcı (platform yöneticisi gözüyle): bir ton bilgi vermek yerine beni YÖNLENDİRSİN. Karar: USER_DECISIONS K51. Konsol kimliği: frontend/backoffice/docs/elev/CONSOLE_IDENTITY.md.

## BO1-DASH — Genel bakış (dashboard) şu sorulara sırayla cevap vermeli
1. **Sistemde müdahale edeceğim bir şey var mı?** (kritik/uyarı durumları: kuyruk birikimi, başarısız işler, devre kesici açık, entegrasyon API hata oranı, altyapı, alarmlar — öncelik sıralı, her birinde "ne oldu, ne kadar ciddi, ne yapmalıyım" + doğrudan eylem bağlantısı)
2. **Sistem kullanımı büyük resimde nasıl?** (trend özetleri, kapasite, sağlık — sakin, okunur)
3. **Müşterilerimle ilgili müdahale edeceğim bir şey var mı?** (sorun yaşayan tenant'lar: entegrasyon hatası, senkron gecikmesi, deneme bitiyor/askıda, ödeme sorunu, silme talebi, destek talebi — öncelik sıralı + eylem)
4. **Genel kullanım durumları nasıl?** (aktif müşteri, abonelik/gelir özeti, kullanım)
5. Her bulgudan ilgili AKSİYONA tek tıkla ulaşım (ilgili ekran + süzgeç önceden uygulanmış, ya da doğrudan güvenli eylem).

## BO1-PAGES — Tüm sayfalar aynı mantık (hiyerarşi)
6. Her sayfanın üstünde: **Mevcut durumdan ne anlamalıyım?** (tek cümlelik durum özeti + sağlık rozeti) → **Müdahale etmeli miyim?** (dikkat gerektiren öğeler öne) → **Nasıl müdahale ederim / ne yapabilirim?** (önerilen eylemler, güvenli eylem akışı step-up+gerekçe) → **Ayrıntılar** (tablolar, loglar, geçmiş) aşağıda.
7. Ortak desen: `frontend/backoffice/docs/BO_UI_PATTERNS.md`'ye "Durum → Karar → Eylem → Ayrıntı" bölümü; ortak bileşenler (durum başlığı, dikkat listesi, önerilen eylem kartı).

## BO1-PLANNED — Planlanmış işler bu turda
8. `frontend/backoffice/docs/elev/NEXT_TASKS.md` A bölümü (NT-01..NT-10) bulutta; B bölümü (BE-01..BE-06) yerel backend.
