/**
 * Markdown utilities for SpeakNotes
 * Converts structured content to Markdown for Obsidian export
 */

import type {
	SpeakNotesNote,
	ContentFormat,
	StructuredContent,
	NoteData,
	TranscriptData,
	BulletPointsData,
	BlogPostData,
	TweetThreadData,
	LinkedInArticleData,
	MeetingNotesData,
	NewsArticleData,
	QAFormatData,
	PresentationSlidesData,
	BookSummaryData,
	EmailNewsletterData,
	VideoScriptData,
	FlashCardsData,
} from "../types/speaknotes";

/**
 * Convert structured content to Markdown based on format
 * Returns formatted markdown string for Obsidian
 */
export function structuredContentToMarkdown(content: StructuredContent): string {
	const { format, data } = content;

	switch (format) {
		case "note":
			return noteToMarkdown(data as NoteData);
		case "transcript":
			return transcriptToMarkdown(data as TranscriptData);
		case "bulletpoints":
			return bulletPointsToMarkdown(data as BulletPointsData);
		case "blog-post":
			return blogPostToMarkdown(data as BlogPostData);
		case "tweet-thread":
			return tweetThreadToMarkdown(data as TweetThreadData);
		case "linkedin-article":
			return linkedInArticleToMarkdown(data as LinkedInArticleData);
		case "meeting-notes":
			return meetingNotesToMarkdown(data as MeetingNotesData);
		case "news-article":
			return newsArticleToMarkdown(data as NewsArticleData);
		case "qa-format":
			return qaFormatToMarkdown(data as QAFormatData);
		case "presentation-slides":
			return presentationSlidesToMarkdown(data as PresentationSlidesData);
		case "book-summary":
			return bookSummaryToMarkdown(data as BookSummaryData);
		case "email-newsletter":
			return emailNewsletterToMarkdown(data as EmailNewsletterData);
		case "video-script":
			return videoScriptToMarkdown(data as VideoScriptData);
		case "flash-cards":
			return flashCardsToMarkdown(data as FlashCardsData);
		default:
			// Unknown format, return empty string (will fall back to summary)
			return "";
	}
}

/**
 * Note format - simple content with optional key points
 */
function noteToMarkdown(data: NoteData): string {
	let md = data.content + "\n";

	if (data.keyPoints && data.keyPoints.length > 0) {
		md += "\n### Key Points\n\n";
		md += data.keyPoints.map((point) => `- ${point}`).join("\n") + "\n";
	}

	return md;
}

/**
 * Transcript format - segments with optional speakers and timestamps
 */
function transcriptToMarkdown(data: TranscriptData): string {
	let md = "";

	for (const segment of data.segments) {
		if (segment.speaker || segment.timestamp) {
			const parts = [];
			if (segment.speaker) parts.push(`**${segment.speaker}**`);
			if (segment.timestamp) parts.push(`*${segment.timestamp}*`);
			md += parts.join(" ") + "\n";
		}
		md += segment.text + "\n\n";
	}

	return md;
}

/**
 * Bullet points format - simple list or sectioned lists
 */
function bulletPointsToMarkdown(data: BulletPointsData): string {
	let md = "";

	if (data.sections && data.sections.length > 0) {
		for (const section of data.sections) {
			if (section.heading) {
				md += `### ${section.heading}\n\n`;
			}
			md += section.points.map((p) => `- ${p}`).join("\n") + "\n\n";
		}
	} else if (data.points && data.points.length > 0) {
		md = data.points.map((p) => `- ${p}`).join("\n") + "\n";
	}

	return md;
}

/**
 * Blog post format - headline, intro, sections, conclusion
 */
function blogPostToMarkdown(data: BlogPostData): string {
	let md = `## ${data.headline}\n\n`;
	md += `${data.introduction}\n\n`;

	for (const section of data.sections) {
		md += `### ${section.heading}\n\n`;
		md += `${section.content}\n\n`;
	}

	if (data.conclusion) {
		md += `### Conclusion\n\n${data.conclusion}\n`;
	}

	return md;
}

/**
 * Tweet thread format - numbered tweets
 */
function tweetThreadToMarkdown(data: TweetThreadData): string {
	let md = `**Thread: ${data.threadTopic}**\n\n`;

	data.tweets.forEach((tweet, index) => {
		const prefix = tweet.isHook ? "🧵 " : "";
		md += `${index + 1}/ ${prefix}${tweet.content}\n\n`;
	});

	return md;
}

