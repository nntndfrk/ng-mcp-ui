import { ChangeDetectionStrategy, Component, computed } from "@angular/core";
import {
  DataLlmDirective,
  injectCallTool,
  injectDisplayMode,
  injectLayout,
  injectToolInfo,
  injectViewState,
} from "ng-mcp-ui/web";

/** One row of the list. Matches the `tasks[]` entry the server tool returns. */
export type Task = {
  id: string;
  label: string;
  done: boolean;
};

/**
 * The snapshot shape the rendering tool returns.
 *
 * A `type` and not an `interface`, because `injectToolInfo` constrains its
 * generics to `Record<string, unknown>`. An interface is open and does not get
 * an implicit index signature, so it fails that constraint.
 */
export type TaskListSnapshot = {
  listName: string;
  tasks: Task[];
};

/** Arguments for the `toggle_task` tool this widget calls. */
export type ToggleTaskArgs = {
  id: string;
  done: boolean;
};

/** Locally persisted, host-synced view state. Survives a view remount. */
export type TaskListViewState = {
  filter: "all" | "open";
};

/**
 * A small MCP widget, written exactly as a production widget is written.
 *
 * It reads nothing from `window`. Every host capability arrives through an
 * `inject*` function, and each of those resolves the adaptor from the
 * `MCP_ADAPTOR` DI token. That single token is the reason this component
 * renders in Storybook with no host present: a story provides
 * `provideMockMcpUi()` instead of `provideMcpUi()`, and nothing else changes.
 *
 * | Capability          | Surface here                                     |
 * | ------------------- | ------------------------------------------------ |
 * | tool output         | `injectToolInfo` reads the rendering tool result  |
 * | view to server call | `injectCallTool("toggle_task")`                   |
 * | persisted state     | `injectViewState({ filter })` survives a remount  |
 * | theme and layout    | `injectLayout()` gives the theme and the safe area |
 * | display mode        | `injectDisplayMode()` requests fullscreen         |
 * | model-visible text  | `[dataLlm]` tells the model what the user sees     |
 */
@Component({
  selector: "task-list-widget",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataLlmDirective],
  host: {
    class: "task-host",
    "[class.task-dark]": "theme() === 'dark'",
    "[style.paddingBottom.px]": "safeAreaBottom()",
  },
  styleUrl: "./task-list.css",
  template: `
    @let snapshot = list();
    @if (snapshot) {
      <header>
        <h1>{{ snapshot.listName }}</h1>
        <button type="button" (click)="expand()">Expand</button>
      </header>

      <nav>
        <button
          type="button"
          [class.active]="filter() === 'all'"
          (click)="setFilter('all')"
        >
          All
        </button>
        <button
          type="button"
          [class.active]="filter() === 'open'"
          (click)="setFilter('open')"
        >
          Open only
        </button>
      </nav>

      <ul>
        @for (task of visibleTasks(); track task.id) {
          <li [class.done]="task.done">
            <label>
              <input
                type="checkbox"
                [checked]="task.done"
                (change)="toggle(task)"
              />
              <span>{{ task.label }}</span>
            </label>
          </li>
        } @empty {
          <li class="empty">Nothing to show.</li>
        }
      </ul>

      <p class="progress" [dataLlm]="progressSummary()">
        {{ doneCount() }} of {{ snapshot.tasks.length }} done
      </p>
    } @else {
      <p class="idle">Waiting for the tool result…</p>
    }
  `,
})
export default class TaskListWidget {
  /** The rendering tool's result, as an idle / pending / success state signal. */
  private readonly tool = injectToolInfo<{ output: TaskListSnapshot }>();

  /**
   * A server tool this widget calls when the user ticks a row. The tool answers
   * with the whole updated snapshot, which {@link TaskListWidget.list} then
   * prefers over the original tool output.
   */
  private readonly toggleTask = injectCallTool<
    ToggleTaskArgs,
    { structuredContent: TaskListSnapshot }
  >("toggle_task");

  /** Host-persisted view state. The host keeps it across a view remount. */
  private readonly viewState = injectViewState<TaskListViewState>({
    filter: "all",
  });

  private readonly layout = injectLayout();
  private readonly display = injectDisplayMode();

  /** The snapshot the rendering tool returned, or `null` before it succeeds. */
  private readonly rendered = computed(() => {
    const state = this.tool();
    return state.isSuccess ? state.output : null;
  });

  /**
   * What the list draws. A `toggle_task` answer is fresher than the render, so
   * it wins while it is present. Before the first call there is no answer, and
   * the rendering tool's own output shows instead. `null` drives the waiting
   * branch.
   */
  protected readonly list = computed<TaskListSnapshot | null>(
    () => this.toggleTask.data()?.structuredContent ?? this.rendered(),
  );

  protected readonly theme = computed(() => this.layout().theme);
  protected readonly safeAreaBottom = computed(
    () => this.layout().safeArea.insets.bottom,
  );

  protected readonly filter = computed(
    () => this.viewState.value()?.filter ?? "all",
  );

  protected readonly visibleTasks = computed(() => {
    const tasks = this.list()?.tasks ?? [];
    return this.filter() === "open" ? tasks.filter((t) => !t.done) : tasks;
  });

  protected readonly doneCount = computed(
    () => this.list()?.tasks.filter((t) => t.done).length ?? 0,
  );

  /** The line the model reads on the next turn, through the `[dataLlm]` host. */
  protected readonly progressSummary = computed(() => {
    const snapshot = this.list();
    if (!snapshot) {
      return "";
    }
    return `Task list "${snapshot.listName}": ${this.doneCount()} of ${snapshot.tasks.length} tasks are done. Filter: ${this.filter()}.`;
  });

  protected setFilter(filter: TaskListViewState["filter"]): void {
    this.viewState.set({ filter });
  }

  protected toggle(task: Task): void {
    this.toggleTask.callTool({ id: task.id, done: !task.done });
  }

  protected expand(): void {
    // Fire and forget. The host answers with the mode it actually gave us, and
    // the `displayMode` signal reports that, so there is nothing to await here.
    void this.display.setDisplayMode("fullscreen");
  }
}
