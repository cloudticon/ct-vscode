import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const URL_REGEX = /^(?:https?:\/\/)?([^/]+\.[^/]+)\/([^/]+)\/([^/@]+)@(.+)$/;
const IMPORT_REGEX = /(?:import|export)\s+.*?from\s*["']([^"']+)["']/g;

export interface PackageRef {
  host: string;
  owner: string;
  repo: string;
  version: string;
}

export const parsePackageURL = (url: string): PackageRef | null => {
  const m = url.match(URL_REGEX);
  return m ? { host: m[1], owner: m[2], repo: m[3], version: m[4] } : null;
};

export const parseURLImportsFromFile = (filePath: string): string[] => {
  if (!fs.existsSync(filePath)) return [];
  return parseURLImportsFromSource(fs.readFileSync(filePath, 'utf-8'));
};

export const parseURLImportsFromSource = (source: string): string[] => {
  const urls: string[] = [];
  const regex = new RegExp(IMPORT_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    if (URL_REGEX.test(match[1])) {
      urls.push(match[1]);
    }
  }
  return urls;
};

const getCacheDir = (): string =>
  path.join(os.homedir(), '.ct', 'cache');

const getPackageDir = (ref: PackageRef): string =>
  path.join(getCacheDir(), ref.host, ref.owner, `${ref.repo}@${ref.version}`);

export const isPackageCached = (ref: PackageRef): boolean => {
  try {
    return fs.readdirSync(getPackageDir(ref)).length > 0;
  } catch {
    return false;
  }
};

const copyDirSync = (src: string, dst: string): void => {
  fs.mkdirSync(dst, { recursive: true });

  const walk = (currentSrc: string, currentDst: string): void => {
    for (const entry of fs.readdirSync(currentSrc, { withFileTypes: true })) {
      if (entry.name.startsWith('.git')) continue;
      const srcPath = path.join(currentSrc, entry.name);
      const dstPath = path.join(currentDst, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(dstPath, { recursive: true });
        walk(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  };

  walk(src, dst);
};

export const downloadPackage = (ref: PackageRef): void => {
  const destDir = getPackageDir(ref);
  const gitURL = `https://${ref.host}/${ref.owner}/${ref.repo}.git`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-download-'));

  try {
    cp.execSync(
      `git clone --depth 1 --branch "${ref.version}" "${gitURL}" "${tmpDir}"`,
      { stdio: 'pipe', timeout: 60_000 },
    );
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    copyDirSync(tmpDir, destDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

export const getMissingPackages = (
  urls: string[],
): { url: string; ref: PackageRef }[] =>
  urls.reduce<{ url: string; ref: PackageRef }[]>((acc, url) => {
    const ref = parsePackageURL(url);
    if (ref && !isPackageCached(ref)) acc.push({ url, ref });
    return acc;
  }, []);
