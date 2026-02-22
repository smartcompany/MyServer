export type DashboardUser = {
  uid: string;
  email: string | null;
  firebaseDisplayName: string | null;
  profileName: string | null;
  trustScore: number | null;
  isActive: boolean | null;
};

export type BotConfig = {
  selectedBotUids: string[];
  meetingsPerWeekPerBot: number;
  creatorRatio: number; // 0.0 ~ 1.0
  applicationsPerRunPerBot: number;
  applyOnlyToBotMeetings: boolean;
  isRunning: boolean;
  runNow?: boolean; // pm2 simulator: 즉시 1회 실행 트리거
  lastTickAt?: string; // ISO string, 마지막 tick 시각
  updatedAt: string;
};

export type BotMeeting = {
  id: string;
  hostUid: string;
  title: string;
  createdAt: string;
};

export type BotWeeklyCounter = {
  weekKey: string;
  createdMeetings: number;
};

export type BotLog = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type BotState = {
  config: BotConfig;
  logs: BotLog[];
  botMeetings: BotMeeting[];
  weeklyCounters: Record<string, BotWeeklyCounter>;
};
