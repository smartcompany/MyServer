// log.js
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const formatDate = () => {
  return moment().tz("Asia/Seoul").format("YYYY-MM-DD HH:mm:ss");
};

// 로그 파일 경로
const logPath = path.join(__dirname, 'trade-logs.txt');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const dateString = formatDate();
  const message = `[${dateString}] ${args.join(' ')}\n`;
  logStream.write(message);
  originalLog(...args);
};

console.error = (...args) => {
  const dateString = formatDate();
  const message = `[${dateString}] ERROR: ${args.join(' ')}\n`;
  logStream.write(message);
  originalError(...args);
};