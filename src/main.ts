/**
 * SpeakNotes Plugin for Obsidian
 * Main entry point
 */

import { Notice, Plugin, TFile, MarkdownView } from "obsidian";
import { SpeakNotesAPI } from "./api/client";
import { addBreadcrumb, captureException, initSentry, setSentryUser } from "./lib/sentry";
import { SidebarView, VIEW_TYPE_SIDEBAR } from "./views/sidebar";
import { RecorderModal } from "./views/recorder";
import { ExportModal } from "./views/export-modal";
import { BulkExportModal } from "./views/bulk-export-modal";
import { ImportModal } from "./views/import-modal";
import { StatusBarManager } from "./views/status-bar";
import { SyncService } from "./services/sync";
import { SettingsTab, DEFAULT_SETTINGS, type SpeakNotesSettings } from "./settings";

export default class SpeakNotesPlugin extends Plugin {
	settings: SpeakNotesSettings = DEFAULT_SETTINGS;
	api!: SpeakNotesAPI;
	syncService!: SyncService;
	statusBarManager!: StatusBarManager;
	settingsTab!: SettingsTab;

	async onload(): Promise<void> {
		await this.loadSettings();

		initSentry(this.manifest.version);
		if (this.settings.userId) {
			setSentryUser({
				id: this.settings.userId,
				email: this.settings.userEmail || undefined,
			});
		}

		// Initialize API client
		this.api = new SpeakNotesAPI({
			baseUrl: this.settings.apiUrl || "https://api.speaknotes.io",
			token: this.settings.firebaseToken,
		});

		// Initialize sync service
		this.syncService = new SyncService(this.app, this.api, this.settings);

		// Initialize status bar
		this.statusBarManager = new StatusBarManager(this, this.syncService);
		this.statusBarManager.setConnected(!!this.settings.userId);
		this.statusBarManager.init();

		// Register sidebar view
		this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new SidebarView(leaf, this));

		// Add ribbon icon
		this.addRibbonIcon("microphone", "Record voice memo", () => {
			new RecorderModal(this.app, this).open();
		});

		// Add commands
		this.addCommand({
			id: "open-sidebar",
			name: "Open library",
			callback: () => {
				void this.activateSidebar();
			},
		});

		this.addCommand({
			id: "record-voice-memo",
			name: "Record voice memo",
			callback: () => new RecorderModal(this.app, this).open(),
		});

