/**
 * SpeakNotes API Client for Obsidian Plugin
 * Connects to the Express API server
 */

import type { ContentFormat, SpeakNotesNote } from "../types/speaknotes";
import type { UploadOptions, UploadResponse } from "../types/plugin";

interface APIClientConfig {
	baseUrl: string;
	token: string;
}

export class SpeakNotesAPI {
	private baseUrl: string;
	private token: string;

	constructor(config: APIClientConfig) {
		this.baseUrl = config.baseUrl;
		this.token = config.token;
	}

	/**
	 * Make an authenticated API request
	 */
	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
		}

		return response.json();
	}

	/**
	 * Upload audio for transcription and summarization
	 * Endpoint: POST /upload-audio
	 */
	async uploadAudio(audioBlob: Blob, options: UploadOptions): Promise<UploadResponse> {
		const formData = new FormData();
		formData.append("audio", audioBlob, "recording.webm");
		formData.append("title", options.title);
		formData.append("style", options.format);
		formData.append("source", options.source);

		const response = await fetch(`${this.baseUrl}/upload-audio`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Upload failed: ${response.status} - ${errorText}`);
		}

		return response.json();
	}

	/**
	 * Upload video for transcription and summarization
	 * Endpoint: POST /upload-video
	 */
	async uploadVideo(videoBlob: Blob, options: UploadOptions): Promise<UploadResponse> {
		const formData = new FormData();
		formData.append("video", videoBlob);
		formData.append("title", options.title);
		formData.append("style", options.format);
		formData.append("source", options.source);

		const response = await fetch(`${this.baseUrl}/upload-video`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
			},
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Upload failed: ${response.status} - ${errorText}`);
		}

		return response.json();
	}

	/**
	 * Regenerate summary with a different format
	 * Endpoint: POST /update-style
	 */
	async updateStyle(
		noteId: string,
		format: ContentFormat,
		userId: string
	): Promise<SpeakNotesNote> {
		return this.request("/update-style", {
			method: "POST",
			body: JSON.stringify({
				noteId,
				style: format,
				userId,
			}),
		});
	}

	/**
	 * Ask a question about transcribed content
	 * Endpoint: POST /ask-question
	 */
	async askQuestion(noteId: string, question: string, userId: string): Promise<{ answer: string }> {
		return this.request("/ask-question", {
			method: "POST",
			body: JSON.stringify({ noteId, question, userId }),
		});
	}

	/**
	 * Get notes via API v1 endpoint
	 */
	async getNotes(params?: {
		updatedAfter?: string;
		folderId?: string;
		status?: string;
		limit?: number;
	}): Promise<SpeakNotesNote[]> {
		const queryParams = new URLSearchParams();
		if (params?.updatedAfter) queryParams.set("updatedAfter", params.updatedAfter);
		if (params?.folderId) queryParams.set("folderId", params.folderId);
		if (params?.status) queryParams.set("status", params.status);
		if (params?.limit) queryParams.set("limit", params.limit.toString());

		const query = queryParams.toString();
		return this.request(`/api/v1/notes${query ? `?${query}` : ""}`);
	}

	/**
	 * Get a single note by ID
	 */
	async getNote(noteId: string): Promise<SpeakNotesNote> {
		return this.request(`/api/v1/notes/${noteId}`);
	}

	/**
	 * Get note processing status
	 */
	async getNoteStatus(noteId: string): Promise<{ status: string; note?: SpeakNotesNote }> {
		return this.request(`/api/v1/notes/${noteId}/status`);
	}

	/**
	 * Set the authentication token
	 */
	setToken(token: string): void {
		this.token = token;
	}

	/**
	 * Set the API URL
	 */
	setBaseUrl(baseUrl: string): void {
		this.baseUrl = baseUrl;
	}

	// ============================================================================
	// Obsidian Integration API Endpoints
	// ============================================================================

	/**
	 * Connect Obsidian integration
	 * Endpoint: POST /integrations/obsidian/connect
	 */
	async connectObsidian(): Promise<{ success: boolean; message: string }> {
		return this.request("/integrations/obsidian/connect", {
			method: "POST",
		});
	}

	/**
	 * Get Obsidian integration status
	 * Endpoint: GET /integrations/obsidian/status
	 */
	async getObsidianStatus(): Promise<{
		connected: boolean;
		settings?: {
			autoExport?: boolean;
			autoSync?: boolean;
			syncInterval?: number;
		};
		connectedAt?: string;
		lastSyncAt?: string;
	}> {
		return this.request("/integrations/obsidian/status");
	}

	/**
	 * Update Obsidian integration settings
	 * Endpoint: PUT /integrations/obsidian/settings
	 */
	async updateObsidianSettings(settings: {
		autoSync?: boolean;
		syncInterval?: number;
		defaultFormat?: string;
		autoExport?: boolean;
	}): Promise<{ success: boolean; message: string }> {
		return this.request("/integrations/obsidian/settings", {
			method: "PUT",
			body: JSON.stringify(settings),
		});
	}

	/**
	 * Disconnect Obsidian integration
	 * Endpoint: DELETE /integrations/obsidian
	 */
	async disconnectObsidian(): Promise<{ success: boolean; message: string }> {
		return this.request("/integrations/obsidian", {
			method: "DELETE",
		});
	}

	/**
	 * Get notes for Obsidian sync (optimized endpoint)
	 * Endpoint: GET /integrations/obsidian/notes
	 */
	async getObsidianNotes(params?: {
		updatedAfter?: string;
		status?: string;
		limit?: number;
	}): Promise<{
		data: SpeakNotesNote[];
		count: number;
		hasMore: boolean;
	}> {
		const queryParams = new URLSearchParams();
		if (params?.updatedAfter) queryParams.set("updatedAfter", params.updatedAfter);
		if (params?.status) queryParams.set("status", params.status);
		if (params?.limit) queryParams.set("limit", params.limit.toString());

		const query = queryParams.toString();
		return this.request(`/integrations/obsidian/notes${query ? `?${query}` : ""}`);
	}

	/**
	 * Get folders for Obsidian
	 * Endpoint: GET /integrations/obsidian/folders
	 */
	async getObsidianFolders(): Promise<{
		data: Array<{ id: string; name: string; parentId?: string }>;
	}> {
		return this.request("/integrations/obsidian/folders");
	}

	/**
	 * Mark a note as exported to Obsidian
	 * Endpoint: POST /integrations/obsidian/export
	 */
	async markNoteExported(noteId: string): Promise<{
		success: boolean;
		note: SpeakNotesNote;
	}> {
		return this.request("/integrations/obsidian/export", {
			method: "POST",
			body: JSON.stringify({ noteId }),
		});
	}

	/**
	 * Bulk export all notes to Obsidian
	 * Endpoint: POST /integrations/obsidian/export-all
	 */
	async bulkExportToObsidian(params?: {
		includeAlreadyExported?: boolean;
		updatedAfter?: string;
	}): Promise<{
		success: boolean;
		exported: number;
		skipped: number;
		notes: SpeakNotesNote[];
		folders: Array<{ id: string; name: string; parentId?: string }>;
	}> {
		return this.request("/integrations/obsidian/export-all", {
			method: "POST",
			body: JSON.stringify(params || {}),
		});
	}

	/**
	 * Record sync event from Obsidian plugin
	 * Endpoint: POST /integrations/obsidian/sync
	 */
	async recordSync(): Promise<{ success: boolean }> {
		return this.request("/integrations/obsidian/sync", {
			method: "POST",
		});
	}

	/**
	 * Update a note from Obsidian (two-way sync)
	 * Endpoint: PATCH /integrations/obsidian/notes/:noteId
	 */
	async updateNote(
		noteId: string,
		data: {
			title?: string;
			summary?: string;
			isPinned?: boolean;
		}
	): Promise<{
		success: boolean;
		note: SpeakNotesNote;
	}> {
		return this.request(`/integrations/obsidian/notes/${noteId}`, {
			method: "PATCH",
			body: JSON.stringify(data),
		});
	}
}
