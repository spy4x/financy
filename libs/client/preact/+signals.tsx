/** @jsxImportSource preact */
/** @jsxRuntime automatic */

import { useMemo } from "preact/hooks"
import { Signal } from "@preact/signals"
import { JSX } from "preact"

const Item = (
  { v, k, f }: { v: unknown; k: number; f: (v: unknown, k: number) => JSX.Element },
): JSX.Element => f(v, k)

export function For(
  { each, children: f, fallback }: {
    each: Signal<unknown[]>
    children: (v: unknown, k: number) => JSX.Element
    fallback?: JSX.Element
  },
) {
  const c = useMemo(() => new Map(), [])
  const value = each.value
  //if (!Array.isArray(value)) return <Item v={value} f={f} />;
  return value?.map((v, k) =>
    c.get(v) || (c.set(v, <Item key={k} v={v} k={k} f={f} />), c.get(v))
  ) ?? fallback
}

export function Show(
  { when, fallback, children: f }: {
    when: Signal<unknown>
    fallback?: JSX.Element
    children: ((v: unknown) => JSX.Element) | JSX.Element
  },
) {
  const v = when.value
  return v ? typeof f === "function" ? <Item v={v} k={0} f={f} /> : f : fallback
}

// Extend Signal prototype with proper types
declare module "@preact/signals" {
  interface Signal<T> {
    map(fn: (value: T) => JSX.Element): JSX.Element
  }
  interface ReadonlySignal<T> {
    map(fn: (value: T) => JSX.Element): JSX.Element
  }
}

Signal.prototype.map = function <T,>(fn: (value: T) => JSX.Element) {
  return <For each={this as Signal<unknown[]>}>{(v: unknown) => fn(v as T)}</For>
}
