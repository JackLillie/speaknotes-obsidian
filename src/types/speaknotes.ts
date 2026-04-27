/**
 * SpeakNotes types for Obsidian plugin
 * Derived from @speaknotes/shared for bundling
 */

/**
 * All 14 content formats supported by SpeakNotes
 */
export type ContentFormat =
	| "note"
	| "transcript"
	| "bulletpoints"
	| "blog-post"
	| "tweet-thread"
	| "linkedin-article"
	| "meeting-notes"
	| "news-article"
	| "qa-format"
	| "presentation-slides"
	| "book-summary"
	| "flash-cards"
	| "email-newsletter"
	| "video-script";

/**
 * Note status values (matches Firestore status field)
 */
export type NoteStatus = "Uploading" | "Transcribing" | "Summarizing" | "Done" | "Error";

/**
 * Note type values (matches Firestore type field)
 */
export type NoteType = "audio" | "video" | "youtube" | "pdf";

/**
 * SpeakNotes note from Firestore
 */
export interface SpeakNotesNote {
	id: string;
	title: string;
	summary: string;
	originalTranscription: string;
	status: NoteStatus;
	type: NoteType;
	structuredContent?: StructuredContent;
	folderId?: string;
	folderName?: string; // Provided by API when fetching notes
	isPinned?: boolean;
	pinnedAt?: Date;
	dateCreated: Date | string;
	updatedAt: Date | string;
	audioFileName?: string;
	duration?: number;
	format?: string; // Content format when returned from API
	// Integration references
	notionPageId?: string;
	notionExportedAt?: Date;
	obsidianExportedAt?: Date;
}

/**
 * SpeakNotes folder from Firestore
 */
export interface SpeakNotesFolder {
	id: string;
	name: string;
	parentId?: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Structured content wrapper
 */
export interface StructuredContent {
	format: ContentFormat;
	version: number;
	data: FormatData;
}

/**
 * Union type for all format data
 */
export type FormatData =
	| NoteData
	| TranscriptData
	| BulletPointsData
	| BlogPostData
	| TweetThreadData
	| LinkedInArticleData
	| MeetingNotesData
	| NewsArticleData
	| QAFormatData
	| PresentationSlidesData
	| BookSummaryData
	| EmailNewsletterData
	| VideoScriptData
	| FlashCardsData;

// Format-specific data types

export interface NoteData {
	content: string;
	keyPoints?: string[];
}

export interface TranscriptData {
	segments: Array<{
		text: string;
		speaker?: string;
		timestamp?: string;
	}>;
}

export interface BulletPointsData {
	points: string[];
	sections?: Array<{
		heading?: string;
		points: string[];
	}>;
}

export interface BlogPostData {
	headline: string;
	introduction: string;
	sections: Array<{
		heading: string;
		content: string;
	}>;
	conclusion?: string;
}

export interface TweetThreadData {
	threadTopic: string;
	tweets: Array<{
		content: string;
		isHook?: boolean;
	}>;
}

export interface LinkedInArticleData {
	headline: string;
	hook: string;
	keyPoints: Array<{
		point: string;
		elaboration?: string;
	}>;
	conclusion: string;
	hashtags?: string[];
}

export interface MeetingNotesData {
	meetingTitle?: string | null;
	attendees?: string[] | null;
	discussionPoints: Array<{
		topic: string;
		notes: string[];
		decisions?: string[] | null;
	}>;
	actionItems: Array<{
		task: string;
		assignee?: string | null;
		dueDate?: string | null;
		priority?: "high" | "medium" | "low" | null;
	}>;
	nextSteps?: string[] | null;
}

export interface NewsArticleData {
	headline: string;
	subheadline?: string;
	lead: string;
	body: Array<{
		heading?: string;
		paragraphs: string[];
	}>;
	quotes?: Array<{
		text: string;
		attribution?: string;
	}>;
}

export interface QAFormatData {
	topic: string;
	pairs: Array<{
		id: number;
		question: string;
		answer: string;
		followUp?: string;
	}>;
}

export interface PresentationSlidesData {
	totalSlides: number;
	slides: Array<{
		slideNumber: number;
		title: string;
		subtitle?: string | null;
		bullets?: string[] | null;
		speakerNotes?: string | null;
		layout?: "title" | "bullets" | "comparison" | "quote" | "image" | "content" | null;
	}>;
}

export interface BookSummaryData {
	bookTitle?: string;
	author?: string;
	overview: string;
	mainThemes: Array<{
		theme: string;
		description: string;
	}>;
	keyTakeaways: string[];
	quotes?: Array<{
		text: string;
		context?: string;
	}>;
}

export interface EmailNewsletterData {
	subject: string;
	greeting?: string;
	sections: Array<{
		heading?: string;
		content: string;
	}>;
	signOff: string;
	ctaText?: string;
}

export interface VideoScriptData {
	title: string;
	duration?: string;
	scenes: Array<{
		sceneNumber: number;
		narration: string;
		visualCues?: string;
		timestamp?: string;
	}>;
	callToAction?: string;
}

export interface FlashCardsData {
	topic: string;
	totalCards: number;
	cards: Array<{
		id: number;
		front: string;
		back: string;
		hint?: string;
		category?: string;
	}>;
}
