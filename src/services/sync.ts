/**
 * Sync Service for SpeakNotes Obsidian Plugin
 * Handles synchronization between SpeakNotes and Obsidian vault
 */

import { App, TFile, Notice } from "obsidian";
import type { SpeakNotesAPI } from "../api/client";
import type { SpeakNotesSettings } from "../types/plugin";
import type { SpeakNotesNote, ContentFormat } from "../types/speaknotes";
import { getFormattedContent } from "../utils/markdown";
import { captureException } from "../lib/sentry";

export class SyncService {
	app: App;
	api: SpeakNotesAPI;
	settings: SpeakNotesSettings;
	isSyncing = false;
	syncIntervalId: number | null = null;

	constructor(app: App, api: SpeakNotesAPI, settings: SpeakNotesSettings) {
		this.app = app;
		this.api = api;
		this.settings = settings;
	}

	/**
	 * Update settings reference
	 */
	updateSettings(settings: SpeakNotesSettings): void {
		this.settings = settings;
	}

	/**
	 * Start periodic sync if enabled
	 */
	startPeriodicSync(): void {
		if (this.settings.syncInterval > 0) {
			this.syncIntervalId = window.setInterval(
				() => {
					void this.sync();
				},
				this.settings.syncInterval * 60 * 1000
			);
		}
	}

