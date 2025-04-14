import { exec } from "https://deno.land/x/exec/mod.ts";
import { ensureDir, emptyDir } from "https://deno.land/std/fs/mod.ts";
import { gzip } from "https://deno.land/x/compress/mod.ts";

async function notifySlack(message: string) {
    const response = await fetch(Deno.env.get("SLACK_SYSTEM_URL")!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
    });

    if (response.ok) {
        console.log(`📣 Slack notified about "${message}"`);
    } else {
        console.error("❌ Slack notification failed");
    }
}

function getReportText(
    backupTime: number,
    backupSize: string,
    compressionTime: number,
    compressedSize: string,
    uploadTime: number,
    totalTime: number,
): string {
    return `Backup: ${backupTime} sec (${backupSize})
Compression: ${compressionTime} sec (${compressedSize})
Upload: ${uploadTime} sec
Total: ${totalTime} sec`;
}

async function main() {
    const envFile = Deno.args[0];
    if (!envFile) {
        console.error("❌ Environment file not provided. Usage: deno run --allow-all db-backup-create.ts path/to/envfile");
        Deno.exit(1);
    }

    const env = await Deno.readTextFile(envFile);
    const envVars = Object.fromEntries(env.split("\n").map(line => line.split("=").map(part => part.trim())));
    Object.entries(envVars).forEach(([key, value]) => Deno.env.set(key, value));

    const date = new Date().toISOString().replace(/[:.]/g, "_");
    const project = Deno.env.get("PROJECT")!;
    const dbName = Deno.env.get("DB_NAME")!;
    const dbUser = Deno.env.get("DB_USER")!;
    const dbPass = Deno.env.get("DB_PASS")!;
    const backupDbContainer = `${project}-db`;
    const backupFolder = `/tmp/${project}-db-backups`;
    const backupNameUnzipped = `${dbName}-${date}.sql`;
    const backupPathUnzipped = `${backupFolder}/${backupNameUnzipped}`;
    const backupName = `${backupNameUnzipped}.gz`;
    const backupPath = `${backupFolder}/${backupName}`;
    const s3BucketFolder = Deno.env.get("S3_BUCKET_BACKUPS_DB_FOLDER")!;
    const s3BucketName = Deno.env.get("S3_BUCKET_BACKUPS_NAME")!;
    const s3Endpoint = Deno.env.get("S3_BUCKET_BACKUPS_ENDPOINT")!;
    const s3Region = Deno.env.get("S3_BUCKET_BACKUPS_REGION")!;
    const s3AccessKey = Deno.env.get("S3_BUCKET_BACKUPS_ACCESS_KEY_ID")!;
    const s3SecretKey = Deno.env.get("S3_BUCKET_BACKUPS_SECRET_ACCESS_KEY")!;

    await notifySlack("🔧 DB backup initiated.\nA successful message must appear shortly.");

    await emptyDir(backupFolder);
    await ensureDir(backupFolder);

    console.log(`⚡ Generating backup [${dbUser}@${backupDbContainer}:${dbName}]`);
    const backupStartTime = Date.now();
    const backupCommand = [
        "docker", "exec", "-i",
        "-e", `PGPASSWORD=${dbPass}`,
        backupDbContainer, "pg_dump",
        "-h", backupDbContainer,
        "-U", dbUser,
        dbName,
    ];
    const backupProcess = exec(backupCommand.join(" "), { output: "piped" });
    const backupFile = await Deno.open(backupPathUnzipped, { write: true, create: true });
    await backupProcess.stdout.pipeTo(backupFile.writable);
    const backupTime = (Date.now() - backupStartTime) / 1000;

    const backupStats = await Deno.stat(backupPathUnzipped);
    const backupSize = `${(backupStats.size / 1024 / 1024).toFixed(2)} MB`;

    console.log(`📦 Backup generated. Took ${backupTime} seconds. Size: ${backupSize}`);
    console.log("🔒 Compressing backup");

    const compressionStartTime = Date.now();
    const compressedData = await gzip(new Uint8Array(await Deno.readFile(backupPathUnzipped)));
    await Deno.writeFile(backupPath, compressedData);
    const compressionTime = (Date.now() - compressionStartTime) / 1000;

    const compressedStats = await Deno.stat(backupPath);
    const compressedSize = `${(compressedStats.size / 1024 / 1024).toFixed(2)} MB`;

    console.log(`🔒 Compressed. Took ${compressionTime} seconds. Size: ${compressedSize}`);

    console.log(`🚀 Uploading [${s3Endpoint}/${s3BucketName}/${s3BucketFolder}]`);
    const uploadStartTime = Date.now();
    const uploadCommand = [
        "docker", "run", "--rm",
        "-v", `${backupFolder}:${backupFolder}`,
        "-e", `AWS_ACCESS_KEY_ID=${s3AccessKey}`,
        "-e", `AWS_SECRET_ACCESS_KEY=${s3SecretKey}`,
        "-e", `AWS_DEFAULT_REGION=${s3Region}`,
        "-e", `AWS_ENDPOINT_URL=${s3Endpoint}`,
        "amazon/aws-cli", "s3", "cp", backupPath,
        `s3://${s3BucketName}/${s3BucketFolder}/${backupName}`,
        "--region", s3Region,
    ];
    const uploadProcess = await exec(uploadCommand.join(" "));
    const uploadTime = (Date.now() - uploadStartTime) / 1000;

    if (uploadProcess.status.success) {
        console.log(`✅ Uploaded. Took ${uploadTime} seconds`);
    } else {
        console.error(`❌ Upload failed after ${uploadTime} seconds`);
        await notifySlack(`🔧❌ <!channel> DB backup upload failed\n${getReportText(backupTime, backupSize, compressionTime, compressedSize, uploadTime, backupTime + compressionTime + uploadTime)}`);
        Deno.exit(1);
    }

    await emptyDir(backupFolder);

    const totalTime = backupTime + compressionTime + uploadTime;
    await notifySlack(`🔧✅ DB backup successful.\n<${Deno.env.get("S3_BACKUP_BACKUPS_DASHBOARD_URL")}|${backupName}>\n${getReportText(backupTime, backupSize, compressionTime, compressedSize, uploadTime, totalTime)}`);
}

await main();
