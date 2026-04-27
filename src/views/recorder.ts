/**
 * Recording Modal for capturing voice memos
 * Records audio and uploads to SpeakNotes for transcription
 */

import { App, Modal, Notice } from "obsidian";
import type SpeakNotesPlugin from "../main";
import type { ContentFormat, SpeakNotesNote } from "../types/speaknotes";
import { CONTENT_FORMATS } from "../types/plugin";
import { captureException } from "../lib/sentry";

export class RecorderModal extends Modal {
	plugin: SpeakNotesPlugin;
	mediaRecorder: MediaRecorder | null = null;
	audioChunks: Blob[] = [];
	isRecording = false;
	isPaused = false;
	timer: HTMLElement | null = null;
	waveform: HTMLCanvasElement | null = null;
	analyser: AnalyserNode | null = null;
	audioContext: AudioContext | null = null;
	timerInterval: number | null = null;
	seconds = 0;
	animationFrameId: number | null = null;
	stream: MediaStream | null = null;

	constructor(app: App, plugin: SpeakNotesPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("speaknotes-recorder-modal");

		contentEl.createEl("h2", { text: "Record voice memo" });

		// Waveform display
		this.waveform = contentEl.createEl("canvas", {
			cls: "speaknotes-waveform",
		});
		this.waveform.width = 400;
		this.waveform.height = 100;

		// Timer
		this.timer = contentEl.createEl("div", {
			cls: "speaknotes-timer",
			text: "00:00",
		});

		// Recording controls
		const controls = contentEl.createDiv("speaknotes-controls");

		const recordBtn = controls.createEl("button", {
			cls: "speaknotes-record-btn",
			text: "Start Recording",
		});
		recordBtn.onclick = () => this.toggleRecording(recordBtn);

		// Title input
		const titleContainer = contentEl.createDiv("speaknotes-input-group");
		titleContainer.createEl("label", { text: "Title (optional)" });
		titleContainer.createEl("input", {
			type: "text",
			placeholder: "Voice Memo",
			cls: "speaknotes-title-input",
		});

		// Format selector
		const formatContainer = contentEl.createDiv("speaknotes-input-group");
		formatContainer.createEl("label", { text: "Summary Format" });
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

		// Store references for later use
		contentEl.setAttribute("data-title-input", "speaknotes-title-input");
		contentEl.setAttribute("data-format-select", "speaknotes-format-select");
	}

	async toggleRecording(btn: HTMLButtonElement): Promise<void> {
		if (this.isRecording) {
			await this.stopRecording(btn);
		} else {
			await this.startRecording(btn);
		}
	}

