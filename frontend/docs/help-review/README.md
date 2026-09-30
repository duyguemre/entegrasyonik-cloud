# Yardım merkezi + bağlamsal yardım — inceleme görüntüleri

Linux Chromium, sentetik fixture (PII yok); görsel onay yerelde (Windows). Üretim:
`HELP_REVIEW=1 HELP_REVIEW_WIDTH=1440|390 npx playwright test e2e/specs/help-center.spec.ts -g inceleme --project=chromium-desktop`

| Dosya | İçerik |
|---|---|
| `01-merkez-ana*` | Yardım merkezi ana sayfası (arama, Başlarken, konular, SSS + destek) — `-tam` tam sayfa |
| `02-merkez-arama` | "sipariş gelmedi" araması, eşleşme vurgusu + gövde alıntısı |
| `03`–`06` | Makaleler: ilk entegrasyon, kanal rehberi (connect.ts ile eş), entegrasyon hata tablosu (A6a eşlemesi), kısayol tablosu (kayıt defteri) |
| `07-kategori-stok` | Kategori görünümü |
| `10`–`13` | **Bağlamsal örnekler:** Stok politikası "Sayfa hakkında" paneli; tampon (?) ipucu; Trendyol kimlik bilgisi (?) ipucu; boş sipariş listesinde "Nasıl başlanır?" |
| `20`–`23` | İlk giriş tur teklifi, tur adımları, üst bar Yardım menüsü (390'da hesap menüsü) |
