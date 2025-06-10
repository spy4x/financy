const envFilePath = `./infra/envs/.env`;
const env = await Deno.readTextFile(envFilePath);
const envVars = Object.fromEntries(
  env.split("\n").map((line) => line.split("=").map((part) => part.trim())),
);
const envName = envVars["ENV"];

const args = Deno.args;
const composeFile = `./infra/compose/compose.${envName}.yml`;
const sharedComposeFile = `./infra/compose/compose.shared.yml`;
const composeCommand = [
  "docker",
  "compose",
  "-f",
  sharedComposeFile,
  "-f",
  composeFile,
  "--env-file",
  envFilePath,
  ...args, 
];
console.log("Compose command:", composeCommand.join(" "));
const process = Deno.run({
    cmd: composeCommand,
    stdout: "inherit",
    stderr: "inherit",
});
const { code } = await process.status();
if (code === 0) {
//   const output = new TextDecoder().decode(await process.output());
  console.log("Compose command executed successfully"/*, output*/);
}
else {
    // const error = new TextDecoder().decode(await process.stderrOutput());
    console.error("Error executing compose command"/*, error*/);
    }
