import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface FileRelationship {
	path: string;
	pattern: (baseName: string) => string;
}

interface BundleConfiguration {
	includedPaths: string[];
	fileRelationships: Record<string, {
		pattern: RegExp;
		related: FileRelationship[];
	}>;
}

export const DEFAULT_CONFIG: BundleConfiguration = {
	includedPaths: [
		'app/Http/Controllers/',
		'app/Services/',
		'app/Models/',
		'app/Repositories/',
		'app/Actions/'
	],
	fileRelationships: {
		'Controllers': {
			pattern: /Controller\.php$/,
			related: [
				{
					path: 'app/Services',
					pattern: (baseName: string) => `${baseName.replace('Controller', 'Service')}.php`
				},
				{
					path: 'app/Repositories',
					pattern: (baseName: string) => `${baseName.replace('Controller', 'Repository')}.php`
				}
			]
		},
		'Services': {
			pattern: /Service\.php$/,
			related: [
				{
					path: 'app/Http/Controllers',
					pattern: (baseName: string) => `${baseName.replace('Service', 'Controller')}.php`
				},
				{
					path: 'app/Actions',
					pattern: (baseName: string) => `${baseName.replace('Service', 'Action')}.php`
				}
			]
		}
	}
};

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('laravel-bundler.bundle', handleBundleCommand),
		vscode.commands.registerCommand('laravel-bundler.configure', handleConfigureCommand)
	);
}

async function handleBundleCommand() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace open');
		return;
	}

	const config = await getConfiguration();
	if (!config) return;

	try {
		const rootPath = workspaceFolders[0].uri.fsPath;
		const outputContent = await generateBundle(rootPath, config);
		const doc = await vscode.workspace.openTextDocument({ content: outputContent, language: 'php' });
		await vscode.window.showTextDocument(doc);
	} catch (error) {
		vscode.window.showErrorMessage(`Bundle failed: ${error instanceof Error ? error.message : error}`);
	}
}

async function handleConfigureCommand() {
	const config = vscode.workspace.getConfiguration('laravelBundler');

	// Get current paths, falling back to defaults if none exist
	const currentPaths = config.get<string[]>('includedPaths') || [...DEFAULT_CONFIG.includedPaths];

	// Create quick pick items with all available paths
	const allPaths = new Set([...currentPaths, ...DEFAULT_CONFIG.includedPaths]);
	const pathOptions = Array.from(allPaths).map(p => ({
		label: p,
		picked: currentPaths.includes(p)
	}));

	// Add the "Add new path" option
	pathOptions.push({ label: '$(add) Add new path...', picked: false });

	const selected = await vscode.window.showQuickPick(pathOptions, {
		canPickMany: true,
		placeHolder: 'Select folders to include in bundle'
	});

	if (!selected) return;

	let finalPaths = selected
		.filter(i => i.label !== '$(add) Add new path...')
		.map(i => i.label);

	if (selected.some(i => i.label === '$(add) Add new path...')) {
		const newPath = await vscode.window.showInputBox({
			prompt: 'Enter new path relative to project root',
			placeHolder: 'app/CustomFolder/',
			validateInput: (value) => {
				if (!value) return 'Path cannot be empty';
				if (!value.endsWith('/')) return 'Path must end with a forward slash (/)';
				return null;
			}
		});

		if (newPath) {
			finalPaths.push(newPath);
		}
	}

	// If no paths selected, offer to use defaults
	if (finalPaths.length === 0) {
		const useDefaults = await vscode.window.showWarningMessage(
			'No paths selected. Would you like to use default paths?',
			'Yes', 'No'
		);

		if (useDefaults === 'Yes') {
			finalPaths = [...DEFAULT_CONFIG.includedPaths];
		}
	}

	await config.update('includedPaths', finalPaths, vscode.ConfigurationTarget.Workspace);
	vscode.window.showInformationMessage(`Configuration updated with ${finalPaths.length} paths`);
}

async function getConfiguration(): Promise<BundleConfiguration | null> {
	const config = vscode.workspace.getConfiguration('laravelBundler');
	const includedPaths = config.get<string[]>('includedPaths');

	if (!includedPaths?.length) {
		const choice = await vscode.window.showQuickPick(
			['Use Defaults', 'Configure Now'],
			{ placeHolder: 'No configuration found. Use default settings?' }
		);

		if (!choice) return null;
		if (choice === 'Configure Now') {
			await vscode.commands.executeCommand('laravel-bundler.configure');
			return getConfiguration();
		}

		return DEFAULT_CONFIG;
	}

	return {
		includedPaths: includedPaths,
		fileRelationships: DEFAULT_CONFIG.fileRelationships
	};
}

async function generateBundle(rootPath: string, config: BundleConfiguration): Promise<string> {
	let output = "<?php\n\n// LARAVEL CODE BUNDLE\n\n";
	const processedFiles = new Set<string>();

	for (const relPath of config.includedPaths) {
		const fullPath = path.join(rootPath, relPath);
		if (!fs.existsSync(fullPath)) {
			console.log(`Path does not exist: ${fullPath}`);
			continue;
		}

		try {
			const files = await findPhpFiles(fullPath);
			for (const file of files) {
				if (!processedFiles.has(file)) {
					output += await processFile(rootPath, file, processedFiles, config);
				}
			}
		} catch (error) {
			console.error(`Error processing ${relPath}:`, error);
			vscode.window.showErrorMessage(`Error processing ${relPath}: ${error instanceof Error ? error.message : error}`);
		}
	}

	return output;
}

async function findPhpFiles(dirPath: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...await findPhpFiles(fullPath));
		} else if (entry.name.endsWith('.php')) {
			files.push(fullPath);
		}
	}

	return files;
}

async function processFile(
	rootPath: string,
	filePath: string,
	processedFiles: Set<string>,
	config: BundleConfiguration
): Promise<string> {
	if (processedFiles.has(filePath)) return '';
	processedFiles.add(filePath);

	let output = `\n// FILE: ${path.relative(rootPath, filePath)}\n`;
	output += await fs.promises.readFile(filePath, 'utf8');
	output += '\n';

	const relatedFiles = await findRelatedFiles(rootPath, filePath, config);
	for (const relatedFile of relatedFiles) {
		output += await processFile(rootPath, relatedFile, processedFiles, config);
	}

	return output;
}

async function findRelatedFiles(
	rootPath: string,
	filePath: string,
	config: BundleConfiguration
): Promise<string[]> {
	const relatedFiles: string[] = [];
	const fileName = path.basename(filePath);

	for (const { pattern, related } of Object.values(config.fileRelationships)) {
		if (pattern.test(fileName)) {
			const baseName = fileName.replace(pattern, '');

			for (const rel of related) {
				const relPath = path.join(rootPath, rel.path, rel.pattern(baseName));
				if (fs.existsSync(relPath)) {
					relatedFiles.push(relPath);
				}
			}
		}
	}

	return relatedFiles;
}