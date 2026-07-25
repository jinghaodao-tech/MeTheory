const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  apiUrl: "http://127.0.0.1:8100",
  userId: "",
  authSubject: "obsidian-local",
};

function frontmatterEntryId(note) {
  const frontmatter = note.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!frontmatter) return null;
  const line = frontmatter[1].split(/\r?\n/).find((value) => /^metheory_entry_id\s*:/.test(value));
  if (!line) return null;
  const value = line.replace(/^metheory_entry_id\s*:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
  return value || null;
}

function noteBody(note) {
  return note.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

class MeTheorySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("MeTheory API URL")
      .setDesc("The local MeTheory API endpoint.")
      .addText((text) => text.setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value.trim().replace(/\/$/, "");
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("MeTheory user ID")
      .setDesc("Leave empty to create or reuse the local Obsidian user automatically.")
      .addText((text) => text.setValue(this.plugin.settings.userId).onChange(async (value) => {
        this.plugin.settings.userId = value.trim();
        await this.plugin.saveSettings();
      }));
  }
}

module.exports = class MeTheoryEntrySyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MeTheorySettingTab(this.app, this));
    this.addCommand({
      id: "register-active-note",
      name: "Register current note as MeTheory Entry",
      callback: () => this.registerActiveNote(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async ensureUserId() {
    if (this.settings.userId) return this.settings.userId;
    const response = await fetch(`${this.settings.apiUrl}/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authSubject: this.settings.authSubject, locale: "ja-JP", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo" }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.id) throw new Error(payload.error || "local_user_registration_failed");
    this.settings.userId = payload.id;
    await this.saveSettings();
    return this.settings.userId;
  }

  async registerActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a note before registering it with MeTheory.");
      return;
    }
    try {
      const userId = await this.ensureUserId();
      const note = await this.app.vault.read(file);
      const response = await fetch(`${this.settings.apiUrl}/v1/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: frontmatterEntryId(note) || undefined,
          userId,
          externalSource: "obsidian",
          externalSourceId: file.path,
          title: file.basename,
          body: noteBody(note),
          recordedAt: new Date(file.stat.mtime).toISOString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "entry_registration_failed");
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.metheory_entry_id = payload.entry.id;
      });
      new Notice(payload.created ? "MeTheory Entry created." : "MeTheory Entry updated.");
    } catch (error) {
      new Notice(`MeTheory registration failed: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
};
