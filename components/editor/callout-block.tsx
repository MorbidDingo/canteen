import { Node, mergeAttributes } from "@tiptap/core";

export type CalloutType = "info" | "warning" | "tip" | "important";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calloutBlock: {
      setCallout: (type: CalloutType) => ReturnType;
      toggleCallout: (type: CalloutType) => ReturnType;
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
        parseHTML: (element) =>
          (element.getAttribute("data-callout") as CalloutType) || "info",
        renderHTML: (attributes) => ({
          "data-callout": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": HTMLAttributes["data-callout"] || "info" }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, { type });
        },
      toggleCallout:
        (type: CalloutType) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, { type });
        },
    };
  },
});
