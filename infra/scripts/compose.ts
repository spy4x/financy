/*
I had the next justfile:
```
set dotenv-load := true
set dotenv-path := "./infra/envs/.env"

compose params:
    docker compose -f "./infra/compose/compose.shared.yml" -f "./infra/compose/compose.${ENV}.yml" --env-file="./infra/envs/.env" {{params}}

start: web

web:
    just compose "up -d --build --force-recreate proxy db redis minio minio-configure api web"

dev:
    just compose "up -d --build --remove-orphans"

dev_down:
    just compose "down --remove-orphans"
```

Now I need to rewrite it to Deno typescript script.
*/

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
