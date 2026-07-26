import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";

import type { DocEntry } from "./docs-index";

@Component({
  selector: "docs-pager",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav aria-label="Pagination">
      @if (prev(); as entry) {
        <a class="card" [routerLink]="entry.route">
          <span class="label">← Previous</span>
          <span class="title">{{ entry.title }}</span>
        </a>
      } @else {
        <span class="card placeholder"></span>
      }

      @if (next(); as entry) {
        <a class="card end" [routerLink]="entry.route">
          <span class="label">Next →</span>
          <span class="title">{{ entry.title }}</span>
        </a>
      } @else {
        <span class="card placeholder"></span>
      }
    </nav>
  `,
  styles: `
    nav { display: flex; gap: 14px; margin-top: 52px; }
    .card {
      flex: 1;
      padding: 18px;
      border-radius: 11px;
      border: 1px solid var(--border);
      background: var(--bg2);
      display: grid;
      gap: 6px;
      transition: border-color 140ms ease;
    }
    a.card:hover { border-color: var(--tintBorder); color: var(--text); }
    .card.end { text-align: right; }
    .placeholder { border-color: transparent; background: none; }
    .label { font-size: 12px; color: var(--dim); }
    .title { font-size: 15px; font-weight: 600; }

    @media (max-width: 640px) { nav { flex-direction: column; } }
  `,
})
export class DocsPager {
  readonly prev = input<DocEntry | null>(null);
  readonly next = input<DocEntry | null>(null);
}
