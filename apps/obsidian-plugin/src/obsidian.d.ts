declare module "obsidian" {
  export type TFile = { path: string; basename: string; stat: { ctime: number; mtime: number } };
  export class Notice { constructor(message: string); }
  export class Plugin {
    app: {
      workspace: { getActiveFile(): TFile | null };
      vault: { read(file: TFile): Promise<string> };
      fileManager: { processFrontMatter(file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void> };
    };
    addSettingTab(tab: PluginSettingTab): void;
    addCommand(command: { id: string; name: string; callback: () => unknown }): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }
  export class PluginSettingTab {
    containerEl: { empty(): void };
    constructor(app: unknown, plugin: Plugin);
  }
  export class Setting {
    constructor(containerEl: unknown);
    setName(name: string): this;
    setDesc(description: string): this;
    addText(callback: (text: { setValue(value: string): { onChange(callback: (value: string) => Promise<void>): unknown } }) => unknown): this;
  }
}
