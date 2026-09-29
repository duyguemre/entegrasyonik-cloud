/**
 * Oturum-bağlı durumun tek noktadan sıfırlanması (R9b / H-01, T-15).
 *
 * SORUN: çıkış sonrası aynı SPA oturumunda başka bir hesapla giriş yapılınca önceki kullanıcının
 * menüsü, açık sekmeleri ve katalog önbelleği bellekte kalıyordu (e2e: session-isolation.spec.ts).
 *
 * ÇÖZÜM: her oturum-bağlı store (ve `useUser` modül durumu) kendi `reset` fonksiyonunu BURAYA
 * kaydeder; `resetAllStores()` yalnızca örneklenmiş (kayıtlı) olanları sıfırlar. Kayıt defteri hiçbir
 * store'u import etmez -> döngüsel import yok. Sıfırlama, giriş ekranı gösterildiğinde çağrılır
 * (LoginComponent): hem açık çıkışı hem de oturum süresi dolması yönlendirmesini kapsar ve kabuk
 * hâlâ ekrandayken (çıkış işlemi sürerken) boş duruma düşme titremesi yaratmaz.
 *
 * Platform kataloğu (entegrasyon tanımları) kiracıya özel DEĞİLDİR ve giriş ekranının kendisi
 * tarafından yüklenir — bu yüzden sıfırlanmaz. `sessionStorage` çalışma alanı kalıcılığı da
 * SIFIRLANMAZ (ADR-0012 Karar 3: oturum süresi dolması sekmeleri silmez; yalnızca açık çıkış siler).
 */
type Resetter = () => void

const resetters = new Map<string, Resetter>()

/** Bir store/modül kendi sıfırlayıcısını kaydeder (aynı `id` yeniden kaydedilirse üzerine yazılır). */
export function registerStoreReset(id: string, reset: Resetter): void {
  resetters.set(id, reset)
}

/** Kayıtlı tüm sıfırlayıcıları çalıştırır; biri hata verse de diğerleri çalışır. Hata veren `id`'leri döndürür. */
export function resetAllStores(): string[] {
  const failed: string[] = []
  for (const [id, reset] of resetters) {
    try {
      reset()
    } catch {
      failed.push(id)
    }
  }
  return failed
}

/** Yalnızca test/tanılama için. */
export function registeredResetIds(): string[] {
  return [...resetters.keys()]
}
