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

The API defaults to `http://127.0.0.1:8100`; start it with `npm run dev:api`.
