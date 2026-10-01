// [ADR-0023] RPC gövde şemaları kaydı: `'Servis/operasyon'` -> zod şeması. `capabilities/index.ts` bunları ilgili
// yeteneğin bağına (`Binding.input`) iliştirir; ayrı tutulmasının nedeni domain dosyalarını (14 adet) büyütmemek ve
// yeni şema eklemeyi tek yerde toplamaktır. Her anahtar TAM OLARAK bir kayıtlı bağa karşılık gelmelidir (test denetler).
import type { ZodType } from 'zod';
import type { RpcRef } from '../types';
import { IDENTITY_RPC_INPUT } from './identity';
import { COMMERCE_RPC_INPUT } from './commerce';
import { CATALOG_RPC_INPUT } from './catalog';
import { MEDIA_RPC_INPUT } from './media';
import { NOTIFICATION_RPC_INPUT } from './notification';
import { BACKOFFICE_RPC_INPUT } from './backoffice';
import { BACKOFFICE_INFRA_RPC_INPUT } from './backoffice-infra';
import { BACKOFFICE_BILLING_RPC_INPUT } from './backoffice-billing';
import { BACKOFFICE_ENGINE_RPC_INPUT } from './backoffice-engine';
import { BACKOFFICE_ATTENTION_RPC_INPUT } from './backoffice-attention';
import { BACKOFFICE_NOTIFICATIONS_RPC_INPUT } from './backoffice-notifications';

export const RPC_INPUT_SCHEMAS: Readonly<Partial<Record<RpcRef, ZodType<any>>>> = { ...IDENTITY_RPC_INPUT, ...COMMERCE_RPC_INPUT, ...CATALOG_RPC_INPUT, ...MEDIA_RPC_INPUT, ...NOTIFICATION_RPC_INPUT, ...BACKOFFICE_RPC_INPUT, ...BACKOFFICE_BILLING_RPC_INPUT, ...BACKOFFICE_ENGINE_RPC_INPUT, ...BACKOFFICE_ATTENTION_RPC_INPUT, ...BACKOFFICE_INFRA_RPC_INPUT, ...BACKOFFICE_NOTIFICATIONS_RPC_INPUT };
