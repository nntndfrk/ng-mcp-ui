import { assertInInjectionContext, inject } from "@angular/core";
import type {
  Adaptor,
  SendFollowUpMessageOptions,
} from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that sends a follow-up message to the LLM. Returned by {@link injectSendFollowUpMessage}. */
export type SendFollowUpMessageFn = (
  prompt: string,
  options?: SendFollowUpMessageOptions,
) => Promise<void>;

/**
 * Signal-DI send-follow-up-message wrapper.
 *
 * Returns a function that sends a follow-up message to the LLM on behalf of the
 * view, as if the user had sent it. Use to chain interactions from view UI
 * (e.g. a button that triggers the next assistant turn). Pass
 * `scrollToBottom: false` to keep the chat scroll position (Apps-SDK-only;
 * silently ignored under MCP Apps).
 *
 * Where the React hook memoized with `useCallback`, the DI port returns a plain
 * closure bound to the injected adaptor (stable for the injection context's
 * lifetime).
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectSendFollowUpMessage(): SendFollowUpMessageFn {
  assertInInjectionContext(injectSendFollowUpMessage);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return (prompt, options) => adaptor.sendFollowUpMessage(prompt, options);
}
