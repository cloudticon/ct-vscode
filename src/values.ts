import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';

const VALUES_FILENAMES = ['values.json', 'values.yaml', 'values.yml'] as const;

export const findValuesFile = (projectDir: string): string | null => {
  for (const name of VALUES_FILENAMES) {
    const p = path.join(projectDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

export const getValuesDeclarationPath = (projectDir: string): string => {
  const hash = crypto
    .createHash('md5')
    .update(projectDir)
    .digest('hex')
    .slice(0, 12);
  return path.join(os.homedir(), '.ct', 'types', hash, 'values.d.ts');
};

export const generateValuesDeclaration = (valuesFilePath: string): string => {
  const raw = fs.readFileSync(valuesFilePath, 'utf-8');
  const ext = path.extname(valuesFilePath).toLowerCase();

  const data: unknown =
    ext === '.json' ? JSON.parse(raw) : yaml.load(raw);

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return 'declare const Values: Record<string, any>;\n';
  }

  return `declare const Values: ${objectToType(data as Record<string, unknown>, 1)};\n`;
};

const objectToType = (
  obj: Record<string, unknown>,
  indent: number,
): string => {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';

  const pad = '  '.repeat(indent);
  const closePad = '  '.repeat(indent - 1);

  const fields = entries.map(([key, value]) => {
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : JSON.stringify(key);
    return `${pad}readonly ${safeKey}: ${valueToType(value, indent)};`;
  });

  return `{\n${fields.join('\n')}\n${closePad}}`;
};

const valueToType = (value: unknown, indent: number): string => {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'readonly unknown[]';
    const elementTypes = [
      ...new Set(value.map((v) => valueToType(v, indent))),
    ];
    const union =
      elementTypes.length === 1
        ? elementTypes[0]
        : `(${elementTypes.join(' | ')})`;
    return `readonly ${union}[]`;
  }

  if (typeof value === 'object') {
    return objectToType(value as Record<string, unknown>, indent + 1);
  }

  return 'unknown';
};
