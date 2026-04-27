/**
 * SpeakNotes Sidebar View
 * Browse and manage SpeakNotes library within Obsidian
 */

import { ItemView, WorkspaceLeaf, setIcon, MarkdownView } from "obsidian";
import type SpeakNotesPlugin from "../main";
import type { SpeakNotesNote, SpeakNotesFolder } from "../types/speaknotes";
import { captureException } from "../lib/sentry";

export const VIEW_TYPE_SIDEBAR = "speaknotes-sidebar";

export class SidebarView extends ItemView {
	plugin: SpeakNotesPlugin;
	notes: SpeakNotesNote[] = [];
	folders: SpeakNotesFolder[] = [];
	isLoading = false;
	searchQuery = "";
	selectedFolderId: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SpeakNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SIDEBAR;
	}

	getDisplayText(): string {
		return "SpeakNotes";
	}

	getIcon(): string {
		return "microphone";
	}

	async onOpen(): Promise<void> {
		await this.render();
		await this.loadNotes();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("speaknotes-sidebar");

		// Header
		const header = container.createDiv("speaknotes-sidebar-header");
		header.createEl("h4", { text: "SpeakNotes library" });

		// Sync button
		const syncBtn = header.createEl("button", {
			cls: "speaknotes-sync-btn",
			attr: { "aria-label": "Sync library" },
		});
		setIcon(syncBtn, "refresh-cw");
		syncBtn.onclick = () => this.handleSync();

		// Search bar
		const searchContainer = container.createDiv("speaknotes-search-container");
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search summaries...",
			cls: "speaknotes-search-input",
		});
		searchInput.value = this.searchQuery;
		searchInput.oninput = (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.renderNotesList();
		};

		// Folder filter
		if (this.folders.length > 0) {
			const folderContainer = container.createDiv("speaknotes-folder-filter");
			const folderSelect = folderContainer.createEl("select", {
				cls: "speaknotes-folder-select",
			});

			const allOption = folderSelect.createEl("option", {
				value: "",
				text: "All Folders",
			});
			if (!this.selectedFolderId) allOption.selected = true;

			for (const folder of this.folders) {
				const option = folderSelect.createEl("option", {
					value: folder.id,
					text: folder.name,
				});
				if (folder.id === this.selectedFolderId) option.selected = true;
			}

			folderSelect.onchange = (e) => {
				this.selectedFolderId = (e.target as HTMLSelectElement).value || null;
				this.renderNotesList();
			};
		}

		// Notes list container
		container.createDiv({ cls: "speaknotes-notes-list", attr: { id: "speaknotes-notes-list" } });

		// Render notes
		this.renderNotesList();

		// Connection status
		if (!this.plugin.settings.userId) {
			const statusEl = container.createDiv("speaknotes-status-disconnected");
			statusEl.createEl("p", { text: "Not connected to SpeakNotes" });
			const connectBtn = statusEl.createEl("button", {
				text: "Connect Account",
				cls: "mod-cta",
			});
			connectBtn.onclick = () => this.plugin.openSettings();
		}
	}

	renderNotesList(): void {
		const listContainer = this.contentEl.querySelector("#speaknotes-notes-list");
		if (!listContainer) return;

		listContainer.empty();

		if (this.isLoading) {
			listContainer.createDiv({
				cls: "speaknotes-loading",
				text: "Loading summaries...",
			});
			return;
		}

		// Filter notes
		let filteredNotes = this.notes;

		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			filteredNotes = filteredNotes.filter(
				(note) =>
					note.title.toLowerCase().includes(query) || note.summary.toLowerCase().includes(query)
			);
		}

		if (this.selectedFolderId) {
			filteredNotes = filteredNotes.filter((note) => note.folderId === this.selectedFolderId);
		}

		if (filteredNotes.length === 0) {
			listContainer.createDiv({
				cls: "speaknotes-empty",
				text: this.searchQuery ? "No matching summaries found" : "No summaries yet",
			});
			return;
		}

		// Render notes
		for (const note of filteredNotes) {
			this.renderNoteItem(listContainer as HTMLElement, note);
		}
	}

	renderNoteItem(container: HTMLElement, note: SpeakNotesNote): void {
		const item = container.createDiv({ cls: "speaknotes-note-item" });

		// Note icon based on type
		const iconContainer = item.createDiv("speaknotes-note-icon");
		const iconName = this.getIconForType(note.type);
		setIcon(iconContainer, iconName);

		// Note content
		const content = item.createDiv("speaknotes-note-content");
		content.createEl("div", { cls: "speaknotes-note-title", text: note.title });

		const meta = content.createDiv("speaknotes-note-meta");
		meta.createEl("span", {
			text: this.formatDate(note.dateCreated),
			cls: "speaknotes-note-date",
		});

		if (note.status !== "Done") {
			meta.createEl("span", {
				text: note.status,
				cls: `speaknotes-note-status speaknotes-status-${note.status.toLowerCase()}`,
			});
		}

		// Actions
		const actions = item.createDiv("speaknotes-note-actions");

		// Export button
		const exportBtn = actions.createEl("button", {
			cls: "speaknotes-action-btn",
			attr: { "aria-label": "Export to vault" },
		});
		setIcon(exportBtn, "download");
		exportBtn.onclick = (e) => {
			e.stopPropagation();
			this.handleExportNote(note);
		};

		// Insert button
		const insertBtn = actions.createEl("button", {
			cls: "speaknotes-action-btn",
			attr: { "aria-label": "Insert into current note" },
		});
		setIcon(insertBtn, "file-input");
		insertBtn.onclick = (e) => {
			e.stopPropagation();
			this.handleInsertNote(note);
		};

		// Click to preview
		item.onclick = () => this.handlePreviewNote(note);
	}

	getIconForType(type: string): string {
		switch (type) {
			case "audio":
				return "mic";
			case "video":
				return "video";
			case "youtube":
				return "youtube";
			case "pdf":
				return "file-text";
			default:
				return "file";
		}
	}

	formatDate(date: Date | string): string {
		if (!(date instanceof Date)) {
			date = new Date(date);
		}
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	async loadNotes(): Promise<void> {
		if (!this.plugin.settings.userId) return;

		this.isLoading = true;
		this.renderNotesList();

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

			// Load notes
			const notesResponse = await this.plugin.api.getObsidianNotes({
				status: "Done",
			});
			this.notes = notesResponse.data;

			this.isLoading = false;
			this.renderNotesList();
		} catch (error) {
			this.isLoading = false;
			console.error("Failed to load notes:", error);
			captureException(error, { stage: "load sidebar notes" });
			this.renderNotesList();
		}
	}

	async handleSync(): Promise<void> {
		await this.plugin.syncService.sync();
		await this.loadNotes();
	}

	async handleExportNote(note: SpeakNotesNote): Promise<void> {
		// Use cached folders from loadNotes, or fetch fresh if needed
		let folderMap: Map<string, SpeakNotesFolder>;
		if (this.folders.length > 0) {
			folderMap = new Map(this.folders.map((f) => [f.id, f]));
		} else {
			const foldersResponse = await this.plugin.api.getObsidianFolders();
			const folders = foldersResponse.data.map((f) => ({
				id: f.id,
				name: f.name,
				parentId: f.parentId,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
			folderMap = new Map(folders.map((f) => [f.id, f]));
		}
		await this.plugin.syncService.exportNoteToVault(note, folderMap);
	}

	handleInsertNote(note: SpeakNotesNote): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const editor = activeView.editor;
			const content = this.formatNoteForInsertion(note);
			editor.replaceSelection(content);
		}
	}

	formatNoteForInsertion(note: SpeakNotesNote): string {
		return `## ${note.title}\n\n${note.summary}\n\n---\n*Imported from SpeakNotes*\n`;
	}

	handlePreviewNote(note: SpeakNotesNote): void {
		// Create a preview modal or expand the note
		const modal = new NotePreviewModal(this.app, note, this.plugin);
		modal.open();
	}
}

