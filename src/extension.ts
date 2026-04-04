import * as cp from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runWithRetry } from "./retry";

const PLUGIN_ID = "ct-typescript-plugin";
const CT_BINARIES = ["ct", "ct-operator"] as const;
const DEBOUNCE_MS = 500;
const CONFIGURE_PLUGIN_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

let log: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
const typesFingerprintByFolder = new Map<string, string>();

const computeTypesFingerprint = (typesDir: string): string => {
  try {
    const hash = crypto.createHash("sha256");
    hash.update(typesDir);
    const files = fs
      .readdirSync(typesDir)
      .filter((f) => f.endsWith(".d.ts"))
      .sort();
    for (const f of files) {
      hash.update(f);
      hash.update(fs.readFileSync(path.join(typesDir, f), "utf-8"));
    }
    return hash.digest("hex");
  } catch {
    return "";
  }
};

const findCtBinary = (): string | undefined => {
  const cmd = process.platform === "win32" ? "where" : "which";
  for (const bin of CT_BINARIES) {
    try {
      const out = cp.execSync(`${cmd} ${bin}`, {
        stdio: "pipe",
        timeout: 5_000,
      });
      const p = out.toString().trim().split("\n")[0];
      if (p) return p;
    } catch {
      // binary not found, try next
    }
  }
  return undefined;
};

const runCtTypes = (ctPath: string, dir: string): string | undefined => {
  const hasOperator = fs.existsSync(path.join(dir, "operator.ct"));
  const hasDev = fs.existsSync(path.join(dir, "dev.ct"));
  const args = [
    "types",
    dir,
    ...(hasOperator ? ["--operator"] : []),
    ...(hasDev ? ["--dev"] : []),
  ];

  try {
    const stdout = cp.execFileSync(ctPath, args, {
      stdio: "pipe",
      timeout: 30_000,
      cwd: dir,
    });
    return stdout.toString().trim() || undefined;
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim();
    log.appendLine(`[ct] ct types failed: ${stderr || err.message}`);
    return undefined;
  }
};

const isCtDocument = (doc: vscode.TextDocument): boolean =>
  doc.fileName.endsWith(".ct");

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isConfigurePluginUnsupported = (error: unknown): boolean => {
  const message = toErrorMessage(error);
  return (
    /command .*_typescript\.configurePlugin.*not found/i.test(message) ||
    /not available in this VS Code version/i.test(message)
  );
};

const ctFileDecorationProvider: vscode.FileDecorationProvider = {
  provideFileDecoration(uri) {
    if (!uri.fsPath.endsWith(".ct")) return undefined;
    return new vscode.FileDecoration("CT", "Cloudticon Template");
  },
};

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  log = vscode.window.createOutputChannel("Cloudticon CT");
  context.subscriptions.push(log);
  log.appendLine("[ct] Extension activating…");

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(ctFileDecorationProvider),
  );

  const ctPath = findCtBinary();
  if (!ctPath) {
    log.appendLine("[ct] ct binary not found in PATH");
    vscode.window.showWarningMessage(
      "Cloudticon CT: ct binary not found. Install ct for type generation and package resolution.",
    );
  } else {
    log.appendLine(`[ct] Found ct binary: ${ctPath}`);
  }

  for (const doc of vscode.workspace.textDocuments) {
    await handleCtDocumentOpen(doc, ctPath);
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      void handleCtDocumentOpen(doc, ctPath);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isCtDocument(editor.document)) {
        scheduleSyncAll(ctPath);
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{ct,json,yaml,yml}",
  );
  const scheduleSync = () => scheduleSyncAll(ctPath);
  context.subscriptions.push(
    watcher.onDidChange(scheduleSync),
    watcher.onDidCreate(scheduleSync),
    watcher.onDidDelete(scheduleSync),
    watcher,
  );

  await syncAll(ctPath);
  log.appendLine("[ct] Extension activated");
}

const switchCtToTypeScript = (doc: vscode.TextDocument): void => {
  if (isCtDocument(doc) && doc.languageId !== "typescript") {
    log.appendLine(`[ct] Switching ${doc.fileName} to typescript`);
    void vscode.languages.setTextDocumentLanguage(doc, "typescript");
  }
};

const handleCtDocumentOpen = async (
  doc: vscode.TextDocument,
  ctPath: string | undefined,
): Promise<void> => {
  if (!isCtDocument(doc)) return;
  switchCtToTypeScript(doc);
  scheduleSyncAll(ctPath);
};

const scheduleSyncAll = (ctPath: string | undefined): void => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncAll(ctPath), DEBOUNCE_MS);
};

const syncAll = async (ctPath: string | undefined): Promise<void> => {
  if (!ctPath) return;

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = folder.uri.fsPath;
    log.appendLine(`[ct] Running ct types for: ${dir}`);

    const typesDir = runCtTypes(ctPath, dir);
    if (!typesDir) continue;

    const fingerprint = computeTypesFingerprint(typesDir);
    const prev = typesFingerprintByFolder.get(dir);

    if (fingerprint === prev) {
      log.appendLine(`[ct] Types unchanged for ${dir}, skipping restart`);
      continue;
    }

    log.appendLine(`[ct] Types changed at: ${typesDir}`);
    typesFingerprintByFolder.set(dir, fingerprint);
    await configurePlugin(typesDir);
  }
};

const configurePlugin = async (typesDir: string): Promise<void> => {
  try {
    await runWithRetry(
      () =>
        Promise.resolve(
          vscode.commands.executeCommand(
            "_typescript.configurePlugin",
            PLUGIN_ID,
            { typesDir },
          ),
        ),
      {
        delaysMs: CONFIGURE_PLUGIN_RETRY_DELAYS_MS,
        shouldRetry: (error) => !isConfigurePluginUnsupported(error),
        onRetry: ({ attempt, delayMs, error }) => {
          log.appendLine(
            `[ct] configurePlugin retry ${attempt} in ${delayMs}ms: ${toErrorMessage(error)}`,
          );
        },
      },
    );
    log.appendLine(`[ct] Configured TypeScript plugin: ${typesDir}`);
  } catch (error) {
    if (isConfigurePluginUnsupported(error)) {
      log.appendLine(
        "[ct] _typescript.configurePlugin not available in this VS Code version",
      );
      return;
    }

    log.appendLine(
      `[ct] Failed to configure TypeScript plugin: ${toErrorMessage(error)}`,
    );
  }
};

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
}
