/**
 * SpeakNotes API Client for Obsidian Plugin
 * Uses Obsidian's requestUrl helper instead of fetch (required by Community Plugin policy).
 */

import { requestUrl, type RequestUrlParam } from "obsidian";
import type { ContentFormat, SpeakNotesNote } from "../types/speaknotes";
import type { UploadOptions, UploadResponse } from "../types/plugin";

interface APIClientConfig {
	baseUrl: string;
	token: string;
}

interface JsonRequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: string;
	headers?: Record<string, string>;
}

export class SpeakNotesAPI {
	private baseUrl: string;
	private token: string;

	constructor(config: APIClientConfig) {
		this.baseUrl = config.baseUrl;
		this.token = config.token;
	}

	private async request<T>(endpoint: string, options: JsonRequestOptions = {}): Promise<T> {
		const params: RequestUrlParam = {
			url: `${this.baseUrl}${endpoint}`,
			method: options.method ?? "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
				...(options.headers ?? {}),
			},
			body: options.body,
			throw: false,
		};

		const response = await requestUrl(params);
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`API Error: ${response.status} - ${response.text}`);
		}
		return response.json as T;
	}

	private async uploadMultipart<T>(
		endpoint: string,
		fileField: string,
		fileName: string,
		fileBlob: Blob,
		fields: Record<string, string>
	): Promise<T> {
		const boundary = `----SpeakNotesBoundary${Math.random().toString(36).slice(2)}`;
		const encoder = new TextEncoder();
		const parts: Uint8Array[] = [];
		const fileBuffer = new Uint8Array(await fileBlob.arrayBuffer());

		for (const [key, value] of Object.entries(fields)) {
			parts.push(
				encoder.encode(
					`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
				)
			);
		}
		const fileType = fileBlob.type || "application/octet-stream";
		parts.push(
			encoder.encode(
				`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${fileType}\r\n\r\n`
			)
		);
		parts.push(fileBuffer);
		parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

		const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
		const body = new Uint8Array(total);
		let offset = 0;
		for (const p of parts) {
			body.set(p, offset);
			offset += p.byteLength;
		}

		const response = await requestUrl({
			url: `${this.baseUrl}${endpoint}`,
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
			},
			body: body.buffer,
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Upload failed: ${response.status} - ${response.text}`);
		}
		return response.json as T;
	}

	async uploadAudio(audioBlob: Blob, options: UploadOptions): Promise<UploadResponse> {
		return this.uploadMultipart("/upload-audio", "audio", "recording.webm", audioBlob, {
			title: options.title,
			style: options.format,
			source: options.source,
		});
	}

	async uploadVideo(videoBlob: Blob, options: UploadOptions): Promise<UploadResponse> {
		return this.uploadMultipart("/upload-video", "video", "recording.webm", videoBlob, {
			title: options.title,
			style: options.format,
			source: options.source,
		});
	}

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

	async askQuestion(noteId: string, question: string, userId: string): Promise<{ answer: string }> {
		return this.request("/ask-question", {
			method: "POST",
			body: JSON.stringify({ noteId, question, userId }),
		});
	}

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

	async getNote(noteId: string): Promise<SpeakNotesNote> {
		return this.request(`/api/v1/notes/${noteId}`);
	}

	async getNoteStatus(noteId: string): Promise<{ status: string; note?: SpeakNotesNote }> {
		return this.request(`/api/v1/notes/${noteId}/status`);
	}

	setToken(token: string): void {
		this.token = token;
	}

	setBaseUrl(baseUrl: string): void {
		this.baseUrl = baseUrl;
	}

	// ============================================================================
	// Obsidian Integration API Endpoints
	// ============================================================================

	async connectObsidian(): Promise<{ success: boolean; message: string }> {
		return this.request("/integrations/obsidian/connect", {
			method: "POST",
		});
	}

	async exchangeConnectCode(
		code: string
	): Promise<{ token: string; userId: string; email: string }> {
		const response = await requestUrl({
			url: `${this.baseUrl}/integrations/obsidian/exchange-code`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
			throw: false,
		});
		if (response.status === 404) {
			throw new Error("Code not found. Generate a new code on speaknotes.io.");
		}
		if (response.status === 410) {
			throw new Error("Code expired or already used. Generate a new code.");
		}
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Failed to exchange code: ${response.status} ${response.text}`);
		}
		return response.json as { token: string; userId: string; email: string };
	}

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

	async disconnectObsidian(): Promise<{ success: boolean; message: string }> {
		return this.request("/integrations/obsidian", {
			method: "DELETE",
		});
	}

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

	async getObsidianFolders(): Promise<{
		data: Array<{ id: string; name: string; parentId?: string }>;
	}> {
		return this.request("/integrations/obsidian/folders");
	}

	async markNoteExported(noteId: string): Promise<{
		success: boolean;
		note: SpeakNotesNote;
	}> {
		return this.request("/integrations/obsidian/export", {
			method: "POST",
			body: JSON.stringify({ noteId }),
		});
	}

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

	async recordSync(): Promise<{ success: boolean }> {
		return this.request("/integrations/obsidian/sync", {
			method: "POST",
		});
	}

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
