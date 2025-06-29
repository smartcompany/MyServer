// log.js
const fs = require('fs');
const path = require('path');

// 로그 파일 경로
const logPath = path.join(__dirname, 'trade-logs.txt');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

const formatDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

console.log = (...args) => {
  const dateString = formatDate(new Date());
  const message = `[${dateString}] ${args.join(' ')}\n`;
  logStream.write(message);
  originalLog(...args);
};

console.error = (...args) => {
  const dateString = formatDate(new Date());
  const message = `[${dateString}] ERROR: ${args.join(' ')}\n`;
  logStream.write(message);
  originalError(...args);
};