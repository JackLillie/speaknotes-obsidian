/**
 * Export Modal for exporting notes to SpeakNotes or configuring export settings
 */

import { App, Modal, Notice, TFile, Editor } from "obsidian";
import type SpeakNotesPlugin from "../main";
import { CONTENT_FORMATS } from "../types/plugin";
import type { ContentFormat } from "../types/speaknotes";

export class ExportModal extends Modal {
	plugin: SpeakNotesPlugin;
	editor: Editor | null;
	file: TFile | null;

	constructor(app: App, plugin: SpeakNotesPlugin, editor?: Editor, file?: TFile) {
		super(app);
		this.plugin = plugin;
		this.editor = editor || null;
		this.file = file || null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("speaknotes-export-modal");

		contentEl.createEl("h2", { text: "Export to cloud" });

		if (this.editor) {
			this.renderTextExport(contentEl);
		} else if (this.file) {
			this.renderFileExport(contentEl);
		} else {
			this.renderBulkExport(contentEl);
		}
	}

	renderTextExport(container: HTMLElement): void {
		const selection = this.editor?.getSelection();

		container.createEl("p", {
			text: selection
				? "Export the selected text to SpeakNotes for summarization."
				: "Export the current note to SpeakNotes for summarization.",
		});

		// Preview
		const previewContainer = container.createDiv("speaknotes-export-preview");
		previewContainer.createEl("h4", { text: "Content preview" });
		const preview = previewContainer.createDiv({
			cls: "speaknotes-export-preview-content",
		});

		const content = selection || this.editor?.getValue() || "";
		preview.textContent = content.length > 500 ? content.substring(0, 500) + "..." : content;

		// Title input
		const titleContainer = container.createDiv("speaknotes-input-group");
		titleContainer.createEl("label", { text: "Title" });
		titleContainer.createEl("input", {
			type: "text",
			placeholder: "Summary title",
			cls: "speaknotes-title-input",
		});

		// Format selector
		const formatContainer = container.createDiv("speaknotes-input-group");
		formatContainer.createEl("label", { text: "Summary format" });
		const formatSelect = formatContainer.createEl("select", {
			cls: "speaknotes-format-select",
		});

		for (const format of CONTENT_FORMATS) {
			const option = formatSelect.createEl("option", {
				value: format.value,
				text: format.label,
			});
			if (format.value === this.plugin.settings.defaultFormat) {
				option.selected = true;
			}
		}

		// Actions
		const actions = container.createDiv("speaknotes-export-actions");

		const exportBtn = actions.createEl("button", {
			text: "Export to cloud",
			cls: "mod-cta",
		});
		exportBtn.onclick = () => {
			this.handleTextExport();
		};

		const cancelBtn = actions.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();
	}

	renderFileExport(container: HTMLElement): void {
		if (!this.file) return;

		const isAudio = this.isAudioFile(this.file);
		const isVideo = this.isVideoFile(this.file);

		if (isAudio || isVideo) {
			container.createEl("p", {
				text: `Send this ${isAudio ? "audio" : "video"} file to SpeakNotes for transcription and summarization.`,
			});
		} else {
			container.createEl("p", {
				text: "This file type is not supported.",
			});
			return;
		}

		// File info
		const fileInfo = container.createDiv("speaknotes-file-info");
		fileInfo.createDiv({
			text: `File: ${this.file.name}`,
			cls: "speaknotes-file-name",
		});
		fileInfo.createDiv({
			text: `Size: ${this.formatFileSize(this.file.stat.size)}`,
			cls: "speaknotes-file-size",
		});

		// Title input
		const titleContainer = container.createDiv("speaknotes-input-group");
		titleContainer.createEl("label", { text: "Title" });
		const titleInput = titleContainer.createEl("input", {
			type: "text",
			placeholder: this.file.basename,
			cls: "speaknotes-title-input",
		});

		// Format selector
		const formatContainer = container.createDiv("speaknotes-input-group");
		formatContainer.createEl("label", { text: "Summary format" });
		const formatSelect = formatContainer.createEl("select", {
			cls: "speaknotes-format-select",
		});

		for (const format of CONTENT_FORMATS) {
			const option = formatSelect.createEl("option", {
				value: format.value,
				text: format.label,
			});
			if (format.value === this.plugin.settings.defaultFormat) {
				option.selected = true;
			}
		}

		// Actions
		const actions = container.createDiv("speaknotes-export-actions");

		const exportBtn = actions.createEl("button", {
			text: "Transcribe audio",
			cls: "mod-cta",
		});
		exportBtn.onclick = async () => {
			const title = titleInput.value || this.file!.basename;
			const format = formatSelect.value as ContentFormat;
			await this.handleFileExport(this.file!, title, format);
		};

		const cancelBtn = actions.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();
	}