/**
 * LinkedIn article format - professional content with key points
 */
function linkedInArticleToMarkdown(data: LinkedInArticleData): string {
	let md = `## ${data.headline}\n\n`;
	md += `${data.hook}\n\n`;

	if (data.keyPoints && data.keyPoints.length > 0) {
		md += `### Key Insights\n\n`;
		for (const point of data.keyPoints) {
			md += `**${point.point}**\n`;
			if (point.elaboration) {
				md += `${point.elaboration}\n`;
			}
			md += "\n";
		}
	}

	md += `${data.conclusion}\n`;

	if (data.hashtags && data.hashtags.length > 0) {
		md += "\n" + data.hashtags.map((h) => `#${h}`).join(" ") + "\n";
	}

	return md;
}

/**
 * Meeting notes format - structured meeting documentation
 */
function meetingNotesToMarkdown(data: MeetingNotesData): string {
	let md = "";

	if (data.meetingTitle) {
		md += `## ${data.meetingTitle}\n\n`;
	}

	if (data.attendees && data.attendees.length > 0) {
		md += `### Attendees\n`;
		md += data.attendees.map((a) => `- ${a}`).join("\n") + "\n\n";
	}

	if (data.discussionPoints && data.discussionPoints.length > 0) {
		md += `### Discussion Points\n\n`;
		for (const point of data.discussionPoints) {
			md += `#### ${point.topic}\n`;
			md += point.notes.map((n) => `- ${n}`).join("\n") + "\n";
			if (point.decisions && point.decisions.length > 0) {
				md += `\n**Decisions:**\n`;
				md += point.decisions.map((d) => `- ${d}`).join("\n") + "\n";
			}
			md += "\n";
		}
	}

	if (data.actionItems && data.actionItems.length > 0) {
		md += `### Action Items\n`;
		for (const item of data.actionItems) {
			let line = `- [ ] ${item.task}`;
			if (item.assignee) line += ` (@${item.assignee})`;
			if (item.dueDate) line += ` - Due: ${item.dueDate}`;
			if (item.priority) line += ` [${item.priority}]`;
			md += line + "\n";
		}
		md += "\n";
	}

	if (data.nextSteps && data.nextSteps.length > 0) {
		md += `### Next Steps\n`;
		md += data.nextSteps.map((s) => `- ${s}`).join("\n") + "\n";
	}

	return md;
}

/**
 * News article format - journalistic structure
 */
function newsArticleToMarkdown(data: NewsArticleData): string {
	let md = `## ${data.headline}\n\n`;

	if (data.subheadline) {
		md += `*${data.subheadline}*\n\n`;
	}

	md += `${data.lead}\n\n`;

	if (data.body && data.body.length > 0) {
		for (const section of data.body) {
			if (section.heading) {
				md += `### ${section.heading}\n\n`;
			}
			md += section.paragraphs.join("\n\n") + "\n\n";
		}
	}

	if (data.quotes && data.quotes.length > 0) {
		md += `### Notable Quotes\n\n`;
		for (const quote of data.quotes) {
			md += `> "${quote.text}"`;
			if (quote.attribution) {
				md += ` — ${quote.attribution}`;
			}
			md += "\n\n";
		}
	}

	return md;
}

/**
 * Q&A format - question and answer pairs
 */
function qaFormatToMarkdown(data: QAFormatData): string {
	let md = `## ${data.topic}\n\n`;

	for (const pair of data.pairs) {
		md += `### Q: ${pair.question}\n\n`;
		md += `**A:** ${pair.answer}\n\n`;
		if (pair.followUp) {
			md += `*Follow-up: ${pair.followUp}*\n\n`;
		}
	}

	return md;
}

/**
 * Presentation slides format - slide-by-slide breakdown
 */
function presentationSlidesToMarkdown(data: PresentationSlidesData): string {
	let md = `## Presentation (${data.totalSlides} slides)\n\n`;

	for (const slide of data.slides) {
		md += `### Slide ${slide.slideNumber}: ${slide.title}\n\n`;
		if (slide.subtitle) {
			md += `*${slide.subtitle}*\n\n`;
		}
		if (slide.bullets && slide.bullets.length > 0) {
			md += slide.bullets.map((b) => `- ${b}`).join("\n") + "\n\n";
		}
		if (slide.speakerNotes) {
			md += `> **Speaker Notes:** ${slide.speakerNotes}\n\n`;
		}
	}

	return md;
}

