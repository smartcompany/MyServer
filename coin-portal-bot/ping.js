require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const targetUrl = 'https://coinpang.org';
const targetHost = new URL(targetUrl).hostname;

const IP_CACHE_PATH = path.join(__dirname, 'ping-last-ip.json');
const DUCKDNS_LOG_PATH = path.join(__dirname, 'duckdns.log');

// Email alert config

// DuckDNS update config (duck.sh 대체)
const DUCKDNS_DOMAIN = 'smartzero';

// 이 ping.js가 돌아가는 "서버(라즈베리파이)의 공인 IP" 조회
// (coinpang.org의 IP가 아니라, 네트워크 외부에서 보이는 현재 서버 IP)
const PUBLIC_IP_URL = 'https://api.ipify.org?format=json';

function loadLastIp() {
  try {
    const raw = fs.readFileSync(IP_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.ip === 'string' ? parsed.ip : null;
  } catch {
    return null;
  }
}

function saveLastIp(ip) {
  try {
    fs.writeFileSync(IP_CACHE_PATH, JSON.stringify({ ip, updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    console.error(`[${new Date().toISOString()}] IP 캐시 저장 실패: ${e.message}`);
  }
}

function canSendEmail() {
  return Boolean(process.env.SMTP_PASS);
}

async function sendIpChangeEmail({ oldIp, newIp }) {
  if (!canSendEmail()) {
    console.warn(
      `[${new Date().toISOString()}] SMTP 설정이 없어 메일 발송 스킵 (필수: SMTP_HOST/SMTP_USER/SMTP_PASS)`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true면 465 권장
    auth: {
      user: 'gunnylove@gmail.com',
      pass: process.env.SMTP_PASS,
    },
  });

  const subject = `[IP 변경 감지] ${targetHost}: ${oldIp || 'N/A'} -> ${newIp}`;
  const text = [
    `시간: ${new Date().toISOString()}`,
    `대상: ${targetUrl}`,
    `호스트: ${targetHost}`,
    `이전 IP: ${oldIp || 'N/A'}`,
    `현재 IP: ${newIp}`,
  ].join('\n');

  await transporter.sendMail({
    from: 'gunnylove@gmail.com',
    to: 'gunnylove@gmail.com',
    subject,
    text,
  });
}

function canUpdateDuckDns() {
  return Boolean(DUCKDNS_DOMAIN && process.env.DUCKDNS_TOKEN);
}

function appendDuckDnsLog(line) {
  try {
    fs.appendFileSync(DUCKDNS_LOG_PATH, `${line}\n`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] duckdns 로그 기록 실패: ${e.message}`);
  }
}

async function updateDuckDns(ip) {
  if (!canUpdateDuckDns()) {
    console.warn(
      `[${new Date().toISOString()}] DuckDNS 설정이 없어 업데이트 스킵 (필수: DUCKDNS_DOMAIN/DUCKDNS_TOKEN)`
    );
    return false;
  }

  const now = new Date().toISOString();
  try {
    const res = await axios.get('https://www.duckdns.org/update', {
      timeout: 15000,
      params: {
        domains: DUCKDNS_DOMAIN,
        token: process.env.DUCKDNS_TOKEN,
        ip: ip || '',
      },
      validateStatus: () => true,
    });

    const body = typeof res.data === 'string' ? res.data.trim() : JSON.stringify(res.data);
    const ok = body === 'OK';
    const line = `[${now}] duckdns update domains=${DUCKDNS_DOMAIN} ip=${ip} => HTTP ${res.status} ${body}`;
    appendDuckDnsLog(line);

    if (!ok) console.warn(line);
    return ok;
  } catch (e) {
    const line = `[${now}] duckdns update FAILED domains=${DUCKDNS_DOMAIN} ip=${ip} => ${e.message}`;
    appendDuckDnsLog(line);
    console.error(line);
    return false;
  }
}

async function getPublicIp() {
  const res = await axios.get(PUBLIC_IP_URL, { timeout: 15000, validateStatus: () => true });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`public ip 조회 실패: HTTP ${res.status}`);
  }

  if (typeof res.data === 'string') {
    const ip = res.data.trim();
    if (!ip) throw new Error('public ip 응답이 비어있습니다.');
    return ip;
  }

  const ip = res.data?.ip;
  if (typeof ip !== 'string' || ip.trim().length === 0) {
    throw new Error(`public ip 응답 파싱 실패: ${JSON.stringify(res.data)}`);
  }
  return ip.trim();
}

async function ping() {
  const now = new Date().toISOString();

  try {
    const [publicIp, httpRes] = await Promise.all([
      getPublicIp(),
      (async () => {
        const start = Date.now();
        const res = await axios.get(targetUrl, { timeout: 15000, validateStatus: () => true });
        const end = Date.now();
        return { status: res.status, ms: end - start };
      })(),
    ]);

    const lastIp = loadLastIp();
    // lastIp가 없으면 "초기 설정(=업데이트)"으로 보고 메일/duckdns를 1회 수행
    if (!lastIp || lastIp !== publicIp) {
      const label = lastIp ? `${lastIp} -> ${publicIp}` : `N/A -> ${publicIp} (init)`;
      console.log(`[${now}] 공인 IP 업데이트 감지: ${label}`);

      // IP 변경 시 DuckDNS 업데이트 (기존 duck.sh 역할)
      await updateDuckDns(publicIp);

      try {
        await sendIpChangeEmail({ oldIp: lastIp, newIp: publicIp });
        console.log(`[${now}] IP 업데이트 메일 발송 완료 to=gunnylove@gmail.com`);
      } catch (e) {
        console.error(`[${now}] IP 업데이트 메일 발송 실패: ${e.message}`);
      }
    }

    if (!lastIp || lastIp !== publicIp) {
      saveLastIp(publicIp);
    }

    console.log(`[${now}] ${targetUrl} - ${httpRes.status} (${httpRes.ms}ms) publicIp=${publicIp}`);
  } catch (err) {
    console.error(`[${now}] Error: ${err.message}`);
  }
}

setInterval(ping, 5 * 60 * 1000);
ping();