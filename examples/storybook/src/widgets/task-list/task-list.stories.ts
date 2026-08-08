import { applicationConfig } from "@storybook/angular";
import type { Decorator, Meta, StoryObj } from "@storybook/angular";
import { type MockMcpUiArgs, provideMockMcpUi } from "ng-mcp-ui/testing";
import TaskListWidget, { type TaskListSnapshot } from "./task-list.widget";

/**
 * Build the one decorator each story needs.
 *
 * This is the whole `ng-mcp-ui` Storybook integration. `provideMockMcpUi()`
 * returns the same shape as `provideMcpUi()`, so a story hands its `providers`
 * to `applicationConfig` and the widget renders with no host, no `window.mcpUi`
 * and no iframe. Every `inject*` function in the widget resolves the mock,
 * because all of them read the one `MCP_ADAPTOR` token.
 *
 * Each call makes a new `MockAdaptor`. Do not lift one to module scope: the
 * adaptor holds mutable host state and a call log, so a shared instance would
 * leak one story's writes into the next.
 */
function mockMcpUi(args: MockMcpUiArgs = {}): Decorator {
  return applicationConfig({ providers: [provideMockMcpUi(args).providers] });
}

const SNAPSHOT: TaskListSnapshot = {
  listName: "Release checklist",
  tasks: [
    { id: "t1", label: "Cut the release branch", done: true },
    { id: "t2", label: "Update the changelog", done: true },
    { id: "t3", label: "Tag the merge commit", done: false },
    { id: "t4", label: "Announce in the channel", done: false },
  ],
};

/**
 * `injectToolInfo` reports success only when `toolInput` is present as well as
 * `toolOutput`. A story that sets the output alone still reads as idle, and the
 * widget draws its waiting branch. Both keys go in together for that reason.
 */
const SUCCESS_CONTEXT = {
  toolInput: { listId: "release-42" },
  toolOutput: SNAPSHOT,
} satisfies MockMcpUiArgs["hostContext"];

const meta: Meta<TaskListWidget> = {
  title: "Widgets/Task list",
  component: TaskListWidget,
  parameters: {
    docs: {
      description: {
        component:
          "An MCP widget rendered with no host. The only difference from " +
          "production is that the story provides `provideMockMcpUi()` where " +
          "the host shell provides `provideMcpUi()`.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<TaskListWidget>;

/** The tool returned a snapshot, and the host reports the light theme. */
export const Default: Story = {
  decorators: [mockMcpUi({ hostContext: SUCCESS_CONTEXT })],
};

/** The same snapshot with the host theme flipped. `injectLayout` reads it. */
export const DarkTheme: Story = {
  decorators: [
    mockMcpUi({ hostContext: { ...SUCCESS_CONTEXT, theme: "dark" } }),
  ],
};

/**
 * The tool is running: `toolInput` is present, no output yet. `injectToolInfo`
 * reports `pending`, so the widget draws its waiting branch.
 */
export const Pending: Story = {
  decorators: [mockMcpUi({ hostContext: { toolInput: { listId: "r-42" } } })],
};

/** A successful call that returned no rows, which draws the `@empty` branch. */
export const EmptyList: Story = {
  decorators: [
    mockMcpUi({
      hostContext: {
        toolInput: { listId: "release-43" },
        toolOutput: { listName: "Nothing queued", tasks: [] },
      },
    }),
  ],
};

/**
 * Persisted view state, seeded as the host would return it on a remount. The
 * widget starts on the "Open only" filter without any user interaction, which
 * is what `injectViewState` buys.
 */
export const FilterRestoredFromHost: Story = {
  decorators: [
    mockMcpUi({
      hostContext: { ...SUCCESS_CONTEXT, viewState: { filter: "open" } },
    }),
  ],
};

/**
 * The host reports a bottom safe-area inset, as a mobile host does over a home
 * indicator. `injectLayout().safeArea` drives the host element's padding.
 */
export const WithSafeArea: Story = {
  decorators: [
    mockMcpUi({
      hostContext: {
        ...SUCCESS_CONTEXT,
        safeArea: { insets: { top: 0, right: 0, bottom: 48, left: 0 } },
      },
    }),
  ],
};

/**
 * A canned answer for the tool the widget calls. Tick "Tag the merge commit"
 * and the mock resolves `toggle_task` from this map instead of reaching a
 * server, so the count goes to 3 of 4 in front of you. This is the only story
 * you have to interact with to see it work.
 *
 * The adaptor records the call as well, so a spec can assert that the widget
 * sent `{ id: "t3", done: true }`. The README shows that pattern.
 */
export const WithCannedToolResponse: Story = {
  decorators: [
    mockMcpUi({
      hostContext: SUCCESS_CONTEXT,
      toolResponses: {
        toggle_task: {
          listName: SNAPSHOT.listName,
          tasks: SNAPSHOT.tasks.map((task) =>
            task.id === "t3" ? { ...task, done: true } : task,
          ),
        },
      },
    }),
  ],
};
