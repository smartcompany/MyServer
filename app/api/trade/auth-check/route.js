import { authMiddleware } from '../middleware';

export async function GET(request) {
  const auth = authMiddleware(request);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  return Response.json({ ok: true, user: auth.user });
}

