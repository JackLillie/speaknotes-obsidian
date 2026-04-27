/**
 * Import Modal
 * Import markdown notes from Obsidian to SpeakNotes
 */

import { App, Modal, Notice, TFile, Setting, requestUrl } from "obsidian";
import type SpeakNotesPlugin from "../main";
import type { ContentFormat, SpeakNotesFolder } from "../types/speaknotes";
import { CONTENT_FORMATS } from "../types/plugin";
import { captureException } from "../lib/sentry";

export class ImportModal extends Modal {
	plugin: SpeakNotesPlugin;
	file: TFile | null = null;
	files: TFile[] = [];
	folders: SpeakNotesFolder[] = [];
	selectedFormat: ContentFormat;
	selectedFolderId: string | null = null;
	isImporting = false;
	importMode: "single" | "multiple" = "single";
	selectedFiles: Set<string> = new Set();

	constructor(app: App, plugin: SpeakNotesPlugin, file?: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file || null;
		this.selectedFormat = plugin.settings.defaultFormat;
	}

	async onOpen(): Promise<void> {
		// Load folders via API
		try {
			const foldersResponse = await this.plugin.api.getObsidianFolders();
			this.folders = foldersResponse.data.map((f) => ({
				id: f.id,
				name: f.name,
				parentId: f.parentId,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
		} catch (error) {
			console.error("Failed to load folders:", error);
		}

		// Get markdown files from export folder
		const exportFolder = this.plugin.settings.exportFolder || "SpeakNotes";
		this.files = this.app.vault.getMarkdownFiles().filter((f) => {
			// Exclude files already from SpeakNotes
			return !f.path.startsWith(exportFolder);
		});

		this.render();
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("speaknotes-import-modal");

		contentEl.createEl("h2", { text: "Import to SpeakNotes" });

		if (this.file) {
			// Single file mode
			this.renderSingleFileMode();
		} else {
			// Multiple file selection mode
			this.renderMultipleFileMode();
		}
	}

	renderSingleFileMode(): void {
		const { contentEl } = this;

		if (!this.file) return;

		// File info
		const fileInfo = contentEl.createDiv("speaknotes-import-file-info");
		fileInfo.createEl("p", { text: `File: ${this.file.name}` });
		fileInfo.createEl("p", {
			cls: "speaknotes-file-path",
			text: this.file.path,
		});

		// Format selector
		new Setting(contentEl)
			.setName("Content format")
			.setDesc("How should SpeakNotes process this content?")
			.addDropdown((dropdown) => {
				for (const format of CONTENT_FORMATS) {
					dropdown.addOption(format.value, format.label);
				}
				dropdown.setValue(this.selectedFormat);
				dropdown.onChange((value) => {
					this.selectedFormat = value as ContentFormat;
				});
			});

		// Folder selector
		new Setting(contentEl)
			.setName("Target folder")
			.setDesc("Which SpeakNotes folder to import to")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "No Folder");
				for (const folder of this.folders) {
					dropdown.addOption(folder.id, folder.name);
				}
				dropdown.setValue(this.selectedFolderId || "");
				dropdown.onChange((value) => {
					this.selectedFolderId = value || null;
				});
			});

		// Actions
		const actionsEl = contentEl.createDiv("speaknotes-import-actions");

		const importBtn = actionsEl.createEl("button", {
			cls: "mod-cta",
			text: this.isImporting ? "Importing..." : "Import to SpeakNotes",
		});
		importBtn.disabled = this.isImporting;
		importBtn.onclick = () => this.importSingleFile();

		const cancelBtn = actionsEl.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();
	}

