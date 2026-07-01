export interface Keymap {
  key: string;
  description: string;
  mode: string;
  section: string;
}

export interface Section {
  name: string;
  keymaps: Keymap[];
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function clean(input: string): string {
  const withoutComments = input.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(/<[^>]*>/g, "");
  return decodeEntities(withoutTags)
    .replace(/\u200B/g, "")
    .trim();
}

export function parseKeymaps(html: string): Section[] {
  const sectionsByName = new Map<string, Section>();
  const tokenRegex = /<h2\b[^>]*>([\s\S]*?)<\/h2>|<table>([\s\S]*?)<\/table>/g;

  let currentSection = "General";
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const heading = match[1];
    const table = match[2];

    if (heading !== undefined) {
      currentSection = clean(heading);
      continue;
    }

    const keymaps = parseTable(table, currentSection);
    if (keymaps.length === 0) {
      continue;
    }

    const existing = sectionsByName.get(currentSection);
    if (existing) {
      existing.keymaps.push(...keymaps);
    } else {
      sectionsByName.set(currentSection, { name: currentSection, keymaps });
    }
  }

  return [...sectionsByName.values()];
}

function parseTable(table: string, section: string): Keymap[] {
  const keymaps: Keymap[] = [];

  for (const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(
      (cell) => clean(cell[1]),
    );
    if (cells.length >= 3 && cells[0] !== "Key") {
      keymaps.push({
        key: cells[0],
        description: cells[1],
        mode: cells[2],
        section,
      });
    }
  }

  return keymaps;
}
