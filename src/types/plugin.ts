/**
 * Plugin-specific types for Obsidian SpeakNotes integration
 */

import type { ContentFormat } from "./speaknotes";

/**
 * Plugin settings stored in Obsidian
 */
export interface SpeakNotesSettings {
	// Authentication
	firebaseToken: string;
	userId: string;
	userEmail: string;
	apiUrl: string;

	// Sync settings
	exportFolder: string;
	autoSync: boolean;
	syncInterval: number; // minutes
	lastSyncTimestamp: number;
	enableTwoWaySync: boolean; // Push local changes back to SpeakNotes

	// Content settings
	defaultFormat: ContentFormat;
	exportTemplate: string;
	includeTranscription: boolean;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: SpeakNotesSettings = {
	firebaseToken: "",
	userId: "",
	userEmail: "",
	apiUrl: "https://api.speaknotes.io",
	exportFolder: "SpeakNotes",
	autoSync: true,
	syncInterval: 30,
	lastSyncTimestamp: 0,
	enableTwoWaySync: true,
	defaultFormat: "note",
	exportTemplate: "",
	includeTranscription: true,
};

/**
 * Upload options for audio processing
 */
export interface UploadOptions {
	title: string;
	format: ContentFormat;
	source: "obsidian-plugin";
	fileName?: string;
}

/**
 * API response for upload
 */
export interface UploadResponse {
	noteId: string;
	status: string;
}

/**
 * Content format options for UI
 */
export const CONTENT_FORMATS: { value: ContentFormat; label: string }[] = [
	{ value: "note", label: "Note" },
	{ value: "transcript", label: "Transcript" },
	{ value: "bulletpoints", label: "Bullet Points" },
	{ value: "blog-post", label: "Blog Post" },
	{ value: "tweet-thread", label: "Tweet Thread" },
	{ value: "linkedin-article", label: "LinkedIn Article" },
	{ value: "meeting-notes", label: "Meeting Notes" },
	{ value: "news-article", label: "News Article" },
	{ value: "qa-format", label: "Q&A Format" },
	{ value: "presentation-slides", label: "Presentation Slides" },
	{ value: "book-summary", label: "Book Summary" },
	{ value: "flash-cards", label: "Flash Cards" },
	{ value: "email-newsletter", label: "Email Newsletter" },
	{ value: "video-script", label: "Video Script" },
];
