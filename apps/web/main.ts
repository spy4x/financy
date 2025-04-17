import "./app.css"
import { mount } from "svelte"
import App from "./app.svelte"
import { initWebSocket } from "./services/websocket.ts"
initWebSocket()

const app = mount(App, {
  target: document.getElementById("app")!,
})

export default app
