import { describe, expect, it } from "vitest";
import { InMemoryViewManifest, type ViewManifest } from "./view-manifest.js";

describe("InMemoryViewManifest", () => {
  it("returns the main filename it was constructed with", () => {
    const manifest: ViewManifest = new InMemoryViewManifest("main-XBYE53NT.js");
    expect(manifest.mainFile()).toBe("main-XBYE53NT.js");
  });

  it("returns the style filename when provided", () => {
    const manifest = new InMemoryViewManifest(
      "main.js",
      "styles-3KHXIMM.css",
    );
    expect(manifest.styleFile()).toBe("styles-3KHXIMM.css");
  });

  it("returns undefined for the style file when none was provided", () => {
    const manifest = new InMemoryViewManifest("main.js");
    expect(manifest.styleFile()).toBeUndefined();
  });
});
