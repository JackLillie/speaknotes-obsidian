import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME, R2_PUBLIC_URL_BASE } =
	process.env;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
	console.error("Missing R2 environment variables. Required:");
	console.error("  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME");
	process.exit(1);
}

const client = new S3Client({
	region: "auto",
	endpoint: R2_ENDPOINT,
	credentials: {
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
	},
});

const zipPath = "speaknotes-obsidian.zip";
const key = "plugins/obsidian/speaknotes-obsidian.zip";

try {
	console.log("Uploading to R2...");
	console.log(`  Endpoint: ${R2_ENDPOINT}`);
	console.log(`  Bucket: ${R2_BUCKET_NAME}`);
	console.log(`  Key: ${key}`);

	const fileBuffer = readFileSync(zipPath);

	await client.send(
		new PutObjectCommand({
			Bucket: R2_BUCKET_NAME,
			Key: key,
			Body: fileBuffer,
			ContentType: "application/zip",
		})
	);

	const publicUrl = R2_PUBLIC_URL_BASE
		? `${R2_PUBLIC_URL_BASE}/${key}`
		: `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;

	console.log("✓ Published to R2");
	console.log(`  URL: ${publicUrl}`);
} catch (error) {
	console.error("Failed to publish:", error.message);
	if (error.Code) console.error("  Error code:", error.Code);
	if (error.$metadata) console.error("  HTTP status:", error.$metadata.httpStatusCode);
	process.exit(1);
}
