# Bulut önyüz sözleşme kopyaları (2026-09-30)

Backend `faz4-integration` dalındaki sözleşmelerin salt-okunur KOPYALARI. Bulut önyüz görevleri
(backend kodu bu kopyada eski olduğu için) sözleşmeyi buradan okur. Asıl kaynak backend dalıdır;
faz4 → faz3 birleşiminden sonra bu klasör silinir.

- NOTIFICATION_PLAN.md — bildirim sistemi (ADR-0029), önyüz bölümü F-N1..
- API_ACCOUNT_LIFECYCLE.md — davet / askı / sahiplik devri / reauth (§6-9)
- ERROR_CODES.md — hata kodları

## NB6 — gerçekleşen SSE sözleşmesi (plandan farkları bu bölüm geçerlidir)
- `GET /api/notifications/stream`, çerez oturumu; `new EventSource(url, { withCredentials: true })`.
- Açılış: `retry: 5000`, `: connected`; 25 sn'de `: ping`.
- `event: notification` — `id:` monoton; `data: {id, category, severity, unreadCount}` (başlık/metin YOK;
  `unreadCount` null olabilir → RPC ile say). Liste açıksa yenileri `NotificationService/get` ile çek.
- `event: resync` (data `{}`) — tam tazele (planda `sync` yazıyor; gerçek ad `resync`).
- `event: shutdown` / `event: reconnect` — tarayıcı otomatik yeniden bağlanır (normal).
- `event: unauthorized` — akışı kapat, yeniden bağlanma; oturum akışına bırak.
- HTTP: 401 kimliksiz, 403 tenant yok/Origin, 503 + Retry-After (tavan/kapalı) → polling'e düş.
- Sekme görünmezken bağlantı korunabilir; kullanıcı başına 5 bağlantı tavanı var (çok sekme).