	async startRecording(btn: HTMLButtonElement): Promise<void> {
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

			// Set up audio analysis for waveform
			this.audioContext = new AudioContext();
			const source = this.audioContext.createMediaStreamSource(this.stream);
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 256;
			source.connect(this.analyser);
			this.drawWaveform();

			// Start recording
			this.mediaRecorder = new MediaRecorder(this.stream, {
				mimeType: this.getSupportedMimeType(),
			});
			this.audioChunks = [];

			this.mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					this.audioChunks.push(e.data);
				}
			};

			this.mediaRecorder.start(1000); // Collect data every second
			this.isRecording = true;
			this.startTimer();

			btn.textContent = "Stop Recording";
			btn.addClass("recording");
		} catch (error) {
			console.error("Failed to start recording:", error);
			captureException(error, { stage: "start recording" });
			new Notice("Failed to access microphone. Please check permissions.");
		}
	}

	getSupportedMimeType(): string {
		const types = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}
		return "audio/webm";
	}

	async stopRecording(btn: HTMLButtonElement): Promise<void> {
		if (!this.mediaRecorder) return;

		return new Promise<void>((resolve) => {
			if (!this.mediaRecorder) {
				resolve();
				return;
			}

			this.mediaRecorder.onstop = async () => {
				this.isRecording = false;
				this.stopTimer();
				this.stopWaveform();

				// Stop all tracks
				if (this.stream) {
					this.stream.getTracks().forEach((track) => track.stop());
				}

				// Close audio context
				if (this.audioContext) {
					await this.audioContext.close();
				}

				const mimeType = this.getSupportedMimeType();
				const audioBlob = new Blob(this.audioChunks, { type: mimeType });
				await this.uploadAndProcess(audioBlob);

				resolve();
			};

			this.mediaRecorder.stop();
			btn.textContent = "Start Recording";
			btn.removeClass("recording");
		});
	}

	async uploadAndProcess(audioBlob: Blob): Promise<void> {
		const titleInput = this.contentEl.querySelector(".speaknotes-title-input") as HTMLInputElement;
		const formatSelect = this.contentEl.querySelector(
			".speaknotes-format-select"
		) as HTMLSelectElement;

		const title = titleInput?.value || `Voice Memo ${new Date().toLocaleString()}`;
		const format = (formatSelect?.value || this.plugin.settings.defaultFormat) as ContentFormat;

		// Show processing state
		this.contentEl.empty();
		this.contentEl.addClass("speaknotes-processing-state");

		const processingEl = this.contentEl.createDiv("speaknotes-processing");
		processingEl.createEl("div", { cls: "speaknotes-spinner" });
		const statusEl = processingEl.createEl("div", {
			cls: "speaknotes-processing-status",
			text: "Uploading to SpeakNotes...",
		});

		try {
			// Check authentication
			if (!this.plugin.settings.firebaseToken) {
				throw new Error("Not authenticated. Please connect your SpeakNotes account.");
			}

			// Upload via API
			const result = await this.plugin.api.uploadAudio(audioBlob, {
				title,
				format,
				source: "obsidian-plugin",
			});

			statusEl.textContent = "Processing transcription...";

			// Wait for completion
			const completedNote = await this.waitForCompletion(result.noteId, statusEl);

			statusEl.textContent = "Creating summary in vault...";

			// Create note in vault
			await this.createNoteInVault(completedNote);

			new Notice(`SpeakNotes: Created "${completedNote.title}"`);
			this.close();
		} catch (error) {
			console.error("Upload failed:", error);
			captureException(error, { stage: "voice memo upload" });
			this.contentEl.empty();

			const errorEl = this.contentEl.createDiv("speaknotes-error");
			errorEl.createEl("h3", { text: "Error" });
			errorEl.createEl("p", { text: (error as Error).message });

			const retryBtn = errorEl.createEl("button", {
				text: "Close",
				cls: "mod-cta",
			});
			retryBtn.onclick = () => this.close();
		}
	}

	async waitForCompletion(noteId: string, statusEl: HTMLElement): Promise<SpeakNotesNote> {
		const maxWait = 300000; // 5 minutes
		const startTime = Date.now();

		while (Date.now() - startTime < maxWait) {
			try {
				const note = await this.plugin.api.getNote(noteId);

				if (note.status === "Done") {
					return note;
				}

				if (note.status === "Error") {
					throw new Error("Transcription failed");
				}

				// Update status display
				statusEl.textContent = `Status: ${note.status}...`;

				await new Promise((resolve) => setTimeout(resolve, 2000));
			} catch {
				// Note might not exist yet, retry
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}

		throw new Error("Timeout waiting for transcription");
	}

	async createNoteInVault(note: SpeakNotesNote): Promise<void> {
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
	}

	drawWaveform(): void {
		if (!this.analyser || !this.waveform || !this.isRecording) return;

		const canvas = this.waveform;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

		const draw = (): void => {
			if (!this.isRecording || !this.analyser) return;

			this.animationFrameId = requestAnimationFrame(draw);
			this.analyser.getByteTimeDomainData(dataArray);

			// Clear canvas
			ctx.fillStyle = "var(--background-primary)";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			// Draw waveform
			ctx.lineWidth = 2;
			ctx.strokeStyle = "var(--interactive-accent)";
			ctx.beginPath();

			const sliceWidth = canvas.width / dataArray.length;
			let x = 0;

			for (let i = 0; i < dataArray.length; i++) {
				const v = dataArray[i] / 128.0;
				const y = (v * canvas.height) / 2;

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}

				x += sliceWidth;
			}

			ctx.lineTo(canvas.width, canvas.height / 2);
			ctx.stroke();
		};

		draw();
	}

	stopWaveform(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	startTimer(): void {
		this.seconds = 0;
		this.timerInterval = window.setInterval(() => {
			this.seconds++;
			const mins = Math.floor(this.seconds / 60);
			const secs = this.seconds % 60;
			if (this.timer) {
				this.timer.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
			}
		}, 1000);
	}

	stopTimer(): void {
		if (this.timerInterval !== null) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	onClose(): void {
		// Cleanup
		if (this.isRecording && this.mediaRecorder) {
			this.mediaRecorder.stop();
		}

		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
		}

		this.stopTimer();
		this.stopWaveform();

		if (this.audioContext) {
			this.audioContext.close();
		}

		this.contentEl.empty();
	}
}
