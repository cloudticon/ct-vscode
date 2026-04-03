import type * as ts from 'typescript/lib/tsserverlibrary';
import * as path from 'path';
import * as fs from 'fs';
import { resolveCtImport } from './resolveCtImport';
import { isPackageURL, resolveURLImport } from './resolveUrlImport';

interface PluginConfig {
  typesDir?: string;
}

const resolveExtension = (
  tsModule: typeof ts,
  fileName: string,
): ts.Extension => {
  if (fileName.endsWith('.d.ts')) return tsModule.Extension.Dts;
  if (fileName.endsWith('.ts') || fileName.endsWith('.ct'))
    return tsModule.Extension.Ts;
  return tsModule.Extension.Js;
};

const collectDtsFiles = (dir: string): string[] => {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.d.ts'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
};

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const tsModule = modules.typescript;
  let config: PluginConfig = {};

  const getTypeFiles = (): string[] =>
    config.typesDir ? collectDtsFiles(config.typesDir) : [];

  const create = (info: ts.server.PluginCreateInfo): ts.LanguageService => {
    const logger = info.project.projectService.logger;
    logger.info('[ct] TypeScript plugin loaded');

    config = info.config || {};

    const host = info.languageServiceHost;

    const origGetScriptFileNames = host.getScriptFileNames.bind(host);
    host.getScriptFileNames = () => {
      const files = origGetScriptFileNames();
      const extra = getTypeFiles().filter((f) => !files.includes(f));
      if (extra.length > 0) {
        logger.info(`[ct] Injecting type files: ${extra.join(', ')}`);
        return [...files, ...extra];
      }
      return files;
    };

    const origResolveLiterals = (
      host as any
    ).resolveModuleNameLiterals?.bind(host);
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

          const ctResolved = resolveCtImport(name, containingFile);
          if (ctResolved) {
            logger.info(`[ct] Resolved .ct import: ${name} -> ${ctResolved}`);
            return {
              resolvedModule: {
                resolvedFileName: ctResolved,
                isExternalLibraryImport: false,
                extension: tsModule.Extension.Ts,
              },
            };
          }

          if (!isPackageURL(name)) return baseResults[i];

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

          const ctResolved = resolveCtImport(name, containingFile);
          if (ctResolved) {
            logger.info(`[ct] Resolved .ct import: ${name} -> ${ctResolved}`);
            return {
              resolvedFileName: ctResolved,
              isExternalLibraryImport: false,
              extension: tsModule.Extension.Ts,
            };
          }

          if (!isPackageURL(name)) return undefined;

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

  const getExternalFiles = (_project: ts.server.Project): string[] =>
    getTypeFiles();

  const onConfigurationChanged = (newConfig: PluginConfig): void => {
    config = newConfig || {};
  };

  return { create, getExternalFiles, onConfigurationChanged };
}

export = init;
