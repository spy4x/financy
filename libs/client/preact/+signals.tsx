/** @jsxImportSource preact */
/** @jsxRuntime automatic */

import { useMemo } from "preact/hooks"
import { Signal } from "@preact/signals"

const Item = ({ v, k, f }) => f(v, k)

export function For({ each, children: f, fallback }) {
  let c = useMemo(() => new Map(), [])
  let value = each.value
  //if (!Array.isArray(value)) return <Item v={value} f={f} />;
  return value?.map((v, k, x) =>
    c.get(v) || (c.set(v, x = <Item {...{ key: v, v, k, f }} />), x)
  ) ?? fallback
}

export function Show({ when, fallback, children: f }) {
  let v = when.value
  return v ? typeof f === "function" ? <Item v={v} f={f} /> : f : fallback
}

Signal.prototype.map = function (fn) {
  return <For each={this} children={fn} />
}
