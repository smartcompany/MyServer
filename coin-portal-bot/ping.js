require('dotenv').config();

const axios = require('axios');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const targetUrl = 'https://coinpang.org';
const targetHost = new URL(targetUrl).hostname;

const IP_CACHE_PATH = path.join(__dirname, 'ping-last-ip.json');

const ALERT_TO = 'gunnylove@gmail.com';
const ALERT_FROM = 'gunnylove@gmail.com';
const SMTP_HOST='smtp.gmail.com';

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
    host: SMTP_HOST,
    port: 587,
    secure: false, // true면 465 권장
    auth: {
      user: ALERT_FROM,
      pass: rocess.env.SMTP_PASS,
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
    from: ALERT_FROM,
    to: ALERT_TO,
    subject,
    text,
  });
}

async function resolveIp() {
  // A 레코드/AAAA 레코드 중 첫 번째를 사용
  const results = await dns.lookup(targetHost, { all: true });
  const addr = results?.[0]?.address;
  if (!addr) throw new Error('DNS lookup 결과가 비어있습니다.');
  return addr;
}

async function ping() {
  const now = new Date().toISOString();

  try {
    const [ip, httpRes] = await Promise.all([
      resolveIp(),
      (async () => {
        const start = Date.now();
        const res = await axios.get(targetUrl, { timeout: 15000, validateStatus: () => true });
        const end = Date.now();
        return { status: res.status, ms: end - start };
      })(),
    ]);

    const lastIp = loadLastIp();
    if (lastIp && lastIp !== ip) {
      console.log(`[${now}] IP 변경 감지: ${targetHost} ${lastIp} -> ${ip}`);
      try {
        await sendIpChangeEmail({ oldIp: lastIp, newIp: ip });
        console.log(`[${now}] IP 변경 메일 발송 완료: to=${ALERT_TO}`);
      } catch (e) {
        console.error(`[${now}] IP 변경 메일 발송 실패: ${e.message}`);
      }
    }

    if (!lastIp || lastIp !== ip) {
      saveLastIp(ip);
    }

    console.log(`[${now}] ${targetUrl} - ${httpRes.status} (${httpRes.ms}ms) ip=${ip}`);
  } catch (err) {
    console.error(`[${now}] Error: ${err.message}`);
  }
}

setInterval(ping, 5 * 60 * 1000);
ping();