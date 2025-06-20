// my-bot.js

require('dotenv').config();

const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('API KEY:', OPENAI_API_KEY); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('🤖 Bot is running and listening for new messages...');

const botName = '무뚝뚝이봇';

let isFirstSnapshot = true;
let isWaiting = false;
let apiCallCount = 0; // API 호출 횟수 추적

const messagesRef = db.collection('chat_rooms').doc('anonymous_room').collection('messages');

messagesRef
  .orderBy('createdAt', 'desc')
  .limit(10)
  .onSnapshot(snapshot => {

     if (isFirstSnapshot) {
      isFirstSnapshot = false;
      return; // 최초 스냅샷은 무시
    }

    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const text = data.text;
        const sender = data.sender || 'unknown';

        // 봇이 자기 자신이 쓴 메시지엔 반응 안 하게
        if (sender === botName) {
          console.log(`[Bot] 자기 자신(${botName})의 메시지엔 반응하지 않음: "${text}"`);
          return;
        }

        console.log(`📨 New message from ${sender}: "${text}"`);
        
        if (isWaiting) {
          console.log('[Bot] 이미 응답 대기 중, 무시합니다.');
          return; // 이미 응답 대기 중이면 무시
        }

        isWaiting = true; // 응답 대기 상태로 설정

        setTimeout(() => {
          isWaiting = false; // 응답 대기 상태 해제

          const messageId = uuidv4();  // npm install uuid 필요

          const messages = [];
          let lastDate = null;
          snapshot.forEach(doc => {
            const text = doc.data().text;
            const sender = doc.data().sender === botName ? '무뚝뚝이봇' :  doc.data().authorId;
            if (lastDate === null)
              lastDate = doc.data().createdAt;
            messages.push({sender: sender, text: text})
          });

          messages.reverse(); // 최신 메시지가 마지막에 오도록 역순 정렬

          const lastMessageDate = lastDate.toDate();
          // 현재 시간과 마지막 메시지 시간 차이 계산
          const timeDiff = Date.now() - lastMessageDate.getTime();
          console.log(`[Bot] 마지막 메시지 시간 차이: ${timeDiff}ms`);

          if (apiCallCount >= 5) {
            console.log('[Bot] API 호출 횟수 5회 초과');

            if (timeDiff < 3600000) {
              console.log('[Bot] 1시간 이내에는 API 호출 횟수 초과로 응답하지 않음');
              return; 
            } else {
              console.log('[Bot] 1시간 이상 지난 경우, API 호출 횟수 초기화');
              apiCallCount = 0; // 1시간 이상 지난 경우 호출 횟수 초기화
            }
          }

          const messagesText = JSON.stringify(messages, null, 2);

          console.log(`[Bot] 메시지 목록: ${messagesText}`);

          // 여기서 OpenAI API를 호출하는 로직을 추가해야 합니다.
          askOpenAI(messagesText)
            .then(aiResponse => {
              apiCallCount++;
              console.log(`[Bot] OpenAI API 호출 횟수: ${apiCallCount}`);

              if (aiResponse) {
                console.log(`[Bot] OpenAI 응답: "${aiResponse}"`);
                db.collection('chat_rooms')
                  .doc('anonymous_room')
                  .collection('messages')
                  .doc(messageId)
                  .set({
                    id: messageId,
                    text: aiResponse,
                    sender: botName,
                    authorId: 'bot',  // 또는 고정 UUID
                    createdAt: Timestamp.now(),
                    type: 'text',
                  })
                  .then(() => console.log('[Bot] OpenAI 응답 메시지 저장 완료'))
                  .catch(err => console.error('[Bot] OpenAI 응답 메시지 저장 실패:', err));
              } else {
                console.error('[Bot] OpenAI 응답이 없습니다.');
              }
            })
            .catch(err => console.error('[Bot] OpenAI API 호출 실패:', err));
        }, 2000); // 5초 딜레이
      }
    });
  });

async function askOpenAI(messagesText) {
  try {
    const jsonData = fs.readFileSync('./aiRequest.json', 'utf-8');
    const aiRequest = JSON.parse(jsonData);

    const systemPrompt = aiRequest.system;
    let userPrompt = aiRequest.user.replace('{{content}}', messagesText);
;
    console.log('System Prompt:', systemPrompt);
    console.log('User Prompt:', userPrompt);
 
    const body = {
              model: "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt},
                { role: "user", content: userPrompt}
              ],
              max_tokens: 100,
              temperature: 0.7,
            };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      body,
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    // 응답 메시지 추출
    const aiMessage = response.data.choices[0].message.content;
    return aiMessage;
  } catch (error) {
    console.error('OpenAI API 호출 오류:', error.response?.data || error.message);
    return null;
  }
}
