import { defineConfig } from "vite"
import deno from "@deno/vite-plugin"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [deno(), tailwindcss(), svelte()],
  server: {
    host: "0.0.0.0",
  },
})
