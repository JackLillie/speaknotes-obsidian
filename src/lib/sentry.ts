import {
	BrowserClient,
	Scope,
	defaultStackParser,
	getDefaultIntegrations,
	makeFetchTransport,
} from "@sentry/browser";

const DSN =
	"https://8d34b5fb91f08be40a51eee79adc86ee@o4510858594484224.ingest.de.sentry.io/4511043803742288";

let scope: Scope | null = null;

export function initSentry(release: string): void {
	if (scope) return;

	// Strip integrations that would auto-instrument or hijack global handlers.
	// We only want explicit captureException calls so we don't accidentally
	// report Obsidian's own runtime errors or other plugins' bugs.
	const integrations = getDefaultIntegrations({}).filter(
		(i) =>
			i.name !== "GlobalHandlers" &&
			i.name !== "TryCatch" &&
			i.name !== "Breadcrumbs" &&
			i.name !== "BrowserApiErrors"
	);

	const client = new BrowserClient({
		dsn: DSN,
		release: `speaknotes-obsidian@${release}`,
		environment: "production",
		integrations,
		transport: makeFetchTransport,
		stackParser: defaultStackParser,
		// Don't send personally identifiable info from the URL/UA by default.
		sendDefaultPii: false,
	});

	scope = new Scope();
	scope.setClient(client);
	client.init();
	scope.setTag("source", "obsidian-plugin");
}

export function setSentryUser(user: { id?: string; email?: string } | null): void {
	if (!scope) return;
	scope.setUser(user);
}

export function captureException(
	error: unknown,
	context?: Record<string, unknown>
): void {
	if (!scope) {
		console.error("[speaknotes] sentry not initialised:", error);
		return;
	}
	if (context) {
		const child = scope.clone();
		child.setExtras(context);
		child.captureException(error);
	} else {
		scope.captureException(error);
	}
}

export function addBreadcrumb(
	message: string,
	data?: Record<string, unknown>
): void {
	if (!scope) return;
	scope.addBreadcrumb({ message, data, level: "info" });
}
