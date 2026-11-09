// JSON output that stays diff-friendly: objects indented, coordinate arrays on one line.
const flat = v => Array.isArray(v) && v.every(x => typeof x === 'number' || (Array.isArray(x) && x.every(y => typeof y === 'number')));

export function stringify(value, indent = '') {
  const next = indent + '  ';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (flat(value)) return JSON.stringify(value);
    return '[\n' + value.map(v => next + stringify(v, next)).join(',\n') + '\n' + indent + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter(k => value[k] !== undefined);
    if (!keys.length) return '{}';
    return '{\n' + keys.map(k => next + JSON.stringify(k) + ': ' + stringify(value[k], next)).join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(value);
}
export const toFile = value => stringify(value) + '\n';