		this.addCommand({
			id: "export-current-note",
			name: "Export current note",
			editorCallback: (editor) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					new ExportModal(this.app, this, editor, view.file || undefined).open();
				}
			},
		});

		this.addCommand({
			id: "sync-library",
			name: "Sync library",
			callback: () => {
				void (async () => {
					this.statusBarManager.setStatus("syncing");
					try {
						await this.syncService.sync();
						this.statusBarManager.setStatus("success");
					} catch {
						this.statusBarManager.setStatus("error");
					}
				})();
			},
		});

		this.addCommand({
			id: "bulk-export",
			name: "Bulk export summaries",
			callback: () => new BulkExportModal(this.app, this).open(),
		});

		this.addCommand({
			id: "import-notes",
			name: "Import summaries",
			callback: () => new ImportModal(this.app, this).open(),
		});

		// Register custom code block for embeds
		this.registerMarkdownCodeBlockProcessor("speaknotes", async (source, el) => {
			await this.renderSpeakNotesEmbed(source, el);
		});

		// Context menu for audio files
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && this.isAudioFile(file)) {
					menu.addItem((item) => {
						item
							.setTitle("Transcribe audio")
							.setIcon("microphone")
							.onClick(() => {
								new ExportModal(this.app, this, undefined, file).open();
							});
					});
				}
			})
		);

		// Track file modifications for two-way sync
		// When a synced file is edited, update its "updated" timestamp in frontmatter
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.settings.enableTwoWaySync) {
					void this.handleFileModification(file);
				}
			})
		);

		// Track file renames for two-way sync
		// When a synced file is renamed, update its "updated" timestamp in frontmatter
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && this.settings.enableTwoWaySync) {
					void this.handleFileRename(file, oldPath);
				}
			})
		);

		// Settings tab
		this.settingsTab = new SettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		// Register protocol handler for OAuth callback
		this.registerObsidianProtocolHandler("speaknotes-auth-callback", (params) => {
			void this.handleAuthCallback(params);
		});

		// Auto-sync on startup if configured
		if (this.settings.autoSync && this.settings.userId) {
			// Delay sync to allow Obsidian to fully load
			this.registerInterval(
				window.setTimeout(() => {
					void this.syncService.sync();
				}, 5000)
			);
		}

		// Start periodic sync if configured
		if (this.settings.syncInterval > 0 && this.settings.userId) {
			this.syncService.startPeriodicSync();
		}

	}

	onunload(): void {
		this.syncService.stopPeriodicSync();
		this.statusBarManager.destroy();
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SpeakNotesSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.syncService.updateSettings(this.settings);
		this.statusBarManager.setConnected(!!this.settings.userId);
	}

	async activateSidebar(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: VIEW_TYPE_SIDEBAR,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	async renderSpeakNotesEmbed(source: string, el: HTMLElement): Promise<void> {
		const noteId = source.trim();

		try {
			const note = await this.api.getNote(noteId);

			const container = el.createDiv({ cls: "speaknotes-embed" });
			container.createEl("h4", { text: note.title });
			container.createEl("p", { text: note.summary });

			const meta = container.createDiv({ cls: "speaknotes-embed-meta" });
			meta.createSpan({ text: `Type: ${note.type}` });
			meta.createSpan({
				text: ` | Created: ${new Date(note.dateCreated).toLocaleDateString()}`,
			});
		} catch {
			el.createDiv({
				cls: "speaknotes-embed-error",
				text: "Failed to load SpeakNotes content",
			});
		}
	}

	isAudioFile(file: TFile): boolean {
		const audioExtensions = ["mp3", "m4a", "wav", "ogg", "webm", "aac", "flac"];
		return audioExtensions.includes(file.extension.toLowerCase());
	}

	isVideoFile(file: TFile): boolean {
		const videoExtensions = ["mp4", "mov", "webm", "mkv", "avi"];
		return videoExtensions.includes(file.extension.toLowerCase());
	}

	async handleAuthCallback(params: Record<string, string>): Promise<void> {
		const { token, userId, email } = params;
		addBreadcrumb("auth callback received", {
			hasToken: !!token,
			hasUserId: !!userId,
		});

		if (!token || !userId) {
			captureException(new Error("Auth callback missing token or userId"), {
				hasToken: !!token,
				hasUserId: !!userId,
			});
			new Notice("Login failed, please try again.");
			return;
		}

		try {
			this.settings.firebaseToken = token;
			this.settings.userId = userId;
			this.settings.userEmail = email || "";

			await this.saveSettings();
			setSentryUser({ id: userId, email: email || undefined });

			// Update API client
			this.api.setToken(token);

			// Register the Obsidian integration on the backend
			try {
				await this.api.connectObsidian();
			} catch (error) {
				console.error("Failed to register Obsidian integration:", error);
				captureException(error, { stage: "connectObsidian", userId });
			}

			// Update status bar
			this.statusBarManager.setConnected(true);
			this.statusBarManager.setStatus("syncing");

			// Trigger initial sync
			try {
				await this.syncService.sync();
				this.statusBarManager.setStatus("success");
			} catch (error) {
				this.statusBarManager.setStatus("error");
				captureException(error, { stage: "initial sync", userId });
			}

			// Start periodic sync
			if (this.settings.syncInterval > 0) {
				this.syncService.startPeriodicSync();
			}

			// Refresh settings tab so it reflects the connected state
			this.settingsTab.display();

			// Show success notification
			new Notice("Successfully connected!");
		} catch (error) {
			captureException(error, { stage: "handleAuthCallback", userId });
			new Notice("Login failed, please try again.");
		}
	}

	openSettings(): void {
		// Open the settings tab
		const { setting } = this.app as unknown as {
			setting: { open: () => void; openTabById: (id: string) => void };
		};
		if (setting) {
			setting.open();
			setting.openTabById(this.manifest.id);
		}
	}

	/**
	 * Handle file modification for two-way sync
	 * Updates the "updated" timestamp in frontmatter when a synced file is edited
	 */
	private isUpdatingFrontmatter = false;

	async handleFileModification(file: TFile): Promise<void> {
		// Prevent recursive updates when we modify the frontmatter
		if (this.isUpdatingFrontmatter) return;

		// Only process markdown files in the export folder
		if (!file.path.startsWith(this.settings.exportFolder)) return;
		if (file.extension !== "md") return;

		try {
			const content = await this.app.vault.read(file);

			// Check if this is a synced SpeakNotes file (has speaknotes_id in frontmatter)
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) return;

			const frontmatter = frontmatterMatch[1];
			if (!frontmatter.includes("speaknotes_id:")) return;

			// Update the "updated" timestamp in frontmatter
			const newTimestamp = new Date().toISOString();

			// Replace the updated field in frontmatter
			const updatedRegex = /updated:\s*\S+/;
			if (updatedRegex.test(frontmatter)) {
				const newFrontmatter = frontmatter.replace(updatedRegex, `updated: ${newTimestamp}`);
				const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}\n---`);

				// Only update if content changed (avoid infinite loop)
				if (newContent !== content) {
					this.isUpdatingFrontmatter = true;
					await this.app.vault.modify(file, newContent);
					this.isUpdatingFrontmatter = false;
				}
			}
		} catch (error) {
			this.isUpdatingFrontmatter = false;
			console.error("Failed to update frontmatter timestamp:", error);
		}
	}

	/**
	 * Handle file rename for two-way sync
	 * Updates the "updated" timestamp when a synced file is renamed (title change)
	 */
	async handleFileRename(file: TFile, oldPath: string): Promise<void> {
		// Prevent recursive updates
		if (this.isUpdatingFrontmatter) return;

		// Only process markdown files
		if (file.extension !== "md") return;

		// Check if old or new path is in the export folder
		const inExportFolder =
			file.path.startsWith(this.settings.exportFolder) ||
			oldPath.startsWith(this.settings.exportFolder);
		if (!inExportFolder) return;

		try {
			const content = await this.app.vault.read(file);

			// Check if this is a synced SpeakNotes file
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) return;

			const frontmatter = frontmatterMatch[1];
			if (!frontmatter.includes("speaknotes_id:")) return;

			// Update the "updated" timestamp in frontmatter
			const newTimestamp = new Date().toISOString();

			const updatedRegex = /updated:\s*\S+/;
			if (updatedRegex.test(frontmatter)) {
				const newFrontmatter = frontmatter.replace(updatedRegex, `updated: ${newTimestamp}`);
				const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}\n---`);

				if (newContent !== content) {
					this.isUpdatingFrontmatter = true;
					await this.app.vault.modify(file, newContent);
					this.isUpdatingFrontmatter = false;
				}
			}
		} catch (error) {
			this.isUpdatingFrontmatter = false;
			console.error("Failed to update frontmatter timestamp on rename:", error);
		}
	}
}
