import type { McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";
import { mergeWithUnion } from "./merge-with-union.js";
import type { ViewConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Apps SDK (OpenAI / ChatGPT) resource `_meta`
// ---------------------------------------------------------------------------

/**
 * @internal
 * OpenAI Apps SDK CSP shape carried under `openai/widgetCSP`. `connect_domains`
 * and `resource_domains` are always emitted (from server-derived defaults);
 * frame/redirect are added only when a view configures them.
 * @see https://developers.openai.com/apps-sdk/reference#component-resource-_meta-fields
 */
export interface OpenaiViewCsp {
  connect_domains: string[];
  resource_domains: string[];
  frame_domains?: string[];
  redirect_domains?: string[];
}

/**
 * @internal
 * The Apps SDK view-resource `_meta`, keyed by OpenAI's `openai/*` namespace.
 */
export interface OpenaiResourceMeta {
  "openai/widgetDescription"?: string;
  "openai/widgetPrefersBorder"?: boolean;
  "openai/widgetCSP"?: OpenaiViewCsp;
  "openai/widgetDomain"?: string;
}

// ---------------------------------------------------------------------------
// MCP Apps (ext-apps) resource `_meta`
// ---------------------------------------------------------------------------

/**
 * @internal
 * The ext-apps `McpUiResourceCsp` extended with host-specific / upcoming fields
 * not yet in the published spec.
 * @see https://github.com/modelcontextprotocol/ext-apps/pull/158
 */
export type ExtendedMcpUiResourceCsp = NonNullable<McpUiResourceMeta["csp"]> & {
  /**
   * Origins that can receive openExternal redirects without the safe-link modal.
   * OpenAI-specific; mirrored into the mcp-apps CSP for cross-host parity.
   * @see https://developers.openai.com/apps-sdk/reference#component-resource-_meta-fields
   */
  redirectDomains?: string[];
};

/**
 * @internal
 * `McpUiResourceMeta` with the extended CSP and a `description` field.
 *
 * `description` is retained for hosts that still read a resource-level
 * description; upstream `McpUiResourceMeta` (ext-apps ≥1.7.4) no longer declares
 * it (Apps SDK carries it via `openai/widgetDescription` instead), so it lives
 * here as an explicit extension rather than being silently dropped.
 */
export type ExtendedMcpUiResourceMeta = Omit<McpUiResourceMeta, "csp"> & {
  csp?: ExtendedMcpUiResourceCsp;
  description?: string;
};

/** @internal The ext-apps view-resource `_meta`, nested under `ui`. */
export interface McpAppsResourceMeta {
  ui?: ExtendedMcpUiResourceMeta;
}

/** @internal Either host's view-resource `_meta` shape. */
export type ResourceMeta = OpenaiResourceMeta | McpAppsResourceMeta;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * @internal
 * Server-derived CSP defaults shared by both builders: the request-resolved
 * asset/connect origins and the view's served `domain` (see request-context +
 * view-hashing). `baseUriDomains` is ext-apps-only.
 */
export interface ViewContentDefaults {
  resourceDomains: string[];
  connectDomains: string[];
  domain: string;
}

/** @internal {@link ViewContentDefaults} plus the ext-apps-only `baseUriDomains`. */
export interface ExtAppsContentDefaults extends ViewContentDefaults {
  baseUriDomains: string[];
}

/**
 * @internal
 * Per-request overrides applied last (e.g. the Claude content-domain hash).
 * An absent field never clears a default — {@link mergeWithUnion} skips
 * `undefined` sources.
 */
export interface ViewContentOverrides {
  domain?: string;
}

/**
 * @internal
 * Build the Apps SDK (`openai/*`) view-resource `_meta`.
 *
 * Layering (via {@link mergeWithUnion}, which unions array fields and skips
 * `undefined` so neither side's domains are lost):
 *   1. server defaults — `resource_domains`/`connect_domains` and the served domain;
 *   2. per-view CSP/domain/border overrides from {@link ViewConfig};
 *   3. the request-level `domain` override (the Claude content domain);
 *   4. a final shallow spread of `view._meta` (free-form escape hatch — wins outright).
 */
export function buildAppsSdkContentMeta(
  view: ViewConfig,
  defaults: ViewContentDefaults,
  overrides: ViewContentOverrides = {},
): OpenaiResourceMeta {
  // Only server-derived values (the request-resolved CSP domains and the served
  // domain) are true defaults. `widgetDescription` has no server default — it is
  // view-derived, so it goes in `fromView` where `mergeWithUnion` skips it when
  // `undefined` (rather than emitting an `openai/widgetDescription: undefined`
  // key from the defaults object).
  const serverDefaults: OpenaiResourceMeta = {
    "openai/widgetCSP": {
      resource_domains: defaults.resourceDomains,
      connect_domains: defaults.connectDomains,
    },
    "openai/widgetDomain": defaults.domain,
  };

  const fromView: Partial<
    Omit<OpenaiResourceMeta, "openai/widgetCSP"> & {
      "openai/widgetCSP": Partial<OpenaiViewCsp>;
    }
  > = {
    "openai/widgetCSP": {
      resource_domains: view.csp?.resourceDomains,
      connect_domains: view.csp?.connectDomains,
      frame_domains: view.csp?.frameDomains,
      redirect_domains: view.csp?.redirectDomains,
    },
    "openai/widgetDomain": view.domain,
    "openai/widgetDescription": view.description,
    "openai/widgetPrefersBorder": view.prefersBorder,
  };

  // `mergeWithUnion`'s structural return type widens the merged CSP to
  // `Partial` (it can't see that the required arrays come from `serverDefaults`),
  // so assert the shape the runtime guarantees.
  const base = mergeWithUnion(mergeWithUnion(serverDefaults, fromView), {
    "openai/widgetDomain": overrides.domain,
  }) as OpenaiResourceMeta;

  if (view._meta) {
    return { ...base, ...view._meta } as OpenaiResourceMeta;
  }
  return base;
}

/**
 * @internal
 * Build the MCP Apps (ext-apps, `ui.*`) view-resource `_meta`. Same four-layer
 * composition as {@link buildAppsSdkContentMeta}, nested under `ui` and carrying
 * the ext-apps-only `baseUriDomains`.
 */
export function buildExtAppsContentMeta(
  view: ViewConfig,
  defaults: ExtAppsContentDefaults,
  overrides: ViewContentOverrides = {},
): McpAppsResourceMeta {
  const serverDefaults: McpAppsResourceMeta = {
    ui: {
      csp: {
        resourceDomains: defaults.resourceDomains,
        connectDomains: defaults.connectDomains,
        baseUriDomains: defaults.baseUriDomains,
      },
      domain: defaults.domain,
    },
  };

  const fromView: McpAppsResourceMeta = {
    ui: {
      ...(view.description && { description: view.description }),
      ...(view.prefersBorder !== undefined && {
        prefersBorder: view.prefersBorder,
      }),
      ...(view.domain && { domain: view.domain }),
      csp: {
        ...(view.csp?.resourceDomains && {
          resourceDomains: view.csp.resourceDomains,
        }),
        ...(view.csp?.connectDomains && {
          connectDomains: view.csp.connectDomains,
        }),
        ...(view.csp?.frameDomains && {
          frameDomains: view.csp.frameDomains,
        }),
        ...(view.csp?.baseUriDomains && {
          baseUriDomains: view.csp.baseUriDomains,
        }),
        ...(view.csp?.redirectDomains && {
          redirectDomains: view.csp.redirectDomains,
        }),
      },
    },
  };

  const base = mergeWithUnion(mergeWithUnion(serverDefaults, fromView), {
    ui: overrides,
  }) as McpAppsResourceMeta;

  if (view._meta) {
    return { ...base, ...view._meta } as McpAppsResourceMeta;
  }
  return base;
}
