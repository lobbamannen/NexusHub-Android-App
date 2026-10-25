import { invalid } from './errors.mjs';
export function validateArguments(schema, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw invalid('Verktygsargument måste vara ett objekt.');
    for (const field of schema.required || [])
        if (!Object.hasOwn(value, field))
            throw invalid('Obligatoriskt fält saknas: ' + field);
    if (schema.additionalProperties === false)
        for (const field of Object.keys(value))
            if (!Object.hasOwn(schema.properties, field))
                throw invalid('Okänt argument: ' + field);
    for (const [field, input] of Object.entries(value)) {
        const rule = schema.properties[field];
        if (!rule)
            continue;
        if (rule.type === 'string' && typeof input !== 'string' || rule.type === 'boolean' && typeof input !== 'boolean' || rule.type === 'integer' && !Number.isInteger(input) || rule.type === 'array' && (!Array.isArray(input) || input.some(x => typeof x !== rule.items.type)))
            throw invalid('Fel datatyp för ' + field);
        if (typeof input === 'string' && input.length > 1800000)
            throw invalid('För stort argument: ' + field);
        if (Array.isArray(input) && input.length > 10000)
            throw invalid('För många värden: ' + field);
        if (rule.enum && !rule.enum.includes(input))
            throw invalid('Otillåtet värde för ' + field);
        if (typeof input === 'number' && (rule.minimum !== undefined && input < rule.minimum || rule.maximum !== undefined && input > rule.maximum))
            throw invalid('Värdet är utanför intervallet: ' + field);
    }
    return value;
}
