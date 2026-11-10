import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { App } from "@spy4x/preact-server"
import { handler } from "./routes/blog/og/[file].ts"
import type { State } from "./utils.ts"

const info = {
  remoteAddr: { transport: "tcp", hostname: "192.0.2.7", port: 4000 },
  completed: Promise.resolve(),
} as Deno.ServeHandlerInfo<Deno.NetAddr>

const serve = new App<State>().get("/blog/og/:file", handler.GET!).handler()
const get = (name: string) => serve(new Request(`https://www.example.com/blog/og/${name}`), info)

// Financy's posts are written in the admin app and have no card file, so the folder holds none.
describe("the blog's link-preview card files (#733)", () => {
  it("answers 404 for a name it does not hold, and for one that climbs out of the folder", async () => {
    for (
      const name of [`no-such-post.jpg`, `README.jpg`, `..%2FREADME.md`, `..%2F..%2Fseed-posts.ts`]
    ) {
      const response = await get(name)
      expect(response.status).toBe(404)
      await response.body?.cancel()
    }
  })
})