	/**
	 * Stop periodic sync
	 */
	stopPeriodicSync(): void {
		if (this.syncIntervalId !== null) {
			clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
	}

	/**
	 * Perform full sync using the API endpoint
	 * Supports two-way sync: local changes → server, then server changes → local
	 */
	async sync(): Promise<void> {
		if (this.isSyncing) {
			new Notice("Sync already in progress");
			return;
		}

		if (!this.settings.userId || !this.settings.firebaseToken) {
			new Notice("Not connected. Please connect your account.");
			return;
		}

		this.isSyncing = true;
		new Notice("Starting sync...");

		try {
			// Fetch folders first (needed for both directions)
			const foldersResponse = await this.api.getObsidianFolders();
			const folderMap = new Map(
				foldersResponse.data.map((f) => [f.id, { id: f.id, name: f.name, parentId: f.parentId }])
			);

			let pushedCount = 0;
			let pulledCount = 0;
			const pushedNoteIds = new Set<string>();

			// Step 1: Push local changes to server (if two-way sync enabled)
			if (this.settings.enableTwoWaySync) {
				const pushResult = await this.syncLocalChangesToServer();
				pushedCount = pushResult.count;
				pushResult.noteIds.forEach((id) => pushedNoteIds.add(id));
			}

			// Step 2: Pull server changes to local
			// Fetch all Done notes from server
			const response = await this.api.getObsidianNotes({
				status: "Done",
			});

			// Find locally synced notes
			const localNotes = await this.findSyncedNotes();

			// Process each server note
			for (const serverNote of response.data) {
				try {
					// Skip notes we just pushed - they have the latest content locally
					if (pushedNoteIds.has(serverNote.id)) {
						continue;
					}

					const localFile = localNotes.get(serverNote.id);

					if (localFile) {
						// Note exists locally - check if server is newer
						const localData = await this.parseNoteFromFile(localFile);
						const serverUpdated = new Date(serverNote.updatedAt).getTime();
						const localUpdated = localData.updated ? new Date(localData.updated).getTime() : 0;

						// Only pull if server is newer (last-write-wins)
						if (serverUpdated > localUpdated) {
							await this.exportNoteToVault(serverNote, folderMap);
							pulledCount++;
						}
					} else {
						// New note from server - export it
						await this.exportNoteToVault(serverNote, folderMap);
						pulledCount++;
					}
				} catch (error) {
					console.error(`Failed to sync note ${serverNote.id}:`, error);
				}
			}

			// Update last sync timestamp
			this.settings.lastSyncTimestamp = Date.now();

			// Record sync event on the server
			try {
				await this.api.recordSync();
			} catch {
				// Non-critical - don't fail sync if this fails
			}

			// Show result
			const parts: string[] = [];
			if (pushedCount > 0) parts.push(`pushed ${pushedCount}`);
			if (pulledCount > 0) parts.push(`pulled ${pulledCount}`);
			if (parts.length === 0) {
				new Notice("Everything up to date");
			} else {
				new Notice(`Synced (${parts.join(", ")})`);
			}
		} catch (error) {
			console.error("Sync failed:", error);
			captureException(error, { stage: "sync", userId: this.settings.userId });
			new Notice(`Sync failed - ${(error as Error).message}`);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Sync local changes to server (two-way sync)
	 * Finds locally modified files and pushes changes to SpeakNotes
	 * Returns the count and IDs of pushed notes (to skip them during pull)
	 */
	async syncLocalChangesToServer(): Promise<{ count: number; noteIds: string[] }> {
		const localNotes = await this.findSyncedNotes();
		let pushedCount = 0;
		const pushedNoteIds: string[] = [];

		// Fetch server notes to compare timestamps
		const response = await this.api.getObsidianNotes({
			status: "Done",
		});
		const serverNotesMap = new Map(response.data.map((n) => [n.id, n]));

		for (const [noteId, file] of localNotes) {
			try {
				const localData = await this.parseNoteFromFile(file);
				const serverNote = serverNotesMap.get(noteId);

				if (!serverNote) {
					// Server note doesn't exist anymore, skip
					continue;
				}

				const localUpdated = localData.updated ? new Date(localData.updated).getTime() : 0;
				const serverUpdated = new Date(serverNote.updatedAt).getTime();

				// Only push if local is newer (last-write-wins)
				if (localUpdated > serverUpdated) {
					// Extract title and summary from local file
					const updateData: { title?: string; summary?: string; isPinned?: boolean } = {};

					if (localData.title && localData.title !== serverNote.title) {
						updateData.title = localData.title;
					}
					if (localData.summary && localData.summary !== serverNote.summary) {
						updateData.summary = localData.summary;
					}
					if (localData.isPinned !== undefined && localData.isPinned !== serverNote.isPinned) {
						updateData.isPinned = localData.isPinned;
					}

					// Only update if there are changes
					if (Object.keys(updateData).length > 0) {
						await this.api.updateNote(noteId, updateData);
						pushedCount++;
						pushedNoteIds.push(noteId);
					}
				}
			} catch (error) {
				console.error(`Failed to push changes for note ${noteId}:`, error);
			}
		}

		return { count: pushedCount, noteIds: pushedNoteIds };
	}

	/**
	 * Parse note data from a local markdown file
	 * Extracts frontmatter and content
	 * Title is derived from the filename
	 */
	async parseNoteFromFile(file: TFile): Promise<{
		id?: string;
		title?: string;
		summary?: string;
		updated?: string;
		isPinned?: boolean;
	}> {
		const { vault } = this.app;
		const content = await vault.read(file);

		const result: {
			id?: string;
			title?: string;
			summary?: string;
			updated?: string;
			isPinned?: boolean;
		} = {};

		// Title comes from the filename (without extension)
		result.title = file.basename;

		// Parse frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];

			// Extract speaknotes_id
			const idMatch = frontmatter.match(/speaknotes_id:\s*(\S+)/);
			if (idMatch) result.id = idMatch[1];

			// Extract updated timestamp
			const updatedMatch = frontmatter.match(/updated:\s*(\S+)/);
			if (updatedMatch) result.updated = updatedMatch[1];

			// Extract pinned status
			const pinnedMatch = frontmatter.match(/pinned:\s*(true|false)/);
			if (pinnedMatch) result.isPinned = pinnedMatch[1] === "true";
		}

		// Extract summary (content after frontmatter)
		const bodyStart = content.indexOf("---", 4); // Find end of frontmatter
		if (bodyStart !== -1) {
			const body = content.substring(bodyStart + 3).trim();
			result.summary = body;
		}

		return result;
	}

	/**
	 * Export a single note to the vault
	 * First checks if a file with this speaknotes_id already exists (handles renames)
	 */
	async exportNoteToVault(
		note: SpeakNotesNote,
		folderMap: Map<string, { id: string; name: string; parentId?: string }>
	): Promise<void> {
		const { vault } = this.app;
		const baseFolder = this.settings.exportFolder || "SpeakNotes";

		// Ensure base folder exists
		await this.ensureFolder(baseFolder);

		// Generate content using template
		const content = this.applyTemplate(note);

		// First, check if any file already has this speaknotes_id (handles renamed files)
		const existingFileById = await this.findFileByNoteId(note.id);
		if (existingFileById) {
			// Update the existing file in place (even if renamed)
			await vault.modify(existingFileById, content);
			return;
		}

		// Build file path based on SpeakNotes folder structure
		let notePath: string;

		// Use folderName from the note if available (from API), otherwise fall back to folderMap
		const folderName =
			note.folderName ||
			(note.folderId && folderMap.has(note.folderId)
				? folderMap.get(note.folderId)!.name
				: undefined);

		if (folderName) {
			const subFolder = `${baseFolder}/${this.sanitizeFilename(folderName)}`;
			await this.ensureFolder(subFolder);
			notePath = `${subFolder}/${this.sanitizeFilename(note.title)}.md`;
		} else {
			notePath = `${baseFolder}/${this.sanitizeFilename(note.title)}.md`;
		}

		// Handle duplicate filenames
		notePath = await this.getUniqueFilePath(notePath, note.id);

		// Check if file exists at this path
		const existingFile = vault.getAbstractFileByPath(notePath);

		if (existingFile instanceof TFile) {
			// Update existing file
			await vault.modify(existingFile, content);
		} else {
			// Create new file
			await vault.create(notePath, content);
		}
	}

	/**
	 * Find a file by its speaknotes_id in frontmatter
	 * Used to find renamed files
	 */
	async findFileByNoteId(noteId: string): Promise<TFile | null> {
		const { vault } = this.app;
		const files = vault.getMarkdownFiles();

		for (const file of files) {
			if (file.path.startsWith(this.settings.exportFolder)) {
				const content = await vault.read(file);
				if (content.includes(`speaknotes_id: ${noteId}`)) {
					return file;
				}
			}
		}

		return null;
	}

	/**
	 * Get a unique file path, handling duplicates
	 */
	async getUniqueFilePath(basePath: string, noteId: string): Promise<string> {
		const { vault } = this.app;
		const existingFile = vault.getAbstractFileByPath(basePath);

		if (!existingFile) {
			return basePath;
		}

		// Check if the existing file has the same SpeakNotes ID
		if (existingFile instanceof TFile) {
			const content = await vault.read(existingFile);
			if (content.includes(`speaknotes_id: ${noteId}`)) {
				// Same note, just update it
				return basePath;
			}
		}

		// Generate unique filename
		const dir = basePath.substring(0, basePath.lastIndexOf("/"));
		const filename = basePath.substring(basePath.lastIndexOf("/") + 1, basePath.lastIndexOf("."));
		const ext = basePath.substring(basePath.lastIndexOf("."));

		let counter = 1;
		let newPath = `${dir}/${filename} (${counter})${ext}`;

		while (vault.getAbstractFileByPath(newPath)) {
			counter++;
			newPath = `${dir}/${filename} (${counter})${ext}`;
		}

		return newPath;
	}

	/**
	 * Apply template to note
	 */
	applyTemplate(note: SpeakNotesNote): string {
		const template = this.settings.exportTemplate || this.defaultTemplate();

		// Extract format from structuredContent if available
		const format = this.getFormat(note);

		// Get properly formatted content from structured data or fallback to summary
		const formattedContent = getFormattedContent(note);

		return template
			.replace(/\{\{id\}\}/g, note.id)
			.replace(/\{\{title\}\}/g, note.title)
			.replace(/\{\{created\}\}/g, this.formatDate(note.dateCreated))
			.replace(/\{\{updated\}\}/g, this.formatDate(note.updatedAt))
			.replace(/\{\{type\}\}/g, note.type)
			.replace(/\{\{status\}\}/g, note.status)
			.replace(/\{\{format\}\}/g, format)
			.replace(/\{\{isPinned\}\}/g, String(note.isPinned || false))
			.replace(/\{\{summary\}\}/g, formattedContent)
			.replace(
				/\{\{transcription\}\}/g,
				this.settings.includeTranscription ? note.originalTranscription || "" : ""
			);
	}

	/**
	 * Get format from note
	 */
	getFormat(note: SpeakNotesNote): ContentFormat {
		// Use format field if directly available (from API)
		if (note.format) {
			return note.format as ContentFormat;
		}
		// Fall back to structuredContent
		if (note.structuredContent && "format" in note.structuredContent) {
			return note.structuredContent.format;
		}
		return "note";
	}

	/**
	 * Default export template
	 * Note: Title is derived from the filename, not included in content
	 */
	defaultTemplate(): string {
		return `---
speaknotes_id: {{id}}
created: {{created}}
updated: {{updated}}
type: {{type}}
status: {{status}}
format: {{format}}
pinned: {{isPinned}}
tags: [speaknotes]
---

{{summary}}

{{transcription}}
`;
	}

	/**
	 * Ensure a folder exists in the vault
	 */
	async ensureFolder(path: string): Promise<void> {
		const { vault } = this.app;

		// Check if folder exists
		const folder = vault.getAbstractFileByPath(path);
		if (folder) return;

		// Create folder and any parent folders
		const parts = path.split("/");
		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await vault.createFolder(currentPath);
			}
		}
	}

	/**
	 * Sanitize filename for vault compatibility
	 */
	sanitizeFilename(name: string): string {
		// Remove characters that are invalid in filenames
		return name
			.replace(/[\\/:*?"<>|#^[\]]/g, "-")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 100);
	}

	/**
	 * Format date for frontmatter
	 */
	formatDate(date: Date | string): string {
		if (typeof date === "string") {
			date = new Date(date);
		}
		return date.toISOString();
	}

	/**
	 * Find notes in vault that were synced from SpeakNotes
	 */
	async findSyncedNotes(): Promise<Map<string, TFile>> {
		const { vault } = this.app;
		const syncedNotes = new Map<string, TFile>();

		const files = vault.getMarkdownFiles();

		for (const file of files) {
			if (file.path.startsWith(this.settings.exportFolder)) {
				const content = await vault.read(file);
				const match = content.match(/speaknotes_id:\s*(\S+)/);
				if (match) {
					syncedNotes.set(match[1], file);
				}
			}
		}

		return syncedNotes;
	}
}
