// utility veya common altında bir dosya: EventBus.ts
import { EventEmitter } from 'events';

class IntegrationEventBus extends EventEmitter { }
export const integrationEventBus = new IntegrationEventBus();

export const EVENTS = {
    // --- EXPORT SÜREÇLERİ ---
    PROCESS_NEXT_SIGNAL: 'PROCESS_NEXT_SIGNAL',

    // --- IMPORT SÜREÇLERİ ---
    // Yeni bir import talebi geldiğinde veya bir aşama (Staging) bittiğinde kullanılır
    PROCESS_NEXT_IMPORT_JOB: 'PROCESS_NEXT_IMPORT_JOB',

    // --- GENEL (İhtiyaç Olursa) ---
    // Tüm sistemdeki zombi temizliğini manuel tetiklemek istersen
    TRIGGER_ZOMBIE_CLEANUP: 'TRIGGER_ZOMBIE_CLEANUP'
};