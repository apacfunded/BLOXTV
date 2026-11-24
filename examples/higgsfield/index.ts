// Seedance 2.5 text-to-video with the official Higgsfield SDK.
//
// Run from the project root:   npm run example:seedance
// Credentials: HF_CREDENTIALS="key-id:key-secret" in .env.local (git-ignored) or in the environment.
// This makes one billable generation request.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  config,
  higgsfield,
  AuthenticationError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  ValidationError,
  BadInputError,
  TimeoutError,
  APIError,
} from "@higgsfield/client/v2";

// Load .env.local without printing anything from it. Values already in the environment win.
const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS is not set. Add HF_CREDENTIALS=key-id:key-secret to .env.local and run again.");
  process.exit(1);
}

config({
  credentials: process.env.HF_CREDENTIALS,
  // Seedance can take several minutes; the SDK default stops polling at 5.
  maxPollTime: 15 * 60_000,
  pollInterval: 3000,
});

const MODEL = "bytedance/seedance-2.5/text-to-video";
const input = {
  prompt: "A cinematic scene at sunset",
  duration: 5,
  resolution: "720p",
  aspect_ratio: "16:9",
};

async function main(): Promise<number> {
  console.log(`Submitting ${MODEL} (${input.duration}s, ${input.resolution}, ${input.aspect_ratio})…`);
  const started = Date.now();
  const result = await higgsfield.subscribe(MODEL, { input, withPolling: true });
  const secs = Math.round((Date.now() - started) / 1000);
  // The SDK types list completed | failed | nsfw | queued | in_progress; canceled comes from the API docs.
  const status = String(result.status);

  if (status === "completed" && result.video?.url) {
    console.log(`Completed in ${secs}s. Request ${result.request_id}`);
    console.log(`Video URL: ${result.video.url}`);
    return 0;
  }
  if (status === "completed") {
    console.error(`Request ${result.request_id} completed but returned no video URL.`);
    return 2;
  }
  if (status === "nsfw") {
    console.error(`Request ${result.request_id} was rejected by content moderation. No video was produced.`);
    return 3;
  }
  if (status === "failed") {
    const error = (result as { error?: string }).error;
    console.error(`Request ${result.request_id} failed${error ? `: ${error}` : ""}. No video was produced.`);
    return 4;
  }
  if (status === "canceled") {
    console.error(`Request ${result.request_id} was canceled. No video was produced.`);
    return 5;
  }
  console.error(`Request ${result.request_id} ended in an unexpected state: ${status}.`);
  return 6;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof CredentialsMissedError || err instanceof AuthenticationError) {
      console.error("Higgsfield rejected the credentials. Check HF_CREDENTIALS in .env.local (key-id:key-secret).");
    } else if (err instanceof NotEnoughCreditsError) {
      console.error("Not enough API credits (HTTP 403). Add a balance in Higgsfield Console.");
    } else if (err instanceof ValidationError || err instanceof BadInputError) {
      console.error("The request parameters were rejected:", JSON.stringify(err.details ?? err.message));
    } else if (err instanceof TimeoutError) {
      console.error("Gave up waiting for the result. The request may still finish; check it in Higgsfield Console.");
    } else if (err instanceof APIError) {
      console.error(`Higgsfield API error ${err.statusCode ?? ""}: ${err.message}`);
    } else {
      console.error("Request did not complete:", err?.message ?? err);
    }
    process.exit(1);
  });
