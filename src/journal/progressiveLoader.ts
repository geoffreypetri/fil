import { EditorView } from '@codemirror/view';
import type { PageSync } from './pageSync';

export const BATCH_PAGES = 30;
/** Distance from the top (px) at which earlier pages start loading. */
export const LOAD_THRESHOLD_PX = 1200;

/**
 * Loads earlier pages when the user scrolls near the top of the document. The scroll position is
 * kept on the same text, so the view never jumps.
 */
export class ProgressiveLoader {
  private loading = false;
  private readonly onScroll = (): void => void this.maybeLoad();

  constructor(
    private readonly sync: PageSync,
    private readonly view: EditorView,
  ) {}

  start(): void {
    this.view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    requestAnimationFrame(() => void this.maybeLoad());
  }

  stop(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
  }

  /** First line block whose top is visible, and its distance from the top of the scroller. */
  private visibleAnchor(): { pos: number; offset: number } {
    const { view } = this;
    const scroller = view.scrollDOM.getBoundingClientRect();
    const docTop = view.documentTop - scroller.top;
    let block = view.lineBlockAtHeight(Math.max(0, -docTop));
    if (block.top + docTop < 0 && block.to < view.state.doc.length) block = view.lineBlockAt(block.to + 1);
    return { pos: block.from, offset: Math.max(0, block.top + docTop) };
  }

  async maybeLoad(): Promise<void> {
    if (this.loading || this.view.scrollDOM.scrollTop > LOAD_THRESHOLD_PX) return;
    const names = this.sync.olderNames(BATCH_PAGES);
    if (names.length === 0) return;
    this.loading = true;
    try {
      const sources = await this.sync.readPages(names);
      const spec = this.sync.insertBeforeSpec(sources);
      if (spec) {
        const anchor = this.visibleAnchor();
        const tr = this.view.state.update(spec);
        this.view.dispatch(tr);
        // Map forward: text inserted exactly at the anchor goes above it.
        const pos = tr.changes.mapPos(anchor.pos, 1);
        this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: anchor.offset }) });
      }
    } finally {
      this.loading = false;
    }
    // Keep loading while the top is still close (short pages, tall screen).
    requestAnimationFrame(() => void this.maybeLoad());
  }
}
