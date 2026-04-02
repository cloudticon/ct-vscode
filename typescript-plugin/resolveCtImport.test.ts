import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { resolveCtImport } from './resolveCtImport';

vi.mock('fs');

const containingFile = '/project/src/main.ct';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCtImport', () => {
  it('returns resolved path when .ct file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = resolveCtImport('./hasura.ct', containingFile);

    expect(result).toBe(path.resolve('/project/src', './hasura.ct'));
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.resolve('/project/src', './hasura.ct'),
    );
  });

  it('returns null when .ct file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = resolveCtImport('./missing.ct', containingFile);

    expect(result).toBeNull();
  });

  it('returns null for specifiers without .ct extension', () => {
    const result = resolveCtImport('./utils.ts', containingFile);

    expect(result).toBeNull();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('returns null for bare module specifiers', () => {
    const result = resolveCtImport('lodash', containingFile);

    expect(result).toBeNull();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('resolves relative paths with ../', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = resolveCtImport('../shared/common.ct', containingFile);

    expect(result).toBe(path.resolve('/project/src', '../shared/common.ct'));
  });

  it('resolves deeply nested relative paths', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const deep = '/project/src/a/b/c/deep.ct';

    const result = resolveCtImport('../../other.ct', deep);

    expect(result).toBe(path.resolve('/project/src/a/b/c', '../../other.ct'));
  });
});
