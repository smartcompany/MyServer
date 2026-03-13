import { promises as fs } from "fs";
import path from "path";
import { BotConfig, BotLog, BotState } from "./types";

const BOT_STATE_DIR = path.join(process.cwd(), "data");
const BOT_LOGS_PATH = path.join(BOT_STATE_DIR, "bot-logs.json");

const MAX_LOGS = 300;

async function ensureDataDir() {
  await fs.mkdir(BOT_STATE_DIR, { recursive: true });
}

function defaultConfig(): BotConfig {
  return {
    creatorRatio: 1,
    applicationsPerRunPerBot: 2,
    applyOnlyToBotMeetings: true,
    updatedAt: new Date().toISOString(),
  };
}

const inMemoryState: BotState = {
  config: defaultConfig(),
};

export async function readBotState(): Promise<BotState> {
  return inMemoryState;
}

export async function writeBotState(state: BotState): Promise<void> {
  inMemoryState.config = { ...state.config };
}

async function readBotLogsRaw(): Promise<BotLog[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(BOT_LOGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { logs?: BotLog[] };
    return Array.isArray(parsed.logs) ? parsed.logs : [];
  } catch {
    return [];
  }
}

export async function readBotLogs(): Promise<BotLog[]> {
  return readBotLogsRaw();
}

export async function appendLog(log: Omit<BotLog, "id" | "ts">): Promise<void> {
  const newLog: BotLog = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...log,
  };
  const logs = [newLog, ...(await readBotLogsRaw())].slice(0, MAX_LOGS);
  await ensureDataDir();
  await fs.writeFile(BOT_LOGS_PATH, JSON.stringify({ logs }, null, 2), "utf-8");
  const prefix = `[${newLog.ts}] [letsmeet] [${newLog.level.toUpperCase()}]`;
  console.log(prefix, newLog.message);
}

export async function clearBotLogs(): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(BOT_LOGS_PATH, JSON.stringify({ logs: [] }, null, 2), "utf-8");
}

export function toBotStateApiError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { status: 500, error: message };
}
