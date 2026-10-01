// ADR-0034 BR-2: zod (v3 API) -> JSON Schema (LLM arac girdi semasi). Yerel, kucuk cevirici: `zod-to-json-schema` bagimliligi EKLENMEZ
// (zod 3.25'in `zod/v4` toJSONSchema'si v3 sema nesnelerini cevirmez). Yalniz `mcp.exposed` yeteneklerin girdi sozlugu desteklenir:
// object(strict) / string / number(int) / boolean / enum / literal / array / union / optional / nullable / default / effects.
// Desteklenmeyen tur FIRLATIR (sessizce gevsek sema uretmez) -> yeni bir girdi turu eklenince bu dosya ve testi birlikte genisler.
import type { ZodTypeAny } from 'zod';

export type JsonSchema = Record<string, unknown>;

interface Check { kind: string; value?: number; message?: string }

function checks(def: any): Check[] {
    return Array.isArray(def.checks) ? def.checks : [];
}

/** Bir zod semasinin JSON Schema karsiligi. `optional` bilgisi icin `isOptional` ayrica sorulur (nesne `required` listesi). */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
    const def = (schema as any)._def;
    const t: string = def.typeName;
    const withDesc = (s: JsonSchema): JsonSchema => (typeof def.description === 'string' ? { ...s, description: def.description } : s);
    switch (t) {
        case 'ZodString': {
            const s: JsonSchema = { type: 'string' };
            for (const c of checks(def)) {
                if (c.kind === 'min') s.minLength = c.value;
                else if (c.kind === 'max') s.maxLength = c.value;
                else if (c.kind === 'regex') s.pattern = (c as any).regex.source;
            }
            return withDesc(s);
        }
        case 'ZodNumber': {
            const s: JsonSchema = { type: 'number' };
            for (const c of checks(def)) {
                if (c.kind === 'int') s.type = 'integer';
                else if (c.kind === 'min') s.minimum = c.value;
                else if (c.kind === 'max') s.maximum = c.value;
            }
            return withDesc(s);
        }
        case 'ZodBoolean': return withDesc({ type: 'boolean' });
        case 'ZodLiteral': return withDesc({ const: def.value });
        case 'ZodEnum': return withDesc({ type: 'string', enum: [...def.values] });
        case 'ZodArray': {
            const s: JsonSchema = { type: 'array', items: zodToJsonSchema(def.type) };
            if (def.minLength) s.minItems = def.minLength.value;
            if (def.maxLength) s.maxItems = def.maxLength.value;
            return withDesc(s);
        }
        case 'ZodOptional': return zodToJsonSchema(def.innerType);
        case 'ZodDefault': return { ...zodToJsonSchema(def.innerType), default: def.defaultValue() };
        case 'ZodNullable': return { anyOf: [zodToJsonSchema(def.innerType), { type: 'null' }] };
        case 'ZodEffects': return zodToJsonSchema(def.schema);
        case 'ZodUnion': return { anyOf: (def.options as ZodTypeAny[]).map(zodToJsonSchema) };
        case 'ZodObject': {
            const shape: Record<string, ZodTypeAny> = def.shape();
            const properties: Record<string, JsonSchema> = {};
            const required: string[] = [];
            for (const [k, v] of Object.entries(shape)) {
                properties[k] = zodToJsonSchema(v);
                if (!isOptionalSchema(v)) required.push(k);
            }
            const s: JsonSchema = { type: 'object', properties, additionalProperties: false };
            if (required.length > 0) s.required = required;
            return withDesc(s);
        }
        default:
            throw new Error(`zodToJsonSchema: desteklenmeyen zod turu ${t}`);
    }
}

/** Alan istek govdesinde yok sayilabilir mi (`.optional()` / `.default()`). */
export function isOptionalSchema(schema: ZodTypeAny): boolean {
    const t = (schema as any)._def.typeName;
    if (t === 'ZodOptional' || t === 'ZodDefault') return true;
    if (t === 'ZodNullable' || t === 'ZodEffects') return isOptionalSchema(t === 'ZodNullable' ? (schema as any)._def.innerType : (schema as any)._def.schema);
    return false;
}
