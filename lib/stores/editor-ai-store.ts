import { create } from "zustand";

export type EditorAIAction =
  | "improve"
  | "continue"
  | "summarize"
  | "expand"
  | "shorten"
  | "fix_grammar"
  | "simplify"
  | "translate"
  | "change_tone"
  | "generate_quiz"
  | "explain_concept"
  | "custom";

interface EditorAIState {
  isOpen: boolean;
  action: EditorAIAction | null;
  selectedText: string;
  result: string;
  isStreaming: boolean;
  error: string | null;
  customPrompt: string;
  // Actions
  open: (action?: EditorAIAction, text?: string) => void;
  close: () => void;
  setResult: (text: string) => void;
  appendResult: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (error: string | null) => void;
  setCustomPrompt: (prompt: string) => void;
  setAction: (action: EditorAIAction) => void;
  reset: () => void;
}

export const useEditorAIStore = create<EditorAIState>((set) => ({
  isOpen: false,
  action: null,
  selectedText: "",
  result: "",
  isStreaming: false,
  error: null,
  customPrompt: "",

  open: (action, text) =>
    set({
      isOpen: true,
      action: action ?? null,
      selectedText: text ?? "",
      result: "",
      error: null,
      isStreaming: false,
    }),

  close: () =>
    set({
      isOpen: false,
      action: null,
      selectedText: "",
      result: "",
      error: null,
      isStreaming: false,
      customPrompt: "",
    }),

  setResult: (text) => set({ result: text }),
  appendResult: (chunk) => set((s) => ({ result: s.result + chunk })),
  setStreaming: (v) => set({ isStreaming: v }),
  setError: (error) => set({ error, isStreaming: false }),
  setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
  setAction: (action) => set({ action }),
  reset: () =>
    set({
      result: "",
      error: null,
      isStreaming: false,
    }),
}));
