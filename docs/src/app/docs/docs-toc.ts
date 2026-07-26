import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import type { Heading } from "./headings";

@Component({
  selector: "docs-toc",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (headings().length) {
      <div class="title">On this page</div>
      @for (heading of headings(); track heading.id) {
        <a [href]="'#' + heading.id" [class.nested]="heading.depth === 3">{{ heading.text }}</a>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 10px; align-content: start; }
    .title {
      font-size: 12px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--dim);
      font-weight: 600;
    }
    a { font-size: 13.5px; color: var(--muted); line-height: 1.5; }
    a:hover { color: var(--accent); }
    a.nested { padding-left: 12px; font-size: 13px; color: var(--faint); }
  `,
})
export class DocsToc {
  readonly headings = input.required<Heading[]>();
}
