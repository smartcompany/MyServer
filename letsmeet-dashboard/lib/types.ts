export type DashboardUser = {
  uid: string;
  email: string | null;
  loginProvider: string | null;
  firebaseDisplayName: string | null;
  profileName: string | null;
  trustScore: number | null;
  isActive: boolean | null;
  isBot: boolean;
};

export type BotConfig = {
  creatorRatio: number; // 0.0 ~ 1.0
  applicationsPerRunPerBot: number;
  applyOnlyToBotMeetings: boolean;
  updatedAt: string;
};

export type BotLog = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type BotState = {
  config: BotConfig;
};
