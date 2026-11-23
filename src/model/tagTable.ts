import { hashColor, type PaletteColor } from './palette';
import { isValidTag } from './tags';

/** Parameters stored in the front matter of tags/<tag>.md. All optional. */
export interface TagSettings {
  readonly color?: PaletteColor;
  readonly aliases: readonly string[];
  readonly label?: string;
  readonly archived: boolean;
}

export const EMPTY_SETTINGS: TagSettings = { aliases: [], archived: false };

export interface SheetRecord {
  readonly name: string;
  readonly path: string;
  readonly lastModified: number;
  readonly settings: TagSettings;
}

export interface TagInfo {
  readonly name: string;
  readonly settings: TagSettings;
  readonly sheet: SheetRecord | null;
  /** Aliases that actually resolve to this tag (conflicting ones excluded). */
  readonly aliases: readonly string[];
}

export interface AliasConflict {
  readonly alias: string;
  /** Tag that keeps the name. */
  readonly winner: string;
  /** Tag whose claim is ignored until corrected. */
  readonly loser: string;
}

/**
 * Table of tags built from the sheets in tags/: primary names, aliases → primary name, settings.
 * When two tags claim the same name (as a name or an alias), the first one in alphabetical
 * order wins and the conflict is reported.
 */
export class TagTable {
  private readonly infos = new Map<string, TagInfo>();
  private readonly aliasToName = new Map<string, string>();
  readonly conflicts: readonly AliasConflict[];

  constructor(sheets: readonly SheetRecord[] = []) {
    const sorted = [...sheets].filter((s) => isValidTag(s.name)).sort((a, b) => a.name.localeCompare(b.name));
    const claims = new Map<string, string>();
    const conflicts: AliasConflict[] = [];

    // Claims are processed in alphabetical order of the claiming tag: first claim wins.
    const claim = (claimed: string, by: string): boolean => {
      const owner = claims.get(claimed);
      if (owner === undefined) {
        claims.set(claimed, by);
        return true;
      }
      if (owner !== by) conflicts.push({ alias: claimed, winner: owner, loser: by });
      return false;
    };

    const accepted = new Map<string, string[]>();
    for (const sheet of sorted) {
      claim(sheet.name, sheet.name);
      const aliases: string[] = [];
      for (const alias of sheet.settings.aliases) {
        if (alias === sheet.name || !isValidTag(alias)) continue;
        if (claim(alias, sheet.name)) aliases.push(alias);
      }
      accepted.set(sheet.name, aliases);
    }

    for (const sheet of sorted) {
      // A sheet whose own name was claimed by another tag as an alias resolves to that tag.
      if (claims.get(sheet.name) !== sheet.name) continue;
      const aliases = accepted.get(sheet.name) ?? [];
      this.infos.set(sheet.name, { name: sheet.name, settings: sheet.settings, sheet, aliases });
      for (const alias of aliases) this.aliasToName.set(alias, sheet.name);
    }
    for (const [claimed, owner] of claims) {
      if (claimed !== owner) this.aliasToName.set(claimed, owner);
    }
    this.conflicts = conflicts;
  }

  /** Primary name of a raw tag (resolves aliases). */
  canonical(raw: string): string {
    return this.aliasToName.get(raw) ?? raw;
  }

  isAlias(raw: string): boolean {
    return this.aliasToName.has(raw);
  }

  /** Info for a primary name; tags without a sheet get default settings. */
  info(name: string): TagInfo {
    return this.infos.get(name) ?? { name, settings: EMPTY_SETTINGS, sheet: null, aliases: [] };
  }

  hasSheet(name: string): boolean {
    return this.infos.has(name);
  }

  /** Primary names that have a sheet. */
  sheetNames(): string[] {
    return [...this.infos.keys()];
  }

  colorOf(raw: string): PaletteColor {
    const name = this.canonical(raw);
    return this.info(name).settings.color ?? hashColor(name);
  }

  /** Which tag currently owns a name, as a primary name or an alias (null when free). */
  ownerOf(name: string): string | null {
    if (this.infos.has(name)) return name;
    return this.aliasToName.get(name) ?? null;
  }
}
