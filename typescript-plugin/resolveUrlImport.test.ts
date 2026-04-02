import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parsePackageURL, isPackageURL, resolveURLImport } from './resolveUrlImport';

vi.mock('fs');
vi.mock('os');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(os.homedir).mockReturnValue('/home/user');
});

describe('parsePackageURL', () => {
  it('parses full URL with version', () => {
    expect(parsePackageURL('github.com/devticon/ct@master')).toEqual({
      host: 'github.com',
      owner: 'devticon',
      repo: 'ct',
      version: 'master',
    });
  });

  it('parses URL with https prefix and version', () => {
    expect(parsePackageURL('https://github.com/devticon/ct@v1.2.3')).toEqual({
      host: 'github.com',
      owner: 'devticon',
      repo: 'ct',
      version: 'v1.2.3',
    });
  });

  it('parses URL without version and defaults to _default', () => {
    expect(parsePackageURL('github.com/devticon/ct')).toEqual({
      host: 'github.com',
      owner: 'devticon',
      repo: 'ct',
      version: '_default',
    });
  });

  it('parses URL with http prefix without version', () => {
    expect(parsePackageURL('http://github.com/devticon/ct')).toEqual({
      host: 'github.com',
      owner: 'devticon',
      repo: 'ct',
      version: '_default',
    });
  });

  it('returns null for relative paths', () => {
    expect(parsePackageURL('./local.ct')).toBeNull();
  });

  it('returns null for bare module names', () => {
    expect(parsePackageURL('lodash')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(parsePackageURL('not-a-url')).toBeNull();
  });

  it('handles version with slashes (branch path)', () => {
    expect(parsePackageURL('github.com/devticon/ct@feat/new-thing')).toEqual({
      host: 'github.com',
      owner: 'devticon',
      repo: 'ct',
      version: 'feat/new-thing',
    });
  });
});

describe('isPackageURL', () => {
  it('returns true for versioned URL', () => {
    expect(isPackageURL('github.com/devticon/ct@master')).toBe(true);
  });

  it('returns true for URL without version', () => {
    expect(isPackageURL('github.com/devticon/ct')).toBe(true);
  });

  it('returns false for relative path', () => {
    expect(isPackageURL('./local.ct')).toBe(false);
  });

  it('returns false for bare module', () => {
    expect(isPackageURL('lodash')).toBe(false);
  });
});

describe('resolveURLImport', () => {
  const cacheBase = '/home/user/.ct/cache';

  it('resolves versioned import to existing index.ct', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === path.join(cacheBase, 'github.com/devticon/ct@master/index.ct'),
    );

    expect(resolveURLImport('github.com/devticon/ct@master')).toBe(
      path.join(cacheBase, 'github.com/devticon/ct@master/index.ct'),
    );
  });

  it('resolves versionless import to _default cache dir', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === path.join(cacheBase, 'github.com/devticon/ct@_default/index.ct'),
    );

    expect(resolveURLImport('github.com/devticon/ct')).toBe(
      path.join(cacheBase, 'github.com/devticon/ct@_default/index.ct'),
    );
  });

  it('prefers index.ts over index.ct', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === path.join(cacheBase, 'github.com/devticon/ct@master/index.ts'),
    );

    expect(resolveURLImport('github.com/devticon/ct@master')).toBe(
      path.join(cacheBase, 'github.com/devticon/ct@master/index.ts'),
    );
  });

  it('returns null when no index file found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(resolveURLImport('github.com/devticon/ct@master')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(resolveURLImport('not-a-url')).toBeNull();
  });
});
