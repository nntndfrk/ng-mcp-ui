import { describe, expect, it } from "vitest";
import type { ViewConfig } from "./types.js";
import {
  buildAppsSdkContentMeta,
  buildExtAppsContentMeta,
  type ExtAppsContentDefaults,
  type ViewContentDefaults,
} from "./view-meta.js";

const APPS_SDK_DEFAULTS: ViewContentDefaults = {
  resourceDomains: ["https://assets.example.com"],
  connectDomains: ["https://api.example.com"],
  domain: "default.example.com",
};

const EXT_APPS_DEFAULTS: ExtAppsContentDefaults = {
  ...APPS_SDK_DEFAULTS,
  baseUriDomains: ["https://base.example.com"],
};

const view = (overrides: Partial<ViewConfig> = {}): ViewConfig => ({
  component: "card",
  ...overrides,
});

describe("buildAppsSdkContentMeta", () => {
  it("emits server defaults under openai/* keys", () => {
    const meta = buildAppsSdkContentMeta(
      view({ description: "A card" }),
      APPS_SDK_DEFAULTS,
    );
    expect(meta).toEqual({
      "openai/widgetCSP": {
        resource_domains: ["https://assets.example.com"],
        connect_domains: ["https://api.example.com"],
      },
      "openai/widgetDomain": "default.example.com",
      "openai/widgetDescription": "A card",
    });
  });

  it("unions (not replaces) per-view CSP domains with the defaults, deduped", () => {
    const meta = buildAppsSdkContentMeta(
      view({
        csp: {
          resourceDomains: ["https://assets.example.com", "https://cdn.example.com"],
          connectDomains: ["https://ws.example.com"],
        },
      }),
      APPS_SDK_DEFAULTS,
    );
    expect(meta["openai/widgetCSP"]).toEqual({
      // dedup: the shared default origin appears once
      resource_domains: ["https://assets.example.com", "https://cdn.example.com"],
      connect_domains: ["https://api.example.com", "https://ws.example.com"],
    });
  });

  it("adds frame/redirect domains only when the view configures them", () => {
    const meta = buildAppsSdkContentMeta(
      view({
        csp: {
          frameDomains: ["https://frame.example.com"],
          redirectDomains: ["https://redir.example.com"],
        },
      }),
      APPS_SDK_DEFAULTS,
    );
    expect(meta["openai/widgetCSP"]).toEqual({
      resource_domains: ["https://assets.example.com"],
      connect_domains: ["https://api.example.com"],
      frame_domains: ["https://frame.example.com"],
      redirect_domains: ["https://redir.example.com"],
    });
  });

  it("maps prefersBorder and the per-view domain", () => {
    const meta = buildAppsSdkContentMeta(
      view({ prefersBorder: true, domain: "view.example.com" }),
      APPS_SDK_DEFAULTS,
    );
    expect(meta["openai/widgetPrefersBorder"]).toBe(true);
    expect(meta["openai/widgetDomain"]).toBe("view.example.com");
  });

  it("lets a request-level domain override win over the view and default domain", () => {
    const meta = buildAppsSdkContentMeta(
      view({ domain: "view.example.com" }),
      APPS_SDK_DEFAULTS,
      { domain: "hash123.claudemcpcontent.com" },
    );
    expect(meta["openai/widgetDomain"]).toBe("hash123.claudemcpcontent.com");
  });

  it("an absent override domain never clears the default", () => {
    const meta = buildAppsSdkContentMeta(view(), APPS_SDK_DEFAULTS, {});
    expect(meta["openai/widgetDomain"]).toBe("default.example.com");
  });

  it("omits widgetDescription entirely when the view has none", () => {
    const meta = buildAppsSdkContentMeta(view(), APPS_SDK_DEFAULTS);
    expect("openai/widgetDescription" in meta).toBe(false);
  });

  it("spreads view._meta last so it wins outright", () => {
    const meta = buildAppsSdkContentMeta(
      view({ _meta: { "openai/widgetDescription": "overridden", custom: 1 } }),
      APPS_SDK_DEFAULTS,
    );
    expect(meta["openai/widgetDescription"]).toBe("overridden");
    expect((meta as Record<string, unknown>).custom).toBe(1);
  });

  it("does not mutate the defaults object", () => {
    const defaults: ViewContentDefaults = {
      resourceDomains: ["https://a"],
      connectDomains: ["https://b"],
      domain: "d",
    };
    buildAppsSdkContentMeta(
      view({ csp: { resourceDomains: ["https://c"] } }),
      defaults,
    );
    expect(defaults.resourceDomains).toEqual(["https://a"]);
  });
});

