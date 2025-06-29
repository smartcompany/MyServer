
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;
const path = require('path');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;
const USER_ID = process.env.USER_ID;
const PASSWORD = process.env.PASSWORD;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일
app.use(express.json());

const configFilePath = path.join(__dirname, 'config.json');
const logFilePath = path.join(__dirname, 'trade-logs.txt');
const orderStateFilePath = path.join(__dirname, 'orderState.json');
const cashBalanceLogPath = path.join(__dirname, 'cashBalance.json');

let config = {};
if (fs.existsSync(configFilePath)) {
  config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
  console.log('현재 설정값 파일 읽기');
  console.log(JSON.stringify(config, null, 2));
} else {
  console.log('현재 설정값 참조 파일 없음', configFilePath);
}


// 로그인
app.post('/login', (req, res) => {
  const { id, password } = req.body;
  if (id === USER_ID && password === PASSWORD) {
    const token = jwt.sign({ user: id }, MY_SERVER_LOGIN_KEY, { expiresIn: '1h' });
    return res.json({ token });
  }
  res.status(401).send('인증 실패');
});

// 토큰 검증 미들웨어
function verifyToken(req, res, next) {
  console.log('토큰 검증 중...');
  const auth = req.headers.authorization || req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).send('토큰 없음');

  jwt.verify(token, MY_SERVER_LOGIN_KEY, (err, user) => {
    if (err) return res.status(403).send('토큰 유효하지 않음');
    req.user = user;
    next();
  });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('로그인 필요');

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, MY_SERVER_LOGIN_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).send('토큰 유효하지 않음');
  }
}

app.post('/init', verifyToken, (req, res) => {
  // log, cashBalance 파일 삭제
  fs.writeFileSync(logFilePath, '');
  fs.writeFileSync(cashBalanceLogPath, '');

  if (fs.existsSync(orderStateFilePath)) {
    const data = fs.readFileSync(orderStateFilePath, 'utf8');
    let history = JSON.parse(data);
    history.needInit = true; // 초기화 요청
    fs.writeFileSync(orderStateFilePath, JSON.stringify(history));
  }
 
  res.sendStatus(200);
});

// 현재 설정값 가져오기
app.get('/config', verifyToken, (req, res) => {
  res.json(config);
});

app.post('/config', verifyToken, (req, res) => {
  const updates = req.body.updates;

  if (!Array.isArray(updates)) {
    return res.status(400).send('Invalid payload');
  }

  let changed = false;

  updates.forEach(({ key, value }) => {
    if (key in config) {
      config[key] = value;
      console.log(`🔧 설정 변경됨: ${key} = ${value}`);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    res.sendStatus(200);
  } else {
    res.status(400).send('No valid keys updated');
  }
});

// 로그 보기 (최근 100줄)
app.get('/logs', verifyToken, (req, res) => {
  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('로그를 읽을 수 없습니다');
    const lines = data.trim().split('\n').slice(-100).join('\n');
    res.type('text/plain').send(lines);
  });
});

// 거래 내역 
app.get('/cashBalance', verifyToken, (req, res) => {
  const cashBalanceLogPath = path.join(__dirname, 'cashBalance.json');
  fs.readFile(cashBalanceLogPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('거래 내역을 읽을 수 없습니다');
    res.type('application/json').send(data);
  });
});

app.get('/auth-check', authMiddleware, (req, res) => {
  res.send({ ok: true, user: req.user });
});

app.listen(port, () => {
  console.log(`웹 컨트롤 서버 실행 중: http://localhost:${port}`);
});
