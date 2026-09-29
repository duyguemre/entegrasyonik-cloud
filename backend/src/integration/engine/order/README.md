Aşağıda detaylarını paylaştığım Entegrasyonik projesi için bir [Sipariş İşleme Fonksiyonu / Worker Logic / Error Handler] yazmanı istiyorum. İşte sistemin bağlamı:


Project: Entegrasyonik | System Architecture Manifesto
1. General Overview:
Entegrasyonik is a multi-tenant e-commerce integration SaaS designed to scale from 1 to 1,000+ clients. The system synchronizes orders, inventory, and shipping data across 5+ marketplaces (Trendyol, Hepsiburada, Amazon, etc.) using a distributed worker architecture.

2. Core Tech Stack:

Runtime: Node.js (High-concurrency event-loop).

Primary DB: MongoDB (Multi-tenant: 1 Central ApplicationDB for configs, 1000+ isolated ClientDBs for data privacy).

Message Broker: Redis (BullMQ) for task orchestration and job queuing.

Hosting: Railway.app (Multipod/Replica support).

3. Scaling & Infrastructure Strategy:

Configurative Redis: The system is environment-agnostic. It uses Docker-based Redis for local development, Upstash (Serverless Redis) for the MVP/Growth phase, and scales to Railway Dedicated Redis as the client load increases.

Job Orchestration: A central scheduler injects "Fetch Orders" jobs into Redis every 10 minutes per client/marketplace pair.

Distributed Workers: Independent worker pods consume these jobs, handling API rate limits (Token Bucket), retries, and state management.

4. Data Pipeline & Logic:

Extraction: Workers fetch raw order data and extract specific entities: Inventory updates, Invoicing data, Shipping/Tracking info, and Customer profiles.

Persistence: Extracted data is normalized and saved directly to the respective ClientDB to ensure strict data isolation.

Claim/Refund Management: The system monitors order status changes to trigger refund, return, or claim workflows.

Sync Integrity: Uses a "Last Successful Sync" timestamp in MongoDB as a primary fallback to prevent data gaps during Redis or API downtimes.

5. Operational Constraints & Resilience:

Circuit Breaker: Implements circuit breakers for Marketplace API integrations to prevent resource exhaustion and "cascading failures" during vendor downtimes.

Retries & DLQ: Uses Exponential Backoff for failed jobs. Persistent failures (after X attempts) are moved to a Dead Letter Queue (DLQ) for manual inspection.

Memory Management: Aggressive job eviction (removeOnComplete, removeOnFail) to keep Redis RAM usage under 256MB even at 1M+ daily requests.

Rate Limiting: Global rate-limit tracking via Redis to prevent marketplace API bans across multiple pods.

Idempotency: Ensures strict data integrity using unique marketplace order keys to prevent duplicate record creation.


src/integration/engine/order/

├── OrderOrchestrator.ts      # Ana Yönetici: Producer'ı zamanlar, Worker sonuçlarını dinler, stok/fatura işlerini tetikler.

├── OrderQueueProducer.ts     # Scheduler: CentralDB'den tenantları okur, Redis'e (BullMQ) benzersiz jobId ile işleri bırakır.

├── OrderWorker.ts            # Runner: Redis'i bilmez; kendisine verilen işi alıp Fetcher -> Transformer -> Repository akışını yönetir.

├── OrderTransformer.ts       # Logic: Fetcher'dan gelen normalize edilmiş veriyi (IOrder), sistemin alt tablolarına dağıtılacak hale getirir.

├── OrderRepository.ts        # Data: Transform edilmiş veriyi databaseManager kullanarak ilgili ClientDB'ye (Mongo) yazar.

├── OrderErrorHandler.ts      # Resilience: Hata tipine göre (API hatası vs. DB hatası) retry veya DLQ kararını verir.

├── order.config.json         # Senkronizasyon aralığı (10dk), retry limitleri ve timeout süreleri.

└── README.md                 # Bu modülün çalışma prensibi ve bağımlılık tablosu.