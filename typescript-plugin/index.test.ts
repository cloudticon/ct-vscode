import { describe, it, expect, vi, afterEach } from "vitest";
import type * as ts from "typescript/lib/tsserverlibrary";
import init from "./index";

const createTsModule = (): typeof ts =>
  ({
    Extension: {
      Dts: ".d.ts",
      Ts: ".ts",
      Js: ".js",
    },
  }) as unknown as typeof ts;

const createPluginInfo = () => {
  const logger = {
    info: vi.fn(),
    msg: vi.fn(),
    perftrc: vi.fn(),
    hasLevel: vi.fn().mockReturnValue(true),
    loggingEnabled: vi.fn().mockReturnValue(true),
    startGroup: vi.fn(),
    endGroup: vi.fn(),
    getLogFileName: vi.fn().mockReturnValue(""),
  };

  const project = {
    projectService: { logger },
    updateGraph: vi.fn(),
    refreshDiagnostics: vi.fn(),
  };

  const languageServiceHost = {
    getScriptFileNames: vi.fn().mockReturnValue([]),
  };

  const languageService = {
    getProgram: vi.fn(),
  };

  return {
    logger,
    project,
    info: {
      project,
      config: {},
      languageServiceHost,
      languageService,
    } as unknown as ts.server.PluginCreateInfo,
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ct TypeScript plugin configuration refresh", () => {
  it("refreshes project graph and diagnostics after configuration change", () => {
    vi.useFakeTimers();

    const plugin = init({ typescript: createTsModule() });
    const { project, info } = createPluginInfo();
    plugin.create(info);

    plugin.onConfigurationChanged?.({ typesDir: "/tmp/types" });
    vi.runAllTimers();

    expect(project.updateGraph).toHaveBeenCalledTimes(1);
    expect(project.refreshDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("does not throw when config changes before plugin create", () => {
    const plugin = init({ typescript: createTsModule() });
    expect(() =>
      plugin.onConfigurationChanged?.({ typesDir: "/tmp/types" }),
    ).not.toThrow();
  });
});