describe("buildExtAppsContentMeta", () => {
  it("emits server defaults nested under ui, with baseUriDomains", () => {
    const meta = buildExtAppsContentMeta(view(), EXT_APPS_DEFAULTS);
    expect(meta).toEqual({
      ui: {
        csp: {
          resourceDomains: ["https://assets.example.com"],
          connectDomains: ["https://api.example.com"],
          baseUriDomains: ["https://base.example.com"],
        },
        domain: "default.example.com",
      },
    });
  });

  it("unions per-view CSP domains with defaults, deduped", () => {
    const meta = buildExtAppsContentMeta(
      view({
        csp: {
          resourceDomains: ["https://assets.example.com", "https://cdn.example.com"],
          frameDomains: ["https://frame.example.com"],
          redirectDomains: ["https://redir.example.com"],
        },
      }),
      EXT_APPS_DEFAULTS,
    );
    expect(meta.ui?.csp).toEqual({
      resourceDomains: ["https://assets.example.com", "https://cdn.example.com"],
      connectDomains: ["https://api.example.com"],
      baseUriDomains: ["https://base.example.com"],
      frameDomains: ["https://frame.example.com"],
      redirectDomains: ["https://redir.example.com"],
    });
  });

  it("honors an explicit empty-string description (skips only undefined)", () => {
    // Parity with the Apps SDK path, which keeps "" via mergeWithUnion.
    expect(
      buildExtAppsContentMeta(view({ description: "" }), EXT_APPS_DEFAULTS).ui
        ?.description,
    ).toBe("");
    expect(
      buildAppsSdkContentMeta(view({ description: "" }), APPS_SDK_DEFAULTS)[
        "openai/widgetDescription"
      ],
    ).toBe("");
  });

  it("carries description, prefersBorder, and the per-view domain on ui", () => {
    const meta = buildExtAppsContentMeta(
      view({ description: "A card", prefersBorder: false, domain: "view.example.com" }),
      EXT_APPS_DEFAULTS,
    );
    expect(meta.ui?.description).toBe("A card");
    expect(meta.ui?.prefersBorder).toBe(false);
    expect(meta.ui?.domain).toBe("view.example.com");
  });

  it("lets a request-level domain override win on ui.domain", () => {
    const meta = buildExtAppsContentMeta(
      view({ domain: "view.example.com" }),
      EXT_APPS_DEFAULTS,
      { domain: "hash123.claudemcpcontent.com" },
    );
    expect(meta.ui?.domain).toBe("hash123.claudemcpcontent.com");
  });

  it("an absent override domain never clears the default", () => {
    const meta = buildExtAppsContentMeta(view(), EXT_APPS_DEFAULTS, {});
    expect(meta.ui?.domain).toBe("default.example.com");
  });

  it("spreads view._meta last so it wins outright", () => {
    const meta = buildExtAppsContentMeta(
      view({ _meta: { ui: { domain: "replaced" }, custom: 2 } }),
      EXT_APPS_DEFAULTS,
    );
    // shallow spread: view._meta.ui replaces the built ui wholesale
    expect(meta.ui).toEqual({ domain: "replaced" });
    expect((meta as Record<string, unknown>).custom).toBe(2);
  });

  it("does not mutate the defaults object", () => {
    const defaults: ExtAppsContentDefaults = {
      resourceDomains: ["https://a"],
      connectDomains: ["https://b"],
      baseUriDomains: ["https://base"],
      domain: "d",
    };
    buildExtAppsContentMeta(
      view({ csp: { resourceDomains: ["https://c"] } }),
      defaults,
    );
    expect(defaults.resourceDomains).toEqual(["https://a"]);
  });
});
