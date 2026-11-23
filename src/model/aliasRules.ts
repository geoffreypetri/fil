import { normalizeTag } from './tags';
import type { TagTable } from './tagTable';

export type AliasError = 'invalid' | 'taken' | 'used';

export interface AliasValidation {
  /** Normalized, unique, valid aliases. */
  readonly aliases: string[];
  readonly errors: { readonly input: string; readonly reason: AliasError; readonly owner?: string }[];
}

/**
 * Validates aliases for tag `name`. An alias must be a valid tag name, must not be another
 * tag or another tag's alias, and must not already be used in notes as a tag of its own.
 */
export function validateAliases(
  name: string,
  inputs: readonly string[],
  table: TagTable,
  usedRawTags: ReadonlySet<string>,
): AliasValidation {
  const aliases: string[] = [];
  const errors: AliasValidation['errors'][number][] = [];
  for (const input of inputs) {
    if (input.trim() === '') continue;
    const alias = normalizeTag(input);
    if (alias === null) {
      errors.push({ input, reason: 'invalid' });
      continue;
    }
    if (alias === name || aliases.includes(alias)) continue;
    const owner = table.ownerOf(alias);
    if (owner !== null && owner !== name) {
      errors.push({ input, reason: 'taken', owner });
      continue;
    }
    if (usedRawTags.has(alias) && table.canonical(alias) !== name) {
      errors.push({ input, reason: 'used' });
      continue;
    }
    aliases.push(alias);
  }
  return { aliases, errors };
}

/** Splits an alias field ("px, projetx" or "#px #projetx"). */
export function splitAliasInput(value: string): string[] {
  return value.split(/[,\s]+/).filter(Boolean);
}
