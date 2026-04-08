import { Node, mergeAttributes } from "@tiptap/react";

export type CalloutType = "info" | "warning" | "tip" | "important";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    calloutBlock: {
      setCallout: (attrs: { type: CalloutType }) => ReturnType;
      toggleCallout: (attrs: { type: CalloutType }) => ReturnType;
    };
  }
}

export const CalloutBlock = Node.create({
  name: "calloutBlock",

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout") || "info",
        renderHTML: (attributes) => ({
          "data-callout": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "callout-block",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs);
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs);
        },
    };
  },
});
