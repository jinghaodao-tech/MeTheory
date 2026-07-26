import { Notice, Plugin, PluginSettingTab, Setting, type TFile } from "obsidian";
import { entryRegistrationPayload } from "./entryRegistration";
import { entryIdFromFrontmatter } from "./frontmatter";

type MeTheoryPluginSettings = {
  apiUrl: string;
  userId: string;
  authSubject: string;
};

type EntryResponse = { created: boolean; entry: { id: string } };

const DEFAULT_SETTINGS: MeTheoryPluginSettings = {
  apiUrl: "http://127.0.0.1:8100",
  userId: "",
  authSubject: "obsidian-local",
};

function sourceUpdatedAt(file: TFile): string {
  return new Date(file.stat.mtime).toISOString();
}

function creationTimestamp(file: TFile): string {
  return new Date(file.stat.ctime).toISOString();
}

class MeTheorySettingTab extends PluginSettingTab {
  private readonly plugin: MeTheoryEntrySyncPlugin;

  constructor(plugin: MeTheoryEntrySyncPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
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

export default class MeTheoryEntrySyncPlugin extends Plugin {
  settings: MeTheoryPluginSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new MeTheorySettingTab(this));
    this.addCommand({
      id: "register-active-note",
      name: "Register current note as MeTheory Entry",
      callback: () => this.registerActiveNote(),
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() as Partial<MeTheoryPluginSettings> };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async ensureUserId(): Promise<string> {
    if (this.settings.userId) return this.settings.userId;
    const response = await fetch(`${this.settings.apiUrl}/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authSubject: this.settings.authSubject, locale: "ja-JP", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo" }),
    });
    const payload = await response.json() as { id?: string; error?: string };
    if (!response.ok || !payload.id) throw new Error(payload.error ?? "local_user_registration_failed");
    this.settings.userId = payload.id;
    await this.saveSettings();
    return this.settings.userId;
  }

  async registerActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a note before registering it with MeTheory.");
      return;
    }
    try {
      const userId = await this.ensureUserId();
      const note = await this.app.vault.read(file);
      const entryId = entryIdFromFrontmatter(note);
      const response = await fetch(`${this.settings.apiUrl}/v1/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entryRegistrationPayload({ userId, note, path: file.path, sourceUpdatedAt: sourceUpdatedAt(file), creationTimestamp: creationTimestamp(file), entryId })),
      });
      const payload = await response.json() as EntryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "entry_registration_failed");
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.metheory_entry_id = payload.entry.id;
      });
      new Notice(payload.created ? "MeTheory Entry created." : "MeTheory Entry updated.");
    } catch (error) {
      new Notice(`MeTheory registration failed: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
}
