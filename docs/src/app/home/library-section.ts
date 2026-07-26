import { ChangeDetectionStrategy, Component } from "@angular/core";

import { API_CARDS } from "./home-data";

@Component({
  selector: "home-library",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <div class="inner">
        <p class="eyebrow accent">The library</p>
        <h2>Everything a widget needs, injected</h2>
        <p class="lede">
          One <code>Adaptor</code> interface abstracts the OpenAI Apps SDK and the open MCP-Apps
          postMessage spec. Your widget code is identical across hosts.
        </p>

        <div class="grid">
          @for (api of cards; track api.name) {
            <div class="card">
              <div class="name">{{ api.name }}</div>
              <div class="desc">{{ api.desc }}</div>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    section { border-bottom: 1px solid var(--border); }
    .inner { max-width: var(--page-max); margin: 0 auto; padding: 70px 28px; }
    .accent { color: var(--accent); }

    h2 { margin: 0; font-size: 36px; letter-spacing: -0.03em; font-weight: 700; }
    .lede {
      margin: 14px 0 0;
      max-width: 620px;
      font-size: 16.5px;
      line-height: 1.6;
      color: var(--muted);
    }
    .lede code { font-family: var(--font-mono); font-size: 14.5px; color: var(--text); }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 40px;
    }
    .card {
      padding: 22px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg2);
      transition: border-color 140ms ease;
    }
    .card:hover { border-color: var(--tintBorder); }
    .name {
      font-family: var(--font-mono);
      font-size: 13.5px;
      color: var(--str);
      font-weight: 500;
    }
    .desc { margin-top: 9px; font-size: 14px; line-height: 1.55; color: var(--muted); }

    @media (max-width: 980px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) {
      .inner { padding: 52px 18px; }
      h2 { font-size: 28px; }
      .grid { grid-template-columns: 1fr; }
    }
  `,
})
export class LibrarySection {
  protected readonly cards = API_CARDS;
}
