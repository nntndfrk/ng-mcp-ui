import type { StorybookConfig } from "@storybook/angular";

/**
 * Storybook config for the `ng-mcp-ui` widget example.
 *
 * Nothing here is specific to `ng-mcp-ui`. The library needs no Storybook
 * plugin, no custom webpack rule and no decorator of its own, because the
 * host bridge is behind one DI token (`MCP_ADAPTOR`). A story swaps that
 * token with `provideMockMcpUi()` and the widget renders. See
 * `src/widgets/task-list/task-list.stories.ts`.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: [],
  framework: {
    name: "@storybook/angular",
    options: {},
  },
};

export default config;
