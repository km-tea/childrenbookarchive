import bcrypt from 'bcryptjs';
import { db, json, hash, newToken, sessionCookie, cookieValue, currentUser } from './_shared.mjs';

export default async (request) => {
  const url = new URL(request.url);
  try {
    const sql = db();
    if (request.method === 'GET' && url.searchParams.get('action') === 'me') {
      const user = await currentUser(request, sql);
      return json({ user: user ? { id: user.id, email: user.email, role: user.role } : null });
    }
    if (request.method !== 'POST') return json({ message: '지원하지 않는 요청입니다.' }, 405);
    const body = await request.json();
    const action = String(body.action || '');
    if (action === 'logout') {
      const token = cookieValue(request, 'fairytale_session');
      if (token) await sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`;
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: '올바른 이메일 주소를 입력해 주세요.' }, 400);
    if (password.length < 1 || password.length > 200) return json({ message: '비밀번호를 1~200자로 입력해 주세요.' }, 400);

    if (action === 'signup') {
      const code = String(body.signupCode || '');
      const memberCode = process.env.SIGNUP_MEMBER_CODE || '동화사랑';
      const adminCode = process.env.SIGNUP_ADMIN_CODE || '동화책사랑';
      const defaultAdminEmail = '0227kkm@naver.com';
      let role = 'member';

      // 지정된 기본 관리자 계정은 관리자 가입 코드로만 생성합니다.
      // 일반회원 코드로 해당 이메일을 선점하는 것을 방지합니다.
      if (email === defaultAdminEmail) {
        if (code !== adminCode) return json({ message: '기본 관리자 계정은 관리자 가입 코드가 필요합니다.' }, 403);
        role = 'admin';
      } else if (code === adminCode) {
        role = 'admin';
      } else if (code !== memberCode) {
        return json({ message: '가입 코드가 올바르지 않습니다.' }, 400);
      }
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        const rows = await sql`INSERT INTO users(email,password_hash,role) VALUES(${email},${passwordHash},${role}) RETURNING id,email,role`;
        const token = newToken();
        await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${rows[0].id},${hash(token)},NOW()+INTERVAL '7 days')`;
        return json({ user: rows[0] }, 201, { 'Set-Cookie': sessionCookie(token) });
      } catch (e) {
        if (e?.code === '23505') return json({ message: '이미 가입된 이메일입니다.' }, 409);
        throw e;
      }
    }
    if (action === 'login') {
      let rows = await sql`SELECT id,email,role,password_hash FROM users WHERE email=${email} LIMIT 1`;
      if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return json({ message: '이메일 또는 비밀번호를 확인해 주세요.' }, 401);
      if (email === '0227kkm@naver.com' && rows[0].role !== 'admin') {
        rows = await sql`UPDATE users SET role='admin' WHERE id=${rows[0].id} RETURNING id,email,role,password_hash`;
      }
      const token = newToken();
      await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${rows[0].id},${hash(token)},NOW()+INTERVAL '7 days')`;
      return json({ user: { id: rows[0].id, email: rows[0].email, role: rows[0].role } }, 200, { 'Set-Cookie': sessionCookie(token) });
    }
    return json({ message: '알 수 없는 요청입니다.' }, 400);
  } catch (e) {
    console.error('auth error:', e?.message || 'unknown', 'code:', e?.code || 'none');
    if (!process.env.DATABASE_URL) {
      return json({ message: '서버 설정에 DATABASE_URL이 없습니다. Netlify 환경 변수에 Neon 연결 주소를 등록해 주세요.' }, 500);
    }
    if (e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '')) {
      return json({ message: '데이터베이스 테이블이 없습니다. Neon SQL Editor에서 sql/schema.sql을 실행해 주세요.' }, 500);
    }
    if (e?.code === 'ENOTFOUND' || /connection|connect|timeout|fetch failed/i.test(e?.message || '')) {
      return json({ message: 'Neon 데이터베이스에 연결하지 못했습니다. DATABASE_URL과 Neon 연결 상태를 확인해 주세요.' }, 500);
    }
    return json({ message: '인증 처리 중 오류가 발생했습니다. Netlify 환경 변수와 Neon의 users, sessions 테이블을 확인해 주세요.' }, 500);
  }
};
