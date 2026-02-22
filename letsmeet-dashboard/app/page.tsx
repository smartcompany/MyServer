"use client";

import { useEffect, useMemo, useState } from "react";
import { BotConfig, BotLog, DashboardUser } from "@/lib/types";

const BASE = "/letsmeet-dashboard";

type LogsResponse = { isRunning: boolean; logs: BotLog[]; botMeetingsCount: number };

const defaultConfig: BotConfig = {
  selectedBotUids: [],
  meetingsPerWeekPerBot: 2,
  creatorRatio: 0.4,
  applicationsPerRunPerBot: 2,
  applyOnlyToBotMeetings: true,
  isRunning: false,
  updatedAt: "",
};

export default function DashboardPage() {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [config, setConfig] = useState<BotConfig>(defaultConfig);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [botMeetingsCount, setBotMeetingsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [deletingMeetings, setDeletingMeetings] = useState(false);
  const [creatingUid, setCreatingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshLogsOnly() {
    try {
      const logsRes = await fetch(`${BASE}/api/bot-logs`, { cache: "no-store" });
      if (!logsRes.ok) return;
      const logsJson = (await logsRes.json()) as LogsResponse;
      setLogs(logsJson.logs);
      setBotMeetingsCount(logsJson.botMeetingsCount);
    } catch {
      // ignore refresh-only failures
    }
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, configRes, logsRes] = await Promise.all([
        fetch(`${BASE}/api/users`, { cache: "no-store" }),
        fetch(`${BASE}/api/bot-config`, { cache: "no-store" }),
        fetch(`${BASE}/api/bot-logs`, { cache: "no-store" }),
      ]);

      if (!usersRes.ok) throw new Error(`users API 실패: ${usersRes.status}`);
      if (!configRes.ok) throw new Error(`config API 실패: ${configRes.status}`);
      if (!logsRes.ok) throw new Error(`logs API 실패: ${logsRes.status}`);

      const usersJson = (await usersRes.json()) as { users: DashboardUser[] };
      const configJson = (await configRes.json()) as { config: BotConfig };
      const logsJson = (await logsRes.json()) as LogsResponse;

      setUsers(usersJson.users);
      setConfig(configJson.config);
      setLogs(logsJson.logs);
      setBotMeetingsCount(logsJson.botMeetingsCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!simulating) return;
    const intervalId = setInterval(() => {
      void refreshLogsOnly();
    }, 1000);
    return () => clearInterval(intervalId);
  }, [simulating]);

  const selectedUsers = useMemo(
    () => users.filter((u) => config.selectedBotUids.includes(u.uid)),
    [users, config.selectedBotUids]
  );

  const creatorPreviewCount = Math.max(
    selectedUsers.length > 0 ? 1 : 0,
    Math.round(selectedUsers.length * config.creatorRatio)
  );

  async function toggleBot(uid: string) {
    const exists = config.selectedBotUids.includes(uid);
    const nextSelectedBotUids = exists
      ? config.selectedBotUids.filter((id) => id !== uid)
      : [...config.selectedBotUids, uid];
    const nextConfig = { ...config, selectedBotUids: nextSelectedBotUids };

    setConfig(nextConfig);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/bot-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `봇 계정 선택 저장 실패: ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "봇 계정 선택 저장 오류");
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/bot-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`저장 실패: ${res.status}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정 저장 오류");
    } finally {
      setSaving(false);
    }
  }

  async function callControl(path: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}${path}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `요청 실패: ${res.status}`);
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 오류");
    } finally {
      setSaving(false);
    }
  }

  async function runSimulateOnce() {
    setSimulating(true);
    setSaving(true);
    setError(null);
    try {
      await refreshLogsOnly();
      const res = await fetch(`${BASE}/api/bot-control/trigger`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `요청 실패: ${res.status}`);
      }
      const body = (await res.json()) as { skipped?: boolean; reason?: string; triggered?: boolean };
      if (body.skipped && body.reason === "STOPPED") {
        setError("현재 상태가 STOPPED라서 1회 실행이 스킵되었습니다. 먼저 'AI 봇 진행 시작'을 눌러주세요.");
      }
      if (body.triggered) {
        setError(null);
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 오류");
      await refreshLogsOnly();
    } finally {
      setSimulating(false);
      setSaving(false);
    }
  }

  async function createMeetingByBot(uid: string, email: string | null) {
    setCreatingUid(uid);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/bot-control/create-meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `모임 생성 실패: ${res.status}`);
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "모임 생성 오류");
      await refreshLogsOnly();
    } finally {
      setCreatingUid(null);
      setSaving(false);
    }
  }

  async function clearLogs() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/bot-logs`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `로그 초기화 실패: ${res.status}`);
      }
      const body = (await res.json()) as { logs?: BotLog[]; botMeetingsCount?: number };
      setLogs(Array.isArray(body.logs) ? body.logs : []);
      if (typeof body.botMeetingsCount === "number") {
        setBotMeetingsCount(body.botMeetingsCount);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그 초기화 오류");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedBotMeetings() {
    if (config.selectedBotUids.length === 0) {
      setError("삭제할 봇 계정을 먼저 선택하세요.");
      return;
    }

    const ok = window.confirm(`선택된 봇 ${config.selectedBotUids.length}명의 모임을 모두 삭제할까요?`);
    if (!ok) return;

    setDeletingMeetings(true);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/bot-control/delete-meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids: config.selectedBotUids }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `모임 삭제 실패: ${res.status}`);
      }
      const body = (await res.json()) as { config?: BotConfig };
      if (body.config) {
        setConfig(body.config);
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "모임 삭제 오류");
      await refreshLogsOnly();
    } finally {
      setDeletingMeetings(false);
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <h1 style={{ margin: 0, fontSize: 28 }}>LetsMeet AI Bot Dashboard (Prototype)</h1>
      <p style={{ marginTop: 8, color: "#4b5563" }}>
        10개 계정 중 봇 계정을 선택하고, 모임 생성/참가 시뮬레이션을 제어합니다.
      </p>

      {error && (
        <div className="card" style={{ borderColor: "#fecaca", color: "#991b1b", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>운영 제어</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={() => callControl("/api/bot-control/start")}
              disabled={saving || loading}
              style={buttonPrimary}
            >
              AI 봇 진행 시작
            </button>
            <button
              onClick={() => callControl("/api/bot-control/stop")}
              disabled={saving || loading}
              style={buttonGhost}
            >
              AI 봇 진행 종료
            </button>
            <button
              onClick={runSimulateOnce}
              disabled={saving || loading || simulating}
              style={buttonGhost}
            >
              {simulating ? "실행 중..." : "지금 1회 실행 (simulate)"}
            </button>
            <button onClick={loadAll} disabled={saving || loading} style={buttonGhost}>
              새로고침
            </button>
          </div>
          <div style={{ color: "#374151", fontSize: 14 }}>
            <div>상태: {config.isRunning ? "RUNNING" : "STOPPED"}</div>
            <div>선택된 봇 계정: {config.selectedBotUids.length}개</div>
            <div>시뮬레이션으로 생성된 봇 모임: {botMeetingsCount}개</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>봇 정책 설정</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={labelStyle}>
              봇별 주간 모임 생성 수
              <input
                type="number"
                min={0}
                max={14}
                value={config.meetingsPerWeekPerBot}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, meetingsPerWeekPerBot: Number(e.target.value || 0) }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              모임 생성 담당 비율 (0~1)
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={config.creatorRatio}
                onChange={(e) => setConfig((prev) => ({ ...prev, creatorRatio: Number(e.target.value || 0) }))}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              봇당 신청 개수 (N)
              <input
                type="number"
                min={0}
                max={10}
                value={config.applicationsPerRunPerBot}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, applicationsPerRunPerBot: Number(e.target.value || 0) }))
                }
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, justifyContent: "flex-end" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={config.applyOnlyToBotMeetings}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, applyOnlyToBotMeetings: e.target.checked }))
                  }
                />
                봇이 만든 모임에만 참가
              </div>
            </label>
          </div>
          <p style={{ marginTop: 12, color: "#4b5563", fontSize: 13 }}>
            미리보기: 선택 봇 {selectedUsers.length}명 중 약 {creatorPreviewCount}명이 모임 생성, 전체 봇이 타인 모임에 최대 {config.applicationsPerRunPerBot}개 신청.
          </p>
          <button onClick={saveConfig} disabled={saving || loading} style={buttonPrimary}>
            설정 저장
          </button>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>사용자 목록 (봇 계정 선택)</h2>
            <button
              onClick={deleteSelectedBotMeetings}
              disabled={saving || loading || deletingMeetings || config.selectedBotUids.length === 0}
              style={buttonGhost}
              title={config.selectedBotUids.length === 0 ? "먼저 봇 계정을 체크하세요" : "선택된 봇의 모임 일괄 삭제"}
            >
              {deletingMeetings ? "삭제 중..." : "봇 모임 삭제"}
            </button>
          </div>
          {loading ? (
            <p>로딩 중...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={thStyle}>선택</th>
                    <th style={thStyle}>이메일</th>
                    <th style={thStyle}>UID</th>
                    <th style={thStyle}>프로필 이름</th>
                    <th style={thStyle}>신뢰점수</th>
                    <th style={thStyle}>활성</th>
                    <th style={thStyle}>동작</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const checked = config.selectedBotUids.includes(u.uid);
                    return (
                      <tr key={u.uid} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={tdStyle}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving || loading}
                            onChange={() => void toggleBot(u.uid)}
                          />
                        </td>
                        <td style={tdStyle}>{u.email ?? "-"}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace" }}>{u.uid}</td>
                        <td style={tdStyle}>{u.profileName ?? u.firebaseDisplayName ?? "-"}</td>
                        <td style={tdStyle}>{u.trustScore ?? "-"}</td>
                        <td style={tdStyle}>{u.isActive == null ? "-" : u.isActive ? "Y" : "N"}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => createMeetingByBot(u.uid, u.email)}
                            disabled={!checked || saving || loading || creatingUid === u.uid}
                            style={
                              checked
                                ? creatingUid === u.uid
                                  ? { ...buttonPrimary, opacity: 0.8 }
                                  : buttonPrimary
                                : { ...buttonPrimary, opacity: 0.5 }
                            }
                            title={checked ? "선택된 봇으로 모임 생성" : "먼저 봇 계정을 체크하세요"}
                          >
                            {creatingUid === u.uid ? "생성 중..." : "모임 생성"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>실행 로그</h2>
          <div style={{ marginBottom: 10 }}>
            <button onClick={clearLogs} disabled={saving || loading} style={buttonGhost}>
              실행 로그 초기화
            </button>
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", fontFamily: "monospace", fontSize: 12 }}>
            {logs.length === 0 && <div>로그 없음</div>}
            {[...logs].reverse().map((log) => (
              <div key={log.id} style={{ padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                [{new Date(log.ts).toLocaleString("ko-KR")}] [{log.level.toUpperCase()}] {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const buttonPrimary: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 600,
};

const buttonGhost: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 500,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
};

const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  verticalAlign: "top",
};
