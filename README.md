# SpeakNotes for Obsidian

Transcribe and summarize audio directly in your Obsidian vault. Record voice memos, import audio or video files, and sync your SpeakNotes library straight into your notes.

## Features

- Record voice memos from inside Obsidian
- Import audio and video files from your vault and get them transcribed
- Sync your existing SpeakNotes library into a folder of your choosing
- Choose the summary format (action items, structured notes, key takeaways, etc.)
- Two-way sync: edits in Obsidian propagate back to SpeakNotes
- Status bar indicator with manual sync trigger
- Multilingual UI (English, Spanish, French, German, Portuguese, and more)

## Requirements

- An Obsidian vault on Obsidian 1.5.0 or newer (desktop or mobile)
- A free or paid SpeakNotes account at [speaknotes.io](https://speaknotes.io)

## Install

### From the Community Plugins directory (recommended once approved)

1. Open **Settings** → **Community plugins**
2. Click **Browse**, search for "SpeakNotes"
3. Click **Install**, then **Enable**

### Manually (until approved)

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the [Releases page](https://github.com/JackLillie/speaknotes-obsidian/releases)
2. Drop them into `<vault>/.obsidian/plugins/speaknotes/`
3. In Obsidian, open **Settings** → **Community plugins** and enable **SpeakNotes**

## Connect your account

1. Open the plugin settings tab in Obsidian
2. Click **Connect SpeakNotes**
3. A browser tab opens at speaknotes.io to authorise the plugin
4. After signing in, the page redirects back into Obsidian and the plugin is paired

You only need to do this once per device.

## Usage

- **Record a voice memo** — open the command palette and run `SpeakNotes: Record voice memo`
- **Import an audio or video file** — run `SpeakNotes: Import audio file`, or right-click any audio attachment in your vault
- **Sync your library** — click the SpeakNotes status bar icon, or run `SpeakNotes: Sync now`. You can also enable periodic sync in settings

## Settings

- **Sync folder** — where synced notes are stored in your vault
- **Auto-sync on startup** — pull new notes when Obsidian launches
- **Sync interval** — minutes between background syncs (0 disables periodic sync)
- **Default format** — which summary style to use for newly transcribed audio

## Privacy

The plugin only sends audio you explicitly record or import. Your vault contents are never read by SpeakNotes. Authentication happens via your existing SpeakNotes account using Firebase tokens. See the [SpeakNotes privacy policy](https://speaknotes.io/privacy) for details on how we handle the data we do receive.

## Support

- Docs: [speaknotes.io/docs/obsidian](https://speaknotes.io/docs/obsidian)
- Issues and feature requests: [GitHub Issues](https://github.com/JackLillie/speaknotes-obsidian/issues)
- Email: support@speaknotes.io

## License

MIT — see [LICENSE](./LICENSE).
