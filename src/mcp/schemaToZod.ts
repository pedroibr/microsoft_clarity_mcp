import * as z from 'zod/v4';
import type { JsonSchema } from '../types.js';

function applyDescription<T extends z.ZodTypeAny>(schema: T, jsonSchema?: JsonSchema) {
  return jsonSchema?.description ? schema.describe(jsonSchema.description) : schema;
}

export function jsonSchemaToZod(jsonSchema?: JsonSchema): z.ZodTypeAny {
  if (!jsonSchema) return z.any();

  if (jsonSchema.enum && jsonSchema.enum.length > 0) {
    return applyDescription(z.enum(jsonSchema.enum as [string, ...string[]]), jsonSchema);
  }

  if (jsonSchema.type === 'object' || jsonSchema.properties || jsonSchema.additionalProperties === false) {
    const shape: Record<string, z.ZodTypeAny> = {};
    const required = new Set(jsonSchema.required || []);

    for (const [key, propertySchema] of Object.entries(jsonSchema.properties || {})) {
      let property = jsonSchemaToZod(propertySchema);
      if (!required.has(key)) property = property.optional();
      shape[key] = property;
    }

    const objectSchema =
      jsonSchema.additionalProperties === false
        ? z.object(shape).strict()
        : z.object(shape).passthrough();

    return applyDescription(objectSchema, jsonSchema);
  }

  if (jsonSchema.type === 'array') {
    return applyDescription(z.array(jsonSchemaToZod(jsonSchema.items)), jsonSchema);
  }
  if (jsonSchema.type === 'string') return applyDescription(z.string(), jsonSchema);
  if (jsonSchema.type === 'number') return applyDescription(z.number(), jsonSchema);
  if (jsonSchema.type === 'boolean') return applyDescription(z.boolean(), jsonSchema);
  return applyDescription(z.any(), jsonSchema);
}
