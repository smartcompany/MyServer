// my-bot.js

const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccount.json'); // 네가 다운받은 키 파일

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore();

console.log('🤖 Bot is running and listening for new messages...');

const botName = '무뚝뚝이봇';

db.collection('messages')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const text = data.text;
        const sender = data.sender || 'unknown';

        // 봇이 자기 자신이 쓴 메시지엔 반응 안 하게
        if (sender === botName) return;

        console.log(`📨 New message from ${sender}: "${text}"`);

        const reply = generateReply(text);

        // Firestore에 응답 저장
        db.collection('messages').add({
          text: reply,
          sender: botName,
          timestamp: Timestamp.now()
        });
      }
    });
  });

function generateReply(msg) {
  if (msg.includes('여기 뭐하는 곳')) return '뭐하긴, 수다 떨고 노는 데지.';
  if (msg.includes('심심')) return '심심하면 춤이나 추지 뭐.';
  if (msg.includes('하하') || msg.includes('ㅋㅋ')) return '웃기나? 난 잘 모르겠는데.';
  return '흐음... 계속 해보소.';
}
