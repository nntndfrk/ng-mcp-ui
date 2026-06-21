import { describe, expect, it } from "vitest";
import {
  AngularShellRenderer,
  renderDevelopmentShell,
  renderProductionShell,
} from "./shell-templates.js";
import { InMemoryViewManifest } from "./view-manifest.js";

describe("renderProductionShell", () => {
  const manifest = new InMemoryViewManifest("main-ABC123.js", "styles-XYZ.css");

  it("links the hashed bundle + stylesheet from the manifest, absolute to serverUrl", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      manifest,
    });
    expect(html).toContain(
      '<script type="module" crossorigin src="https://app.example.com/assets/widgets/main-ABC123.js"></script>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="https://app.example.com/assets/widgets/styles-XYZ.css" />',
    );
    expect(html).toContain('<div id="root"></div>');
  });

  it("emits the window.mcpUi global with hostType, serverUrl, and viewName", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      manifest,
    });
    expect(html).toContain(
      'window.mcpUi = { hostType: "apps-sdk", serverUrl: "https://app.example.com", viewName: "card" };',
    );
  });

  it("omits the stylesheet link when the build emitted no global style", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      manifest: new InMemoryViewManifest("main-ABC123.js"),
    });
    expect(html).not.toContain("rel=\"stylesheet\"");
  });
});

describe("renderDevelopmentShell", () => {
  it("hardcodes the unhashed dev bundle + stylesheet (consults no manifest)", () => {
    const html = renderDevelopmentShell({
      hostType: "mcp-app",
      serverUrl: "https://app.example.com",
      viewName: "card",
    });
    expect(html).toContain(
      '<script type="module" crossorigin src="https://app.example.com/assets/widgets/main.js"></script>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="https://app.example.com/assets/widgets/styles.css" />',
    );
    expect(html).toContain('window.mcpUi = { hostType: "mcp-app"');
  });
});

describe("shell HTML escaping (XSS defense-in-depth)", () => {
  const manifest = new InMemoryViewManifest("main.js", "styles.css");

  it("HTML-escapes serverUrl in attribute contexts (href/src)", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: 'https://x.com/"><img src=x onerror=alert(1)>',
      viewName: "card",
      manifest,
    });
    // the raw breakout sequence must not survive into an attribute
    expect(html).not.toContain('"><img src=x');
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes & first so entities are not double-escaped", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: "https://x.com/<a&b",
      viewName: "card",
      manifest,
    });
    expect(html).toContain("https://x.com/&lt;a&amp;b");
    expect(html).not.toContain("&amp;lt;");
  });

  it("neutralizes a malicious serverUrl in BOTH the attribute and the script global", () => {
    // serverUrl reaches two sinks with two different encoders: HTML-escaped in
    // href/src attributes, JS-escaped in the window.mcpUi script global.
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: 'https://x.com/"></script><script>alert(1)//',
      viewName: "card",
      manifest,
    });
    // no raw breakout in either context
    expect(html).not.toContain('"></script><script>alert(1)');
    // attribute sink: HTML-escaped
    expect(html).toContain(
      "https://x.com/&quot;&gt;&lt;/script&gt;&lt;script&gt;alert(1)//",
    );
    // script global: JS-escaped (" → \\" by JSON.stringify, every < → \\u003c)
    expect(html).toContain('serverUrl: "https://x.com/\\">');
    expect(html).toContain("\\u003c/script>\\u003cscript>alert(1)//");
  });

  it("JS-escapes < in the script global so a viewName cannot close the <script>", () => {
    const html = renderProductionShell({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "</script><script>alert(1)//",
      manifest,
    });
    // the injected closing tag must be neutralized to </script>
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain('viewName: "\\u003c/script>\\u003cscript>alert(1)//"');
    // the only literal </script> tags are the two legitimate element closers
    // (the mcpUi global script + the main bundle script) — none injected.
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });
});

describe("AngularShellRenderer", () => {
  it("renders the production shell when isProduction is true", () => {
    const renderer = new AngularShellRenderer(
      "production",
      new InMemoryViewManifest("main-HASH.js", "styles-HASH.css"),
    );
    const html = renderer.render({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      isProduction: true,
      manifest: new InMemoryViewManifest("main-HASH.js", "styles-HASH.css"),
    });
    expect(html).toContain("main-HASH.js");
  });

  it("the per-request isProduction flag overrides the constructed mode", () => {
    // constructed as production, but the request says development
    const renderer = new AngularShellRenderer(
      "production",
      new InMemoryViewManifest("main-HASH.js"),
    );
    const html = renderer.render({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      isProduction: false,
      manifest: new InMemoryViewManifest("main-HASH.js"),
    });
    expect(html).toContain("/assets/widgets/main.js");
    expect(html).not.toContain("main-HASH.js");
  });

  it("renders against the per-request manifest", () => {
    const renderer = new AngularShellRenderer(
      "production",
      new InMemoryViewManifest("ctor-main.js"),
    );
    const html = renderer.render({
      hostType: "apps-sdk",
      serverUrl: "https://app.example.com",
      viewName: "card",
      isProduction: true,
      manifest: new InMemoryViewManifest("request-main.js", "request.css"),
    });
    expect(html).toContain("request-main.js");
    expect(html).toContain("request.css");
    expect(html).not.toContain("ctor-main.js");
  });
});
