import { promises as fs } from "fs";
import path from "path";
import { BotConfig, BotLog, BotMeeting, BotState } from "./types";

const BOT_STATE_DIR = path.join(process.cwd(), "data");
const BOT_STATE_PATH = path.join(BOT_STATE_DIR, "bot-state.json");
const BOT_LOGS_PATH = path.join(BOT_STATE_DIR, "bot-logs.json");

const MAX_LOGS = 300;

async function ensureDataDir() {
  await fs.mkdir(BOT_STATE_DIR, { recursive: true });
}

function defaultConfig(): BotConfig {
  return {
    selectedBotUids: [],
    meetingsPerWeekPerBot: 2,
    creatorRatio: 0.4,
    applicationsPerRunPerBot: 2,
    applyOnlyToBotMeetings: true,
    isRunning: false,
    runNow: false,
    updatedAt: new Date().toISOString(),
  };
}

function defaultState(): BotState {
  return {
    config: defaultConfig(),
    botMeetings: [],
    weeklyCounters: {},
  };
}

export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function ensureStateFile() {
  await ensureDataDir();
  try {
    await fs.access(BOT_STATE_PATH);
  } catch {
    await writeBotState(defaultState());
  }
}

function parseStateWithDefaults(raw: string): BotState {
  const parsed = JSON.parse(raw) as Partial<BotState>;
  return {
    ...defaultState(),
    ...parsed,
    config: {
      ...defaultConfig(),
      ...(parsed.config ?? {}),
    },
    botMeetings: parsed.botMeetings ?? [],
    weeklyCounters: parsed.weeklyCounters ?? {},
  };
}

export async function readBotState(): Promise<BotState> {
  await ensureStateFile();
  const raw = await fs.readFile(BOT_STATE_PATH, "utf-8");
  try {
    return parseStateWithDefaults(raw);
  } catch {
    const state = defaultState();
    await writeBotState(state);
    return state;
  }
}

export async function writeBotState(state: Omit<BotState, "logs">): Promise<void> {
  await ensureDataDir();
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(BOT_STATE_PATH, payload, "utf-8");
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

export function addMeeting(
  state: BotState,
  meeting: Omit<BotMeeting, "id" | "createdAt"> & { id?: string; createdAt?: string }
): BotState {
  const item: BotMeeting = {
    id: meeting.id ?? crypto.randomUUID(),
    createdAt: meeting.createdAt ?? new Date().toISOString(),
    ...meeting,
  };
  return {
    ...state,
    botMeetings: [item, ...state.botMeetings].slice(0, 1000),
  };
}

export function toBotStateApiError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { status: 500, error: message };
}
