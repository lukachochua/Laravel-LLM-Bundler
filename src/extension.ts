import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Default configuration that can be overridden
const DEFAULT_CONFIG = {
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
					path: 'Services', pattern: (baseName: string) =>
						baseName.replace('Controller', 'Service') + '.php'
				},
				{
					path: 'Repositories', pattern: (baseName: string) =>
						baseName.replace('Controller', 'Repository') + '.php'
				}
			]
		},
		'Services': {
			pattern: /Service\.php$/,
			related: [
				{
					path: 'Controllers', pattern: (baseName: string) =>
						baseName.replace('Service', 'Controller') + '.php'
				},
				{
					path: 'Actions', pattern: (baseName: string) =>
						baseName.replace('Service', 'Action') + '.php'
				}
			]
		}
	}
};

interface BundleConfiguration {
	includedPaths: string[];
	fileRelationships: Record<string, {
		pattern: RegExp;
		related: Array<{
			path: string;
			pattern: (baseName: string) => string;
		}>;
	}>;
}

export function activate(context: vscode.ExtensionContext) {
	// Register configuration command
	let configureCommand = vscode.commands.registerCommand(
		'laravel-bundler.configure',
		async () => {
			await showConfigurationDialog();
		}
	);

	// Register bundle command
	let bundleCommand = vscode.commands.registerCommand(
		'laravel-bundler.bundle',
		async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('No workspace open');
				return;
			}

			const config = await getConfiguration();
			if (!config) {
				return;
			}

			const rootPath = workspaceFolders[0].uri.fsPath;
			const outputContent = await bundleLaravelCode(rootPath, config);

			const doc = await vscode.workspace.openTextDocument({
				content: outputContent,
				language: 'php'
			});

			await vscode.window.showTextDocument(doc);
		}
	);

	context.subscriptions.push(configureCommand, bundleCommand);
}

async function showConfigurationDialog(): Promise<void> {
	const config = vscode.workspace.getConfiguration('laravelBundler');
	const currentPaths = config.get<string[]>('includedPaths') || DEFAULT_CONFIG.includedPaths;

	// Show quick pick for paths
	const selectedPaths = await vscode.window.showQuickPick(
		currentPaths.map(path => ({
			label: path,
			picked: true
		})).concat(
			// Allow adding new paths
			{ label: '$(add) Add new path...', picked: false }
		),
		{
			canPickMany: true,
			placeHolder: 'Select folders to include in bundle'
		}
	);

	if (!selectedPaths) {
		return;
	}

	// Handle adding new path
	let finalPaths = selectedPaths
		.filter(item => item.label !== '$(add) Add new path...')
		.map(item => item.label);

	if (selectedPaths.some(item => item.label === '$(add) Add new path...')) {
		const newPath = await vscode.window.showInputBox({
			prompt: 'Enter new path (relative to project root)',
			placeHolder: 'app/CustomFolder/'
		});
		if (newPath) {
			finalPaths.push(newPath);
		}
	}

	// Save configuration
	await config.update('includedPaths', finalPaths, vscode.ConfigurationTarget.Workspace);
	vscode.window.showInformationMessage('Laravel Bundler configuration updated');
}

async function getConfiguration(): Promise<BundleConfiguration | null> {
	const config = vscode.workspace.getConfiguration('laravelBundler');
	const includedPaths = config.get<string[]>('includedPaths');

	if (!includedPaths || includedPaths.length === 0) {
		const useDefault = await vscode.window.showQuickPick(
			['Yes, use defaults', 'No, configure now'],
			{
				placeHolder: 'No configuration found. Use default settings?'
			}
		);

		if (!useDefault) {
			return null;
		}

		if (useDefault === 'No, configure now') {
			await showConfigurationDialog();
			return getConfiguration();
		}

		return DEFAULT_CONFIG;
	}

	return {
		includedPaths,
		fileRelationships: DEFAULT_CONFIG.fileRelationships // Keep default relationships for now
	};
}

async function bundleLaravelCode(rootPath: string, config: BundleConfiguration): Promise<string> {
	let output = "<?php\n\n// LARAVEL LOGIC CODE BUNDLE\n\n";
	const processedFiles = new Set<string>();

	for (const includedPath of config.includedPaths) {
		const fullPath = path.join(rootPath, includedPath);
		if (!fs.existsSync(fullPath)) {
			continue;
		}

		const files = await findPhpFiles(fullPath);

		for (const file of files) {
			if (processedFiles.has(file)) {
				continue;
			}

			const fileContent = await processFile(rootPath, file, processedFiles, config);
			output += fileContent;
		}
	}

	return output;
}

async function findPhpFiles(dirPath: string): Promise<string[]> {
	const files: string[] = [];

	const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

	for (const item of items) {
		const fullPath = path.join(dirPath, item.name);

		if (item.isDirectory()) {
			files.push(...await findPhpFiles(fullPath));
		} else if (item.name.endsWith('.php')) {
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
	let output = '';
	const relativePath = path.relative(rootPath, filePath);

	if (processedFiles.has(filePath)) {
		return output;
	}

	// Add the main file content
	const content = await fs.promises.readFile(filePath, 'utf8');
	output += `\n// FILE: ${relativePath}\n${content}\n`;
	processedFiles.add(filePath);

	// Find and add related files
	const relatedFiles = await findRelatedFiles(rootPath, filePath, config);
	for (const relatedFile of relatedFiles) {
		if (!processedFiles.has(relatedFile)) {
			const relatedContent = await processFile(rootPath, relatedFile, processedFiles, config);
			output += relatedContent;
		}
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

	// Check each relationship pattern
	for (const [type, typeConfig] of Object.entries(config.fileRelationships)) {
		if (typeConfig.pattern.test(fileName)) {
			const baseName = fileName.replace(typeConfig.pattern, '');

			// Look for each related file type
			for (const related of typeConfig.related) {
				const relatedFileName = related.pattern(baseName);
				const relatedPath = path.join(rootPath, 'app', related.path, relatedFileName);

				if (fs.existsSync(relatedPath)) {
					relatedFiles.push(relatedPath);
				}
			}
		}
	}

	return relatedFiles;
}