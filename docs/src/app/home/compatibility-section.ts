import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";

import { PACKAGES, VERSIONS } from "./home-data";

@Component({
  selector: "home-compatibility",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section>
      <div class="inner">
        <p class="eyebrow violet">Compatibility</p>
        <h2>CI-green across three Angular majors</h2>

        <div class="versions">
          @for (v of versions; track v.label) {
            <div class="version">
              <div class="head">
                <span class="label">{{ v.label }}</span>
                <span class="status">{{ v.status }}</span>
              </div>
              <div class="note">{{ v.note }}</div>
            </div>
          }
        </div>

        <div class="table">
          <div class="row head-row">
            <span>Import</span><span>Purpose</span>
          </div>
          @for (pkg of packages; track pkg.name) {
            <a class="row" [routerLink]="pkg.route">
              <span class="import">{{ pkg.name }}</span>
              <span class="purpose">{{ pkg.purpose }}</span>
            </a>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    section { border-bottom: 1px solid var(--border); }
    .inner { max-width: var(--page-max); margin: 0 auto; padding: 70px 28px; }
    .violet { color: var(--violet); }

    h2 { margin: 0 0 34px; font-size: 32px; letter-spacing: -0.03em; font-weight: 700; }

    .versions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .version {
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg2);
    }
    .head { display: flex; align-items: baseline; gap: 10px; }
    .label { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; }
    .status { font-size: 12px; font-weight: 600; color: var(--ok); }
    .note { margin-top: 8px; font-size: 13.5px; line-height: 1.5; color: var(--faint); }

    .table {
      margin-top: 44px;
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .row {
      display: grid;
      grid-template-columns: 1.1fr 2fr;
      gap: 20px;
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      align-items: center;
    }
    .row:hover .import { color: var(--accent); }
    .head-row {
      padding: 14px 20px;
      border-top: none;
      background: var(--surface3);
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--faint);
      font-weight: 600;
    }
    .import { font-family: var(--font-mono); font-size: 13.5px; color: var(--str); }
    .purpose { font-size: 14.5px; color: var(--muted); line-height: 1.5; }

    @media (max-width: 860px) {
      .inner { padding: 52px 18px; }
      h2 { font-size: 28px; }
      .versions { grid-template-columns: 1fr; }
      .row { grid-template-columns: 1fr; gap: 6px; }
    }
  `,
})
export class CompatibilitySection {
  protected readonly versions = VERSIONS;
  protected readonly packages = PACKAGES;
}
