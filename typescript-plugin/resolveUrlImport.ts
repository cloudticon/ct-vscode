import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const URL_REGEX = /^(?:https?:\/\/)?([^/]+\.[^/]+)\/([^/]+)\/([^/@]+)(?:@(.+))?$/;

const DEFAULT_VERSION = '_default';

export interface PackageRef {
  host: string;
  owner: string;
  repo: string;
  version: string;
}

export const parsePackageURL = (url: string): PackageRef | null => {
  const m = url.match(URL_REGEX);
  return m
    ? { host: m[1], owner: m[2], repo: m[3], version: m[4] ?? DEFAULT_VERSION }
    : null;
};

export const isPackageURL = (specifier: string): boolean =>
  URL_REGEX.test(specifier);

const getCacheDir = (): string =>
  path.join(os.homedir(), '.ct', 'cache');

const INDEX_CANDIDATES = ['index.ts', 'index.ct', 'index.d.ts', 'index.js'] as const;

export const resolveURLImport = (url: string): string | null => {
  const ref = parsePackageURL(url);
  if (!ref) return null;

  const pkgDir = path.join(
    getCacheDir(),
    ref.host,
    ref.owner,
    `${ref.repo}@${ref.version}`,
  );

  for (const candidate of INDEX_CANDIDATES) {
    const p = path.join(pkgDir, candidate);
    if (fs.existsSync(p)) return p;
  }
  return null;
};