/**
 * Book summary format - comprehensive book overview
 */
function bookSummaryToMarkdown(data: BookSummaryData): string {
	let md = "";

	if (data.bookTitle) {
		md += `## ${data.bookTitle}\n\n`;
	}
	if (data.author) {
		md += `*by ${data.author}*\n\n`;
	}

	md += `### Overview\n\n${data.overview}\n\n`;

	if (data.mainThemes && data.mainThemes.length > 0) {
		md += `### Main Themes\n\n`;
		for (const theme of data.mainThemes) {
			md += `**${theme.theme}**\n${theme.description}\n\n`;
		}
	}

	if (data.keyTakeaways && data.keyTakeaways.length > 0) {
		md += `### Key Takeaways\n\n`;
		md += data.keyTakeaways.map((t) => `- ${t}`).join("\n") + "\n\n";
	}

	if (data.quotes && data.quotes.length > 0) {
		md += `### Notable Quotes\n\n`;
		for (const quote of data.quotes) {
			md += `> "${quote.text}"`;
			if (quote.context) {
				md += ` *(${quote.context})*`;
			}
			md += "\n\n";
		}
	}

	return md;
}

/**
 * Email newsletter format - email-style content
 */
function emailNewsletterToMarkdown(data: EmailNewsletterData): string {
	let md = `## ${data.subject}\n\n`;

	if (data.greeting) {
		md += `${data.greeting}\n\n`;
	}

	for (const section of data.sections) {
		if (section.heading) {
			md += `### ${section.heading}\n\n`;
		}
		md += `${section.content}\n\n`;
	}

	if (data.ctaText) {
		md += `**${data.ctaText}**\n\n`;
	}

	md += `${data.signOff}\n`;

	return md;
}

/**
 * Video script format - scene-by-scene breakdown
 */
function videoScriptToMarkdown(data: VideoScriptData): string {
	let md = `## ${data.title}\n\n`;

	if (data.duration) {
		md += `*Duration: ${data.duration}*\n\n`;
	}

	for (const scene of data.scenes) {
		md += `### Scene ${scene.sceneNumber}`;
		if (scene.timestamp) {
			md += ` (${scene.timestamp})`;
		}
		md += "\n\n";

		md += `**Narration:**\n${scene.narration}\n\n`;

		if (scene.visualCues) {
			md += `**Visual Cues:**\n${scene.visualCues}\n\n`;
		}
	}

	if (data.callToAction) {
		md += `### Call to Action\n\n${data.callToAction}\n`;
	}

	return md;
}

/**
 * Flash cards format - study cards with Q&A
 */
function flashCardsToMarkdown(data: FlashCardsData): string {
	let md = `## ${data.topic}\n\n`;
	md += `*${data.totalCards} cards*\n\n`;

	for (const card of data.cards) {
		md += `### Card ${card.id}`;
		if (card.category) {
			md += ` (${card.category})`;
		}
		md += "\n\n";
		md += `**Q:** ${card.front}\n\n`;
		md += `**A:** ${card.back}\n\n`;
		if (card.hint) {
			md += `*Hint: ${card.hint}*\n\n`;
		}
		md += "---\n\n";
	}

	return md;
}

/**
 * Get the formatted content for a note
 * Uses structuredContent if available, otherwise falls back to summary
 */
export function getFormattedContent(note: SpeakNotesNote): string {
	// If we have structured content, use the formatter
	if (note.structuredContent && note.structuredContent.data) {
		const formatted = structuredContentToMarkdown(note.structuredContent);
		if (formatted) {
			return formatted;
		}
	}

	// Fall back to summary field
	return note.summary || "";
}

/**
 * Get format label for display
 */
export function getFormatLabel(format: ContentFormat): string {
	const labels: Record<ContentFormat, string> = {
		note: "Note",
		transcript: "Transcript",
		bulletpoints: "Bullet Points",
		"blog-post": "Blog Post",
		"tweet-thread": "Tweet Thread",
		"linkedin-article": "LinkedIn Article",
		"meeting-notes": "Meeting Notes",
		"news-article": "News Article",
		"qa-format": "Q&A Format",
		"presentation-slides": "Presentation Slides",
		"book-summary": "Book Summary",
		"email-newsletter": "Email Newsletter",
		"video-script": "Video Script",
		"flash-cards": "Flash Cards",
	};
	return labels[format] || format;
}
