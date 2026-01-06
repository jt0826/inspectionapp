// Lightweight helper to convert snake_case keys to camelCase recursively

const camelize = (str: string) => str.replace(/_([a-z])/g, (_, g) => g.toUpperCase());

export function toCamelCaseKeys<T = any>(input: any): T {
  if (Array.isArray(input)) {
    return input.map((v) => toCamelCaseKeys(v)) as any;
  }
  if (input && typeof input === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      const newKey = camelize(k);
      out[newKey] = toCamelCaseKeys(v);
    }
    return out as T;
  }
  return input;
}
