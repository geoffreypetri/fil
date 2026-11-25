import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { t } from '../i18n';
import { helperCompletionSource } from './helpers';
import { inCode, tagContext } from './tagContext';

const TAG_BEFORE_CURSOR = /(?<![\p{L}\p{N}_&/#])#[\p{L}\p{N}_-]*/u;

/**
 * Inline completion after "#": existing tags, most recently used first.
 * Matching an alias proposes the primary name, with the alias as a hint.
 */
export function tagCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(TAG_BEFORE_CURSOR);
  if (!match || inCode(context.state, match.from, 1)) return null;
  const query = match.text.slice(1).toLocaleLowerCase().replace(/_/g, '-');
  if (match.text === '#' && !context.explicit) {
    // Show suggestions right after "#", unless "#" is followed by a space (a heading).
    const next = context.state.sliceDoc(context.pos, context.pos + 1);
    if (next !== '' && !/\s/.test(next)) return null;
  }

  const prefixMatches: Completion[] = [];
  const otherMatches: Completion[] = [];
  for (const tag of context.state.facet(tagContext).completions()) {
    const alias = tag.aliases.find((a) => a.startsWith(query));
    const option: Completion = {
      label: `#${tag.name}`,
      apply: `#${tag.name}`,
      detail: alias && !tag.name.startsWith(query) ? t('tags.aliasHint', { alias }) : tag.label,
      type: 'tag',
    };
    if (tag.name.startsWith(query) || alias) prefixMatches.push(option);
    else if (query.length > 0 && tag.name.includes(query)) otherMatches.push(option);
  }
  const options = [...prefixMatches, ...otherMatches].slice(0, 50);
  if (options.length === 0) return null;
  return { from: match.from, to: context.pos, options, filter: false };
}

export function tagAutocomplete(): Extension {
  return autocompletion({
    override: [tagCompletionSource, helperCompletionSource],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
  });
}
