// log.js
const fs = require('fs');
const path = require('path');

// 로그 파일 경로
const logPath = path.join(__dirname, 'trade-logs.txt');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const message = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  logStream.write(message);
  originalLog(...args);
};

console.error = (...args) => {
  const message = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}\n`;
  logStream.write(message);
  originalError(...args);
};