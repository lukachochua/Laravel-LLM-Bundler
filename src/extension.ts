import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EXCLUDED_PATHS } from './exclusions';

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('laravel-bundler.bundle', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders) {
			vscode.window.showErrorMessage('No workspace open');
			return;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;
		const outputContent = await bundleLaravelCode(rootPath);

		const doc = await vscode.workspace.openTextDocument({
			content: outputContent,
			language: 'plaintext'
		});

		await vscode.window.showTextDocument(doc);
	});

	context.subscriptions.push(disposable);
}

async function bundleLaravelCode(rootPath: string): Promise<string> {
	let output = '// LARAVEL CODE BUNDLE\n\n';

	const processDirectory = async (currentPath: string) => {
		const files = await fs.promises.readdir(currentPath, { withFileTypes: true });

		for (const file of files) {
			const fullPath = path.join(currentPath, file.name);
			const relativePath = path.relative(rootPath, fullPath);

			if (isExcluded(relativePath)) {
				continue;
			}

			if (file.isDirectory()) {
				await processDirectory(fullPath);
			} else {
				const content = await fs.promises.readFile(fullPath, 'utf8');
				output += `// FILE: ${relativePath}\n${content}\n\n`;
			}
		}
	};

	await processDirectory(rootPath);
	return output;
}

function isExcluded(relativePath: string): boolean {
	return EXCLUDED_PATHS.some(pattern => {
		const isDirPattern = pattern.endsWith('/');
		const match = relativePath.startsWith(pattern.replace(/\/$/, ''));
		return isDirPattern ?
			relativePath.startsWith(pattern) || relativePath === pattern.replace(/\/$/, '') :
			relativePath === pattern;
	});
}