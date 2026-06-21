import {
  type EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";
import { injectSendFollowUpMessage } from "./inject-send-follow-up-message.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

function makeInjector(method: ReturnType<typeof spy>): EnvironmentInjector {
  const adaptor = createFakeAdaptor({
    methods: {
      sendFollowUpMessage:
        method as unknown as Adaptor["sendFollowUpMessage"],
    },
  });
  return Injector.create({
    providers: [{ provide: MCP_ADAPTOR, useValue: adaptor }],
  }) as EnvironmentInjector;
}

describe("injectSendFollowUpMessage", () => {
  it("forwards the prompt to adaptor.sendFollowUpMessage", async () => {
    const send = spy(() => Promise.resolve());
    const injector = makeInjector(send);

    const sendFollowUp = runInInjectionContext(injector, () =>
      injectSendFollowUpMessage(),
    );
    await sendFollowUp("Summarize the last 5 results");

    expect(send.calls).toEqual([["Summarize the last 5 results", undefined]]);
    injector.destroy();
  });

  it("forwards the scrollToBottom option", async () => {
    const send = spy(() => Promise.resolve());
    const injector = makeInjector(send);

    const sendFollowUp = runInInjectionContext(injector, () =>
      injectSendFollowUpMessage(),
    );
    await sendFollowUp("next", { scrollToBottom: false });

    expect(send.calls).toEqual([["next", { scrollToBottom: false }]]);
    injector.destroy();
  });

  it("throws outside an injection context", () => {
    expect(() => injectSendFollowUpMessage()).toThrow();
  });
});
