/**
 * Bulk Export Modal
 * Export multiple or all notes from SpeakNotes to Obsidian vault
 */

import { App, Modal, Notice, Setting } from "obsidian";
import type SpeakNotesPlugin from "../main";
import type { SpeakNotesNote, SpeakNotesFolder } from "../types/speaknotes";

export class BulkExportModal extends Modal {
	plugin: SpeakNotesPlugin;
	notes: SpeakNotesNote[] = [];
	folders: SpeakNotesFolder[] = [];
	selectedNotes: Set<string> = new Set();
	isLoading = true;
	isExporting = false;
	filterFolder: string | null = null;
	filterStatus: string = "Done";
	selectAll = false;

	constructor(app: App, plugin: SpeakNotesPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("speaknotes-bulk-export-modal");

		contentEl.createEl("h2", { text: "Bulk export summaries" });

		// Loading state
		const loadingEl = contentEl.createDiv("speaknotes-loading");
		loadingEl.createEl("p", { text: "Loading summaries..." });

		await this.loadNotes();
		this.render();
	}

	async loadNotes(): Promise<void> {
		try {
			// Use API client instead of direct Firestore access
			const foldersResponse = await this.plugin.api.getObsidianFolders();
			this.folders = foldersResponse.data.map((f) => ({
				id: f.id,
				name: f.name,
				parentId: f.parentId,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));

			const notesResponse = await this.plugin.api.getObsidianNotes({
				status: this.filterStatus || undefined,
			});
			this.notes = notesResponse.data;
			this.isLoading = false;
		} catch (error) {
			console.error("Failed to load notes:", error);
			this.isLoading = false;
		}
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("speaknotes-bulk-export-modal");

		contentEl.createEl("h2", { text: "Bulk export summaries" });

		if (this.isLoading) {
			contentEl.createDiv({
				cls: "speaknotes-loading",
				text: "Loading summaries...",
			});
			return;
		}

		// Filters
		const filtersEl = contentEl.createDiv("speaknotes-bulk-filters");

		// Folder filter
		new Setting(filtersEl).setName("Filter by folder").addDropdown((dropdown) => {
			dropdown.addOption("", "All folders");
			for (const folder of this.folders) {
				dropdown.addOption(folder.id, folder.name);
			}
			dropdown.setValue(this.filterFolder || "");
			dropdown.onChange((value) => {
				this.filterFolder = value || null;
				this.render();
			});
		});

		// Status filter
		new Setting(filtersEl).setName("Filter by status").addDropdown((dropdown) => {
			dropdown.addOption("Done", "Completed");
			dropdown.addOption("", "All statuses");
			dropdown.setValue(this.filterStatus);
			dropdown.onChange(async (value) => {
				this.filterStatus = value;
				this.isLoading = true;
				this.render();
				await this.loadNotes();
				this.render();
			});
		});

		// Filter notes
		let filteredNotes = this.notes;
		if (this.filterFolder) {
			filteredNotes = filteredNotes.filter((n) => n.folderId === this.filterFolder);
		}

		// Select all checkbox
		const selectAllEl = contentEl.createDiv("speaknotes-select-all");
		const selectAllCheckbox = selectAllEl.createEl("input", {
			type: "checkbox",
			attr: { id: "select-all" },
		});
		selectAllCheckbox.checked = this.selectAll;
		selectAllCheckbox.onchange = () => {
			this.selectAll = selectAllCheckbox.checked;
			if (this.selectAll) {
				filteredNotes.forEach((n) => this.selectedNotes.add(n.id));
			} else {
				this.selectedNotes.clear();
			}
			this.render();
		};
		selectAllEl.createEl("label", {
			text: `Select all (${filteredNotes.length} summaries)`,
			attr: { for: "select-all" },
		});

		// Notes list
		const listEl = contentEl.createDiv("speaknotes-bulk-list");

		if (filteredNotes.length === 0) {
			listEl.createDiv({
				cls: "speaknotes-empty",
				text: "No summaries found",
			});
		} else {
			for (const note of filteredNotes) {
				this.renderNoteItem(listEl, note);
			}
		}

		// Selection count and export button
		const actionsEl = contentEl.createDiv("speaknotes-bulk-actions");

		actionsEl.createSpan({
			cls: "speaknotes-selection-count",
			text: `${this.selectedNotes.size} summaries selected`,
		});

		const exportBtn = actionsEl.createEl("button", {
			cls: "mod-cta",
			text: this.isExporting ? "Exporting..." : "Export selected",
		});
		exportBtn.disabled = this.selectedNotes.size === 0 || this.isExporting;
		exportBtn.onclick = () => this.exportSelected();

		const cancelBtn = actionsEl.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.onclick = () => this.close();
	}

	renderNoteItem(container: HTMLElement, note: SpeakNotesNote): void {
		const itemEl = container.createDiv("speaknotes-bulk-item");

		const checkbox = itemEl.createEl("input", {
			type: "checkbox",
			attr: { id: `note-${note.id}` },
		});
		checkbox.checked = this.selectedNotes.has(note.id);
		checkbox.onchange = () => {
			if (checkbox.checked) {
				this.selectedNotes.add(note.id);
			} else {
				this.selectedNotes.delete(note.id);
				this.selectAll = false;
			}
			this.render();
		};

		const labelEl = itemEl.createEl("label", {
			attr: { for: `note-${note.id}` },
		});

		labelEl.createSpan({
			cls: "speaknotes-bulk-item-title",
			text: note.title,
		});

		const metaEl = labelEl.createSpan({
			cls: "speaknotes-bulk-item-meta",
		});
		metaEl.createSpan({ text: note.type });
		metaEl.createSpan({ text: " • " });
		metaEl.createSpan({
			text: new Date(note.dateCreated).toLocaleDateString(),
		});

		// Check if already exported
		const existingFile = this.checkIfExported(note);
		if (existingFile) {
			itemEl.createSpan({
				cls: "speaknotes-bulk-item-exists",
				text: "Already in vault",
			});
		}
	}

	checkIfExported(note: SpeakNotesNote): boolean {
		const baseFolder = this.plugin.settings.exportFolder || "SpeakNotes";
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			if (file.path.startsWith(baseFolder)) {
				// Quick check - would need to read file for accurate check
				const sanitizedTitle = note.title
					.replace(/[\\/:*?"<>|#^[\]]/g, "-")
					.trim()
					.slice(0, 100);
				if (file.basename === sanitizedTitle) {
					return true;
				}
			}
		}
		return false;
	}

	async exportSelected(): Promise<void> {
		if (this.selectedNotes.size === 0) return;

		this.isExporting = true;
		this.render();

		const folderMap = new Map(this.folders.map((f) => [f.id, f]));
		let successCount = 0;
		let errorCount = 0;

		for (const noteId of this.selectedNotes) {
			const note = this.notes.find((n) => n.id === noteId);
			if (!note) continue;

			try {
				await this.plugin.syncService.exportNoteToVault(note, folderMap);
				successCount++;
			} catch (error) {
				console.error(`Failed to export note ${noteId}:`, error);
				errorCount++;
			}
		}

		this.isExporting = false;

		if (errorCount > 0) {
			new Notice(`Exported ${successCount} summaries, ${errorCount} failed`);
		} else {
			new Notice(`Successfully exported ${successCount} summaries`);
		}

		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
