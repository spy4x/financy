// Deploy script for production, similar to the previous justfile logic
// Usage: deno run -R=./infra --allow-run=rsync,ssh ./infra/scripts/deploy.ts

import { error, log, success } from "./+lib.ts";

const envFilePath = `./infra/envs/.env.prod`;
let env: string;
try {
  env = await Deno.readTextFile(envFilePath);
} catch (err) {
  if (err instanceof Deno.errors.NotFound) {
    error(`Env file not found: ${envFilePath}`);
    Deno.exit(1);
  } else {
    throw err;
  }
}
const envVars = Object.fromEntries(
  env.split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => line.split("=").map((part) => part.trim())),
);

const SSH_TO_SERVER = envVars["SSH_TO_SERVER"];
const PATH_ON_SERVER = envVars["PATH_ON_SERVER"];

if (!SSH_TO_SERVER || !PATH_ON_SERVER) {
  error(`SSH_TO_SERVER and PATH_ON_SERVER must be set in ${envFilePath}`);
  Deno.exit(1);
}

const rsyncArgs = [
  "-avhzru",
  "-e",
  "ssh",
  ".",
  `${SSH_TO_SERVER}:${PATH_ON_SERVER}`,
  "--exclude-from=infra/deploy/exclude.txt",
  "--include-from=infra/deploy/include.txt",
  "--include-from=infra/deploy/include.prod.txt",
  "--exclude",
  "*",
];

log("Running rsync...");
const rsync = Deno.run({
  cmd: ["rsync", ...rsyncArgs],
  stdout: "inherit",
  stderr: "inherit",
});
const rsyncStatus = await rsync.status();
if (rsyncStatus.code !== 0) {
  error("rsync failed");
  Deno.exit(rsyncStatus.code);
}

log("Running remote SSH deploy commands...");
const remoteCmd = `cd ${PATH_ON_SERVER} && mv ./infra/envs/.env.prod ./infra/envs/.env && source ~/.zshrc && deno task compose up -d`;

const ssh = Deno.run({
  cmd: ["ssh", SSH_TO_SERVER, remoteCmd],
  stdout: "inherit",
  stderr: "inherit",
});
const sshStatus = await ssh.status();
if (sshStatus.code !== 0) {
  error("Remote SSH command failed");
  Deno.exit(sshStatus.code);
}

success("Deploy completed successfully.");
