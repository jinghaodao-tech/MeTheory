# MeTheory Entry Sync

This minimal Obsidian plugin keeps the note as the human-readable source of
truth and registers it with the local MeTheory API as an Entry.

Copy this directory to `.obsidian/plugins/metheory-entry-sync`, enable the
plugin, then configure the local API URL. The plugin creates or reuses a local
Obsidian user on its first registration (or accepts a configured MeTheory user
ID). Run the
`Register current note as MeTheory Entry` command from an open note. The
plugin writes only `metheory_entry_id` to frontmatter. Re-registering the same
note updates the existing Entry instead of creating a duplicate.

`recordedAt` represents when the Entry happened and is immutable after the
first registration. For a new Entry the plugin uses the first available value:

1. `recorded_at` frontmatter (preferred; the older `metheory_recorded_at` key is read for compatibility)
2. `date` frontmatter
3. a daily filename matching `YYYY-MM-DD.md`
4. the file creation timestamp

An invalid explicit date or invalid daily filename is an error, not a fallback
to the current time. The Obsidian file mtime is sent separately as
`sourceUpdatedAt`, so editing a note does not change its Entry date. Existing
Entries omit `recordedAt` from the update payload so the stored value remains
unchanged.

`src/main.ts` is the source of truth. `main.js` is a tracked generated artifact
so Obsidian can load this directory directly. After changing plugin source,
run these commands from the repository root:

```powershell
npm run typecheck:obsidian
npm run build:obsidian
```

The API defaults to `http://127.0.0.1:8100`; start it with `npm run dev:api`.
