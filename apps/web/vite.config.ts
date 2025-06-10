import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import preact from "@preact/preset-vite"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    deno(),
    preact(),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
  },
})
