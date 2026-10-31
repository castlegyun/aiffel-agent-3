// 로그인 (Supabase Auth). Supabase 모드에서만 쓴다.
// 토큰은 브라우저 JS가 읽을 수 없는 httpOnly 쿠키에만 둔다 → 화면 코드는 키·토큰을 전혀 모른다.
const { authClient } = require('./store/supabase');

const ACCESS = 'rp_access';
const REFRESH = 'rp_refresh';
const SECURE = process.env.NODE_ENV === 'production';

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSession(res, session) {
  const base = { httpOnly: true, sameSite: 'lax', secure: SECURE, path: '/' };
  res.cookie(ACCESS, session.access_token, { ...base, maxAge: session.expires_in * 1000 });
  res.cookie(REFRESH, session.refresh_token, { ...base, maxAge: 30 * 24 * 3600 * 1000 });
}

function clearSession(res) {
  res.clearCookie(ACCESS, { path: '/' });
  res.clearCookie(REFRESH, { path: '/' });
}

// 쿠키의 토큰을 Supabase에 확인한다. 만료됐으면 refresh 토큰으로 새로 받는다.
async function resolveUser(req, res) {
  const c = readCookies(req);
  const sb = authClient();
  if (c[ACCESS]) {
    const { data, error } = await sb.auth.getUser(c[ACCESS]);
    if (!error && data.user) return { user: data.user, accessToken: c[ACCESS] };
  }
  if (c[REFRESH]) {
    const { data, error } = await sb.auth.refreshSession({ refresh_token: c[REFRESH] });
    if (!error && data.session) {
      setSession(res, data.session);
      return { user: data.user, accessToken: data.session.access_token };
    }
  }
  clearSession(res);
  return null;
}

async function signIn(email, password) {
  return authClient().auth.signInWithPassword({ email, password });
}

async function signUp(email, password) {
  return authClient().auth.signUp({ email, password });
}

async function resendConfirmation(email) {
  return authClient().auth.resend({ type: 'signup', email });
}

async function signOut(accessToken) {
  // 서버 쪽 세션도 끝낸다 (실패해도 쿠키는 지운다)
  try {
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch {}
}

module.exports = { resolveUser, signIn, signUp, resendConfirmation, signOut, setSession, clearSession, readCookies, ACCESS };
