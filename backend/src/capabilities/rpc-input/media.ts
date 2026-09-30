// [ADR-0023 + ADR-0027] Görsel doğrudan-yükleme (imzalı PUT) RPC gövde şemaları. SAF zod; tür izin listesi
// `services/storage/imagePolicy.ts` ile AYNI küme (kayıt `services/**`'i içe aktarmaz — sınır kuralı; eşitlik testle korunur).
import { z } from 'zod';
import { strictBody, text } from './common';
import type { RpcRef } from '../types';

export const MEDIA_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Ürün görsel başvurusu (taslak `tempId` ya da ürün kimliği): R2 anahtar segmentine gömüldüğü için dar küme. */
const productRef = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

/** Mutlak üst sınır (25 MB); ortam tavanı (`IMAGE_UPLOAD_MAX_BYTES`, vars. 10 MB) serviste ayrıca uygulanır. */
const size = z.number().int().min(1).max(25 * 1024 * 1024);

export const MEDIA_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'ImageService/createUploadUrl': strictBody({ tempProductId: productRef, contentType: z.enum(MEDIA_IMAGE_CONTENT_TYPES), size }),
    'ImageService/confirmUpload': strictBody({ tempProductId: productRef, uploadId: z.string().regex(/^[a-f0-9]{32}$/), originalname: text(255).optional() }),
};
