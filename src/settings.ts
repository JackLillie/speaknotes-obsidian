/**
 * SpeakNotes Plugin Settings
 * Configuration tab for the Obsidian plugin
 */

import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import type SpeakNotesPlugin from "./main";
import type { ContentFormat } from "./types/speaknotes";
import { CONTENT_FORMATS } from "./types/plugin";

export class SettingsTab extends PluginSettingTab {
	plugin: SpeakNotesPlugin;

	constructor(app: App, plugin: SpeakNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Connection").setHeading();

		if (this.plugin.settings.userId) {
			// Connected state
			new Setting(containerEl)
				.setName("Connected account")
				.setDesc(`Signed in as ${this.plugin.settings.userEmail || this.plugin.settings.userId}`)
				.addButton((btn) =>
					btn
						.setButtonText("Disconnect")
						.setWarning()
						.onClick(async () => {
							await this.handleDisconnect();
						})
				);

			// Last sync info
			if (this.plugin.settings.lastSyncTimestamp) {
				const lastSync = new Date(this.plugin.settings.lastSyncTimestamp);
				new Setting(containerEl)
					.setName("Last sync")
					.setDesc(lastSync.toLocaleString())
					.addButton((btn) =>
						btn.setButtonText("Sync now").onClick(async () => {
							await this.plugin.syncService.sync();
							this.display(); // Refresh to show new timestamp
						})
					);
			}
		} else {
			// Not connected state
			new Setting(containerEl)
				.setName("Connect account")
				.setDesc("Sign in to sync notes")
				.addButton((btn) =>
					btn
						.setButtonText("Log in")
						.setCta()
						.onClick(() => this.initiateLogin())
				);
		}

		new Setting(containerEl).setName("Sync").setHeading();

		// Export folder
		new Setting(containerEl)
			.setName("Export folder")
			.setDesc("Folder in your vault where summaries will be saved")
			.addText((text) =>
				text
					.setPlaceholder("Summaries")
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportFolder = value || "SpeakNotes";
						await this.plugin.saveSettings();
					})
			);

		// Auto sync
		new Setting(containerEl)
			.setName("Auto-sync on startup")
			.setDesc("Automatically sync notes when Obsidian launches")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				})
			);

		// Sync interval
		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("How often to sync in minutes (0 to disable periodic sync)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 120, 5)
					.setValue(this.plugin.settings.syncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();

						// Restart periodic sync with new interval
						this.plugin.syncService.stopPeriodicSync();
						if (value > 0) {
							this.plugin.syncService.startPeriodicSync();
						}
					})
			);

		// Two-way sync
		new Setting(containerEl)
			.setName("Two-way sync")
			.setDesc("Push local edits back to the cloud when syncing (title and summary changes)")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableTwoWaySync).onChange(async (value) => {
					this.plugin.settings.enableTwoWaySync = value;
					await this.plugin.saveSettings();
				})
			);

		// Force refresh
		new Setting(containerEl)
			.setName("Force refresh")
			.setDesc("Delete all local summaries and re-download everything from the cloud")
			.addButton((btn) =>
				btn
					.setButtonText("Force refresh")
					.setWarning()
					.onClick(async () => {
						const confirmed = await this.confirmForceRefresh();
						if (confirmed) {
							await this.handleForceRefresh();
						}
					})
			);

		new Setting(containerEl).setName("Content").setHeading();

		// Default format
		new Setting(containerEl)
			.setName("Default summary format")
			.setDesc("Default format for new recordings")
			.addDropdown((dropdown) => {
				for (const format of CONTENT_FORMATS) {
					dropdown.addOption(format.value, format.label);
				}
				dropdown.setValue(this.plugin.settings.defaultFormat).onChange(async (value) => {
					this.plugin.settings.defaultFormat = value as ContentFormat;
					await this.plugin.saveSettings();
				});
			});

		// Include transcription
		new Setting(containerEl)
			.setName("Include full transcription")
			.setDesc("Include the full transcription in exported notes")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeTranscription).onChange(async (value) => {
					this.plugin.settings.includeTranscription = value;
					await this.plugin.saveSettings();
				})
			);

		// Custom template
		new Setting(containerEl)
			.setName("Export template")
			.setDesc(
				"Custom Markdown template. Available variables: {{id}}, {{title}}, {{created}}, {{updated}}, {{type}}, {{status}}, {{format}}, {{isPinned}}, {{summary}}, {{transcription}}"
			)
			.addTextArea((text) => {
				text.inputEl.rows = 10;
				text.inputEl.cols = 50;
				return text
					.setPlaceholder("Leave empty for default template")
					.setValue(this.plugin.settings.exportTemplate)
					.onChange(async (value) => {
						this.plugin.settings.exportTemplate = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("About").setHeading();

		new Setting(containerEl)
			.setName("Version")
			.setDesc(this.plugin.manifest.version)
			.addButton((btn) =>
				btn.setButtonText("Visit website").onClick(() => {
					window.open("https://speaknotes.io");
				})
			);

		new Setting(containerEl)
			.setName("Support")
			.setDesc("Get help or report issues")
			.addButton((btn) =>
				btn.setButtonText("Documentation").onClick(() => {
					window.open("https://speaknotes.io/docs/obsidian");
				})
			);
	}

	initiateLogin(): void {
		// Open SpeakNotes web login with redirect back to Obsidian
		const redirectUrl = "obsidian://speaknotes-auth-callback";
		window.open(`https://speaknotes.io/auth/obsidian?redirect=${encodeURIComponent(redirectUrl)}`);

		new Notice("Opening login in your browser...");
	}

	async handleDisconnect(): Promise<void> {
		this.plugin.settings.firebaseToken = "";
		this.plugin.settings.userId = "";
		this.plugin.settings.userEmail = "";
		this.plugin.settings.lastSyncTimestamp = 0;

		await this.plugin.saveSettings();

		this.plugin.syncService.stopPeriodicSync();

		new Notice("Disconnected");
		this.display();
	}

	async confirmForceRefresh(): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(
				this.app,
				"Force refresh",
				"This will delete all local SpeakNotes summaries and re-download them from the server. Any local changes that haven't been synced will be lost.\n\nAre you sure?",
				() => resolve(true),
				() => resolve(false)
			);
			modal.open();
		});
	}

	async handleForceRefresh(): Promise<void> {
		new Notice("Starting force refresh...");

		try {
			const { vault, fileManager } = this.plugin.app;
			const exportFolder = this.plugin.settings.exportFolder || "SpeakNotes";

			// Find and delete all synced files
			const files = vault.getMarkdownFiles();
			let deletedCount = 0;

			for (const file of files) {
				if (file.path.startsWith(exportFolder)) {
					const content = await vault.read(file);
					// Only delete files with speaknotes_id in frontmatter
					if (content.includes("speaknotes_id:")) {
						await fileManager.trashFile(file);
						deletedCount++;
					}
				}
			}

			// Reset last sync timestamp
			this.plugin.settings.lastSyncTimestamp = 0;
			await this.plugin.saveSettings();

			new Notice(`Deleted ${deletedCount} local summaries`);

			// Trigger fresh sync
			await this.plugin.syncService.sync();

			this.display();
		} catch (error) {
			console.error("Force refresh failed:", error);
			new Notice(`Force refresh failed - ${(error as Error).message}`);
		}
	}
}

/**
 * Confirmation modal for destructive actions
 */
class ConfirmModal extends Modal {
	title: string;
	message: string;
	onConfirm: () => void;
	onCancel: () => void;

	constructor(
		app: App,
		title: string,
		message: string,
		onConfirm: () => void,
		onCancel: () => void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.onclick = () => {
			this.onCancel();
			this.close();
		};

		const confirmBtn = buttonContainer.createEl("button", {
			text: "Force refresh",
			cls: "mod-warning",
		});
		confirmBtn.onclick = () => {
			this.onConfirm();
			this.close();
		};
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export { type SpeakNotesSettings, DEFAULT_SETTINGS } from "./types/plugin";
