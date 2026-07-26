import { Notice, Plugin, PluginSettingTab, Setting, type TFile } from "obsidian";
import { entryRegistrationPayload } from "./entryRegistration";
import { entryIdFromFrontmatter } from "./frontmatter";

type MeTheoryPluginSettings = {
  apiUrl: string;
  userId: string;
  authSubject: string;
  aiProvider: "manual_chatgpt" | "openai" | "disabled";
};

type EntryResponse = { created: boolean; entry: { id: string } };

const DEFAULT_SETTINGS: MeTheoryPluginSettings = {
  apiUrl: "http://127.0.0.1:8100",
  userId: "",
  authSubject: "obsidian-local",
  aiProvider: "manual_chatgpt",
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
    new Setting(containerEl)
      .setName("Template generation mode")
      .setDesc("manual_chatgpt, openai, or disabled. API keys stay on the local API.")
      .addText((text) => text.setValue(this.plugin.settings.aiProvider).onChange(async (value) => {
        const mode = value.trim() as MeTheoryPluginSettings["aiProvider"];
        if (["manual_chatgpt", "openai", "disabled"].includes(mode)) { this.plugin.settings.aiProvider = mode; await this.plugin.saveSettings(); }
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
    this.addCommand({ id: "create-template-draft", name: "Create MeTheory Template", callback: () => this.createTemplateDraft() });
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

  async createTemplateDraft(): Promise<void> {
    const theme = window.prompt("Template theme")?.trim();
    if (!theme) return;
    try {
      const userId = await this.ensureUserId();
      const response = await fetch(`${this.settings.apiUrl}/v1/templates/generate-draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, theme }) });
      const payload = await response.json() as { prompt?: string; draft?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "template_generation_failed");
      let draft = payload.draft;
      if (payload.prompt) {
        await navigator.clipboard?.writeText(payload.prompt);
        new Notice("ChatGPT用プロンプトをコピーしました。返却JSONを貼り付けてください。");
        const result = window.prompt("ChatGPTのJSON結果");
        if (!result) return;
        const validation = await fetch(`${this.settings.apiUrl}/v1/templates/validate-draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response: result }) });
        const validated = await validation.json() as { draft?: unknown; error?: string };
        if (!validation.ok) throw new Error(validated.error ?? "template_generation_invalid_json");
        draft = validated.draft;
      }
      const approved = window.confirm(`テンプレート案を保存しますか？\n${JSON.stringify(draft).slice(0, 500)}`);
      if (!approved) return;
      const saved = await fetch(`${this.settings.apiUrl}/v1/templates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, approved: true, ...(draft as object), generationSource: payload.prompt ? "user" : "ai", promptVersion: "template-v2" }) });
      if (!saved.ok) throw new Error((await saved.json() as { error?: string }).error ?? "template_save_failed");
      new Notice("MeTheory Template saved.");
    } catch (error) { new Notice(`Template generation failed: ${error instanceof Error ? error.message : "unknown_error"}`); }
  }
}
