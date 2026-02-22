import { promises as fs } from "fs";
import path from "path";
import { BotConfig, BotLog, BotMeeting, BotState } from "./types";

const BOT_STATE_DIR = path.join(process.cwd(), "data");
const BOT_STATE_PATH = path.join(BOT_STATE_DIR, "bot-state.json");

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
    logs: [],
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

function parseWithDefaults(raw: string): BotState {
  const parsed = JSON.parse(raw) as Partial<BotState>;
  return {
    ...defaultState(),
    ...parsed,
    config: {
      ...defaultConfig(),
      ...(parsed.config ?? {}),
    },
    logs: parsed.logs ?? [],
    botMeetings: parsed.botMeetings ?? [],
    weeklyCounters: parsed.weeklyCounters ?? {},
  };
}

export async function readBotState(): Promise<BotState> {
  await ensureStateFile();
  const raw = await fs.readFile(BOT_STATE_PATH, "utf-8");
  try {
    return parseWithDefaults(raw);
  } catch {
    const state = defaultState();
    await writeBotState(state);
    return state;
  }
}

export async function writeBotState(state: BotState): Promise<void> {
  await ensureDataDir();
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(BOT_STATE_PATH, payload, "utf-8");
}

export function appendLog(state: BotState, log: Omit<BotLog, "id" | "ts">): BotState {
  const newLog: BotLog = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...log,
  };
  const logs = [newLog, ...state.logs].slice(0, 300);
  return { ...state, logs };
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
