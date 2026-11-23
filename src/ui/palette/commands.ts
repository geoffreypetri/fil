import { availableLocales, formatDayHeading, setLocale, t } from '../../i18n';
import type { Navigator } from '../../journal/navigator';
import { nearestDay, parseDateQuery, todayKey } from '../../model/dateQuery';
import { dateOfDayKey } from '../../model/paths';
import { normalizeTag } from '../../model/tags';
import type { RenameService } from '../../tags/renameService';
import type { TagService } from '../../tags/tagService';
import { canInstall, promptInstall } from '../../sw/install';
import { setTheme, toggleTheme } from '../theme';
import type { TopicView } from '../topic/topicView';
import { VERSION_LABEL } from '../../version';
import type { PaletteItem, PaletteMode } from './commandPalette';

export interface CommandDeps {
  readonly tags: TagService;
  readonly topic: TopicView;
  readonly navigator: Navigator;
  readonly rename: RenameService;
  chooseFolder(): void;
  openSettings(name: string): void;
  openRename(name: string): void;
  focusSheet(): void;
  /** Reports the outcome of an action through the status indicator. */
  report(message: string, isError?: boolean): void;
  onLocaleChange(): void;
}

interface TagEntry {
  readonly name: string;
  readonly label?: string;
  readonly aliases: readonly string[];
  readonly archived: boolean;
  readonly orphan: boolean;
  readonly lastUsed: string;
}

function matches(text: string, query: string): number {
  if (query === '') return 1;
  const lower = text.toLocaleLowerCase();
  if (lower.startsWith(query)) return 3;
  if (lower.split(/[\s-]+/).some((word) => word.startsWith(query))) return 2;
  return lower.includes(query) ? 1 : 0;
}

