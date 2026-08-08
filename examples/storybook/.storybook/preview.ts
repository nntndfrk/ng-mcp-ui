import type { Preview } from "@storybook/angular";

// Ionic's stylesheets are NOT imported here. `@ionic/angular` exports `./css/*`
// only under the `style` condition, which a JavaScript import cannot satisfy,
// so an `import "@ionic/angular/css/core.css"` fails to resolve. The builder's
// `styles` array does apply that condition, so they are listed in
// `angular.json` instead.

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
    layout: "centered",
  },
};

export default preview;
