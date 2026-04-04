import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const PLUGIN_ID = "ct-typescript-plugin";
const CT_BINARIES = ["ct", "ct-operator"] as const;
const DEBOUNCE_MS = 500;

let log: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

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

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  log = vscode.window.createOutputChannel("Cloudticon CT");
  context.subscriptions.push(log);
  log.appendLine("[ct] Extension activating…");

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
    switchCtToTypeScript(doc);
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(switchCtToTypeScript),
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
  if (doc.fileName.endsWith(".ct") && doc.languageId !== "typescript") {
    log.appendLine(`[ct] Switching ${doc.fileName} to typescript`);
    vscode.languages.setTextDocumentLanguage(doc, "typescript");
  }
};

const scheduleSyncAll = (ctPath: string | undefined): void => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncAll(ctPath), DEBOUNCE_MS);
};

const syncAll = async (ctPath: string | undefined): Promise<void> => {
  if (!ctPath) return;

  let configured = false;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = folder.uri.fsPath;
    log.appendLine(`[ct] Running ct types for: ${dir}`);

    const typesDir = runCtTypes(ctPath, dir);
    if (typesDir) {
      log.appendLine(`[ct] Types generated at: ${typesDir}`);
      await configurePlugin(typesDir);
      configured = true;
    }
  }

  if (configured) {
    await vscode.commands.executeCommand("typescript.restartTsServer");
  }
};

const configurePlugin = async (typesDir: string): Promise<void> => {
  try {
    await vscode.commands.executeCommand(
      "_typescript.configurePlugin",
      PLUGIN_ID,
      { typesDir },
    );
  } catch {
    // _typescript.configurePlugin not available in this VS Code version
  }
};

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
}
