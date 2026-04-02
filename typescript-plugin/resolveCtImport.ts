import * as path from 'path';
import * as fs from 'fs';

export const resolveCtImport = (
  moduleName: string,
  containingFile: string,
): string | null => {
  if (!moduleName.endsWith('.ct')) return null;
  const resolved = path.resolve(path.dirname(containingFile), moduleName);
  return fs.existsSync(resolved) ? resolved : null;
};
