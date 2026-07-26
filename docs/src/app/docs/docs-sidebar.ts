import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { DocsIndex } from "./docs-index";

@Component({
  selector: "docs-sidebar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Documentation">
      @for (group of groups; track group.title) {
        <div class="group">
          <div class="group-title">{{ group.title }}</div>
          @for (item of group.items; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              >{{ item.title }}</a
            >
          }
        </div>
      }
    </nav>
  `,
  styles: `
    nav { display: grid; gap: 26px; align-content: start; }
    .group { display: grid; gap: 3px; }
    .group-title {
      font-size: 12px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--dim);
      font-weight: 600;
      margin-bottom: 7px;
    }
    a {
      padding: 6px 11px;
      border-radius: 7px;
      font-size: 14px;
      line-height: 1.4;
      color: var(--muted);
    }
    a:hover { color: var(--text); background: var(--surface); }
    a.active {
      background: var(--tint);
      color: var(--accent);
      font-weight: 500;
      box-shadow: inset 2px 0 0 var(--accent);
    }
  `,
})
export class DocsSidebar {
  protected readonly groups = inject(DocsIndex).groups;
}