// Import Modal class at the top level to avoid circular imports
import { App, Modal } from "obsidian";

class NotePreviewModal extends Modal {
	note: SpeakNotesNote;
	plugin: SpeakNotesPlugin;

	constructor(app: App, note: SpeakNotesNote, plugin: SpeakNotesPlugin) {
		super(app);
		this.note = note;
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("speaknotes-preview-modal");

		// Title
		contentEl.createEl("h2", { text: this.note.title });

		// Metadata
		const meta = contentEl.createDiv("speaknotes-preview-meta");
		meta.createEl("span", {
			text: `Type: ${this.note.type}`,
		});
		meta.createEl("span", {
			text: `Created: ${new Date(this.note.dateCreated).toLocaleString()}`,
		});

		// Summary
		contentEl.createEl("h3", { text: "Summary" });
		contentEl.createDiv({
			cls: "speaknotes-preview-summary",
			text: this.note.summary,
		});

		// Transcription (collapsible)
		if (this.note.originalTranscription) {
			const transcriptToggle = contentEl.createEl("details", {
				cls: "speaknotes-preview-transcript",
			});
			transcriptToggle.createEl("summary", { text: "Full Transcription" });
			transcriptToggle.createEl("div", {
				text: this.note.originalTranscription,
			});
		}

		// Actions
		const actions = contentEl.createDiv("speaknotes-preview-actions");

		const exportBtn = actions.createEl("button", {
			text: "Export to Vault",
			cls: "mod-cta",
		});
		exportBtn.onclick = async () => {
			const foldersResponse = await this.plugin.api.getObsidianFolders();
			const folders = foldersResponse.data.map((f) => ({
				id: f.id,
				name: f.name,
				parentId: f.parentId,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
			const folderMap = new Map(folders.map((f) => [f.id, f]));
			await this.plugin.syncService.exportNoteToVault(this.note, folderMap);
			this.close();
		};

		const closeBtn = actions.createEl("button", {
			text: "Close",
		});
		closeBtn.onclick = () => this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
