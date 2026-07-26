"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// apps/obsidian-plugin/src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MeTheoryEntrySyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// apps/obsidian-plugin/src/frontmatter.ts
var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function frontmatterValue(note, key) {
  const match = note.match(FRONTMATTER);
  if (!match) return null;
  const line = match[1].split(/\r?\n/).find((value) => new RegExp(`^${key}\\s*:`).test(value));
  if (!line) return null;
  return line.replace(new RegExp(`^${key}\\s*:\\s*`), "").trim().replace(/^['"]|['"]$/g, "");
}
function normalizedDate(value, errorCode) {
  const calendar = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(errorCode);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) throw new Error(errorCode);
  }
  return parsed.toISOString();
}
function entryIdFromFrontmatter(note) {
  const id = frontmatterValue(note, "metheory_entry_id");
  return id || null;
}
function entryRecordedAtFromFrontmatter(note) {
  const explicitValue = frontmatterValue(note, "recorded_at") ?? frontmatterValue(note, "date") ?? frontmatterValue(note, "metheory_recorded_at");
  return explicitValue === null ? null : normalizedDate(explicitValue, "invalid_frontmatter_recorded_at");
}
function entryRecordedAtFromPath(path) {
  const filename = path.split(/[\\/]/).at(-1) ?? "";
  const date = /^(\d{4}-\d{2}-\d{2})(?:\.md)?$/i.exec(filename)?.[1];
  return date ? normalizedDate(date, "invalid_filename_recorded_at") : null;
}
function entryBodyFromNote(note) {
  return note.replace(FRONTMATTER, "");
}
function entryTitleFromPath(path) {
  const filename = path.split(/[\\/]/).at(-1) ?? "Untitled";
  return filename.replace(/\.md$/i, "") || "Untitled";
}

// apps/obsidian-plugin/src/entryRegistration.ts
function entryRegistrationPayload(input) {
  const entryId = input.entryId === void 0 ? entryIdFromFrontmatter(input.note) : input.entryId;
  return {
    id: entryId ?? void 0,
    userId: input.userId,
    externalSource: "obsidian",
    externalSourceId: input.path,
    title: entryTitleFromPath(input.path),
    body: entryBodyFromNote(input.note),
    recordedAt: entryId ? void 0 : entryRecordedAtFromFrontmatter(input.note) ?? entryRecordedAtFromPath(input.path) ?? input.creationTimestamp,
    sourceUpdatedAt: input.sourceUpdatedAt
  };
}

// apps/obsidian-plugin/src/main.ts
var DEFAULT_SETTINGS = {
  apiUrl: "http://127.0.0.1:8100",
  userId: "",
  authSubject: "obsidian-local"
};
function sourceUpdatedAt(file) {
  return new Date(file.stat.mtime).toISOString();
}
function creationTimestamp(file) {
  return new Date(file.stat.ctime).toISOString();
}
var MeTheorySettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("MeTheory API URL").setDesc("The local MeTheory API endpoint.").addText((text) => text.setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
      this.plugin.settings.apiUrl = value.trim().replace(/\/$/, "");
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("MeTheory user ID").setDesc("Leave empty to create or reuse the local Obsidian user automatically.").addText((text) => text.setValue(this.plugin.settings.userId).onChange(async (value) => {
      this.plugin.settings.userId = value.trim();
      await this.plugin.saveSettings();
    }));
  }
};
var MeTheoryEntrySyncPlugin = class extends import_obsidian.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MeTheorySettingTab(this));
    this.addCommand({
      id: "register-active-note",
      name: "Register current note as MeTheory Entry",
      callback: () => this.registerActiveNote()
    });
  }
  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async ensureUserId() {
    if (this.settings.userId) return this.settings.userId;
    const response = await fetch(`${this.settings.apiUrl}/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authSubject: this.settings.authSubject, locale: "ja-JP", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo" })
    });
    const payload = await response.json();
    if (!response.ok || !payload.id) throw new Error(payload.error ?? "local_user_registration_failed");
    this.settings.userId = payload.id;
    await this.saveSettings();
    return this.settings.userId;
  }
  async registerActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian.Notice("Open a note before registering it with MeTheory.");
      return;
    }
    try {
      const userId = await this.ensureUserId();
      const note = await this.app.vault.read(file);
      const entryId = entryIdFromFrontmatter(note);
      const response = await fetch(`${this.settings.apiUrl}/v1/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entryRegistrationPayload({ userId, note, path: file.path, sourceUpdatedAt: sourceUpdatedAt(file), creationTimestamp: creationTimestamp(file), entryId }))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "entry_registration_failed");
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.metheory_entry_id = payload.entry.id;
      });
      new import_obsidian.Notice(payload.created ? "MeTheory Entry created." : "MeTheory Entry updated.");
    } catch (error) {
      new import_obsidian.Notice(`MeTheory registration failed: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
};
