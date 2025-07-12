import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const {
  OPENAI_API_KEY,
  CRYPTOPANIC_API_KEY,
  COIN_PORTAL_SUPABASE_URL,
  COIN_PORTAL_SUPABASE_ANON_KEY,
} = process.env;

const supabase = createClient(COIN_PORTAL_SUPABASE_URL, COIN_PORTAL_SUPABASE_ANON_KEY);

async function fetchCryptoNews() {
  const res = await axios.get('https://cryptopanic.com/api/v1/posts/', {
    params: {
      auth_token: CRYPTOPANIC_API_KEY,
      filter: 'news',
      currencies: 'BTC,ETH',
      public: true,
    },
  });
  return res.data.results;
}

async function summarizeNews(newsList) {
  const newsText = newsList
    .map((n) => `- ${n.title} (${n.published_at})\n${n.url}`)
    .join('\n\n');

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `
                다음 암호화폐 뉴스를 읽기 쉬운 기사 형식으로 다시 작성해줘.

                조건:
                1. 제목은 사람이 쓴 것처럼 흥미를 끌 수 있게 만들어줘. 너무 딱딱하거나 기계적으로 보이면 안 돼.
                2. 기사 앞부분엔 2~3줄 요약을 붙여줘.
                3. 본문은 자연스럽고 친근한 말투로 작성해줘. 중요한 숫자나 용어는 유지하되, 초보자도 이해할 수 있게 설명해줘.

                \n[뉴스 원문]:\n${newsText}`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    summary: res.data.choices[0].message.content,
    rawNews: newsText,
  };
}

async function uploadToBoard(title, content) {
  const { data, error } = await supabase.from('posts').insert([
    {
      title,
      content,
      author: '코인봇 🤖',
      views: 0,
      likes: 0,
    },
  ]);

  if (error) {
    console.error('❌ 게시물 업로드 실패:', error.message);
  } else {
    console.log('✅ 게시물 업로드 성공:', data);
  }
}

async function runBot() {
  try {
    console.log('🚀 암호화폐 뉴스 가져오는 중...');
    const newsList = await fetchCryptoNews();

    console.log('🧠 요약 중...');
    const { summary, rawNews } = await summarizeNews(newsList);

    const today = new Date();
    const title = `[자동요약] ${today.toLocaleDateString()} 암호화폐 뉴스`;
    const content = `${summary}\n\n🔗 원문 링크들:\n${rawNews}`;

    console.log('📤 Supabase에 업로드 중...');
    await uploadToBoard(title, content);
  } catch (err) {
    console.error('❗ 에러 발생:', err.message);
  }
}

runBot();
setInterval(runBot, 60 * 60 * 3000);