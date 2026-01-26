const envFilePath = `./infra/envs/.env`;
const env = await Deno.readTextFile(envFilePath);
const envVars = Object.fromEntries(
  env.split("\n").map((line) => line.split("=").map((part) => part.trim())),
);
const envName = envVars["ENV"];

const args = Deno.args;
const composeFile = `./infra/compose/compose.${envName}.yml`;
const sharedComposeFile = `./infra/compose/compose.shared.yml`;
const containerProvider: 'docker' | 'podman' = envVars["CONTAINER_PROVIDER"] === "docker" ? "docker" : "podman";

// Build base image first if we're doing "up" or "build"
const needsBaseImage = args.includes("up") || args.includes("build");
if (needsBaseImage) {
  console.log("Building base Deno image first...");
  const buildBaseCommand = [
    "compose",
    "-f",
    sharedComposeFile,
    "-f",
    composeFile,
    "--env-file",
    envFilePath,
    "build",
    "deno-base",
  ];
  const buildProcess = new Deno.Command(containerProvider, {
    args: buildBaseCommand,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code: buildCode } = await buildProcess.output();
  if (buildCode !== 0) {
    console.error("Error building base image");
    Deno.exit(buildCode);
  }
  console.log("Base image built successfully");
}

const composeCommand = [
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
const process = new Deno.Command(containerProvider, {
  args: composeCommand,
  stdout: "inherit",
  stderr: "inherit",
});
const { code } = await process.output();
if (code === 0) {
  console.log("Compose command executed successfully");
} else {
  console.error("Error executing compose command");
  Deno.exit(code);
}
