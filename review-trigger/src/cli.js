import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewPrompt,
  isTriggerReady,
  loadState,
  maxReviewCycleForHead,
  markAttemptError,
  markConfirmed,
  markSubmitted,
  observePullRequest,
  saveState,
  selectReviewScope,
  stateKey,
  validateCustomGptUrl,
  validateReviewScope,
  validateRepository,
} from "./core.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

function parseArguments(argv) {
  const command = argv[0] ?? "";
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const name = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[name] = true;
    } else {
      values[name] = next;
      index += 1;
    }
  }
  return { command, values };
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function resolveGhExecutable() {
  if (process.platform !== "win32") return "gh";
  const candidates = [
    process.env.GH_EXECUTABLE_PATH,
    "C:\\Program Files\\GitHub CLI\\gh.exe",
    "C:\\Program Files (x86)\\GitHub CLI\\gh.exe",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "GitHub CLI", "gh.exe") : null,
    "gh.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === "gh.exe" || existsSync(candidate)) ?? "gh.exe";
}

function getPullRequestMetadata(repository, prNumber) {
  const executable = resolveGhExecutable();
  let raw;
  try {
    raw = execFileSync(
      executable,
      ["pr", "view", String(prNumber), "--repo", repository, "--json", "number,headRefOid,headRefName,state,isDraft,url"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    throw new Error(`Could not read PR #${prNumber} with gh.${stderr ? ` ${stderr}` : ""}`);
  }
  const parsed = JSON.parse(raw);
  if (parsed.state !== "OPEN") throw new Error(`PR #${prNumber} is not open`);
  return {
    repository,
    prNumber: Number(parsed.number),
    headSha: parsed.headRefOid,
    headRef: parsed.headRefName,
    isDraft: Boolean(parsed.isDraft),
    url: parsed.url,
  };
}

function resolveChromeExecutable() {
  if (process.platform !== "win32") return process.env.CHATGPT_CHROME_EXECUTABLE_PATH?.trim() || "google-chrome";
  const candidates = [
    process.env.CHATGPT_CHROME_EXECUTABLE_PATH,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error("Chrome executable was not found.");
  return executable;
}

function resolveRuntimeDirectory(values) {
  const configured = values["runtime-dir"] ?? process.env.METHEORY_REVIEW_RUNTIME_DIR;
  return path.resolve(configured?.trim() || path.join(process.env.LOCALAPPDATA || repositoryRoot, "MeTheory", "review-loop"));
}

function resolveProfileDirectory(values, runtimeDirectory) {
  if (values["profile-dir"]) return path.resolve(values["profile-dir"]);
  const legacyProfile = path.join(repositoryRoot, ".ai", "chatgpt-profile");
  const defaultProfile = path.join(runtimeDirectory, "chatgpt-profile");
  return existsSync(legacyProfile) && !existsSync(defaultProfile) ? legacyProfile : defaultProfile;
}

async function launchPersistentBrowser(profileDirectory) {
  let playwright;
  try {
    playwright = await import("playwright-core");
  } catch {
    throw new Error("playwright-core is not installed. Run npm --prefix review-trigger install.");
  }

  mkdirSync(profileDirectory, { recursive: true });
  const options = {
    headless: false,
    viewport: null,
    chromiumSandbox: process.env.CHATGPT_BROWSER_SANDBOX !== "false",
    args: ["--start-maximized"],
  };
  const executablePath = process.env.CHATGPT_BROWSER_EXECUTABLE_PATH?.trim();
  if (executablePath) {
    return playwright.chromium.launchPersistentContext(profileDirectory, { ...options, executablePath });
  }

  const requested = process.env.CHATGPT_BROWSER_CHANNEL?.trim();
  const channels = [...new Set([requested, "chrome", "msedge"].filter(Boolean))];
  const errors = [];
  for (const channel of channels) {
    try {
      return await playwright.chromium.launchPersistentContext(profileDirectory, { ...options, channel });
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
    }
  }
  throw new Error(`Could not start Chrome or Edge. ${errors.join(" | ")}`);
}

async function findComposer(page, timeoutMs) {
  const selectors = [
    "#prompt-textarea",
    'textarea[data-testid="prompt-textarea"]',
    '[data-testid="prompt-textarea"][contenteditable="true"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="メッセージ"]',
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && await locator.isVisible().catch(() => false)) return locator;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("ChatGPT message composer was not found. Run setup and sign in, or update the selectors.");
}

async function submitPrompt(page, prompt) {
  const composer = await findComposer(page, 60_000);
  await composer.click();
  await composer.fill(prompt);

  const sendSelectors = [
    '[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="送信"]',
  ];
  for (const selector of sendSelectors) {
    const button = page.locator(selector).first();
    if ((await button.count()) > 0 && await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.click();
      return;
    }
  }
  await composer.press("Enter");
}

function validateBridgeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "metheory-review-bridge.jinghaodao-tech.workers.dev") {
    throw new Error("bridge URL must be the deployed MeTheory Review Bridge HTTPS URL");
  }
  return url.toString();
}

async function fetchLatestInstruction(bridgeUrl, token, repository, prNumber, status) {
  const url = new URL("/api/review-instructions/latest", bridgeUrl);
  url.searchParams.set("repository", repository);
  url.searchParams.set("prNumber", String(prNumber));
  url.searchParams.set("status", status);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Review Bridge returned HTTP ${response.status}`);
  return response.json();
}

async function findReviewState({ bridgeUrl, token, repository, prNumber, headSha, reviewScope }) {
  let matchingInstruction = null;
  const instructions = [];
  for (const status of ["pending", "claimed", "completed", "failed", "stale"]) {
    const instruction = await fetchLatestInstruction(bridgeUrl, token, repository, prNumber, status);
    if (instruction) instructions.push(instruction);
    if (instruction?.headSha === headSha &&
        (instruction.reviewScope ?? "pr") === (reviewScope ?? "pr") &&
        ["pending", "claimed", "completed"].includes(instruction.status)) matchingInstruction = instruction;
  }
  return {
    matchingInstruction,
    maxReviewCycle: maxReviewCycleForHead(instructions, headSha, reviewScope ?? "pr"),
  };
}

async function waitForSavedReview({ bridgeUrl, token, repository, prNumber, headSha, reviewScope, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { matchingInstruction } = await findReviewState({ bridgeUrl, token, repository, prNumber, headSha, reviewScope });
    if (matchingInstruction && matchingInstruction.status !== "stale") return matchingInstruction;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

function acquireLock(lockPath) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    return openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Another ChatGPT review trigger is already running.");
    throw error;
  }
}

async function runSetup(values) {
  const customGptUrl = validateCustomGptUrl(values["custom-gpt-url"] ?? process.env.CHATGPT_REVIEW_GPT_URL ?? "");
  const runtimeDirectory = resolveRuntimeDirectory(values);
  const profileDirectory = resolveProfileDirectory(values, runtimeDirectory);
  mkdirSync(profileDirectory, { recursive: true });
  const chrome = resolveChromeExecutable();
  console.log("A normal Chrome window will open for login. Sign in to ChatGPT, open the custom GPT, then close that window before starting the watcher.");
  const child = spawn(chrome, [`--user-data-dir=${profileDirectory}`, "--profile-directory=Default", "--new-window", customGptUrl], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log("Normal Chrome was launched without Playwright automation flags.");
}

async function runTrigger(values) {
  const repository = validateRepository(values.repository ?? "");
  const prNumber = positiveInteger(values["pr-number"], undefined, "pr-number");
  const customGptUrl = validateCustomGptUrl(values["custom-gpt-url"] ?? process.env.CHATGPT_REVIEW_GPT_URL ?? "");
  const bridgeUrl = validateBridgeUrl(values["bridge-url"] ?? "");
  const token = process.env.REVIEW_BRIDGE_TOKEN?.trim();
  if (!token) throw new Error("REVIEW_BRIDGE_TOKEN is not configured.");
  const reviewScope = validateReviewScope(values["review-scope"] ?? "pr");
  const forceReview = values.force === true;

  const debounceSeconds = positiveInteger(values["debounce-seconds"], 90, "debounce-seconds");
  const retryCooldownSeconds = positiveInteger(values["retry-cooldown-seconds"], 1800, "retry-cooldown-seconds");
  const resultTimeoutSeconds = positiveInteger(values["result-timeout-seconds"], 600, "result-timeout-seconds");
  const runtimeDirectory = resolveRuntimeDirectory(values);
  const profileDirectory = resolveProfileDirectory(values, runtimeDirectory);
  const statePath = path.resolve(values["state-file"] ?? path.join(runtimeDirectory, "review-trigger-state.json"));
  const lockPath = path.resolve(values["lock-file"] ?? path.join(runtimeDirectory, "review-trigger.lock"));
  const lockFd = acquireLock(lockPath);

  try {
    const metadata = getPullRequestMetadata(repository, prNumber);
    const state = await loadState(statePath);
    const now = new Date();
    const entry = observePullRequest(state, metadata, now.toISOString());
    if (!forceReview && reviewScope === "repository" && entry.fullRepositoryReviewCompletedSha === metadata.headSha) {
      console.log(`Full repository review already completed for ${metadata.headSha}.`);
      await saveState(statePath, state);
      return;
    }
    const effectiveReviewScope = selectReviewScope(reviewScope, entry.fullRepositoryReviewCompletedSha, metadata.headSha);
    const bridgeState = await findReviewState({ bridgeUrl, token, repository, prNumber, headSha: metadata.headSha, reviewScope: effectiveReviewScope });
    const matchingInstruction = bridgeState.matchingInstruction;
    if (!forceReview && matchingInstruction && matchingInstruction.status !== "stale") {
      markConfirmed(entry, metadata.headSha, now.toISOString());
      if (effectiveReviewScope === "repository") entry.fullRepositoryReviewCompletedSha = metadata.headSha;
      await saveState(statePath, state);
      console.log(`Review Bridge already contains ${matchingInstruction.result} for ${metadata.headSha}.`);
      return;
    }
    await saveState(statePath, state);

    if (!forceReview && !isTriggerReady(entry, now.getTime(), debounceSeconds * 1000, retryCooldownSeconds * 1000)) {
      if (entry.lastConfirmedSha === metadata.headSha) {
        console.log(`Review already confirmed for ${metadata.headSha}.`);
      } else {
        console.log(`Review trigger is waiting for debounce or retry cooldown for ${metadata.headSha}.`);
      }
      return;
    }

    if (forceReview) console.log(`Forcing a new ChatGPT review cycle for ${metadata.headSha}.`);
    const reviewCycle = bridgeState.maxReviewCycle + 1;
    if (reviewCycle > 2) throw new Error("Review Bridge cycle limit exceeded; human review is required.");
    const prompt = buildReviewPrompt({ ...metadata, reviewCycle, reviewScope: effectiveReviewScope, ref: metadata.headRef });
    const context = await launchPersistentBrowser(profileDirectory);
    try {
      const pages = context.pages();
      const page = pages[0] ?? await context.newPage();
      await page.goto(customGptUrl, { waitUntil: "domcontentloaded" });
      await submitPrompt(page, prompt);
      markSubmitted(entry, metadata.headSha, new Date().toISOString());
      await saveState(statePath, state);
      console.log(`Submitted ChatGPT review request for PR #${prNumber} at ${metadata.headSha}.`);

      const instruction = await waitForSavedReview({
        bridgeUrl,
        token,
        repository,
        prNumber,
        headSha: metadata.headSha,
        reviewScope: effectiveReviewScope,
        timeoutMs: resultTimeoutSeconds * 1000,
      });
      if (!instruction) {
        throw new Error("Timed out waiting for the custom GPT to save a Review Bridge result. Check the browser for login or Action approval.");
      }
      markConfirmed(entry, metadata.headSha, new Date().toISOString());
      if (effectiveReviewScope === "repository") entry.fullRepositoryReviewCompletedSha = metadata.headSha;
      await saveState(statePath, state);
      console.log(`Review Bridge saved ${instruction.result} for ${metadata.headSha}.`);
    } catch (error) {
      markAttemptError(entry, error.message, new Date().toISOString());
      await saveState(statePath, state);
      throw error;
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    closeSync(lockFd);
    if (existsSync(lockPath)) rmSync(lockPath, { force: true });
  }
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (command === "setup") return runSetup(values);
  if (command === "trigger") return runTrigger(values);
  throw new Error("Usage: node src/cli.js setup|trigger [options]");
}

main().catch((error) => {
  console.error(`ChatGPT review trigger failed: ${error.message}`);
  process.exitCode = 1;
});
