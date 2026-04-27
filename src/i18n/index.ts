/**
 * i18n setup for SpeakNotes Obsidian Plugin
 * Uses i18next for internationalization
 */

import i18next from "i18next";

// Import all locale files
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import hi from "./locales/hi.json";
import id from "./locales/id.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import th from "./locales/th.json";
import tr from "./locales/tr.json";
import vi from "./locales/vi.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";

// Get the user's preferred language from Obsidian or system
function getPreferredLanguage(): string {
	// Try to get from Obsidian's locale setting
	const obsidianLang = window.localStorage.getItem("language");
	if (obsidianLang) {
		// Obsidian stores full locale like 'en', 'es', 'fr', etc.
		return obsidianLang.split("-")[0];
	}

	// Fall back to browser/system language
	const browserLang = navigator.language || navigator.languages?.[0];
	if (browserLang) {
		return browserLang.split("-")[0];
	}

	return "en";
}

// Initialize i18next
i18next.init({
	lng: getPreferredLanguage(),
	fallbackLng: "en",
	debug: false,
	resources: {
		ar: { translation: ar },
		de: { translation: de },
		en: { translation: en },
		es: { translation: es },
		fr: { translation: fr },
		hi: { translation: hi },
		id: { translation: id },
		it: { translation: it },
		ja: { translation: ja },
		ko: { translation: ko },
		nl: { translation: nl },
		pl: { translation: pl },
		pt: { translation: pt },
		ru: { translation: ru },
		th: { translation: th },
		tr: { translation: tr },
		vi: { translation: vi },
		"zh-Hans": { translation: zhHans },
		"zh-Hant": { translation: zhHant },
		zh: { translation: zhHans }, // Default Chinese to Simplified
	},
	interpolation: {
		escapeValue: false,
	},
});

/**
 * Translation function
 * @param key - The translation key (e.g., "settings.title")
 * @param options - Optional interpolation values
 */
export function t(key: string, options?: Record<string, unknown>): string {
	return i18next.t(key, options);
}

/**
 * Change the current language
 * @param lang - Language code (e.g., "en", "es", "fr")
 */
export function changeLanguage(lang: string): Promise<void> {
	return i18next.changeLanguage(lang).then(() => {});
}

/**
 * Get the current language
 */
export function getCurrentLanguage(): string {
	return i18next.language;
}

/**
 * Get list of available languages
 */
export function getAvailableLanguages(): { code: string; name: string }[] {
	return [
		{ code: "ar", name: "العربية" },
		{ code: "de", name: "Deutsch" },
		{ code: "en", name: "English" },
		{ code: "es", name: "Español" },
		{ code: "fr", name: "Français" },
		{ code: "hi", name: "हिन्दी" },
		{ code: "id", name: "Bahasa Indonesia" },
		{ code: "it", name: "Italiano" },
		{ code: "ja", name: "日本語" },
		{ code: "ko", name: "한국어" },
		{ code: "nl", name: "Nederlands" },
		{ code: "pl", name: "Polski" },
		{ code: "pt", name: "Português" },
		{ code: "ru", name: "Русский" },
		{ code: "th", name: "ไทย" },
		{ code: "tr", name: "Türkçe" },
		{ code: "vi", name: "Tiếng Việt" },
		{ code: "zh-Hans", name: "简体中文" },
		{ code: "zh-Hant", name: "繁體中文" },
	];
}

export default i18next;
