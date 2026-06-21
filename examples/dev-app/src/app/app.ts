import { Component, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  template: `
    <main>
      <h1>{{ title() }}</h1>
      <p>
        Angular SSR host. The MCP endpoint is mounted at
        <code>/mcp</code> and widget assets at <code>/assets/widgets</code>.
      </p>
      <router-outlet />
    </main>
  `,
  styles: [],
})
export class App {
  protected readonly title = signal("ng-mcp-ui dev-app");
}
