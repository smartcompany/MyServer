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
  try {
    console.log('🔍 CryptoPanic API로 뉴스 가져오는 중...');
    const res = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: {
        auth_token: CRYPTOPANIC_API_KEY,
        filter: 'news',
        currencies: 'BTC,ETH',
        public: true,
      },
    });
    console.log('✅ CryptoPanic API 성공');
    return res.data.results;
  } catch (error) {
    console.log('❌ CryptoPanic API 실패, NewsData.io API로 대체...');
    console.error('CryptoPanic 에러:', error.message);
    
    try {
      console.log('🔍 NewsData.io API로 뉴스 가져오는 중...');
      
      // API 키 확인
      const apiKey = process.env.NEWSDATA_API_KEY;
      if (!apiKey) {
        console.log('⚠️ NewsData.io API 키가 없습니다. 무료 뉴스 API를 사용합니다.');
        
        // 무료 뉴스 API 사용 (API 키 불필요)
        const freeNewsRes = await axios.get('https://gnews.io/api/v4/search', {
          params: {
            q: 'cryptocurrency bitcoin ethereum',
            lang: 'en',
            country: 'us',
            max: 10,
            token: process.env.GNEWS_API_KEY || 'demo' // GNews API 키 (선택사항)
          }
        });
        
        const transformedNews = freeNewsRes.data.articles.map(article => ({
          title: article.title,
          url: article.url,
          published_at: article.publishedAt,
          currencies: [{ code: 'CRYPTO' }],
          source: { title: article.source.name || 'GNews' }
        }));
        
        console.log('✅ GNews API 성공');
        return transformedNews;
      }
      
      const newsDataRes = await axios.get('https://newsdata.io/api/1/news', {
        params: {
          apikey: apiKey,
          q: 'cryptocurrency OR bitcoin OR ethereum OR crypto',
          language: 'en',
          category: 'business',
          country: 'us'  // 단일 국가만 지정
        }
      });
      
      // NewsData.io API 응답을 CryptoPanic 형식으로 변환
      const transformedNews = newsDataRes.data.results.map(article => ({
        title: article.title,
        url: article.link,
        published_at: article.pubDate,
        currencies: [{ code: 'CRYPTO' }],
        source: { title: article.source_id || 'NewsData.io' }
      }));
      
      console.log('✅ NewsData.io API 성공');
      return transformedNews;
    } catch (newsDataError) {
      console.error('❌ NewsData.io API 실패:', newsDataError.message);
      if (newsDataError.response) {
        console.error('🔎 상태 코드:', newsDataError.response.status);
        console.error('📄 응답 내용:', newsDataError.response.data);
      }
      
      try {
        console.log('🔍 CryptoCompare API로 뉴스 가져오는 중...');
        const cryptoCompareRes = await axios.get('https://min-api.cryptocompare.com/data/v2/news/?categories=BTC,ETH,ADA,SOL&excludeCategories=Sponsored');
        
        const transformedNews = cryptoCompareRes.data.Data.map(article => ({
          title: article.title,
          url: article.url,
          published_at: new Date(article.published_on * 1000).toISOString(),
          currencies: article.categories ? article.categories.split(',').map(cat => ({ code: cat.trim() })) : [{ code: 'CRYPTO' }],
          source: { title: article.source || 'CryptoCompare' }
        }));
        
        console.log('✅ CryptoCompare API 성공');
        return transformedNews;
      } catch (cryptoCompareError) {
        console.error('❌ CryptoCompare API도 실패:', cryptoCompareError.message);
        throw new Error('모든 뉴스 API가 실패했습니다');
      }
    }
  }
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
                4. 반드시 아래 JSON 형식으로만 응답해줘. 마크다운, 백틱 없이 JSON만. 
                
                {
                  "title": "제목",
                  "content": "본문"
                }

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

  const content =  res.data.choices[0].message.content
  .replace(/```json/g, '')
  .replace(/```/g, '')
  .trim();
  
  try {
    const parsedResponse = JSON.parse(content);
    return parsedResponse;
  } catch (error) {
    console.error('❌ JSON 파싱 실패:', error.message);
    console.log('원본 응답:', content);
    
    // JSON 파싱 실패 시 기본값 반환
    return {
      title: '암호화폐 시장 동향',
      content: content
    };
  }
}

async function uploadToBoard(title, content) {
  const { data, error } = await supabase.from('posts').insert([
    {
      title,
      content,
      author: '코인봇 🤖',
      board_type: 'coin_news',
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

// 자유 게시판용 글 생성 함수
async function generateFunnyFreeBoardPost() {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `최근 코인의 트렌드를 바탕으로 코인에 관심 많은 사용자가 코인 자유 게시판에 올릴만한 재밌는 글을 써줘 때로는 시크하고 농담 조로 웃긴 글이 좋아. 가급적 반말로 해줘 커뮤니티 말투로 \n
                    그리고 웃기고 재치있는 닉네임을 한글로 1개만 출력해 제목과 본문, 닉네임을 아래 JSON 형식으로만 응답해줘. 마크다운, 백틱 없이 JSON만. \n{\n  "title": "제목",\n  "content": "본문"\n, "author": "닉네임"\n}
                    `,
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

  const content =  res.data.choices[0].message.content
  .replace(/```json/g, '')
  .replace(/```/g, '')
  .trim();

  try {
    console.log('🔍 자유게시판 글 생성 완료:', content);
    const parsed = JSON.parse(content);
    return parsed;
  } catch (e) {
    return { title: '코인 자유게시판', content };
  }
}

// 자유 게시판에 글 업로드
async function uploadToFreeBoard(title, content, author) {
  const { data, error } = await supabase.from('posts').insert([
    {
      title,
      content,
      author,
      board_type: 'free_board',
      views: 0,
      likes: 0,
    },
  ]);
  if (error) {
    console.error('❌ 자유게시판 업로드 실패:', error.message);
  } else {
    console.log('✅ 자유게시판 업로드 성공:', data);
  }
}

async function runBot() {
  try {
    console.log('🚀 암호화폐 뉴스 가져오는 중...');
    const newsList = await fetchCryptoNews();

    console.log('🧠 요약 중...');
    const response = await summarizeNews(newsList);

    console.log('📝 요약 완료:', response);

    // AI가 생성한 내용에서 타이틀과 컨텐츠 추출
    const title = response.title || '암호화폐 시장 동향';
    const content = response.content || '뉴스 요약을 가져오는 중입니다.';

    console.log('📤 Supabase에 업로드 중...');
    await uploadToBoard(title, content);
  } catch (err) {
    console.error('❗ 에러 발생:', err.message);
    if (err.response) {
      console.error('🔎 상태 코드:', err.response.status);
      console.error('📄 응답 내용:', err.response.data);
    }
  }
}

// 자유게시판 봇 실행
async function runFreeBoardBot() {
  try {
    console.log('✍️ 자유게시판 글 생성 중...');
    const { title, content, author } = await generateFunnyFreeBoardPost();
    console.log('📤 자유게시판에 업로드 중...');
    await uploadToFreeBoard(title, content, author);
  } catch (err) {
    console.error('❗ 자유게시판 봇 에러:', err.message);
    if (err.response) {
      console.error('🔎 상태 코드:', err.response.status);
      console.error('📄 응답 내용:', err.response.data);
    }
  }
}

// 기존 runBot()은 뉴스 게시판용, runFreeBoardBot()은 자유게시판용
runBot();
setTimeout(() => {
  runFreeBoardBot();
  setInterval(runFreeBoardBot, 24 * 60 * 60 * 1000);
}, 10000); 
setInterval(runBot, 12 * 60 * 60 * 1000);