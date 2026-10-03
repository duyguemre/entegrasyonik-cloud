/** [eslesme-fiyat WP1] Kanal kodu → hata kuralları (bilinmeyen kanal → yalnız ortak kurallar). */
import type { ErrorMapRule } from './errorMap';
import { TRENDYOL_ERROR_RULES } from '../../marketplace/trendyol/errorMap';
import { HEPSIBURADA_ERROR_RULES } from '../../marketplace/hepsiburada/errorMap';
import { N11_ERROR_RULES } from '../../marketplace/n11/errorMap';
import { PAZARAMA_ERROR_RULES } from '../../marketplace/pazarama/errorMap';
import { IDEASOFT_ERROR_RULES } from '../../ecommerce/ideasoft/errorMap';

const RULES: Record<string, readonly ErrorMapRule[]> = {
    trendyol: TRENDYOL_ERROR_RULES,
    hepsiburada: HEPSIBURADA_ERROR_RULES,
    n11: N11_ERROR_RULES,
    pazarama: PAZARAMA_ERROR_RULES,
    ideasoft: IDEASOFT_ERROR_RULES,
};

export function errorRulesFor(integrationCode: string | undefined): readonly ErrorMapRule[] {
    return (integrationCode && RULES[integrationCode]) || [];
}
