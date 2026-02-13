import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface Bookmark {
	name: string;
	url: string;
	folder?: string;
}

interface ArcSidebarItem {
	value?: {
		id?: string;
		title?: string;
		parentID?: string;
		childrenIds?: string[];
		data?: {
			tab?: {
				savedURL?: string;
				savedTitle?: string;
			};
		};
	};
}

const STORAGE_KEY = 'arcBookmarks.list';
const OPEN_CMD = 'workbench.action.browser.open';
const ARC_SIDEBAR_PATH = path.join(
	os.homedir(), 'Library', 'Application Support', 'Arc', 'StorableSidebar.json'
);

function getBookmarks(context: vscode.ExtensionContext): Bookmark[] {
	return context.globalState.get<Bookmark[]>(STORAGE_KEY, []);
}

function saveBookmarks(context: vscode.ExtensionContext, bookmarks: Bookmark[]): Thenable<void> {
	return context.globalState.update(STORAGE_KEY, bookmarks);
}

function readArcBookmarks(): Bookmark[] {
	if (!fs.existsSync(ARC_SIDEBAR_PATH)) {
		return [];
	}

	const raw = JSON.parse(fs.readFileSync(ARC_SIDEBAR_PATH, 'utf-8'));
	const items: ArcSidebarItem[] = raw?.sidebarSyncState?.items ?? [];

	// Build id→title map for folder names
	const folderNames = new Map<string, string>();
	for (const item of items) {
		if (typeof item === 'string' || !item.value) { continue; }
		const val = item.value;
		if (val.childrenIds?.length && !val.data?.tab && val.title) {
			folderNames.set(val.id ?? '', val.title);
		}
	}

	const bookmarks: Bookmark[] = [];
	for (const item of items) {
		if (typeof item === 'string' || !item.value) { continue; }
		const val = item.value;
		const tab = val.data?.tab;
		const url = tab?.savedURL;
		const name = val.title || tab?.savedTitle || '';
		if (!url || !name) { continue; }

		const folder = folderNames.get(val.parentID ?? '') ?? undefined;
		bookmarks.push({ name, url, folder });
	}

	return bookmarks;
}

