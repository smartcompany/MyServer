const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());

const configFilePath = './config.json';

const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 초기값 로딩
let config = fs.existsSync(configFilePath)
  ? JSON.parse(fs.readFileSync(configFilePath, 'utf8'))
  : {
      isTrading: true,
      buyThreshold: 0.5,
      sellThreshold: 2.5,
    };

// 현재 설정값 가져오기
app.get('/config', (req, res) => {
  res.json(config);
});

// 설정 변경
app.post('/config', (req, res) => {
  const { key, value } = req.body;
  if (key in config) {
    config[key] = value;
    console.log(`🔧 설정 변경됨: ${key} = ${value}`);
    res.sendStatus(200);
  } else {
    res.status(400).send('Invalid key');
  }
});

// 로그 보기 (최근 100줄)
app.get('/log', (req, res) => {
  const logFile = './trade-logs.txt';
  fs.readFile(logFile, 'utf8', (err, data) => {
    if (err) return res.status(500).send('로그를 읽을 수 없습니다');
    const lines = data.trim().split('\n').slice(-100).join('\n');
    res.type('text/plain').send(lines);
  });
});

app.listen(port, () => {
  console.log(`웹 컨트롤 서버 실행 중: http://localhost:${port}`);
});

app.get('/logs', (req, res) => {
  fs.readFile('./trade-logs.txt', 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading logs');
    res.setHeader('Content-Type', 'text/plain');
    res.send(data);
  });
});