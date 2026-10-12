import { useCallback, useRef, useState } from "react";

const LIMIT = 300;
/** Typing that follows within this long joins the same undo step. */
const GROUP_MS = 1000;

/** Where the text changed between two versions, so the cursor can be put back there after an undo or redo. */
function changeEnd(from: string, to: string) {
  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) start++;
  let end = 0;
  while (end < from.length - start && end < to.length - start && from[from.length - 1 - end] === to[to.length - 1 - end]) end++;
  return to.length - end;
}

/** Text state with its own undo/redo history (the browser's is lost whenever the app sets the text). */
export function useUndo(initial: string) {
  const [text, setState] = useState(initial);
  const current = useRef(initial);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastTyped = useRef(0);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const sync = () => setDepth({ undo: past.current.length, redo: future.current.length });

  /** `typing` groups quick keystrokes into one step; anything else (paste via a button, restore, upload) is its own step. */
  const set = useCallback((next: string, typing = false) => {
    if (next === current.current) return;
    const now = Date.now();
    if (!typing || now - lastTyped.current > GROUP_MS || past.current.length === 0) {
      past.current.push(current.current);
      if (past.current.length > LIMIT) past.current.shift();
    }
    lastTyped.current = typing ? now : 0;
    future.current = [];
    current.current = next;
    setState(next);
    sync();
  }, []);

  const step = useCallback((from: React.RefObject<string[]>, to: React.RefObject<string[]>) => {
    const target = from.current.pop();
    if (target === undefined) return null;
    to.current.push(current.current);
    const cursor = changeEnd(current.current, target);
    current.current = target;
    lastTyped.current = 0;
    setState(target);
    sync();
    return cursor;
  }, []);

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  return { text, set, undo, redo, canUndo: depth.undo > 0, canRedo: depth.redo > 0 };
}
