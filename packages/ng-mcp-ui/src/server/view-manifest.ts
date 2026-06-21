// The view-manifest interface that resolves a view's hashed bundle filename.
//
// Angular has no Vite-style `manifest.json`; the real resolver parses the
// widgets build's emitted `index.html` (PLAN §5.1) and lands in **S06**. Until
// then, the server depends only on this small interface, which S06 will
// implement against `dist/widgets/browser/index.html`.

/**
 * Resolves the production asset filenames the shell needs to load a widget
 * bundle. The shell links these against the per-request `serverUrl`, so the
 * manifest only needs to surface the (possibly hashed) base filenames — not
 * full URLs.
 *
 * The Angular widgets target ships a single entry (`main`) plus a shared
 * stylesheet and lazy-loads each view, so the manifest reduces to
 * `{ mainFile, styleFile }` (PLAN §5.1) rather than a per-view chunk map.
 */
export interface ViewManifest {
  /** Hashed entry bundle filename, e.g. `main-XBYE53NT.js`. */
  mainFile(): string;
  /** Hashed global stylesheet filename, e.g. `styles-3KHXIMM.css`, or `undefined` if the build emitted none. */
  styleFile(): string | undefined;
}

/**
 * In-memory {@link ViewManifest} for tests and simple setups — returns the
 * filenames it was constructed with. The real `index.html`-parsing
 * implementation lands in S06.
 */
export class InMemoryViewManifest implements ViewManifest {
  constructor(
    private readonly main: string,
    private readonly style?: string,
  ) {}

  mainFile(): string {
    return this.main;
  }

  styleFile(): string | undefined {
    return this.style;
  }
}
