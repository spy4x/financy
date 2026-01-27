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
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://fn-api:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://fn-api:8000",
        ws: true,
      },
    },
    watch: {
      ignored: ["!../../libs/client/**", "!../../libs/shared/**"],
    },
  },
})
