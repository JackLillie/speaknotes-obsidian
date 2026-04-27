/**
 * Status Bar Component
 * Real-time sync indicator in Obsidian status bar
 */

import type { Plugin } from "obsidian";
import type { SyncService } from "../services/sync";

export type SyncStatus = "idle" | "syncing" | "success" | "error" | "offline";

export class StatusBarManager {
	plugin: Plugin;
	syncService: SyncService;
	statusBarEl: HTMLElement | null = null;
	currentStatus: SyncStatus = "idle";
	lastSyncTime: Date | null = null;
	isConnected = false;

	constructor(plugin: Plugin, syncService: SyncService) {
		this.plugin = plugin;
		this.syncService = syncService;
	}

	/**
	 * Initialize the status bar item
	 */
	init(): void {
		this.statusBarEl = this.plugin.addStatusBarItem();
		this.statusBarEl.addClass("speaknotes-status-bar");
		this.statusBarEl.onclick = () => this.handleClick();
		this.update();
	}

	/**
	 * Update status bar display
	 */
	update(): void {
		if (!this.statusBarEl) return;

		this.statusBarEl.empty();

		// Icon
		const icon = this.statusBarEl.createSpan({ cls: "speaknotes-status-icon" });

		// Text
		const text = this.statusBarEl.createSpan({ cls: "speaknotes-status-text" });

		switch (this.currentStatus) {
			case "syncing":
				this.renderSyncingIcon(icon);
				icon.addClass("speaknotes-status-syncing");
				text.textContent = "Syncing...";
				break;

			case "success":
				this.renderCheckIcon(icon);
				icon.addClass("speaknotes-status-success");
				text.textContent = this.lastSyncTime
					? `Synced ${this.formatRelativeTime(this.lastSyncTime)}`
					: "Synced";
				break;

			case "error":
				this.renderErrorIcon(icon);
				icon.addClass("speaknotes-status-error");
				text.textContent = "Sync error";
				break;

			case "offline":
				this.renderOfflineIcon(icon);
				icon.addClass("speaknotes-status-offline");
				text.textContent = "Offline";
				break;

			default: // idle
				this.renderIdleIcon(icon);
				text.textContent = this.isConnected ? "SpeakNotes" : "Not connected";
		}
	}

	/**
	 * Set current sync status
	 */
	setStatus(status: SyncStatus): void {
		this.currentStatus = status;

		if (status === "success") {
			this.lastSyncTime = new Date();

			// Auto-reset to idle after 5 seconds (registered so Obsidian clears on unload)
			this.plugin.registerInterval(
				window.setTimeout(() => {
					if (this.currentStatus === "success") {
						this.setStatus("idle");
					}
				}, 5000)
			);
		}

		this.update();
	}

	/**
	 * Set connection status
	 */
	setConnected(connected: boolean): void {
		this.isConnected = connected;
		if (!connected) {
			this.currentStatus = "offline";
		}
		this.update();
	}

	/**
	 * Handle status bar click
	 */
	handleClick(): void {
		if (this.currentStatus === "syncing") return;

		// Trigger sync
		this.setStatus("syncing");
		this.syncService
			.sync()
			.then(() => this.setStatus("success"))
			.catch(() => this.setStatus("error"));
	}

	/**
	 * Format relative time
	 */
	formatRelativeTime(date: Date): string {
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

		if (seconds < 60) return "just now";
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
		return date.toLocaleDateString();
	}

	/**
	 * SVG Icons - built via DOM API (Obsidian rejects innerHTML)
	 */
	private buildSvg(host: HTMLElement, builder: (svg: SVGElement) => void): void {
		const svg = activeDocument.createSvg("svg");
		svg.setAttribute("width", "14");
		svg.setAttribute("height", "14");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		builder(svg);
		host.appendChild(svg);
	}

	private appendSvgChild(
		parent: SVGElement,
		tag: keyof SVGElementTagNameMap,
		attrs: Record<string, string>
	): void {
		const el = activeDocument.createSvg(tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		parent.appendChild(el);
	}

	renderIdleIcon(host: HTMLElement): void {
		this.buildSvg(host, (svg) => {
			this.appendSvgChild(svg, "path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" });
			this.appendSvgChild(svg, "path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" });
			this.appendSvgChild(svg, "line", { x1: "12", y1: "19", x2: "12", y2: "22" });
		});
	}

	renderSyncingIcon(host: HTMLElement): void {
		this.buildSvg(host, (svg) => {
			svg.classList.add("speaknotes-spin");
			this.appendSvgChild(svg, "path", { d: "M21 12a9 9 0 1 1-6.219-8.56" });
		});
	}

	renderCheckIcon(host: HTMLElement): void {
		this.buildSvg(host, (svg) => {
			this.appendSvgChild(svg, "polyline", { points: "20 6 9 17 4 12" });
		});
	}

	renderErrorIcon(host: HTMLElement): void {
		this.buildSvg(host, (svg) => {
			this.appendSvgChild(svg, "circle", { cx: "12", cy: "12", r: "10" });
			this.appendSvgChild(svg, "line", { x1: "12", y1: "8", x2: "12", y2: "12" });
			this.appendSvgChild(svg, "line", { x1: "12", y1: "16", x2: "12.01", y2: "16" });
		});
	}

	renderOfflineIcon(host: HTMLElement): void {
		this.buildSvg(host, (svg) => {
			this.appendSvgChild(svg, "line", { x1: "1", y1: "1", x2: "23", y2: "23" });
			this.appendSvgChild(svg, "path", { d: "M16.72 11.06A10.94 10.94 0 0 1 19 12.55" });
			this.appendSvgChild(svg, "path", { d: "M5 12.55a10.94 10.94 0 0 1 5.17-2.39" });
			this.appendSvgChild(svg, "path", { d: "M10.71 5.05A16 16 0 0 1 22.58 9" });
			this.appendSvgChild(svg, "path", { d: "M1.42 9a15.91 15.91 0 0 1 4.7-2.88" });
			this.appendSvgChild(svg, "path", { d: "M8.53 16.11a6 6 0 0 1 6.95 0" });
			this.appendSvgChild(svg, "line", { x1: "12", y1: "20", x2: "12.01", y2: "20" });
		});
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.statusBarEl) {
			this.statusBarEl.remove();
			this.statusBarEl = null;
		}
	}
}
