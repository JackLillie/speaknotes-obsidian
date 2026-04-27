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

		containerEl.createEl("h2", { text: "SpeakNotes Settings" });

		// Connection section
		containerEl.createEl("h3", { text: "Connection" });

		if (this.plugin.settings.userId) {
			// Connected state
			new Setting(containerEl)
				.setName("Connected Account")
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
					.setName("Last Sync")
					.setDesc(lastSync.toLocaleString())
					.addButton((btn) =>
						btn.setButtonText("Sync Now").onClick(async () => {
							await this.plugin.syncService.sync();
							this.display(); // Refresh to show new timestamp
						})
					);
			}
		} else {
			// Not connected state
			new Setting(containerEl)
				.setName("Connect Account")
				.setDesc("Sign in with your SpeakNotes account to sync notes")
				.addButton((btn) =>
					btn
						.setButtonText("Login with SpeakNotes")
						.setCta()
						.onClick(() => this.initiateLogin())
				);
		}

		// Sync section
		containerEl.createEl("h3", { text: "Sync Settings" });

		// Export folder
		new Setting(containerEl)
			.setName("Export Folder")
			.setDesc("Folder in your vault where SpeakNotes will be saved")
			.addText((text) =>
				text
					.setPlaceholder("SpeakNotes")
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportFolder = value || "SpeakNotes";
						await this.plugin.saveSettings();
					})
			);

		// Auto sync
		new Setting(containerEl)
			.setName("Auto Sync")
			.setDesc("Automatically sync notes on startup")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				})
			);

		// Sync interval
		new Setting(containerEl)
			.setName("Sync Interval")
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
			.setName("Two-Way Sync")
			.setDesc("Push local edits back to SpeakNotes when syncing (title and summary changes)")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableTwoWaySync).onChange(async (value) => {
					this.plugin.settings.enableTwoWaySync = value;
					await this.plugin.saveSettings();
				})
			);

		// Force refresh
		new Setting(containerEl)
			.setName("Force Refresh")
			.setDesc("Delete all local summaries and re-download everything from SpeakNotes")
			.addButton((btn) =>
				btn
					.setButtonText("Force Refresh")
					.setWarning()
					.onClick(async () => {
						const confirmed = await this.confirmForceRefresh();
						if (confirmed) {
							await this.handleForceRefresh();
						}
					})
			);

		// Content section
		containerEl.createEl("h3", { text: "Content Settings" });

		// Default format
		new Setting(containerEl)
			.setName("Default Summary Format")
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
			.setName("Include Full Transcription")
			.setDesc("Include the full transcription in exported notes")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeTranscription).onChange(async (value) => {
					this.plugin.settings.includeTranscription = value;
					await this.plugin.saveSettings();
				})
			);

		// Custom template
		new Setting(containerEl)
			.setName("Export Template")
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

		// About section
		containerEl.createEl("h3", { text: "About" });

		new Setting(containerEl)
			.setName("SpeakNotes for Obsidian")
			.setDesc("Version 1.0.0")
			.addButton((btn) =>
				btn.setButtonText("Visit Website").onClick(() => {
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

		new Notice("Opening SpeakNotes login in your browser...");
	}

	async handleDisconnect(): Promise<void> {
		this.plugin.settings.firebaseToken = "";
		this.plugin.settings.userId = "";
		this.plugin.settings.userEmail = "";
		this.plugin.settings.lastSyncTimestamp = 0;

		await this.plugin.saveSettings();

		this.plugin.syncService.stopPeriodicSync();

		new Notice("Disconnected from SpeakNotes");
		this.display();
	}

	async confirmForceRefresh(): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(
				this.app,
				"Force Refresh",
				"This will delete all local SpeakNotes summaries and re-download them from the server. Any local changes that haven't been synced will be lost.\n\nAre you sure?",
				() => resolve(true),
				() => resolve(false)
			);
			modal.open();
		});
	}

	async handleForceRefresh(): Promise<void> {
		new Notice("SpeakNotes: Starting force refresh...");

		try {
			const { vault } = this.plugin.app;
			const exportFolder = this.plugin.settings.exportFolder || "SpeakNotes";

			// Find and delete all synced files
			const files = vault.getMarkdownFiles();
			let deletedCount = 0;

			for (const file of files) {
				if (file.path.startsWith(exportFolder)) {
					const content = await vault.read(file);
					// Only delete files with speaknotes_id in frontmatter
					if (content.includes("speaknotes_id:")) {
						await vault.delete(file);
						deletedCount++;
					}
				}
			}

			// Reset last sync timestamp
			this.plugin.settings.lastSyncTimestamp = 0;
			await this.plugin.saveSettings();

			new Notice(`SpeakNotes: Deleted ${deletedCount} local summaries`);

			// Trigger fresh sync
			await this.plugin.syncService.sync();

			this.display();
		} catch (error) {
			console.error("Force refresh failed:", error);
			new Notice(`SpeakNotes: Force refresh failed - ${(error as Error).message}`);
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
			text: "Force Refresh",
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
