import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes } from 'node:crypto';

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}
export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}
export function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const part = cookie.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
export function hash(value) { return createHash('sha256').update(value).digest('hex'); }
export function newToken() { return randomBytes(32).toString('base64url'); }
export function sessionCookie(token, maxAge = 60 * 60 * 24 * 7) {
  return `fairytale_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
export async function currentUser(request, sql) {
  const token = cookieValue(request, 'fairytale_session');
  if (!token) return null;
  const rows = await sql`SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash(token)} AND s.expires_at > NOW() LIMIT 1`;
  return rows[0] || null;
}
export function validHttpUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