	renderMultipleFileMode(): void {
		const { contentEl } = this;

		contentEl.createEl("p", {
			text: "Select markdown files to import to SpeakNotes",
			cls: "speaknotes-import-desc",
		});

		// Format selector
		new Setting(contentEl)
			.setName("Content format")
			.setDesc("Format to apply to all imported notes")
			.addDropdown((dropdown) => {
				for (const format of CONTENT_FORMATS) {
					dropdown.addOption(format.value, format.label);
				}
				dropdown.setValue(this.selectedFormat);
				dropdown.onChange((value) => {
					this.selectedFormat = value as ContentFormat;
				});
			});

		// Folder selector
		new Setting(contentEl).setName("Target folder").addDropdown((dropdown) => {
			dropdown.addOption("", "No Folder");
			for (const folder of this.folders) {
				dropdown.addOption(folder.id, folder.name);
			}
			dropdown.setValue(this.selectedFolderId || "");
			dropdown.onChange((value) => {
				this.selectedFolderId = value || null;
			});
		});

		// File list
		const listEl = contentEl.createDiv("speaknotes-import-list");

		if (this.files.length === 0) {
			listEl.createEl("p", {
				cls: "speaknotes-empty",
				text: "No markdown files found outside SpeakNotes folder",
			});
		} else {
			// Select all
			const selectAllEl = listEl.createDiv("speaknotes-select-all");
			const selectAllCb = selectAllEl.createEl("input", {
				type: "checkbox",
				attr: { id: "select-all-import" },
			});
			selectAllCb.onchange = () => {
				if (selectAllCb.checked) {
					this.files.forEach((f) => this.selectedFiles.add(f.path));
				} else {
					this.selectedFiles.clear();
				}
				this.render();
			};
			selectAllEl.createEl("label", {
				text: `Select all (${this.files.length} files)`,
				attr: { for: "select-all-import" },
			});

			// Files
			const filesContainer = listEl.createDiv("speaknotes-import-files");
			for (const file of this.files.slice(0, 50)) {
				// Limit to 50 for performance
				const itemEl = filesContainer.createDiv("speaknotes-import-item");

				const checkbox = itemEl.createEl("input", {
					type: "checkbox",
					attr: { id: `import-${file.path}` },
				});
				checkbox.checked = this.selectedFiles.has(file.path);
				checkbox.onchange = () => {
					if (checkbox.checked) {
						this.selectedFiles.add(file.path);
					} else {
						this.selectedFiles.delete(file.path);
					}
				};

				itemEl.createEl("label", {
					text: file.basename,
					attr: { for: `import-${file.path}` },
				});
			}

			if (this.files.length > 50) {
				filesContainer.createEl("p", {
					cls: "speaknotes-import-more",
					text: `... and ${this.files.length - 50} more files`,
				});
			}
		}

		// Actions
		const actionsEl = contentEl.createDiv("speaknotes-import-actions");

		actionsEl.createEl("span", {
			text: `${this.selectedFiles.size} files selected`,
		});

		const importBtn = actionsEl.createEl("button", {
			cls: "mod-cta",
			text: this.isImporting ? "Importing..." : "Import selected",
		});
		importBtn.disabled = this.selectedFiles.size === 0 || this.isImporting;
		importBtn.onclick = () => this.importMultipleFiles();

		const cancelBtn = actionsEl.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();
	}

	async importSingleFile(): Promise<void> {
		if (!this.file) return;

		this.isImporting = true;
		this.render();

		try {
			const content = await this.app.vault.read(this.file);
			await this.importContent(this.file.basename, content);
			new Notice(`Imported "${this.file.basename}" to SpeakNotes`);
			this.close();
		} catch (error) {
			console.error("Import failed:", error);
			captureException(error, { stage: "import single file" });
			new Notice(`Import failed: ${(error as Error).message}`);
			this.isImporting = false;
			this.render();
		}
	}

	async importMultipleFiles(): Promise<void> {
		if (this.selectedFiles.size === 0) return;

		this.isImporting = true;
		this.render();

		let successCount = 0;
		let errorCount = 0;

		for (const filePath of this.selectedFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			try {
				const content = await this.app.vault.read(file);
				await this.importContent(file.basename, content);
				successCount++;
			} catch (error) {
				console.error(`Failed to import ${filePath}:`, error);
				errorCount++;
			}
		}

		this.isImporting = false;

		if (errorCount > 0) {
			new Notice(`Imported ${successCount} files, ${errorCount} failed`);
		} else {
			new Notice(`Successfully imported ${successCount} files`);
		}

		this.close();
	}

	async importContent(title: string, content: string): Promise<void> {
		const cleanContent = this.removeFrontmatter(content);

		const response = await requestUrl({
			url: `${this.plugin.settings.apiUrl}/api/v1/notes/import`,
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.plugin.settings.firebaseToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				title,
				content: cleanContent,
				format: this.selectedFormat,
				folderId: this.selectedFolderId,
				source: "obsidian-import",
			}),
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`API error: ${response.status} - ${response.text}`);
		}
	}

	removeFrontmatter(content: string): string {
		const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
		if (frontmatterMatch) {
			return content.slice(frontmatterMatch[0].length).trim();
		}
		return content.trim();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
