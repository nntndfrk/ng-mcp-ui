import {
  type Signal,
  assertInInjectionContext,
  computed,
  inject,
} from "@angular/core";
import type { Adaptor, UserAgent } from "./bridges/types.js";
import { createHostContextSignals } from "./host-context.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Session-stable user info.
 */
export type UserState = {
  locale: string;
  userAgent: UserAgent;
};

const DEFAULT_LOCALE = "en-US";

/**
 * Normalize a locale string to canonical BCP 47 form via {@link Intl.Locale}:
 * handles underscored identifiers (e.g. "fr_FR" → "fr-FR"), incorrect casing
 * ("en-us" → "en-US"), and complex subtags ("zh_Hans_CN" → "zh-Hans-CN"); falls
 * back to "en-US" if the locale is invalid.
 */
function normalizeLocale(locale: string): string {
  try {
    return new Intl.Locale(locale.replace(/_/g, "-")).toString();
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Signal-based user-info wrapper.
 *
 * Read session-stable user info — normalized `locale` and `userAgent`. Returns a
 * single readonly {@link Signal} of {@link UserState} derived from the `locale`
 * and `userAgent` host-context signals (locale is normalized on every recompute).
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectUser(): Signal<UserState> {
  assertInInjectionContext(injectUser);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const ctx = createHostContextSignals(adaptor);

  return computed(() => ({
    locale: normalizeLocale(ctx.locale()),
    userAgent: ctx.userAgent(),
  }));
}
