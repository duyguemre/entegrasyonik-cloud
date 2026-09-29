import Redis, { RedisOptions } from 'ioredis';
import { config } from '@config';

export class RedisService {
    private static instance: Redis;


    /**
     * [ADR-0005 Karar 2 / adım 1] ÖNCEKİ DAVRANIŞ: bağlantı hatasında bu Promise REJECT edilirdi;
     * `entegrasyonik.ts`'teki `await RedisService.init()` bunu yakalayıp `gracefulShutdown()` ile süreci
     * KAPATIYORDU (katalog hattı ve web Redis kullanmadığı halde). YENİ DAVRANIŞ: bu metot ARTIK REJECT
     * ETMEZ — `error` olayında da `resolve()` çağrılır (ioredis kendi üstel yeniden bağlanmasına devam eder,
     * bkz. `getConnectionConfig().retryStrategy`, üst sınır 30 sn). Süreç Redis'siz açılır; `/ready` (ADR-0006)
     * worker/all rolünde Redis PING zorunlu tuttuğu için gerçek "hazır değilim" durumu orada raporlanır.
     */
    public static async init(): Promise<void> {
        return new Promise((resolve) => {
            let settled = false;
            const settleOnce = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            try {
                console.log('[\x1b[34mRedisService\x1b[0m] Bağlantı başlatılıyor...');

                const client = this.getInstance();

                client.on('connect', () => {
                    console.log('[\x1b[32mRedisService\x1b[0m] Redis bağlantısı başarılı.');
                    settleOnce();
                });

                client.on('error', (err) => {
                    console.error('[\x1b[31mRedisService\x1b[0m] Bağlantı hatası (ioredis kendi yeniden bağlanmasına devam ediyor):', err);
                    settleOnce();
                });
            } catch (error) {
                console.error('[\x1b[31mRedisService\x1b[0m] init() sırasında beklenmeyen hata:', error);
                settleOnce();
            }
        });
    }

    /**
     * [ADR-0005 Karar 2] Redis'e şu an komut gönderilebilir mi (ioredis `status === 'ready'`)?
     * Örnek hiç oluşturulmadıysa (getInstance() ÇAĞIRMADAN) `false` döner — yan etkisiz kontrol.
     * Kullanım: sipariş zamanlayıcısı (`OrderQueueProducer`) Redis bağlı değilken iş EKLEMEMELİ.
     */
    public static isReady(): boolean {
        return !!this.instance && this.instance.status === 'ready';
    }


    /**
     * BullMQ ve diğer kütüphanelerin (ioredis tabanlı) 
     * kullanımı için saf konfigürasyon döner.
     */
    public static getConnectionConfig(): RedisOptions {
        const password = config.redis.password;

        return {
            host: config.redis.host ?? '127.0.0.1',
            port: config.redis.port,
            // Düzeltildi (BACKLOG C12): docker-compose Redis'i `--requirepass` ile açıyor, bu satır yorumda
            // olduğu sürece backend NOAUTH hatası alıyordu (canlı yerel testte doğrulandı). Boş/tanımsızsa
            // undefined gönderilir (parolasız local Redis ile geriye uyumlu).
            password: (password && password.trim() !== '') ? password : undefined,
            tls: config.redis.tls ? {} : undefined,
            maxRetriesPerRequest: null,
            // [ADR-0005 Karar 2] Üstel yeniden bağlanma, üst sınır 30 sn (ioredis varsayılanı sınırsız artmaz
            // ama üst sınırı 30sn DEĞİLDİR; ADR bu üst sınırı açıkça istiyor).
            retryStrategy: (times: number) => Math.min(1000 * Math.pow(2, times), 30000),
        };
    }

    /**
     * Singleton Redis Instance: Manuel get/set işlemleri için.
     */
    public static getInstance(): Redis {
        if (!this.instance) {
            this.instance = new Redis(this.getConnectionConfig());
        }
        return this.instance;
    }

    /**
     * ADR-0006 Karar 6 (graceful shutdown, adım 5): uçuştaki komutların bitmesini bekleyip bağlantıyı düzgünce
     * kapatır (`ioredis.quit()` — `disconnect()` gibi anlık kesmez). Örnek hiç oluşturulmadıysa no-op'tur
     * (yeni bağlantı AÇMAZ).
     */
    public static async quit(): Promise<void> {
        if (!this.instance) return;
        await this.instance.quit();
    }

    /**
     * CACHING (Basit Get/Set)
     */
    public static async setCache(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
        await this.getInstance().set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }

    public static async getCache<T>(key: string): Promise<T | null> {
        const data = await this.getInstance().get(key);
        return data ? JSON.parse(data) : null;
    }
}