# Önyüz — onay bekleyen öneriler (K48)

Akış / davranış / bilgi mimarisi değiştiren veya uç durum içeren öneriler. Kullanıcı onayı gelene kadar uygulanmaz;
karar verilince `docs/adr/USER_DECISIONS.md`'ye satır eklenir ve buradaki madde "KARAR: …" ile kapatılır.

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-MCP-1 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ekran adları.** Bulut brifi S3/S4 için "Bağlı uygulamalar / **Otopilot bağlantıları** (ad ürün sabitinden)" diyor; `MCP_UI_CONTRACT.md` §1 ise S3 = "Bağlı uygulamalar", S4 = "**Yapay zekâ bağlantısı**". Uygulanan: sözleşme adları (kanonik). Öneri: adları sözleşmedeki gibi bırakmak — MCP bağlantısı kullanıcının **kendi** yapay zekâ uygulamasıdır (K37b), Otopilot ise uygulama içi ajandır (K39); "Otopilot bağlantıları" iki ürünü karıştırır. Otopilot adı istenirse tek değişiklik `src/components/mcp/mcpMessages.ts` (`menu.*`, `mcp.connections.title`, `mcp.settings.title`) + `CHAT_PRODUCT` sabiti (yalnız `cloud/chat-fe` dalında; ana dalda yok). | Bilgi mimarisi / ürün adlandırması; brif ile sözleşme çelişiyor (CLAUDE.md kural 8 — raporlandı) | BEKLİYOR |
| P-MCP-2 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ortak onay kartı.** `@entegrasyonik/chat` (`PartConfirm`) bu dalın tabanında yok (`cloud/chat-fe` birleşmedi). İşlem onayı önizlemesi (`src/components/mcp/McpActionPreview.vue`) sözleşmeye göre, sohbet onay kartıyla aynı görsel ritimde (ikon karosu + başlık + işlem çipi, pazaryeri notu, etkilenen kayıtlar) yazıldı. Öneri: sohbet paketi ana dala girince önizleme gövdesi pakete taşınsın; sohbet kartı ve S2 aynı bileşeni kullansın. | Paketler arası bileşen taşıma (iki bulut işini etkiler) | BEKLİYOR |
