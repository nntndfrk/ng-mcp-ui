import { isPlatformBrowser } from "@angular/common";
import {
  DOCUMENT,
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";

export type Theme = "dark" | "light";

/** Kept in sync with the pre-hydration script in index.html. */
const STORAGE_KEY = "ng-mcp-ui-docs-theme";

/**
 * Dark/light toggle. The `data-theme` attribute on <html> drives every token in
 * styles.css; index.html applies the stored choice before first paint, so this
 * service only has to mirror and update it.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Dark is the default, matching the comp and the SSR-rendered markup. */
  readonly theme = signal<Theme>("dark");

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const applied = this.document.documentElement.getAttribute("data-theme");
    this.theme.set(applied === "light" ? "light" : "dark");
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    if (!this.isBrowser) {
      return;
    }
    const root = this.document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / storage disabled — the choice just won't persist.
    }
  }

  toggle(): void {
    this.set(this.theme() === "dark" ? "light" : "dark");
  }
}
