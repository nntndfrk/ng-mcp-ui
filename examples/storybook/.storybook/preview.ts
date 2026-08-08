import type { Preview } from "@storybook/angular";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
    layout: "centered",
  },
};

export default preview;
