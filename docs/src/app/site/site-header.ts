import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { DocsSearch } from "./docs-search";
import { DOCS_ENTRY_ROUTE, REPO_URL } from "./site";
import { ThemeService } from "./theme";

@Component({
  selector: "site-header",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, DocsSearch],
  template: `
    <header>
      <div class="bar">
        <a class="brand" routerLink="/">
          <span class="gradient-mark logo" aria-hidden="true"></span>
          <span class="wordmark">ng-mcp-ui</span>
        </a>

        <nav>
          @for (link of navLinks; track link.route) {
            <a
              [routerLink]="link.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: false }"
              >{{ link.label }}</a
            >
          }
        </nav>

        <span class="spacer"></span>

        <div class="actions">
          <docs-search />

          <div class="theme-switch" role="group" aria-label="Colour theme">
            <button
              type="button"
              title="Light"
              [class.on]="theme.theme() === 'light'"
              (click)="theme.set('light')"
            >
              <span class="visually-hidden">Light</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2"></circle>
                <line x1="12" y1="2.5" x2="12" y2="5"></line>
                <line x1="12" y1="19" x2="12" y2="21.5"></line>
                <line x1="2.5" y1="12" x2="5" y2="12"></line>
                <line x1="19" y1="12" x2="21.5" y2="12"></line>
                <line x1="5.3" y1="5.3" x2="7.1" y2="7.1"></line>
                <line x1="16.9" y1="16.9" x2="18.7" y2="18.7"></line>
                <line x1="18.7" y1="5.3" x2="16.9" y2="7.1"></line>
                <line x1="7.1" y1="16.9" x2="5.3" y2="18.7"></line>
              </svg>
            </button>
            <button
              type="button"
              title="Dark"
              [class.on]="theme.theme() === 'dark'"
              (click)="theme.set('dark')"
            >
              <span class="visually-hidden">Dark</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.5 14.6A8.7 8.7 0 0 1 9.4 3.5a8.7 8.7 0 1 0 11.1 11.1z"></path>
              </svg>
            </button>
          </div>

          <a class="repo" [href]="repoUrl" rel="noreferrer noopener">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  `,
  styles: `
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(14px);
      background: var(--nav);
      border-bottom: 1px solid var(--border);
    }

    .bar {
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 0 28px;
      height: var(--nav-h);
      display: flex;
      align-items: center;
      gap: 28px;
    }

    .brand { display: flex; align-items: center; gap: 9px; }
    .brand:hover { color: var(--text); }
    .logo { width: 22px; height: 22px; }
    .wordmark { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }

    nav { display: flex; gap: 22px; font-size: 13.5px; color: var(--muted); }
    nav a { color: var(--muted); font-weight: 500; }
    nav a:hover { color: var(--text); }
    nav a.active { color: var(--text); }

    .spacer { flex: 1; }
    .actions { display: flex; align-items: center; gap: 10px; }

    .theme-switch {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 34px;
      padding: 0 4px;
      border: 1px solid var(--border2);
      border-radius: 10px;
      background: var(--surface);
    }
    .theme-switch button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 26px;
      border: none;
      border-radius: 7px;
      background: none;
      color: var(--faint);
      cursor: pointer;
    }
    .theme-switch button.on {
      background: var(--active);
      color: var(--text);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    .repo {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px;
      border: 1px solid var(--border2);
      border-radius: 10px;
      background: var(--surface);
      font-size: 13.5px;
      color: var(--body);
      font-weight: 500;
    }
    .repo:hover { border-color: var(--hoverBorder); color: var(--hoverText); }

    @media (max-width: 860px) {
      .bar { gap: 16px; padding: 0 18px; }
      nav { display: none; }
      .repo span { display: none; }
      .repo { padding: 0 10px; }
    }
  `,
})
export class SiteHeader {
  protected readonly theme = inject(ThemeService);
  protected readonly repoUrl = REPO_URL;
  protected readonly navLinks = [
    { label: "Docs", route: DOCS_ENTRY_ROUTE },
    { label: "Schematics", route: "/docs/schematics/ng-add" },
    { label: "API", route: "/docs/reference/web" },
  ];
}
