export type ConflictChoice = "markdown"|"sqlite"|"separate_entry"|"stop";
export function conflictChoices(): ConflictChoice[] { return ["markdown","sqlite","separate_entry","stop"]; }