	renderBulkExport(container: HTMLElement): void {
		container.createEl("p", {
			text: "Bulk export is not yet implemented. Use the sidebar to export individual summaries.",
		});

		const closeBtn = container.createEl("button", {
			text: "Close",
		});
		closeBtn.onclick = () => this.close();
	}

	handleTextExport(): void {
		// Show processing state
		this.contentEl.empty();
		const processingEl = this.contentEl.createDiv("speaknotes-processing");
		processingEl.createDiv({ cls: "speaknotes-spinner" });
		processingEl.createDiv({ text: "Sending..." });

		// Text export is not yet fully implemented
		new Notice("Text export is not yet fully implemented. Please use the web app.");
		this.close();
	}

	async handleFileExport(file: TFile, title: string, format: ContentFormat): Promise<void> {
		// Show processing state
		this.contentEl.empty();
		const processingEl = this.contentEl.createDiv("speaknotes-processing");
		processingEl.createDiv({ cls: "speaknotes-spinner" });
		const statusEl = processingEl.createDiv({ text: "Reading file..." });

		try {
			// Read file from vault
			const arrayBuffer = await this.app.vault.readBinary(file);
			const blob = new Blob([arrayBuffer], { type: this.getMimeType(file) });

			statusEl.textContent = "Uploading...";

			// Upload based on file type
			let result;
			if (this.isAudioFile(file)) {
				result = await this.plugin.api.uploadAudio(blob, {
					title,
					format,
					source: "obsidian-plugin",
					fileName: file.name,
				});
			} else if (this.isVideoFile(file)) {
				result = await this.plugin.api.uploadVideo(blob, {
					title,
					format,
					source: "obsidian-plugin",
					fileName: file.name,
				});
			} else {
				throw new Error("Unsupported file type");
			}

			statusEl.textContent = "Processing transcription...";

			// Wait for completion
			const maxWait = 300000;
			const startTime = Date.now();

			while (Date.now() - startTime < maxWait) {
				const note = await this.plugin.api.getNote(result.noteId);

				if (note.status === "Done") {
					// Create note in vault
					const foldersResponse = await this.plugin.api.getObsidianFolders();
					const folders = foldersResponse.data.map((f) => ({
						id: f.id,
						name: f.name,
						parentId: f.parentId,
						createdAt: new Date(),
						updatedAt: new Date(),
					}));
					const folderMap = new Map(folders.map((f) => [f.id, f]));
					await this.plugin.syncService.exportNoteToVault(note, folderMap);

					new Notice(`Transcribed "${note.title}"`);
					this.close();
					return;
				}

				if (note.status === "Error") {
					throw new Error("Transcription failed");
				}

				statusEl.textContent = `Status: ${note.status}...`;
				await new Promise((resolve) => activeWindow.setTimeout(resolve, 2000));
			}

			throw new Error("Timeout waiting for transcription");
		} catch (error) {
			new Notice(`Export failed: ${(error as Error).message}`);
			this.close();
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

	getMimeType(file: TFile): string {
		const ext = file.extension.toLowerCase();
		const mimeTypes: Record<string, string> = {
			mp3: "audio/mpeg",
			m4a: "audio/mp4",
			wav: "audio/wav",
			ogg: "audio/ogg",
			webm: "audio/webm",
			aac: "audio/aac",
			flac: "audio/flac",
			mp4: "video/mp4",
			mov: "video/quicktime",
			mkv: "video/x-matroska",
			avi: "video/x-msvideo",
		};
		return mimeTypes[ext] || "application/octet-stream";
	}

	formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
