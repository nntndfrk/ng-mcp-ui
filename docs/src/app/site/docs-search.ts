import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";

import { DocsIndex } from "../docs/docs-index";

/**
 * ⌘K page palette. Matches against page title, section and description — the
 * front matter the sidebar already carries. This is deliberately not full-text
 * search: there is no build-time body index, and pretending otherwise would be
 * worse than a fast, honest title jump.
 */
@Component({
  selector: "docs-search",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    "(document:keydown)": "onGlobalKeydown($event)",
  },
  template: `
    <button type="button" class="trigger" (click)="open()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
      </svg>
      <span class="trigger-label">Search</span>
      <span class="keys"><kbd>⌘</kbd><kbd>K</kbd></span>
    </button>

    <!-- A native dialog, not a positioned div: the site header sets
         backdrop-filter, which makes it the containing block for any fixed
         descendant. showModal() promotes this to the top layer, so the overlay
         covers the viewport rather than the 60px nav bar. -->
    <dialog #dlg class="palette" aria-label="Search documentation"
            (click)="onDialogClick($event)" (close)="isOpen.set(false)">
      @if (isOpen()) {
        <div class="panel">
          <div class="field">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
            </svg>
            <input
              #box
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search pages…"
              [value]="query()"
              (input)="onInput($event)"
              (keydown)="onFieldKeydown($event)"
            />
            <kbd>Esc</kbd>
          </div>

          <ul class="results">
            @for (result of results(); track result.route; let i = $index) {
              <li>
                <a
                  [class.selected]="i === cursor()"
                  [routerLink]="result.route"
                  (click)="close()"
                  (mouseenter)="cursor.set(i)"
                >
                  <span class="crumb">{{ result.group }}</span>
                  <span class="title">{{ result.title }}</span>
                  <span class="desc">{{ result.description }}</span>
                </a>
              </li>
            } @empty {
              <li class="empty">No pages match “{{ query() }}”.</li>
            }
          </ul>
        </div>
      }
    </dialog>
  `,
  styles: `
    :host { display: contents; }

    .trigger {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 34px;
      padding: 0 8px 0 12px;
      border: 1px solid var(--border2);
      border-radius: 10px;
      background: var(--surface);
      color: var(--faint);
      font-family: inherit;
      font-size: 13.5px;
      cursor: pointer;
      min-width: 230px;
    }
    .trigger:hover { border-color: var(--hoverBorder); }
    .trigger-label { flex: 1; text-align: left; }
    .keys { display: flex; gap: 4px; }

    kbd {
      font-family: var(--font-sans);
      font-size: 11px;
      line-height: 1;
      padding: 4px 6px;
      border-radius: 6px;
      background: var(--surface2);
      color: var(--muted);
    }

    /* Undo the UA dialog box (centred, bordered, sized to content) so the
       element is just a full-viewport flex container for the panel. */
    .palette {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 12vh 20px 20px;
      border: none;
      background: none;
      display: flex;
      justify-content: center;
    }

    /* Author styles beat the UA's dialog:not([open]) rule, so restate it. */
    .palette:not([open]) { display: none; }

    .palette::backdrop {
      background: rgba(9, 9, 11, 0.62);
      backdrop-filter: blur(4px);
    }

    .panel {
      width: min(560px, 100%);
      max-height: 68vh;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border2);
      border-radius: 14px;
      background: var(--panel);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }

    .field {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      color: var(--faint);
    }
    .field input {
      flex: 1;
      border: none;
      background: none;
      outline: none;
      font-family: inherit;
      font-size: 15px;
      color: var(--text);
    }
    .field input::placeholder { color: var(--dim); }

    .results {
      list-style: none;
      margin: 0;
      padding: 6px;
      overflow-y: auto;
    }
    .results a {
      display: grid;
      gap: 2px;
      padding: 10px 12px;
      border-radius: 9px;
      color: var(--text);
    }
    .results a.selected { background: var(--surface2); }
    .results a:hover { color: var(--text); }
    .crumb {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .title { font-size: 14.5px; font-weight: 500; }
    .desc {
      font-size: 13px;
      color: var(--faint);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      padding: 22px 14px;
      text-align: center;
      font-size: 14px;
      color: var(--faint);
    }

    @media (max-width: 900px) {
      .trigger { min-width: 0; }
      .trigger-label, .keys { display: none; }
      .trigger { padding: 0 9px; }
    }
  `,
})
export class DocsSearch {
  private readonly router = inject(Router);
  private readonly index = inject(DocsIndex);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>("box");
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>("dlg");

  protected readonly isOpen = signal(false);
  protected readonly query = signal("");
  protected readonly cursor = signal(0);

  constructor() {
    // Focus the field as soon as the dialog enters the view.
    effect(() => this.box()?.nativeElement.focus());
  }

  protected readonly results = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const all = this.index.entries;
    if (!needle) {
      return all.slice(0, 8);
    }
    return all
      .filter((entry) =>
        `${entry.title} ${entry.group} ${entry.description}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 12);
  });

  protected open(): void {
    this.query.set("");
    this.cursor.set(0);
    this.isOpen.set(true);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) {
      dialog.showModal();
    }
  }

  protected close(): void {
    this.isOpen.set(false);
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
  }

  /** A click that lands on the dialog itself, not the panel, is a backdrop click. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.cursor.set(0);
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    }
  }

  protected onFieldKeydown(event: KeyboardEvent): void {
    // Escape is the dialog's own: it fires `cancel`, then `close`, which syncs
    // isOpen back. Handling it here too would just duplicate that path.
    const count = this.results().length;
    if (event.key === "ArrowDown" && count > 0) {
      event.preventDefault();
      this.cursor.update((i) => (i + 1) % count);
      return;
    }
    if (event.key === "ArrowUp" && count > 0) {
      event.preventDefault();
      this.cursor.update((i) => (i - 1 + count) % count);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = this.results()[this.cursor()];
      if (target) {
        this.navigate(target.route);
      }
    }
  }

  private navigate(route: string): void {
    this.close();
    void this.router.navigateByUrl(route);
  }
}
