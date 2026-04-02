import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  parseURLImportsFromFile,
  getMissingPackages,
  downloadPackage,
} from './downloader';
import {
  generateValuesDeclaration,
  findValuesFile,
  getValuesDeclarationPath,
} from './values';

const PLUGIN_ID = 'ct-typescript-plugin';

let log: vscode.OutputChannel;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  log = vscode.window.createOutputChannel('Cloudticon CT');
  context.subscriptions.push(log);
  log.appendLine('[ct] Extension activating…');

  for (const doc of vscode.workspace.textDocuments) {
    switchCtToTypeScript(doc);
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => switchCtToTypeScript(doc)),
  );

  const ctWatcher = vscode.workspace.createFileSystemWatcher('**/*.ct');
  context.subscriptions.push(
    ctWatcher.onDidChange((uri) => onCtFileChanged(uri)),
    ctWatcher.onDidCreate((uri) => onCtFileChanged(uri)),
    ctWatcher,
  );

  const valuesWatcher = vscode.workspace.createFileSystemWatcher(
    '**/values.{json,yaml,yml}',
  );
  context.subscriptions.push(
    valuesWatcher.onDidChange(() => syncAllValues()),
    valuesWatcher.onDidCreate(() => syncAllValues()),
    valuesWatcher.onDidDelete(() => syncAllValues()),
    valuesWatcher,
  );

  await initialSync();
  log.appendLine('[ct] Extension activated');
}

const switchCtToTypeScript = (doc: vscode.TextDocument): void => {
  if (doc.fileName.endsWith('.ct') && doc.languageId !== 'typescript') {
    log.appendLine(`[ct] Switching ${doc.fileName} from "${doc.languageId}" to "typescript"`);
    vscode.languages.setTextDocumentLanguage(doc, 'typescript');
  }
};

const initialSync = async (): Promise<void> => {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = folder.uri.fsPath;
    log.appendLine(`[ct] Syncing folder: ${dir}`);
    const mainCt = path.join(dir, 'main.ct');
    if (fs.existsSync(mainCt)) {
      log.appendLine(`[ct] Found main.ct, processing imports…`);
      await onCtFileChanged(vscode.Uri.file(mainCt));
    }
    await syncValuesForFolder(dir);
  }
};

const onCtFileChanged = async (uri: vscode.Uri): Promise<void> => {
  const urls = parseURLImportsFromFile(uri.fsPath);
  log.appendLine(`[ct] Parsed imports from ${uri.fsPath}: ${JSON.stringify(urls)}`);
  if (urls.length === 0) return;

  const missing = getMissingPackages(urls);
  log.appendLine(`[ct] Missing packages: ${missing.map(m => m.url).join(', ') || 'none'}`);
  if (missing.length === 0) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Downloading ct packages…',
      cancellable: false,
    },
    async (progress) => {
      for (const { url, ref } of missing) {
        progress.report({ message: url });
        try {
          downloadPackage(ref);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to download ${url}: ${err.message}`,
          );
        }
      }
    },
  );

  await vscode.commands.executeCommand('typescript.restartTsServer');
};

const syncAllValues = async (): Promise<void> => {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    await syncValuesForFolder(folder.uri.fsPath);
  }
};

const syncValuesForFolder = async (folderPath: string): Promise<void> => {
  const valuesFile = findValuesFile(folderPath);
  const declPath = getValuesDeclarationPath(folderPath);
  log.appendLine(`[ct] Values file: ${valuesFile ?? 'not found'}`);
  log.appendLine(`[ct] Values decl path: ${declPath}`);

  if (valuesFile) {
    try {
      const declaration = generateValuesDeclaration(valuesFile);
      fs.mkdirSync(path.dirname(declPath), { recursive: true });
      fs.writeFileSync(declPath, declaration, 'utf-8');
      log.appendLine(`[ct] Generated values.d.ts (${declaration.length} bytes)`);
    } catch (err: any) {
      vscode.window.showWarningMessage(
        `Failed to generate Values types: ${err.message}`,
      );
      return;
    }
  } else if (fs.existsSync(declPath)) {
    fs.unlinkSync(declPath);
  }

  const exists = fs.existsSync(declPath);
  log.appendLine(`[ct] Configuring plugin with valuesDeclarationPath=${exists ? declPath : 'undefined'}`);
  await configurePlugin(exists ? declPath : undefined);
};

const configurePlugin = async (
  valuesDeclarationPath: string | undefined,
): Promise<void> => {
  try {
    await vscode.commands.executeCommand(
      '_typescript.configurePlugin',
      PLUGIN_ID,
      { valuesDeclarationPath },
    );
  } catch {
    // _typescript.configurePlugin not available in this VS Code version
  }
};

export function deactivate(): void {}
