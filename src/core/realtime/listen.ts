import "server-only";
import { getSql } from "../db/client";
import { CHANNEL, type ChangeNotice } from "./index";

// One LISTEN connection per server process, shared by every open event stream.
type Listener = (notice: ChangeNotice) => void;
const globalForListen = globalThis as unknown as { creoListeners?: Set<Listener>; creoListening?: Promise<unknown> };

export function subscribe(listener: Listener): () => void {
  const listeners = (globalForListen.creoListeners ??= new Set());
  listeners.add(listener);
  globalForListen.creoListening ??= getSql().listen(CHANNEL, (payload) => {
    let notice: ChangeNotice;
    try {
      notice = JSON.parse(payload) as ChangeNotice;
    } catch {
      return;
    }
    for (const l of globalForListen.creoListeners ?? []) l(notice);
  });
  return () => {
    listeners.delete(listener);
  };
}