/** Every tag (used in notes or with a sheet), recent first, archived last. */
function tagEntries(tags: TagService): TagEntry[] {
  const usage = tags.index.usage(tags.resolve);
  return tags
    .allNames()
    .map((name) => {
      const info = tags.table.info(name);
      return {
        name,
        label: info.settings.label,
        aliases: info.aliases,
        archived: info.settings.archived,
        orphan: !usage.has(name),
        lastUsed: usage.get(name)?.lastUsed ?? '',
      };
    })
    .sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      if (a.lastUsed !== b.lastUsed) return a.lastUsed < b.lastUsed ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

function tagDetail(entry: TagEntry, matchedAlias?: string): string {
  const parts: string[] = [];
  if (matchedAlias) parts.push(`${t('palette.alias')} #${matchedAlias}`);
  if (entry.label) parts.push(entry.label);
  if (entry.orphan) parts.push(t('palette.noNotes'));
  if (entry.archived) parts.push(t('palette.archived'));
  return parts.join(' · ');
}

/** Tags matching a query, as palette items running `action`. */
function tagItems(
  deps: CommandDeps,
  query: string,
  action: (name: string, alternate: boolean) => void | PaletteMode,
): PaletteItem[] {
  const q = query.replace(/^#/, '').toLocaleLowerCase();
  const scored: { item: PaletteItem; score: number; order: number }[] = [];
  tagEntries(deps.tags).forEach((entry, order) => {
    const alias = q ? entry.aliases.find((a) => a.startsWith(q)) : undefined;
    const score = Math.max(matches(entry.name, q), alias ? 2 : 0, entry.label ? matches(entry.label, q) - 1 : 0);
    if (score <= 0) return;
    scored.push({
      score,
      order,
      item: {
        id: `tag:${entry.name}`,
        label: `#${entry.name}`,
        labelClass: `tag-pill tag-c-${deps.tags.colorOf(entry.name)}`,
        detail: tagDetail(entry, alias),
        run: (alternate) => action(entry.name, alternate),
      },
    });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 60).map((s) => s.item);
}

function tagMode(deps: CommandDeps, action: (name: string, alternate: boolean) => void, hint?: string): PaletteMode {
  return {
    placeholder: t('palette.tagPlaceholder'),
    hint,
    items: (query) => tagItems(deps, query, action),
  };
}

function goToDate(deps: CommandDeps, day: string): void {
  deps.topic.close();
  const days = deps.tags.index.all().map((entry) => entry.day);
  const target = day === todayKey() ? day : (nearestDay(day, days) ?? todayKey());
  void deps.navigator.goToDay(target);
}

function dateItem(deps: CommandDeps, query: string): PaletteItem | null {
  const day = parseDateQuery(query, todayKey());
  if (!day) return null;
  return {
    id: `date:${day}`,
    label: t('command.goToDay', { date: formatDayHeading(dateOfDayKey(day)) }),
    run: () => goToDate(deps, day),
  };
}

function dateMode(deps: CommandDeps): PaletteMode {
  return {
    placeholder: t('palette.datePlaceholder'),
    items: (query) => {
      const item = dateItem(deps, query || 'today');
      return item ? [item] : [];
    },
  };
}

function languageMode(deps: CommandDeps): PaletteMode {
  const names = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });
  return {
    placeholder: t('palette.languagePlaceholder'),
    items: (query) =>
      availableLocales()
        .map((id) => ({
          id: `lang:${id}`,
          label: names.of(id) ?? id,
          run: () => {
            setLocale(id);
            try {
              localStorage.setItem('fil.locale', id);
            } catch {
              // Kept for this session only.
            }
            deps.onLocaleChange();
          },
        }))
        .filter((item) => matches(item.label, query.toLocaleLowerCase()) > 0),
  };
}

/** The root mode of the palette: commands, plus matching tags and dates. */
export function rootMode(deps: CommandDeps): PaletteMode {
  const openTopic = (name: string, add: boolean): void => {
    void (add && deps.topic.isOpen() ? deps.topic.add(name) : deps.topic.open([name]));
  };

  const commands = (): PaletteItem[] => {
    const list: PaletteItem[] = [
      {
        id: 'filter',
        label: t('command.filterTag'),
        run: () => tagMode(deps, openTopic, deps.topic.isOpen() ? t('palette.hintAdd') : undefined),
      },
      {
        id: 'sheet',
        label: t('command.openSheet'),
        run: () =>
          tagMode(deps, (name) => {
            void deps.topic.open([name]).then(() => deps.focusSheet());
          }),
      },
      { id: 'settings', label: t('command.tagSettings'), run: () => tagMode(deps, (name) => deps.openSettings(name)) },
      { id: 'rename', label: t('command.renameTag'), run: () => tagMode(deps, (name) => deps.openRename(name)) },
    ];
    const last = deps.rename.lastRename();
    if (last) {
      list.push({
        id: 'undo-rename',
        label: t('command.undoRename', { from: last.from, to: last.to }),
        run: async () => {
          try {
            await deps.rename.undo();
          } catch (error) {
            deps.report(error instanceof Error ? error.message : String(error), true);
          }
        },
      });
    }
    if (deps.topic.isOpen()) list.push({ id: 'close-topic', label: t('command.closeTopic'), run: () => deps.topic.close() });
    list.push(
      { id: 'date', label: t('command.goToDate'), run: () => dateMode(deps) },
      { id: 'today', label: t('command.goToToday'), run: () => goToDate(deps, todayKey()) },
      { id: 'theme', label: t('command.toggleTheme'), run: () => toggleTheme() },
      { id: 'system-theme', label: t('command.systemTheme'), run: () => setTheme('system') },
      { id: 'language', label: t('command.language'), run: () => languageMode(deps) },
      { id: 'folder', label: t('command.chooseFolder'), run: () => deps.chooseFolder() },
      ...(canInstall()
        ? [{ id: 'install', label: t('command.install'), run: () => void promptInstall() }]
        : []),
      {
        id: 'version',
        label: t('command.version', { version: VERSION_LABEL }),
        detail: t('command.versionDetail'),
        run: () => void navigator.clipboard?.writeText(VERSION_LABEL).catch(() => undefined),
      },
    );
    return list;
  };

  return {
    placeholder: t('palette.placeholder'),
    hint: deps.topic.isOpen() ? t('palette.hintAdd') : undefined,
    items: (query) => {
      const q = query.toLocaleLowerCase();
      if (q.startsWith('#')) return tagItems(deps, q, openTopic);
      const date = dateItem(deps, query);
      const commandItems = commands().filter((item) => matches(item.label, q) > 0);
      // "Ctrl+K then the tag": a query that could be a tag also lists matching tags first.
      const tags = q && normalizeTag(q) !== null ? tagItems(deps, q, openTopic).slice(0, 8) : [];
      return [...(date ? [date] : []), ...tags, ...commandItems];
    },
  };
}
