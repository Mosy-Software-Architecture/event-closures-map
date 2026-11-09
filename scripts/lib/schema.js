// A small JSON Schema validator: the subset used by schemas/*.json, with no dependencies.
// Supports type, enum, const, pattern, min/maxLength, minimum/maximum, required, properties,
// additionalProperties, propertyNames, min/maxProperties, items, min/maxItems, anyOf, oneOf
// and $ref ("#/..." or "<file>#/...").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadSchemas(dir) {
  const cache = new Map();
  const get = name => {
    if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(join(dir, name), 'utf8')));
    return cache.get(name);
  };
  return get;
}

const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);

function resolve(ref, file, getSchema) {
  const [f, frag = ''] = ref.split('#');
  const target = f || file;
  let node = getSchema(target);
  for (const part of frag.split('/').filter(Boolean)) node = node[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  if (node === undefined) throw new Error(`Unresolvable $ref ${ref} in ${file}`);
  return { node, file: target };
}

export function validate(value, schemaFile, getSchema) {
  return check(value, getSchema(schemaFile), schemaFile, '', getSchema);
}

function check(v, s, file, path, getSchema) {
  const errors = [];
  const err = msg => errors.push({ path: path || '/', message: msg });
  if (s.$ref) { const r = resolve(s.$ref, file, getSchema); errors.push(...check(v, r.node, r.file, path, getSchema)); }
  if (s.type) {
    const types = [].concat(s.type);
    if (!types.some(t => isType(v, t))) { err(`expected ${types.join(' or ')}, got ${typeOf(v)}`); return errors; }
  }
  if (s.enum && !s.enum.some(e => e === v)) err(`must be one of ${s.enum.map(e => JSON.stringify(e)).join(', ')}, got ${JSON.stringify(v)}`);
  if ('const' in s && s.const !== v) err(`must be ${JSON.stringify(s.const)}`);
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err(`${JSON.stringify(v.length > 80 ? v.slice(0, 80) + '…' : v)} is not valid: expected ${s.description || 'pattern ' + s.pattern}`);
    if (s.minLength != null && v.length < s.minLength) err(`shorter than ${s.minLength}`);
    if (s.maxLength != null && [...v].length > s.maxLength) err(`longer than ${s.maxLength}`);
  }
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) err(`${v} is below ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) err(`${v} is above ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) err(`needs at least ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) err(`allows at most ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => errors.push(...check(x, s.items, file, `${path}/${i}`, getSchema)));
  }
  if (typeOf(v) === 'object') {
    const keys = Object.keys(v);
    for (const k of s.required || []) if (!(k in v)) err(`missing required property "${k}"`);
    if (s.minProperties != null && keys.length < s.minProperties) err(`needs at least ${s.minProperties} properties`);
    for (const k of keys) {
      const p = `${path}/${k}`;
      if (s.propertyNames && check(k, s.propertyNames, file, p, getSchema).length) { errors.push({ path: p, message: `property name "${k}" is not allowed` }); continue; }
      if (s.properties && k in s.properties) errors.push(...check(v[k], s.properties[k], file, p, getSchema));
      else if (s.additionalProperties === false) errors.push({ path: p, message: `unknown property "${k}"` });
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') errors.push(...check(v[k], s.additionalProperties, file, p, getSchema));
    }
  }
  for (const kw of ['anyOf', 'oneOf']) {
    if (!s[kw]) continue;
    const results = s[kw].map(sub => check(v, sub, file, path, getSchema));
    const ok = results.filter(r => !r.length).length;
    if (kw === 'anyOf' && !ok) errors.push(...results.sort((a, b) => a.length - b.length)[0]);
    if (kw === 'oneOf' && ok !== 1) err(ok ? 'matches more than one alternative' : 'matches none of the alternatives');
  }
  return errors;
}
