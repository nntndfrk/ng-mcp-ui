import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";

import { NPM_URL, REPO_URL } from "./site";

interface FooterLink {
  label: string;
  route?: string;
  href?: string;
}

@Component({
  selector: "site-footer",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <footer>
      <div class="cols">
        <div>
          <div class="brand">
            <span class="gradient-mark logo" aria-hidden="true"></span>
            <span class="wordmark">ng-mcp-ui</span>
          </div>
          <p class="tagline">Interactive Angular views for MCP hosts.</p>
          <p class="legal">© 2026 nntndfrk · MIT</p>
        </div>

        @for (col of columns; track col.title) {
          <div class="col">
            <div class="col-title">{{ col.title }}</div>
            @for (link of col.links; track link.label) {
              @if (link.route) {
                <a [routerLink]="link.route">{{ link.label }}</a>
              } @else {
                <a [href]="link.href" rel="noreferrer noopener">{{ link.label }}</a>
              }
            }
          </div>
        }
      </div>
    </footer>
  `,
  styles: `
    footer { border-top: 1px solid var(--border); }

    .cols {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 48px 28px;
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr;
      gap: 32px;
    }

    .brand { display: flex; align-items: center; gap: 9px; }
    .logo { width: 18px; height: 18px; border-radius: 5px; }
    .wordmark { font-size: 14px; font-weight: 700; }
    .tagline {
      margin: 12px 0 0;
      font-size: 13.5px;
      color: var(--faint);
      line-height: 1.6;
      max-width: 260px;
    }
    .legal { margin: 20px 0 0; font-size: 12.5px; color: var(--dim); }

    .col { display: grid; gap: 11px; align-content: start; }
    .col-title {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--dim);
      font-weight: 600;
    }
    .col a { font-size: 13.5px; color: var(--muted); }
    .col a:hover { color: var(--text); }

    @media (max-width: 860px) {
      .cols { grid-template-columns: 1fr 1fr; padding: 40px 18px; }
    }
  `,
})
export class SiteFooter {
  protected readonly columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Docs",
      links: [
        { label: "Quickstart", route: "/docs/getting-started/quickstart" },
        { label: "Host bridge", route: "/docs/guides/host-bridge" },
        { label: "Schematics", route: "/docs/schematics/ng-add" },
        { label: "Builder", route: "/docs/schematics/build-widgets" },
      ],
    },
    {
      title: "API",
      links: [
        { label: "ng-mcp-ui/web", route: "/docs/reference/web" },
        { label: "ng-mcp-ui/server", route: "/docs/reference/server" },
        { label: "ng-mcp-ui/testing", route: "/docs/reference/testing" },
        { label: "Testing widgets", route: "/docs/guides/testing-widgets" },
      ],
    },
    {
      title: "Project",
      links: [
        { label: "GitHub", href: REPO_URL },
        { label: "npm", href: NPM_URL },
        { label: "Releases", href: `${REPO_URL}/releases` },
        { label: "License", href: `${REPO_URL}/blob/main/LICENSE` },
      ],
    },
  ];
}
