import { ApplicationError } from '../Security'

/** Mongo `MaxTimeMSExpired` (50) -> 504 QUERY_TIMEOUT; Redis/diğer bağlantı hatası -> 503 INFRA_UNAVAILABLE; ApplicationError aynen. Ham hata iletisi yanıta girmez. */
export function toInfraError(e: any): Error {
    if (e instanceof ApplicationError) return e
    if (e?.code === 50 || e?.codeName === 'MaxTimeMSExpired') return new ApplicationError('Sorgu süre sınırını aştı.', 504, 'QUERY_TIMEOUT')
    return new ApplicationError('Altyapı şu an okunamıyor.', 503, 'INFRA_UNAVAILABLE')
}
