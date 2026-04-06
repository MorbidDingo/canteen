# TipTap Editor with AI Integration — Implementation Plan

> **Goal:** Replace the existing TinyMCE rich text editor with a full-featured TipTap editor that has native AI writing assistance, delivering an aesthetically minimal and delightful authoring experience for notes and assignments.

---

## Table of Contents

1. [Current State & Motivation](#1-current-state--motivation)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1 — Core TipTap Editor](#phase-1--core-tiptap-editor)
4. [Phase 2 — Advanced Extensions & UX](#phase-2--advanced-extensions--ux)
5. [Phase 3 — AI Writing Assistant](#phase-3--ai-writing-assistant)
6. [Phase 4 — AI Inline Commands (Slash + Bubble)](#phase-4--ai-inline-commands-slash--bubble)
7. [Phase 5 — Templates & Smart Blocks](#phase-5--templates--smart-blocks)
8. [Phase 6 — Mobile Optimization & Fullscreen](#phase-6--mobile-optimization--fullscreen)
9. [Phase 7 — Migration & Cleanup](#phase-7--migration--cleanup)
10. [File Map & Dependency Graph](#file-map--dependency-graph)
11. [Database Considerations](#database-considerations)
12. [Design System & Styling Guide](#design-system--styling-guide)
13. [Testing Strategy](#testing-strategy)

---

## 1. Current State & Motivation

### What exists today

| Aspect             | Current Implementation                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Editor**         | TinyMCE v8.4 (`@tinymce/tinymce-react` v6.3) self-hosted via `public/tinymce/`                               |
| **Wrapper**        | `components/ui/rich-text-editor.tsx` — 169-line React wrapper with fullscreen toggle                         |
| **Renderer**       | `components/ui/safe-html.tsx` — DOMPurify + Tailwind prose classes                                           |
| **Body storage**   | `content_post.body` column — raw HTML string                                                                 |
| **Consumer pages** | `app/(parent)/content/new/page.tsx` (create) and `app/(parent)/content/[id]/edit/page.tsx` (edit)            |
| **AI integration** | Anthropic Claude (tool-use) + OpenAI embeddings — per-post chat, summarization, RAG pipeline all implemented |
| **Postinstall**    | `scripts/copy-tinymce.js` copies TinyMCE assets to `public/`                                                 |

### Why replace TinyMCE with TipTap

| Problem                                                                                                         | TipTap Solution                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| TinyMCE's iframe sandboxes the editor away from the app's design system — dark mode doesn't match, fonts differ | TipTap renders inline in the DOM — inherits Tailwind classes, dark mode, CSS variables natively         |
| TinyMCE's bundle is ~1.2 MB+ (self-hosted) copied via postinstall script                                        | TipTap starter-kit is ~200 KB, tree-shakeable, no asset copying needed                                  |
| No AI writing assistance in the editor itself                                                                   | TipTap's extensible architecture allows inline AI commands (slash menu, bubble menu, selection actions) |
| Mobile experience is limited (iframe issues, toolbar cramped)                                                   | TipTap's ProseMirror core is touch-friendly; toolbar can be fully custom                                |
| Customizing TinyMCE toolbar/plugins requires learning their proprietary API                                     | TipTap extensions are plain JS/TS — composable, testable, well-documented                               |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    TipTap Editor Shell                        │
│                                                              │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Toolbar     │  │  Editor Content  │  │  AI Sidebar    │  │
│  │  (floating)  │  │  (ProseMirror)   │  │  (slide-over)  │  │
│  │             │  │                  │  │               │  │
│  │  B I U H    │  │  User types here │  │  ✨ Improve    │  │
│  │  • — □ ↗    │  │  with real-time  │  │  📝 Continue   │  │
│  │  /ai        │  │  formatting      │  │  📋 Summarize  │  │
│  └─────────────┘  │                  │  │  🌐 Translate  │  │
│                   │  ┌────────────┐  │  │  🔧 Fix        │  │
│                   │  │ Slash Menu │  │  │  📊 Quiz Gen   │  │
│                   │  │ /heading   │  │  └────────────────┘  │
│                   │  │ /bullet    │  │                       │
│                   │  │ /ai write  │  │                       │
│                   │  │ /image     │  │                       │
│                   │  └────────────┘  │                       │
│                   └──────────────────┘                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Bubble Menu (on text selection)                         ││
│  │  [B] [I] [U] [Link] [Highlight] │ [✨ AI ▾]            ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  Word count · Reading time · Character count                 │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer                     | Technology                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor core**           | `@tiptap/react` + `@tiptap/pm` (ProseMirror)                                                                                                                                                                                                                                                                                                                                     |
| **Starter extensions**    | `@tiptap/starter-kit` (document, paragraph, text, bold, italic, strike, code, heading, bulletList, orderedList, blockquote, codeBlock, hardBreak, horizontalRule, history)                                                                                                                                                                                                       |
| **Additional extensions** | `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-character-count`, `@tiptap/extension-highlight`, `@tiptap/extension-text-align`, `@tiptap/extension-image`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-typography`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item` |
| **UI components**         | shadcn/ui (new-york style), Radix primitives, Lucide icons                                                                                                                                                                                                                                                                                                                       |
| **AI backend**            | Anthropic Claude (`claude-haiku-4-5-20251001`) via existing `@anthropic-ai/sdk`                                                                                                                                                                                                                                                                                                  |
| **Animations**            | Framer Motion (existing)                                                                                                                                                                                                                                                                                                                                                         |
| **State**                 | React `useState`/`useCallback` + Zustand for cross-component AI state                                                                                                                                                                                                                                                                                                            |
| **Styling**               | Tailwind CSS v4 + `@tailwindcss/typography` prose classes                                                                                                                                                                                                                                                                                                                        |

---

## Phase 1 — Core TipTap Editor

> **Goal:** Drop-in replacement for TinyMCE with feature parity. Zero AI yet — just a solid, beautiful editor.

### 1.1 Install Dependencies

```bash
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-underline @tiptap/extension-link \
  @tiptap/extension-placeholder @tiptap/extension-character-count \
  @tiptap/extension-highlight @tiptap/extension-text-align \
  @tiptap/extension-image @tiptap/extension-color \
  @tiptap/extension-text-style @tiptap/extension-typography \
  @tiptap/extension-task-list @tiptap/extension-task-item
```

### 1.2 New File: `components/editor/tiptap-editor.tsx`

The main editor component. Accepts the same interface as the old `RichTextEditor`:

```ts
interface TipTapEditorProps {
  value: string; // HTML string (for backwards compat with content_post.body)
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  maxLength?: number;
  autoFocus?: boolean;
}
```

**Implementation details:**

- `useEditor()` hook with StarterKit + all extensions
- Controlled via `onUpdate` → `editor.getHTML()` → `onChange(html)`
- External value sync via `useEffect` watching `value` prop (only if editor content differs, to avoid cursor jumps)
- `EditorContent` renders ProseMirror in-DOM (no iframe)
- Applies Tailwind `prose prose-sm dark:prose-invert` classes to the editor container
- Inherits the app's Satoshi font, border-radius, color variables naturally

### 1.3 New File: `components/editor/toolbar.tsx`

A floating/sticky toolbar above the editor.

**Toolbar groups:**

| Group         | Actions                                      |
| ------------- | -------------------------------------------- |
| **Text**      | Bold, Italic, Underline, Strikethrough, Code |
| **Headings**  | H1, H2, H3 (dropdown)                        |
| **Lists**     | Bullet list, Ordered list, Task list         |
| **Blocks**    | Blockquote, Code block, Horizontal rule      |
| **Insert**    | Link, Image                                  |
| **Alignment** | Left, Center, Right                          |
| **AI**        | ✨ AI Assist button (Phase 3)                |

**UI pattern:**

- Each button is a `Toggle` (pressed state when active)
- Use `Tooltip` around each button for accessibility
- Icons from `lucide-react`: `Bold`, `Italic`, `Underline`, `Strikethrough`, `Code`, `Heading1-3`, `List`, `ListOrdered`, `ListChecks`, `Quote`, `CodeXml`, `Minus`, `Link`, `Image`, `AlignLeft/Center/Right`, `Sparkles`
- Dividers between groups using `Separator` (vertical)
- On mobile: horizontally scrollable toolbar with `overflow-x-auto`
- Active state: `bg-accent text-accent-foreground` (shadcn pattern)

### 1.4 New File: `components/editor/bubble-menu.tsx`

Appears on text selection:

- Uses TipTap's `BubbleMenu` component
- Shows: Bold, Italic, Underline, Link toggle, Highlight, AI dropdown
- Smooth fade-in animation via Tailwind `animate-in fade-in-0 zoom-in-95`
- Styled as a floating card with `shadow-lg rounded-lg border bg-popover`

### 1.5 New File: `components/editor/link-dialog.tsx`

- Radix `Dialog` for inserting/editing links
- Fields: URL (with `url` input type), Open in new tab (checkbox)
- Auto-detects if selection is already a link → pre-fills
- Validates URL format before applying

### 1.6 Update: `components/ui/rich-text-editor.tsx`

**Strategy:** Re-export the new TipTap editor from this file so existing imports (`content/new/page.tsx` and `content/[id]/edit/page.tsx`) work without changes.

```ts
// components/ui/rich-text-editor.tsx
export { TipTapEditor as RichTextEditor } from "@/components/editor/tiptap-editor";
export type { TipTapEditorProps as RichTextEditorProps } from "@/components/editor/tiptap-editor";
```

### 1.7 Styling: `components/editor/editor.css`

TipTap-specific styles imported in the editor component:

```css
/* ProseMirror focus ring */
.ProseMirror:focus {
  outline: none;
}

/* Placeholder styling */
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--muted-foreground);
  pointer-events: none;
  height: 0;
}

/* Task list checkboxes */
.ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

/* Code block styling */
.ProseMirror pre {
  background: var(--muted);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-family: ui-monospace, monospace;
}

/* Selection highlight */
.ProseMirror ::selection {
  background: oklch(0.65 0.18 28 / 0.25);
}
```

Import this in `app/globals.css` or directly in the editor component.

### 1.8 Deliverables Checklist

- [ ] `components/editor/tiptap-editor.tsx` — main editor component
- [ ] `components/editor/toolbar.tsx` — formatting toolbar
- [ ] `components/editor/bubble-menu.tsx` — selection popup
- [ ] `components/editor/link-dialog.tsx` — link insertion modal
- [ ] `components/editor/editor.css` — ProseMirror base styles
- [ ] `components/ui/rich-text-editor.tsx` — updated re-export
- [ ] `components/ui/safe-html.tsx` — verified compatibility (should work as-is since TipTap outputs standard HTML)
- [ ] Both create & edit pages render correctly
- [ ] Dark mode works natively
- [ ] All current formatting options available (bold, italic, underline, lists, headings, links, code blocks)

---

## Phase 2 — Advanced Extensions & UX

> **Goal:** Elevate the editor beyond TinyMCE feature parity with UX polish.

### 2.1 Slash Command Menu

**New file:** `components/editor/slash-command.tsx`

A custom TipTap extension that triggers on `/` at the start of a line or after a space.

**Commands:**

| Command      | Icon          | Description          |
| ------------ | ------------- | -------------------- |
| `/heading1`  | `Heading1`    | Insert H1            |
| `/heading2`  | `Heading2`    | Insert H2            |
| `/heading3`  | `Heading3`    | Insert H3            |
| `/bullet`    | `List`        | Bullet list          |
| `/numbered`  | `ListOrdered` | Ordered list         |
| `/checklist` | `ListChecks`  | Task list            |
| `/quote`     | `Quote`       | Blockquote           |
| `/code`      | `CodeXml`     | Code block           |
| `/divider`   | `Minus`       | Horizontal rule      |
| `/image`     | `Image`       | Insert image         |
| `/ai`        | `Sparkles`    | AI writing (Phase 3) |

**Implementation:**

- Custom `Extension.create()` using ProseMirror `InputRule` or a decoration-based approach
- Popup positioned below the cursor using `FloatingMenu` or manual coordinates
- Filtered by typed characters after `/`
- Keyboard navigation: ↑/↓ to select, Enter to execute, Esc to dismiss
- Styled as a `Command` palette (shadcn pattern)
- Framer Motion entrance: `animate={{ opacity: 1, y: 0 }}` from `initial={{ opacity: 0, y: 4 }}`

### 2.2 Image Handling

**New file:** `components/editor/image-upload.tsx`

- Drag-and-drop onto editor area
- Paste from clipboard
- Upload button in slash menu / toolbar
- Upload to S3 via existing `lib/s3.ts` → `uploadFileToS3()` function
- Show upload progress indicator inline (skeleton placeholder → actual image)
- Max size: 5 MB, formats: JPEG, PNG, WebP, GIF
- Responsive image rendering with `max-width: 100%`

### 2.3 Table Support (Optional)

Install `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` if needed. Assignment rubrics often use tables. Add to slash menu as `/table`.

### 2.4 Word Count & Reading Time

**New file:** `components/editor/word-count.tsx`

- Uses `@tiptap/extension-character-count` for live stats
- Bottom bar: `{words} words · {chars} characters · {Math.ceil(words/200)} min read`
- Subtle `text-muted-foreground text-xs` styling
- If `maxLength` prop is set, show: `{chars}/{maxLength}` with color change at 90%+

### 2.5 Keyboard Shortcuts

Display available shortcuts in a `Dialog` triggered by `Cmd/Ctrl + /`:

| Shortcut       | Action         |
| -------------- | -------------- |
| `Ctrl+B`       | Bold           |
| `Ctrl+I`       | Italic         |
| `Ctrl+U`       | Underline      |
| `Ctrl+Shift+X` | Strikethrough  |
| `Ctrl+E`       | Inline code    |
| `Ctrl+Shift+7` | Ordered list   |
| `Ctrl+Shift+8` | Bullet list    |
| `Ctrl+Shift+9` | Task list      |
| `Ctrl+Shift+B` | Blockquote     |
| `Ctrl+Alt+C`   | Code block     |
| `Ctrl+K`       | Insert link    |
| `Ctrl+Z`       | Undo           |
| `Ctrl+Shift+Z` | Redo           |
| `/`            | Slash commands |

### 2.6 Deliverables Checklist

- [ ] `components/editor/slash-command.tsx` — slash command extension + menu UI
- [ ] `components/editor/image-upload.tsx` — drag/drop/paste image handling
- [ ] `components/editor/word-count.tsx` — live word/char count bar
- [ ] `components/editor/keyboard-shortcuts.tsx` — shortcuts dialog
- [ ] Table support (if scoped in)

---

## Phase 3 — AI Writing Assistant

> **Goal:** Add an AI sidebar panel for selection-based writing assistance, leveraging the existing Anthropic integration.

### 3.1 API Route: `app/api/ai/editor/route.ts`

A new streaming API endpoint specifically for editor AI operations.

**Request body:**

```ts
interface EditorAIRequest {
  action:
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
  selectedText?: string; // The highlighted text (if any)
  fullContent?: string; // The entire document content
  customPrompt?: string; // For 'custom' action
  targetLanguage?: string; // For 'translate' action
  tone?: string; // For 'change_tone': formal, casual, academic, friendly
  context?: {
    postType: "ASSIGNMENT" | "NOTE";
    title?: string;
    audience?: string; // e.g., "Class 5A", "All parents"
  };
}
```

**Implementation:**

- Stream response using `ReadableStream` (SSE) — same pattern as `app/api/ai/chat/route.ts`
- Auth check via `requireUser()` + Certe+ subscription check
- Rate limit: reuse `checkAIRateLimit()` with type `'EDITOR'`
- Use Claude `claude-haiku-4-5-20251001` (fast, cheap, good enough for writing tasks)
- System prompt tailored per action with educational/school context awareness
- Log usage via `aiUsageLog` table

**System prompts per action:**

| Action            | System Prompt Core                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `improve`         | "Improve the writing quality, clarity, and flow while preserving the original meaning and voice. Output only the improved text."            |
| `continue`        | "Continue writing from where the text left off, matching the style and tone. Write 2-3 natural paragraphs."                                 |
| `summarize`       | "Create a concise summary of the following text, capturing the key points."                                                                 |
| `expand`          | "Expand on the given text with more detail, examples, and explanation while maintaining the same style."                                    |
| `shorten`         | "Make the text more concise without losing the core message. Aim for 50% reduction."                                                        |
| `fix_grammar`     | "Fix all grammar, spelling, and punctuation errors. Output only the corrected text."                                                        |
| `simplify`        | "Rewrite in simpler language suitable for parents and students. Use shorter sentences."                                                     |
| `translate`       | "Translate to {targetLanguage}. Preserve formatting, tone, and meaning."                                                                    |
| `change_tone`     | "Rewrite in a {tone} tone while preserving the content and meaning."                                                                        |
| `generate_quiz`   | "Generate 5 multiple-choice questions based on this content. Format as a numbered list with options (a-d) and indicate the correct answer." |
| `explain_concept` | "Explain the key concepts in this text in a simple, educational way suitable for students."                                                 |
| `custom`          | "Follow the user's instruction: {customPrompt}"                                                                                             |

### 3.2 AI Sidebar: `components/editor/ai-sidebar.tsx`

A slide-over panel (from right) that appears when the user triggers AI.

**UI:**

```
┌──────────────────────────────┐
│  ✨ AI Writing Assistant   ✕ │
│──────────────────────────────│
│                              │
│  Selected text preview       │
│  "The annual sports day..."  │
│                              │
│──────────────────────────────│
│                              │
│  Quick Actions               │
│  ┌────────┐ ┌────────┐      │
│  │✏️ Improve│ │📝 Continue│    │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │📋 Summarize│ │📏 Expand│  │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │✂️ Shorten│ │🔧 Fix│       │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │💬 Simplify│ │🌐 Translate││
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │🎭 Tone│  │📊 Quiz│       │
│  └────────┘ └────────┘      │
│                              │
│──────────────────────────────│
│  Or describe what you want:  │
│  ┌──────────────────────┐    │
│  │ Make it more engaging │    │
│  │ for Class 5 parents   │    │
│  └──────────────────────┘    │
│           [Generate ✨]      │
│──────────────────────────────│
│                              │
│  AI Output:                  │
│  ┌──────────────────────┐    │
│  │ The much-anticipated  │    │
│  │ annual sports day is  │    │
│  │ just around the...    │    │
│  │                       │    │
│  │ [Accept] [Retry] [✕]  │    │
│  └──────────────────────┘    │
│                              │
└──────────────────────────────┘
```

**Behavior:**

- Opens via: toolbar ✨ button, bubble menu AI dropdown, or slash command `/ai`
- Streams the AI response in real-time (character by character) using the SSE stream
- "Accept" replaces the selected text (or inserts at cursor if no selection)
- "Retry" re-runs the same action
- "Discard" closes without changes
- Loading state: shimmer skeleton + "AI is writing..." text
- Uses `Sheet` (shadcn) component with `side="right"` for desktop, full-screen bottom sheet for mobile

### 3.3 AI Bubble Menu Extension: `components/editor/ai-bubble-action.tsx`

Extends the bubble menu (Phase 1) with an AI dropdown:

- Trigger: `Sparkles` icon in bubble menu
- Dropdown with quick actions: Improve, Fix Grammar, Simplify, Translate
- Selecting an action opens the AI sidebar with that action pre-selected and the selected text loaded

### 3.4 Zustand Store: `lib/stores/editor-ai-store.ts`

```ts
interface EditorAIState {
  isOpen: boolean;
  action: EditorAIAction | null;
  selectedText: string;
  result: string;
  isStreaming: boolean;
  error: string | null;
  // Actions
  open: (action?: EditorAIAction, text?: string) => void;
  close: () => void;
  setResult: (text: string) => void;
  appendResult: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  reset: () => void;
}
```

### 3.5 Deliverables Checklist

- [ ] `app/api/ai/editor/route.ts` — streaming AI endpoint
- [ ] `components/editor/ai-sidebar.tsx` — AI assistant panel
- [ ] `components/editor/ai-bubble-action.tsx` — bubble menu AI dropdown
- [ ] `lib/stores/editor-ai-store.ts` — Zustand store for AI state
- [ ] Certe+ gating (free users see "Upgrade" prompt)
- [ ] Rate limiting via existing `checkAIRateLimit()`
- [ ] Usage logging via `aiUsageLog` table

---

## Phase 4 — AI Inline Commands (Slash + Bubble)

> **Goal:** Allow users to invoke AI directly inline without opening the sidebar — for quick, contextual actions.

### 4.1 Inline AI via Slash Command

When user types `/ai ` (with a space), show an inline text input:

```
┌───────────────────────────────────────┐
│ ✨ What would you like AI to write?   │
│ ┌───────────────────────────────────┐ │
│ │ Write a welcome note for new...   │ │
│ └───────────────────────────────────┘ │
│ Press Enter to generate, Esc to cancel│
└───────────────────────────────────────┘
```

- AI output streams directly into the editor at the cursor position
- Replaces the `/ai ...` text with the generated content
- Uses a ProseMirror decoration to show the inline prompt UI
- Esc cancels and removes the prompt

### 4.2 Selection-Based Inline Actions

When user selects text and uses bubble menu:

1. Quick actions run **inline** (no sidebar) for simple operations:
   - Fix Grammar → directly replaces selection with corrected text
   - Improve → directly replaces with improved text
2. Complex actions (Translate, Custom, Quiz) → open sidebar

### 4.3 AI Autocomplete (Optional/Future)

Ghost text suggestions while typing:

- Debounced (500ms after last keystroke)
- Shows greyed-out continuation text
- Tab to accept, keep typing to dismiss
- Only triggers at end of paragraphs
- **Gated to Certe+** and disabled by default (opt-in in settings)

### 4.4 Deliverables Checklist

- [ ] Inline AI prompt via slash command
- [ ] Streaming text insertion at cursor
- [ ] Quick inline actions from bubble menu
- [ ] Ghost text autocomplete (optional — flag-gated)

---

## Phase 5 — Templates & Smart Blocks

> **Goal:** Pre-built content templates for common school communications.

### 5.1 Template System

**New file:** `components/editor/templates.tsx`

Templates are presented when creating a new post (before the editor loads content):

**Assignment Templates:**

| Template           | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| Homework           | Title, instructions, due date reminder, submission guidelines |
| Project            | Overview, objectives, milestones, rubric, resources           |
| Worksheet          | Questions with numbered blanks, instructions                  |
| Reading Assignment | Book/chapter, guiding questions, reflection prompt            |
| Lab Report         | Aim, materials, procedure, observations, conclusion           |

**Note Templates:**

| Template        | Description                                      |
| --------------- | ------------------------------------------------ |
| Announcement    | Header, body, call-to-action, contact info       |
| Event Notice    | Event details, schedule, what to bring, RSVP     |
| Newsletter      | Welcome, highlights, upcoming dates, closing     |
| Circular        | Subject, body, important dates, compliance note  |
| Meeting Minutes | Date, attendees, agenda, decisions, action items |

**Implementation:**

- Templates stored as HTML strings in a `lib/editor/templates.ts` file
- Template picker UI: grid of cards with preview + title
- Shown in a `Dialog` when user clicks "Start from template" on the new post page
- Selecting a template pre-fills the editor's `value`
- AI action: "Generate from template" → user picks template + provides brief, AI fills it out

### 5.2 Smart Blocks (Callout, Info, Warning)

Custom TipTap nodes for structured content blocks:

```
┌─────────────────────────────────────┐
│ ℹ️  Information                      │
│ Please note that the school will... │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️  Important                        │
│ All submissions must be in PDF...   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ✅  Tip                              │
│ You can use Google Docs to...       │
└─────────────────────────────────────┘
```

**Implementation:**

- Custom `Node.create()` extension: `CalloutBlock`
- Types: `info`, `warning`, `tip`, `important`
- Rendered with colored left border + icon + background
- Available via slash command: `/callout`, `/info`, `/warning`, `/tip`
- Outputs semantic HTML: `<div data-callout="info">...</div>`
- `safe-html.tsx` updated with styles for callout rendering

### 5.3 Deliverables Checklist

- [ ] `lib/editor/templates.ts` — template definitions
- [ ] `components/editor/templates.tsx` — template picker UI
- [ ] `components/editor/callout-block.tsx` — custom callout node extension
- [ ] Slash commands for callouts
- [ ] `safe-html.tsx` updated for callout rendering

---

## Phase 6 — Mobile Optimization & Fullscreen

> **Goal:** Ensure the editor is a joy to use on mobile devices (primary platform for parents).

### 6.1 Mobile Toolbar

- Sticky at top of editor viewport
- Horizontally scrollable with `overflow-x-auto` and `-webkit-overflow-scrolling: touch`
- Larger touch targets: `min-h-[44px] min-w-[44px]`
- Grouped with visual separators
- Shows most-used actions first: Bold, Italic, List, Heading, Link, AI

### 6.2 Fullscreen Mode

Preserve the existing fullscreen toggle from the TinyMCE wrapper:

- Button in toolbar (top-right): `Maximize2` / `Minimize2` icon
- Fullscreen: `fixed inset-0 z-50 bg-background` with safe area padding
- Toolbar becomes sticky at top
- Word count bar at bottom
- Exit via button or `Esc` key
- Smooth transition: `transition-all duration-200`

### 6.3 Mobile AI Integration

- AI sidebar becomes a **bottom sheet** (using existing `components/ui/motion.tsx` `BottomSheet`)
- Swipe down to dismiss
- Quick actions displayed as a scrollable row of chips
- Compact output view with Accept/Retry at the bottom

### 6.4 Touch-Friendly Selection

- Selection handles work natively with ProseMirror
- Bubble menu positioned above selection (not overlapping keyboard)
- Adjust bubble menu `tippyOptions` for mobile viewport

### 6.5 Deliverables Checklist

- [ ] Responsive toolbar (scroll on mobile)
- [ ] Fullscreen mode with safe area support
- [ ] AI sidebar → bottom sheet on mobile
- [ ] Touch target compliance (44px minimum)
- [ ] Keyboard avoidance for bubble menu

---

## Phase 7 — Migration & Cleanup

> **Goal:** Remove TinyMCE completely and ensure all existing content renders correctly.

### 7.1 Migration Steps

1. **Verify HTML compatibility:**
   - Render 10+ existing posts with TipTap's `editor.setContent(html)` to confirm they parse correctly
   - Verify `safe-html.tsx` renders TipTap HTML output identically to TinyMCE output
   - Test edge cases: nested lists, code blocks with syntax, links, images

2. **Remove TinyMCE packages:**

   ```bash
   pnpm remove tinymce @tinymce/tinymce-react
   ```

3. **Remove TinyMCE assets:**
   - Delete `scripts/copy-tinymce.js`
   - Remove `postinstall` script from `package.json` (or update it)
   - Remove `public/tinymce/` from `.gitignore` entry
   - Delete `public/tinymce/` directory

4. **Update consumer pages (if needed):**
   - `app/(parent)/content/new/page.tsx` — should work via re-export
   - `app/(parent)/content/[id]/edit/page.tsx` — should work via re-export

5. **Update safe-html.tsx:**
   - Add styles for any new TipTap-specific HTML (task lists, callouts, highlights)
   - Keep DOMPurify sanitization (security critical)
   - Add to DOMPurify allowlist: `data-callout`, `data-type`, `data-checked` attributes

### 7.2 Callout HTML Rendering in safe-html.tsx

Add CSS for callout blocks that TipTap outputs:

```css
[data-callout="info"] {
  /* blue left border, light blue bg */
}
[data-callout="warning"] {
  /* amber left border, light amber bg */
}
[data-callout="tip"] {
  /* green left border, light green bg */
}
[data-callout="important"] {
  /* red left border, light red bg */
}
```

### 7.3 Deliverables Checklist

- [ ] HTML compatibility verified with existing posts
- [ ] TinyMCE packages removed
- [ ] `scripts/copy-tinymce.js` removed
- [ ] `postinstall` script updated
- [ ] `.gitignore` cleaned
- [ ] `public/tinymce/` deleted
- [ ] `safe-html.tsx` updated for new HTML patterns
- [ ] Both create & edit pages tested end-to-end
- [ ] All existing posts render correctly with the new renderer

---

## File Map & Dependency Graph

### New Files

```
components/
  editor/
    tiptap-editor.tsx        ← Main editor component (Phase 1)
    toolbar.tsx               ← Formatting toolbar (Phase 1)
    bubble-menu.tsx           ← Selection popup (Phase 1)
    link-dialog.tsx           ← Link insertion modal (Phase 1)
    editor.css                ← ProseMirror base styles (Phase 1)
    slash-command.tsx          ← Slash command menu (Phase 2)
    image-upload.tsx           ← Image drag/drop/paste (Phase 2)
    word-count.tsx             ← Live word/char count (Phase 2)
    keyboard-shortcuts.tsx     ← Shortcuts dialog (Phase 2)
    ai-sidebar.tsx             ← AI writing assistant panel (Phase 3)
    ai-bubble-action.tsx       ← AI dropdown in bubble menu (Phase 3)
    ai-inline-prompt.tsx       ← Inline AI prompt extension (Phase 4)
    templates.tsx              ← Template picker UI (Phase 5)
    callout-block.tsx          ← Callout custom node (Phase 5)

lib/
  editor/
    templates.ts              ← Template HTML definitions (Phase 5)
    extensions.ts             ← Consolidated TipTap extension config (Phase 1)
  stores/
    editor-ai-store.ts        ← Zustand store for AI state (Phase 3)

app/
  api/
    ai/
      editor/
        route.ts              ← AI writing assistant endpoint (Phase 3)
```

### Modified Files

```
components/ui/rich-text-editor.tsx   ← Re-export TipTap (Phase 1)
components/ui/safe-html.tsx          ← Add callout/task-list styles (Phase 5/7)
app/globals.css                      ← Import editor.css (Phase 1)
package.json                         ← Add @tiptap/*, remove tinymce (Phase 1/7)
.gitignore                           ← Remove public/tinymce line (Phase 7)
```

### Deleted Files

```
scripts/copy-tinymce.js              ← TinyMCE asset copier (Phase 7)
public/tinymce/                      ← TinyMCE self-hosted assets (Phase 7)
```

### Dependency Graph

```
tiptap-editor.tsx
  ├── toolbar.tsx
  │     └── link-dialog.tsx
  ├── bubble-menu.tsx
  │     └── ai-bubble-action.tsx
  │           └── editor-ai-store.ts
  ├── slash-command.tsx
  │     └── ai-inline-prompt.tsx
  ├── word-count.tsx
  ├── image-upload.tsx (→ lib/s3.ts)
  ├── ai-sidebar.tsx
  │     ├── editor-ai-store.ts
  │     └── api/ai/editor/route.ts (fetch)
  ├── callout-block.tsx
  └── lib/editor/extensions.ts
        └── @tiptap/* packages

templates.tsx → lib/editor/templates.ts

api/ai/editor/route.ts
  ├── @anthropic-ai/sdk
  ├── lib/ai/rate-limit.ts
  ├── lib/server/auth-utils.ts
  └── lib/db/schema.ts (aiUsageLog)
```

---

## Database Considerations

### No Schema Changes Required

- The `content_post.body` column stores HTML strings
- TipTap's `editor.getHTML()` produces standard HTML — fully compatible
- Existing posts' HTML will render in TipTap without any data migration
- `safe-html.tsx` (DOMPurify) continues to work for rendering

### Optional: Store TipTap JSON

TipTap can also serialize to JSON (`editor.getJSON()`) which is more structured and allows server-side manipulation. This is **optional** and not recommended for Phase 1:

**If pursued later:**

- Add `bodyJson JSONB` column to `content_post`
- Store both HTML (for backward compat/rendering) and JSON (for re-editing)
- Use JSON for loading into editor, HTML for display

### AI Usage Tracking

The existing `ai_usage_log` table handles editor AI usage:

```sql
-- Existing table, no changes needed
INSERT INTO ai_usage_log (user_id, org_id, type, tokens, metadata)
VALUES ($1, $2, 'EDITOR', $3, '{"action": "improve"}'::jsonb);
```

Add `'EDITOR'` to the type enum if not already present (check the schema; currently supports `'CHAT' | 'EMBEDDING' | 'SEARCH'`).

---

## Design System & Styling Guide

### Visual Principles

1. **Minimal chrome** — the toolbar should feel like it's barely there until needed
2. **Content-first** — the writing area dominates the viewport
3. **Contextual controls** — bubble menu appears on selection, slash menu on `/`
4. **Consistent with app** — uses the same Satoshi font, coral accent, rounded corners
5. **Dark mode native** — all editor elements use CSS variables, not hardcoded colors

### Color Tokens (from globals.css)

| Token                  | Usage                                  |
| ---------------------- | -------------------------------------- |
| `--background`         | Editor background                      |
| `--foreground`         | Text color                             |
| `--muted`              | Code block background, disabled states |
| `--muted-foreground`   | Placeholder text, word count           |
| `--accent`             | Active toolbar button background       |
| `--accent-foreground`  | Active toolbar button text             |
| `--primary`            | AI accent (coral/terracotta)           |
| `--border`             | Editor border, toolbar dividers        |
| `--ring`               | Focus ring                             |
| `--popover`            | Bubble menu, slash menu background     |
| `--popover-foreground` | Bubble menu text                       |

### Typography

| Element     | Classes                                                 |
| ----------- | ------------------------------------------------------- |
| Editor body | `prose prose-sm max-w-none dark:prose-invert font-sans` |
| H1          | `text-2xl font-bold` (TipTap default + prose)           |
| H2          | `text-xl font-semibold`                                 |
| H3          | `text-lg font-medium`                                   |
| Code        | `font-mono text-sm bg-muted rounded px-1.5 py-0.5`      |
| Blockquote  | `border-l-4 border-primary/30 pl-4 italic`              |

### Component Styling

| Component               | Style Pattern                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Toolbar                 | `flex items-center gap-1 p-1.5 border-b bg-background/80 backdrop-blur-sm`                    |
| Toolbar button          | `h-8 w-8 rounded-md hover:bg-accent transition-colors`                                        |
| Toolbar button (active) | `bg-accent text-accent-foreground`                                                            |
| Bubble menu             | `flex items-center gap-0.5 p-1 rounded-lg border bg-popover shadow-lg`                        |
| Slash menu              | `w-56 rounded-lg border bg-popover shadow-lg p-1`                                             |
| Slash menu item         | `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer`       |
| AI sidebar              | `w-80 border-l bg-background` (Sheet component)                                               |
| AI action button        | `rounded-lg border p-3 hover:bg-accent transition-colors text-left`                           |
| Word count bar          | `flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground border-t`                  |
| Editor container        | `rounded-lg border bg-background overflow-hidden focus-within:ring-2 ring-ring ring-offset-2` |

### Animation

| Element           | Animation                                               |
| ----------------- | ------------------------------------------------------- |
| Bubble menu       | `animate-in fade-in-0 zoom-in-95 duration-150`          |
| Slash menu        | `animate-in fade-in-0 slide-in-from-top-2 duration-150` |
| AI sidebar        | Sheet slide-in (built-in)                               |
| AI streaming text | Character-by-character with `opacity` transition        |
| Toolbar tooltips  | `delayDuration={300}`                                   |
| Fullscreen toggle | `transition-all duration-200 ease-in-out`               |

---

## Testing Strategy

### Unit Tests

| Test                         | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| Editor renders with value    | Pass HTML string, verify it appears in ProseMirror |
| onChange fires on edit       | Type text, verify callback with HTML               |
| Toolbar buttons toggle marks | Click Bold, verify `<strong>` in output            |
| Link dialog sets href        | Open dialog, enter URL, verify `<a>` tag           |
| Slash command filters        | Type `/hea`, verify only heading options shown     |
| Character count accurate     | Type text, verify count matches                    |
| Templates load correctly     | Select template, verify editor content             |

### Integration Tests

| Test                   | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| Create assignment flow | Navigate to `/content/new`, fill form, use editor, submit |
| Edit existing post     | Load post with existing HTML, edit, save                  |
| AI improve action      | Select text, trigger AI improve, verify replacement       |
| AI endpoint auth       | Verify non-Certe+ users get 403                           |
| AI rate limiting       | Exceed limit, verify 429 response                         |
| Image upload           | Drop image, verify S3 upload + inline rendering           |

### Visual/Manual Testing

- [ ] Dark mode: all editor elements visible, no white flashes
- [ ] Mobile (375px): toolbar scrolls, touch targets adequate, keyboard doesn't obscure
- [ ] Fullscreen: enters/exits cleanly, safe area respected
- [ ] Existing posts: 10+ real posts render identically in new renderer
- [ ] RTL: if applicable, editor handles RTL text input
- [ ] Accessibility: toolbar buttons have aria-labels, keyboard navigable

---

## Implementation Timeline

| Phase                       | Estimated Effort | Dependencies                                |
| --------------------------- | ---------------- | ------------------------------------------- |
| **Phase 1** — Core Editor   | 2-3 days         | None                                        |
| **Phase 2** — Advanced UX   | 2 days           | Phase 1                                     |
| **Phase 3** — AI Sidebar    | 2-3 days         | Phase 1                                     |
| **Phase 4** — Inline AI     | 1-2 days         | Phase 3                                     |
| **Phase 5** — Templates     | 1-2 days         | Phase 1                                     |
| **Phase 6** — Mobile Polish | 1-2 days         | Phase 1-3                                   |
| **Phase 7** — Migration     | 1 day            | Phase 1 (can run in parallel after Phase 1) |
| **Total**                   | **10-15 days**   |                                             |

### Priority Order

1. **Phase 1** (must-have — blocks everything)
2. **Phase 7** (do immediately after Phase 1 to remove TinyMCE debt)
3. **Phase 3** (AI sidebar — the headline feature)
4. **Phase 2** (slash commands, images — major UX uplift)
5. **Phase 6** (mobile polish — critical for parent users)
6. **Phase 4** (inline AI — power user feature)
7. **Phase 5** (templates — nice-to-have, high impact for adoption)

---

## Risks & Mitigations

| Risk                                             | Mitigation                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Existing HTML doesn't parse correctly in TipTap  | Test with real production data before removing TinyMCE; keep `safe-html.tsx` as fallback renderer |
| ProseMirror learning curve for custom extensions | Start with built-in TipTap extensions; only build custom nodes (callouts) in Phase 5              |
| AI streaming latency perceived as slow           | Show skeleton/shimmer immediately; use `claude-haiku-4-5-20251001` for speed                      |
| Mobile keyboard obscures editor                  | Use `visualViewport` API to adjust layout; test on real devices                                   |
| TipTap bundle size exceeds TinyMCE               | Tree-shake unused extensions; lazy-load editor component with `next/dynamic`                      |
| Rate limit frustration for AI features           | Clear UI showing remaining quota; graceful degradation to non-AI editing                          |
