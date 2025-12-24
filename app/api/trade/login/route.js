import jwt from 'jsonwebtoken';

const MY_SERVER_LOGIN_KEY = process.env.MY_SERVER_LOGIN_KEY;
const USER_ID = process.env.USER_ID;
const PASSWORD = process.env.PASSWORD;

export async function POST(request) {
  try {
    const { id, password } = await request.json();

    if (id === USER_ID && password === PASSWORD) {
      const token = jwt.sign({ user: id }, MY_SERVER_LOGIN_KEY, { expiresIn: '1h' });
      return Response.json({ token });
    }

    return Response.json({ error: '인증 실패' }, { status: 401 });
  } catch (error) {
    return Response.json({ error: '서버 오류' }, { status: 500 });
  }
}

