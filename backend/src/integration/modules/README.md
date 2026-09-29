# Marketplace Integration System Design & Implementation Guide

You are an expert developer building a marketplace integration module for our "Entegrasyonik" system. Follow these strict architectural rules to maintain parity with our existing modules (e.g., Trendyol, Pazarama).

## 1. Architectural Layers (Separation of Concerns)
Every marketplace module must have exactly these four layers:
- **API (Connectors):** Handles ALL HTTP communication. Resolves URLs dynamically from `this.params.integrationSettings.urls` (DB-backed). NEVER use hardcoded URLs here.
- **Services:** Handles business logic and calls Connectors. Uses `payload.mode` (PLATFORM_PROCESS) to decide logic.
- **Transformers (Mappers):** Pure functions that convert between Platform JSON models and our Internal Models (`IProduct`, `IOrder`, `IInternalResult`, etc.).
- **Constants/Index:** Entry point implementing the `IPlatform` interface and defining metadata.

## 2. Core Implementation Rules
- **Interface Compliance:** You MUST strictly follow the interfaces in `@interfaces/index`. Specifically:
    - `IBatchCheckPayload`: Use `trackingId` for batch queries.
    - `IInternalResult`: Always return `{ barcode, status: 'COMPLETED' | 'FAILED' | 'WAITING', messages: string[] }`.
    - `IPlatform`: Implement all methods (retrieveOrders, transferProducts, etc.).
- **Dynamic Endpoint Resolution:** All URLs must be fetched from the database settings. 
    - Pattern: `const url = this.params.integrationSettings.urls.yourSpecificUrl || 'fallback/url'`.
    - Handle placeholders like `<BATCHID>` or `<CATEGORYID>` using `.replace()`.

## 3. Batch Process Logic
- **Differentiation:** Distinguish between `TRANSFER` (Product Create) and `UPDATE_PRICE`/`UPDATE_STOCK`.
- **Status Mapping:** Map platform-specific codes to our internal normalized statuses. 
    - Note: Platforms often use different endpoints and status codes for price/stock vs. creation (e.g., Pazarama uses `lake-projections` for updates).

## 4. Parallel Mock Development (Testing)
For every integration, you must also update the Mock Environment:
- **Mock Backend:** Simulate manual approval workflows. Batches should start as `RECEIVED` or `PROCESSING` and only move to `COMPLETED` after a `/approve` call.
- **Mock Frontend:** Add a "Type" column to distinguish batch types. Visualize status codes using Pazarama-style numeric mappings (0, 1, 2, 3, 5).

## 5. Coding Style
- Use TypeScript for the Integration Engine.
- Use Mongoose for the Mock Backend.
- Use Vuetify for the Mock Frontend.
- Maintain premium design aesthetics in the Mock UI (dark mode, glassmorphism, smooth transitions).



"Yukarıdaki standartlara bağlı kalarak [MARKETPLACE ADI] için bir entegrasyon başlatmanı istiyorum. İşte [MARKETPLACE ADI] API dökümantasyonundaki batch sorgulama formatı: [BURAYA DÖKÜMANI YAPIŞTIRIN]. Lütfen önce ProductConnector ve ProductService katmanlarını dökümana uygun olarak hazırla."