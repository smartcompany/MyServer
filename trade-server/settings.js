const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;
const path = require('path');

app.use(express.json());

const configFilePath = path.join(__dirname, 'config.json');
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
app.get('/logs', (req, res) => {
  const logFile = path.join(__dirname, 'trade-logs.txt');
  fs.readFile(logFile, 'utf8', (err, data) => {
    if (err) return res.status(500).send('로그를 읽을 수 없습니다');
    const lines = data.trim().split('\n').slice(-100).join('\n');
    res.type('text/plain').send(lines);
  });
});

app.listen(port, () => {
  console.log(`웹 컨트롤 서버 실행 중: http://localhost:${port}`);
});
