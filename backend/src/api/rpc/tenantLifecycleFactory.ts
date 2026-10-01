import type { IApplicationDB } from '@interfaces/index';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { TenantLifecycleService } from '@operations/tenant/TenantLifecycleService';

/**
 * ADR-0024 P0-LAYER: TenantLifecycleService (operations) iş kuyruğu üreticisini bilmez; gerçek `OrderQueueProducer`
 * bu üst-katman fabrikasında (lazy: yalnızca iptal gerektiğinde) enjekte edilir.
 */
export function createTenantLifecycleService(applicationDB: IApplicationDB): TenantLifecycleService {
    return new TenantLifecycleService({ applicationDB, orderQueueProducerFactory: () => new OrderQueueProducer() });
}
