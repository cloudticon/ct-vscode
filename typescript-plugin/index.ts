import type * as ts from 'typescript/lib/tsserverlibrary';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

const URL_REGEX = /^(?:https?:\/\/)?([^/]+\.[^/]+)\/([^/]+)\/([^/@]+)@(.+)$/;

interface PluginConfig {
  valuesDeclarationPath?: string;
}

const parsePackageURL = (url: string) => {
  const m = url.match(URL_REGEX);
  return m ? { host: m[1], owner: m[2], repo: m[3], version: m[4] } : null;
};

const getCacheDir = (): string =>
  path.join(os.homedir(), '.ct', 'cache');

const resolveURLImport = (url: string): string | null => {
  const ref = parsePackageURL(url);
  if (!ref) return null;

  const pkgDir = path.join(
    getCacheDir(),
    ref.host,
    ref.owner,
    `${ref.repo}@${ref.version}`,
  );

  for (const candidate of ['index.ts', 'index.d.ts', 'index.js']) {
    const p = path.join(pkgDir, candidate);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const resolveExtension = (
  tsModule: typeof ts,
  fileName: string,
): ts.Extension => {
  if (fileName.endsWith('.d.ts')) return tsModule.Extension.Dts;
  if (fileName.endsWith('.ts')) return tsModule.Extension.Ts;
  return tsModule.Extension.Js;
};

const discoverValuesPath = (projectDir: string): string | undefined => {
  const hash = crypto
    .createHash('md5')
    .update(projectDir)
    .digest('hex')
    .slice(0, 12);
  const p = path.join(os.homedir(), '.ct', 'types', hash, 'values.d.ts');
  return fs.existsSync(p) ? p : undefined;
};

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const tsModule = modules.typescript;
  let config: PluginConfig = {};

  const create = (info: ts.server.PluginCreateInfo): ts.LanguageService => {
    const logger = info.project.projectService.logger;
    logger.info('[ct] TypeScript plugin loaded (v2 — resolveModuleNameLiterals)');

    config = info.config || {};

    const projectDir = info.project.getCurrentDirectory();
    if (!config.valuesDeclarationPath) {
      config.valuesDeclarationPath = discoverValuesPath(projectDir);
      logger.info(`[ct] Auto-discovered values path: ${config.valuesDeclarationPath ?? 'none'}`);
    }

    const host = info.languageServiceHost;

    const origGetScriptFileNames = host.getScriptFileNames.bind(host);
    host.getScriptFileNames = () => {
      const files = origGetScriptFileNames();
      if (config.valuesDeclarationPath && fs.existsSync(config.valuesDeclarationPath)) {
        if (!files.includes(config.valuesDeclarationPath)) {
          logger.info(`[ct] Injecting values.d.ts into root files: ${config.valuesDeclarationPath}`);
          return [...files, config.valuesDeclarationPath];
        }
      }
      return files;
    };

    const origResolveLiterals = (host as any).resolveModuleNameLiterals?.bind(host);
    const origResolve = host.resolveModuleNames?.bind(host);

    if (origResolveLiterals) {
      logger.info('[ct] Hooking resolveModuleNameLiterals (TS 5+)');

      (host as any).resolveModuleNameLiterals = (
        moduleLiterals: any[],
        containingFile: string,
        redirectedReference: ts.ResolvedProjectReference | undefined,
        options: ts.CompilerOptions,
        containingSourceFile: ts.SourceFile,
        reusedNames: any[] | undefined,
      ): any[] => {
        const baseResults: any[] = origResolveLiterals(
          moduleLiterals,
          containingFile,
          redirectedReference,
          options,
          containingSourceFile,
          reusedNames,
        );

        return moduleLiterals.map((literal: any, i: number) => {
          const name: string = literal.text;
          if (baseResults[i]?.resolvedModule) return baseResults[i];
          if (!URL_REGEX.test(name)) return baseResults[i];

          const resolved = resolveURLImport(name);
          if (!resolved) {
            logger.info(`[ct] URL import not cached: ${name}`);
            return baseResults[i];
          }

          logger.info(`[ct] Resolved: ${name} -> ${resolved}`);
          return {
            resolvedModule: {
              resolvedFileName: resolved,
              isExternalLibraryImport: true,
              extension: resolveExtension(tsModule, resolved),
            },
          };
        });
      };
    } else {
      logger.info('[ct] Hooking resolveModuleNames (legacy)');

      host.resolveModuleNames = (
        moduleNames: string[],
        containingFile: string,
        reusedNames: string[] | undefined,
        redirectedReference: ts.ResolvedProjectReference | undefined,
        options: ts.CompilerOptions,
        containingSourceFile?: ts.SourceFile,
      ): (ts.ResolvedModule | undefined)[] => {
        const baseResults = origResolve
          ? origResolve(
              moduleNames,
              containingFile,
              reusedNames,
              redirectedReference,
              options,
              containingSourceFile,
            )
          : moduleNames.map(() => undefined);

        return moduleNames.map((name, i) => {
          if (baseResults[i]) return baseResults[i];
          if (!URL_REGEX.test(name)) return undefined;

          const resolved = resolveURLImport(name);
          if (!resolved) {
            logger.info(`[ct] URL import not cached: ${name}`);
            return undefined;
          }

          logger.info(`[ct] Resolved: ${name} -> ${resolved}`);
          return {
            resolvedFileName: resolved,
            isExternalLibraryImport: true,
            extension: resolveExtension(tsModule, resolved),
          };
        });
      };
    }

    const proxy = Object.create(null) as ts.LanguageService;
    for (const k of Object.keys(info.languageService) as Array<
      keyof ts.LanguageService
    >) {
      const x = info.languageService[k]!;
      (proxy as any)[k] = (...args: any[]) =>
        (x as any).apply(info.languageService, args);
    }
    return proxy;
  };

  const getExternalFiles = (
    _project: ts.server.Project,
  ): string[] => {
    if (config.valuesDeclarationPath && fs.existsSync(config.valuesDeclarationPath)) {
      return [config.valuesDeclarationPath];
    }
    return [];
  };

  const onConfigurationChanged = (newConfig: PluginConfig): void => {
    config = newConfig || {};
  };

  return { create, getExternalFiles, onConfigurationChanged };
}

export = init;
