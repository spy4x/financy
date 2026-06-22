// deno-lint-ignore-file no-process-globals
const KEY = ".age/key.txt";
const FILES = [
  ["infra/envs/.env", "infra/envs/.env.age"],
  ["infra/envs/.env.prod", "infra/envs/.env.prod.age"],
];

if (!existsSync(KEY)) {
  console.error(`Missing age key: ${KEY} — copy from another project or run age-keygen`);
  Deno.exit(1);
}

for (const [src, dst] of FILES) {
  if (!existsSync(src)) {
    console.warn(`Skipping ${src} — not found`);
    continue;
  }
  const cmd = new Deno.Command("sops", {
    args: [
      "--encrypt",
      "--input-type", "dotenv",
      "--output-type", "dotenv",
      src,
    ],
    env: { SOPS_AGE_KEY_FILE: KEY },
  });
  const { stdout, stderr, code } = await cmd.output();
  if (code !== 0) {
    console.error(`Failed to encrypt ${src}:`, new TextDecoder().decode(stderr));
    Deno.exit(1);
  }
  Deno.writeFileSync(dst, stdout);
  console.log(`Encrypted ${src} → ${dst}`);
}

function existsSync(p: string): boolean {
  try { Deno.statSync(p); return true; } catch { return false; }
}
