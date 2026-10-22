"use client";

import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableCell, TableHeader, TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Columns3, Highlighter, Italic, List, ListOrdered, Merge, PaintBucket, Redo2, Rows3,
  Split, Strikethrough, Table as TableIcon, Trash2, Underline, Undo2,
} from "lucide-react";
import { useEffect, useRef } from "react";

/** Table cells keep their shading from Word. */
const shading = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (a: { backgroundColor?: string | null }) => (a.backgroundColor ? { style: `background-color: ${a.backgroundColor}` } : {}),
  },
};
const Cell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...shading }; } });
const Header = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...shading }; } });

export const DOC_EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
  TextStyleKit,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Subscript,
  Superscript,
  TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
  Cell,
  Header,
];

export type DocEditorApi = { insert: (text: string) => void };

function Tool({ label, on, active, disabled, children }: { label: string; on: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // Keeps the editor's selection while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 sm:size-8 ${active ? "bg-brand-50 text-brand-700" : ""}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden />;

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"),
      block: e.isActive("heading", { level: 1 }) ? "1" : e.isActive("heading", { level: 2 }) ? "2" : e.isActive("heading", { level: 3 }) ? "3" : "p",
      center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? "#000000",
      highlighted: !!e.getAttributes("textStyle").backgroundColor,
      inTable: e.isActive("table"),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
      canMerge: e.can().mergeCells(), canSplit: e.can().splitCell(),
    }),
  });
  const run = () => editor.chain().focus();
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-slate-100 bg-white px-2 py-1.5" role="toolbar" aria-label="Formatting">
      <Tool label="Undo (Ctrl+Z)" on={() => run().undo().run()} disabled={!s.canUndo}><Undo2 className="size-4" /></Tool>
      <Tool label="Redo (Ctrl+Shift+Z)" on={() => run().redo().run()} disabled={!s.canRedo}><Redo2 className="size-4" /></Tool>
      <Sep />
      <select
        aria-label="Text style"
        className="h-8 shrink-0 rounded-md border-0 bg-transparent py-0 pr-7 pl-2 text-sm text-slate-700 hover:bg-slate-100 focus:ring-0"
        value={s.block}
        onChange={(e) => (e.target.value === "p" ? run().setParagraph().run() : run().setHeading({ level: Number(e.target.value) as 1 | 2 | 3 }).run())}
      >
        <option value="p">Normal text</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>
      <Sep />
      <Tool label="Bold" on={() => run().toggleBold().run()} active={s.bold}><Bold className="size-4" /></Tool>
      <Tool label="Italic" on={() => run().toggleItalic().run()} active={s.italic}><Italic className="size-4" /></Tool>
      <Tool label="Underline" on={() => run().toggleUnderline().run()} active={s.underline}><Underline className="size-4" /></Tool>
      <Tool label="Strike-through" on={() => run().toggleStrike().run()} active={s.strike}><Strikethrough className="size-4" /></Tool>
      <label className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-slate-100 sm:size-8" title="Text colour">
        <span className="text-sm font-semibold" style={{ color: s.color, textDecoration: "underline", textDecorationThickness: 3 }}>A</span>
        <input type="color" aria-label="Text colour" className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#000000"} onChange={(e) => run().setColor(e.target.value).run()} />
      </label>
      <Tool label={s.highlighted ? "Remove highlight" : "Highlight"} on={() => (s.highlighted ? run().unsetBackgroundColor().run() : run().setBackgroundColor("#ffff00").run())} active={s.highlighted}><Highlighter className="size-4" /></Tool>
      <Sep />
      <Tool label="Bulleted list" on={() => run().toggleBulletList().run()} active={s.bullet}><List className="size-4" /></Tool>
      <Tool label="Numbered list" on={() => run().toggleOrderedList().run()} active={s.ordered}><ListOrdered className="size-4" /></Tool>
      <Tool label="Align left" on={() => run().setTextAlign("left").run()} active={!s.center && !s.right}><AlignLeft className="size-4" /></Tool>
      <Tool label="Centre" on={() => run().setTextAlign("center").run()} active={s.center}><AlignCenter className="size-4" /></Tool>
      <Tool label="Align right" on={() => run().setTextAlign("right").run()} active={s.right}><AlignRight className="size-4" /></Tool>
      <Sep />
      <Tool label="Insert table" on={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={s.inTable}><TableIcon className="size-4" /></Tool>
      {s.inTable && (
        <>
          <Tool label="Add row below" on={() => run().addRowAfter().run()}><Rows3 className="size-4" /></Tool>
          <Tool label="Add column right" on={() => run().addColumnAfter().run()}><Columns3 className="size-4" /></Tool>
          <Tool label="Merge cells" on={() => run().mergeCells().run()} disabled={!s.canMerge}><Merge className="size-4" /></Tool>
          <Tool label="Split cell" on={() => run().splitCell().run()} disabled={!s.canSplit}><Split className="size-4" /></Tool>
          <label className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 sm:size-8" title="Cell shading">
            <PaintBucket className="size-4" />
            <input type="color" aria-label="Cell shading" className="absolute inset-0 cursor-pointer opacity-0" defaultValue="#fff2cc" onChange={(e) => run().setCellAttribute("backgroundColor", e.target.value).run()} />
          </label>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteRow().run()} className="btn-ghost btn-sm shrink-0 text-xs">Delete row</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteColumn().run()} className="btn-ghost btn-sm shrink-0 text-xs">Delete column</button>
          <Tool label="Delete table" on={() => run().deleteTable().run()}><Trash2 className="size-4 text-red-600" /></Tool>
        </>
      )}
    </div>
  );
}

/** The editor for transcripts that came from Word with their formatting. */
export default function RichDocEditor({ value, onChange, apiRef }: { value: string; onChange: (html: string, typing: boolean) => void; apiRef: React.RefObject<DocEditorApi | null> }) {
  const last = useRef(value);
  const editor = useEditor({
    extensions: DOC_EXTENSIONS,
    content: value,
    immediatelyRender: false,
    // Keeps tabs and runs of spaces from Word, which transcripts use after timestamps.
    parseOptions: { preserveWhitespace: "full" },
    editorProps: { attributes: { class: "doc min-h-[55vh] px-5 py-4 focus:outline-none", "aria-label": "Transcript", spellcheck: "true" } },
    onUpdate: ({ editor: e }) => {
      last.current = e.getHTML();
      onChange(last.current, true);
    },
  });

  // Restore original, an uploaded file, or a save from elsewhere replace the content.
  useEffect(() => {
    if (editor && value !== last.current) {
      last.current = value;
      editor.commands.setContent(value, { emitUpdate: false, parseOptions: { preserveWhitespace: "full" } });
    }
  }, [editor, value]);

  useEffect(() => {
    apiRef.current = editor ? { insert: (text) => editor.chain().focus().insertContent(text, { parseOptions: { preserveWhitespace: "full" } }).run() } : null;
  }, [editor, apiRef]);

  if (!editor) return <div className="doc min-h-[55vh] px-5 py-4 text-slate-400">Loading the editor…</div>;
  return (
    <div className="flex flex-1 flex-col">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="doc-scroll flex-1" />
    </div>
  );
}
