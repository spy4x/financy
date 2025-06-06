import { type Config } from "tailwindcss"
import tailwindForms from "@tailwindcss/forms"

export default {
  content: [
    "{routes,islands,components}/**/*.{ts,tsx}",
    "../../libs/client/**/*.{ts,tsx}",
  ],
  plugins: [tailwindForms],
  theme: {
    extend: {
      brightness: {
        80: ".80",
        85: "0.85",
      },
      zIndex: {
        "100": "100",
        "1000": "1000",
        "5000": "5000",
      },
    },
  },
} satisfies Config