export function activate(context: vscode.ExtensionContext) {

	// ── Open a bookmark ──────────────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('arcBookmarks.open', async () => {
			const bookmarks = getBookmarks(context);

			// Quick actions always at the top
			const quickActions: (vscode.QuickPickItem & { action: string })[] = [
				{ label: '$(globe) New blank page', description: 'Open integrated browser', action: 'blank', alwaysShow: true },
				{ label: '$(clippy) Open from clipboard', description: 'Paste a URL and open it', action: 'clipboard', alwaysShow: true },
			];

			if (bookmarks.length === 0) {
				quickActions.push(
					{ label: '$(sync) Sync from Arc', description: 'Import your Arc bookmarks', action: 'sync', alwaysShow: true },
				);
			}

			const separator: vscode.QuickPickItem = { label: 'Bookmarks', kind: vscode.QuickPickItemKind.Separator };

			const bookmarkItems = bookmarks.map((b, i) => ({
				label: b.name,
				description: b.folder ? `$(folder) ${b.folder}` : '',
				detail: b.url,
				index: i,
				action: 'bookmark' as const,
			}));

			const allItems = bookmarks.length > 0
				? [...quickActions, separator, ...bookmarkItems]
				: quickActions;

			const picked = await vscode.window.showQuickPick(allItems, {
				placeHolder: 'Search bookmarks or pick an action...',
				matchOnDescription: true,
				matchOnDetail: true,
			});
			if (!picked) { return; }

			const action = (picked as any).action as string;
			if (action === 'blank') {
				await vscode.commands.executeCommand(OPEN_CMD);
			} else if (action === 'clipboard') {
				const clip = await vscode.env.clipboard.readText();
				const url = clip.trim();
				if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
					await vscode.commands.executeCommand(OPEN_CMD, url);
				} else {
					const manual = await vscode.window.showInputBox({
						prompt: 'Clipboard doesn\'t contain a URL. Enter one manually:',
						placeHolder: 'https://example.com',
						value: url,
					});
					if (manual) {
						await vscode.commands.executeCommand(OPEN_CMD, manual);
					}
				}
			} else if (action === 'sync') {
				await vscode.commands.executeCommand('arcBookmarks.sync');
			} else if (action === 'bookmark') {
				const idx = (picked as any).index as number;
				await vscode.commands.executeCommand(OPEN_CMD, bookmarks[idx].url);
			}
		})
	);

	// ── Add a bookmark ───────────────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('arcBookmarks.add', async () => {
			const url = await vscode.window.showInputBox({
				prompt: 'URL',
				placeHolder: 'https://github.com',
				validateInput: (v) => {
					try { new URL(v); return null; } catch { return 'Enter a valid URL'; }
				},
			});
			if (!url) { return; }

			let defaultName = '';
			try { defaultName = new URL(url).hostname.replace('www.', ''); } catch { /* */ }

			const name = await vscode.window.showInputBox({
				prompt: 'Bookmark name',
				placeHolder: 'My Bookmark',
				value: defaultName,
			});
			if (!name) { return; }

			const bookmarks = getBookmarks(context);
			bookmarks.push({ name, url });
			await saveBookmarks(context, bookmarks);
			vscode.window.showInformationMessage(`Bookmark "${name}" saved.`);
		})
	);

	// ── Remove a bookmark ────────────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('arcBookmarks.remove', async () => {
			const bookmarks = getBookmarks(context);
			if (bookmarks.length === 0) {
				vscode.window.showInformationMessage('No bookmarks to remove.');
				return;
			}

			const picked = await vscode.window.showQuickPick(
				bookmarks.map((b, i) => ({
					label: b.name,
					description: b.folder ?? '',
					detail: b.url,
					index: i,
				})),
				{ placeHolder: 'Select bookmark to remove', matchOnDescription: true, matchOnDetail: true }
			);
			if (picked) {
				bookmarks.splice(picked.index, 1);
				await saveBookmarks(context, bookmarks);
				vscode.window.showInformationMessage(`Removed "${picked.label}".`);
			}
		})
	);

	// ── Edit a bookmark ──────────────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('arcBookmarks.edit', async () => {
			const bookmarks = getBookmarks(context);
			if (bookmarks.length === 0) {
				vscode.window.showInformationMessage('No bookmarks to edit.');
				return;
			}

			const picked = await vscode.window.showQuickPick(
				bookmarks.map((b, i) => ({
					label: b.name,
					detail: b.url,
					index: i,
				})),
				{ placeHolder: 'Select bookmark to edit', matchOnDetail: true }
			);
			if (!picked) { return; }

			const bm = bookmarks[picked.index];

			const newUrl = await vscode.window.showInputBox({
				prompt: 'URL',
				value: bm.url,
				validateInput: (v) => {
					try { new URL(v); return null; } catch { return 'Enter a valid URL'; }
				},
			});
			if (!newUrl) { return; }

			const newName = await vscode.window.showInputBox({
				prompt: 'Bookmark name',
				value: bm.name,
			});
			if (!newName) { return; }

			bookmarks[picked.index] = { name: newName, url: newUrl, folder: bm.folder };
			await saveBookmarks(context, bookmarks);
			vscode.window.showInformationMessage(`Updated "${newName}".`);
		})
	);

	// ── Sync from Arc ────────────────────────────────────────────────
	context.subscriptions.push(
		vscode.commands.registerCommand('arcBookmarks.sync', async () => {
			const arcBookmarks = readArcBookmarks();
			if (arcBookmarks.length === 0) {
				vscode.window.showWarningMessage('No bookmarks found in Arc. Is Arc installed?');
				return;
			}

			const existing = getBookmarks(context);
			const existingUrls = new Set(existing.map(b => b.url));

			// Let user pick which Arc bookmarks to import
			const items = arcBookmarks
				.filter(b => !existingUrls.has(b.url))
				.map(b => ({
					label: b.name,
					description: b.folder ? `$(folder) ${b.folder}` : '',
					detail: b.url,
					picked: true,
					bookmark: b,
				}));

			if (items.length === 0) {
				vscode.window.showInformationMessage('All Arc bookmarks already synced.');
				return;
			}

			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: `Import from Arc (${items.length} new)`,
				canPickMany: true,
				matchOnDescription: true,
				matchOnDetail: true,
			});

			if (picked && picked.length > 0) {
				const merged = [...existing, ...picked.map(p => p.bookmark)];
				await saveBookmarks(context, merged);
				vscode.window.showInformationMessage(`Imported ${picked.length} bookmarks from Arc.`);
			}
		})
	);
}

export function deactivate() {}
