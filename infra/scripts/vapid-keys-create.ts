const command = "deno run https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts > infra/configs/vapid.json"

const process = Deno.run({
  cmd: command.split(" "),
  stdout: "piped",
  stderr: "piped",
})
const { code } = await process.status()
if (code === 0) {
    const output = new TextDecoder().decode(await process.output())
    console.log("VAPID keys generated successfully:", output)
    }
else {
    const error = new TextDecoder().decode(await process.stderrOutput())
    console.error("Error generating VAPID keys:", error)
    }
         