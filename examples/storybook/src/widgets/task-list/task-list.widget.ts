import { ChangeDetectionStrategy, Component, computed } from "@angular/core";
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
} from "@ionic/angular/standalone";
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
 * The chrome is Ionic in `ios` (Cupertino) mode. The host theme drives the
 * `ion-palette-dark` class, which is how Ionic switches its palette: the class
 * sets CSS custom properties that cascade into every Ionic element below it.
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
  imports: [
    DataLlmDirective,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCheckbox,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSegment,
    IonSegmentButton,
  ],
  host: {
    // Ionic's dark palette is selected by `.ion-palette-dark.ios`, with both
    // classes on ONE element. Ionic itself puts `ios` on `<html>`, so binding
    // `ion-palette-dark` alone here would never match. Carrying both on the
    // widget host makes the palette local to this component, which keeps one
    // story (or one widget on a page) from repainting its neighbours.
    class: "task-host ios",
    "[class.ion-palette-dark]": "theme() === 'dark'",
    "[style.paddingBottom.px]": "safeAreaBottom()",
  },
  styleUrl: "./task-list.css",
  template: `
    @let snapshot = list();
    <ion-card>
      @if (snapshot) {
        <ion-card-header>
          <ion-card-title>{{ snapshot.listName }}</ion-card-title>
          <ion-button
            fill="clear"
            size="small"
            class="expand"
            (click)="expand()"
          >
            Expand
          </ion-button>
        </ion-card-header>

        <ion-card-content>
          <ion-segment
            [value]="filter()"
            (ionChange)="onFilterChange($event)"
          >
            <ion-segment-button value="all">
              <ion-label>All</ion-label>
            </ion-segment-button>
            <ion-segment-button value="open">
              <ion-label>Open only</ion-label>
            </ion-segment-button>
          </ion-segment>

          <ion-list lines="full">
            @for (task of visibleTasks(); track task.id) {
              <ion-item>
                <ion-checkbox
                  justify="start"
                  labelPlacement="end"
                  [checked]="task.done"
                  (ionChange)="toggle(task)"
                >
                  <span [class.done]="task.done">{{ task.label }}</span>
                </ion-checkbox>
              </ion-item>
            } @empty {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <ion-note>Nothing to show.</ion-note>
                </ion-label>
              </ion-item>
            }
          </ion-list>

          <ion-note class="progress" [dataLlm]="progressSummary()">
            {{ doneCount() }} of {{ snapshot.tasks.length }} done
          </ion-note>
        </ion-card-content>
      } @else {
        <ion-card-content>
          <ion-note>Waiting for the tool result…</ion-note>
        </ion-card-content>
      }
    </ion-card>
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

  /**
   * `ion-segment` reports the new value on the event detail. It is typed as a
   * loose `string | undefined`, so narrow it before it reaches the view state.
   */
  protected onFilterChange(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    if (value === "all" || value === "open") {
      this.viewState.set({ filter: value });
    }
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
