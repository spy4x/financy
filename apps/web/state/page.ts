import { signal } from "@preact/signals"

const url = signal<URL>(new URL("http://localhost:3000/"))

export const page = {
  url,
  setURL: (newURL: URL) => {
    url.value = newURL
  },
}
