import { db, json } from './_shared.mjs';
export default async (request) => {
  if (request.method !== 'GET') return json({ message: '지원하지 않는 요청입니다.' }, 405);
  try {
    const sql = db();
    const rows = await sql`SELECT regexp_replace(t.name, '^#+', '') AS name, COUNT(DISTINCT bt.book_id)::int AS book_count FROM tags t LEFT JOIN book_tags bt ON bt.tag_id=t.id GROUP BY t.id ORDER BY regexp_replace(t.normalized_name, '^#+', '') LIMIT 1000`;
    const [stats] = await sql`SELECT (SELECT COUNT(*)::int FROM books) AS book_count, (SELECT COUNT(DISTINCT LOWER(BTRIM(regexp_replace(t.normalized_name, '^#+', ''))))::int FROM tags t WHERE EXISTS (SELECT 1 FROM book_tags bt WHERE bt.tag_id=t.id)) AS tag_count, (SELECT COUNT(DISTINCT LOWER(BTRIM(author)))::int FROM books WHERE BTRIM(author) <> '') AS author_count`;
    return json({ items: rows, stats });
  } catch (e) {
    console.error('tags error:', e?.message || 'unknown');
    return json({ message: '주제어를 불러오지 못했습니다.' }, 500);
  }
};
