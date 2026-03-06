/**
 * 비밀번호 해시 생성 — .env에 BYBIT_API_KEY 처럼 $ 없이 쓰려면 base64로 저장
 * 사용: node scripts/gen-password-hash.js
 */
const bcrypt = require('bcrypt');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('비밀번호를 로그인 폼에 입력할 때 쓸 그대로 입력하세요.\n');

rl.question('비밀번호 입력: ', (password) => {
  rl.close();
  if (!password || !password.trim()) {
    console.error('비밀번호를 입력해주세요.');
    process.exit(1);
  }
  const toHash = password.trim();
  bcrypt.hash(toHash, 10).then((hash) => {
    const base64 = Buffer.from(hash, 'utf8').toString('base64');
    const hashFile = path.join(process.cwd(), '.password_hash');
    fs.writeFileSync(hashFile, hash, 'utf8');
    console.log('\n[1] .password_hash 파일에 raw 해시 저장됨\n');
    console.log('[2] .env 에 넣을 값 (BYBIT_API_KEY 처럼 따옴표 없이, $ 없음):\n');
    console.log('PASSWORD_HASH=' + base64 + '\n');
    console.log('(입력 비밀번호 길이:', toHash.length, '글자)');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
});
