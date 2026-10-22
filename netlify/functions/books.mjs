import { db, json, currentUser, validHttpUrl } from './_shared.mjs';

function parseTags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,，、\n#]+/);
  const out = new Map();
  for (const item of values) {
    const name = String(item || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase('ko-KR');
    if (name) out.set(key, name);
  }
  return [...out.values()].slice(0, 20);
}
function clean(v, max = 500) { return String(v ?? '').trim().slice(0, max); }

export default async (request) => {
  try {
    const sql = db();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const q = clean(url.searchParams.get('q'), 100);
      const requestedId = clean(url.searchParams.get('id'), 50);
      const grades = (url.searchParams.get('grades') || url.searchParams.get('grade') || '').split(',').map(x=>clean(x,20)).filter(x=>['3-4','5-6','middle+'].includes(x));
      const tag = clean(url.searchParams.get('tag'), 80).replace(/^#+/, '').trim();
      const author = clean(url.searchParams.get('author'), 100);
      const publisher = clean(url.searchParams.get('publisher'), 100);
      const browse = clean(url.searchParams.get('browse'), 20);
      const initial = clean(url.searchParams.get('initial'), 10);
      const initialRanges = {'ㄱ':'[가-깋]','ㄴ':'[나-닣]','ㄷ':'[다-딯]','ㄹ':'[라-맇]','ㅁ':'[마-밓]','ㅂ':'[바-빟]','ㅅ':'[사-싷]','ㅇ':'[아-잏]','ㅈ':'[자-짛]','ㅊ':'[차-칳]','ㅋ':'[카-킿]','ㅌ':'[타-팋]','ㅍ':'[파-핗]','ㅎ':'[하-힣]'};
      const initialPattern = initialRanges[initial] || '';
      const browseField = browse === 'author' ? 'author' : browse === 'publisher' ? 'publisher' : 'title';
      const mine = url.searchParams.get('mine') === '1';
      const viewer = mine ? await currentUser(request, sql) : null;
      if (mine && !viewer) return json({ message: '로그인이 필요합니다.' }, 401);
      const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1));
      const limit = 12, offset = (page - 1) * limit;
      const rows = await sql`
        SELECT b.id,b.title,b.author,b.publisher,b.grade_band,b.grade_bands,b.book_url,b.summary,b.cover_url,b.isbn13,b.created_at,
          COALESCE((SELECT json_agg(t.name ORDER BY t.normalized_name) FROM book_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.book_id=b.id),'[]'::json) AS tags,
          COUNT(*) OVER()::int AS total_count
        FROM books b
        WHERE (${requestedId}='' OR b.id::text=${requestedId})
          AND (${q}='' OR b.title ILIKE ${'%'+q+'%'} OR b.author ILIKE ${'%'+q+'%'})
          AND (${grades.length}::int=0 OR COALESCE(NULLIF(b.grade_bands,ARRAY[]::text[]),ARRAY[b.grade_band]) && ${grades}::text[])
          AND (${author}='' OR b.author ILIKE ${'%'+author+'%'})
          AND (${publisher}='' OR b.publisher ILIKE ${'%'+publisher+'%'})
          AND (NOT ${mine} OR b.created_by=${viewer?.id || '00000000-0000-0000-0000-000000000000'}::uuid)
          AND (${initialPattern}='' OR (CASE WHEN ${browse}='author' THEN b.author WHEN ${browse}='publisher' THEN b.publisher WHEN ${browse}='tag' THEN '' ELSE b.title END) ~ ${'^'+initialPattern})
          AND (${initialPattern}='' OR ${browse}<>'tag' OR EXISTS (SELECT 1 FROM book_tags ibt JOIN tags it ON it.id=ibt.tag_id WHERE ibt.book_id=b.id AND regexp_replace(it.name, '^#+', '') ~ ${'^'+initialPattern}))
          AND (${tag}='' OR EXISTS (SELECT 1 FROM book_tags bt JOIN tags t ON t.id=bt.tag_id WHERE bt.book_id=b.id AND LOWER(regexp_replace(t.normalized_name, '^#+', ''))=LOWER(${tag})))
        ORDER BY b.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      const total = rows[0]?.total_count || 0;
      return json({ items: rows.map(({ total_count, ...b }) => b), total, page, pageSize: limit, pages: Math.ceil(total / limit) });
    }
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'DELETE') return json({ message: '지원하지 않는 요청입니다.' }, 405);
    const user = await currentUser(request, sql);
    if (!user) return json({ message: '도서를 등록하거나 수정하려면 로그인해 주세요.' }, 401);
    const id = clean(url.searchParams.get('id'), 50);
    if (request.method === 'DELETE') {
      if (!id) return json({ message: '도서 ID가 필요합니다.' }, 400);
      const rows = await sql`DELETE FROM books WHERE id=${id} AND (${user.role}='admin' OR created_by=${user.id}) RETURNING id`;
      return rows.length ? json({ ok: true }) : json({ message: '도서를 찾을 수 없거나 수정·삭제 권한이 없습니다.' }, 403);
    }
    const body = await request.json();
    const title = clean(body.title, 250), author = clean(body.author, 250), publisher = clean(body.publisher, 200);
    const grades = [...new Set((Array.isArray(body.grade_bands) ? body.grade_bands : [body.grade_band]).map(x=>clean(x,20)).filter(x=>['3-4','5-6','middle+'].includes(x)))]; if (!grades.length) return json({error:'대상 학년을 하나 이상 선택해 주세요.'},400); const grade = grades[0]; const bookUrl = clean(body.book_url, 1000), summary = clean(body.summary, 5000), coverUrl = clean(body.cover_url, 1000), isbn13 = clean(body.isbn13, 20);
    const tags = parseTags(body.tags);
    if (!title || !author || !publisher || !bookUrl || grades.length === 0 || tags.length === 0) return json({ message: '제목, 글 작가, 출판사, 대상 학년, 온라인 서점 주소, 주제어 1개 이상은 필수입니다.' }, 400);
    if (!validHttpUrl(bookUrl)) return json({ message: '온라인 서점 주소는 http 또는 https 주소여야 합니다.' }, 400);
    if (coverUrl && !validHttpUrl(coverUrl)) return json({ message: '표지 주소 형식이 올바르지 않습니다.' }, 400);

    let book;
    if (request.method === 'POST') {
      const rows = await sql`INSERT INTO books(title,author,publisher,grade_band,grade_bands,book_url,summary,cover_url,isbn13,created_by) VALUES(${title},${author},${publisher},${grade},${grades}::text[],${bookUrl},${summary},${coverUrl},${isbn13},${user.id}) RETURNING *`;
      book = rows[0];
    } else {
      if (!id) return json({ message: '수정할 도서 ID가 필요합니다.' }, 400);
      const rows = await sql`UPDATE books SET title=${title},author=${author},publisher=${publisher},grade_band=${grade},grade_bands=${grades}::text[],book_url=${bookUrl},summary=${summary},cover_url=${coverUrl},isbn13=${isbn13},updated_at=NOW() WHERE id=${id} AND (${user.role}='admin' OR created_by=${user.id}) RETURNING *`;
      if (!rows.length) return json({ message: '도서를 찾을 수 없거나 수정 권한이 없습니다.' }, 403);
      book = rows[0];
      await sql`DELETE FROM book_tags WHERE book_id=${book.id}`;
    }
    for (const name of tags) {
      const normalized = name.toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
      const tagRows = await sql`INSERT INTO tags(name,normalized_name) VALUES(${name},${normalized}) ON CONFLICT(normalized_name) DO UPDATE SET name=tags.name RETURNING id`;
      await sql`INSERT INTO book_tags(book_id,tag_id) VALUES(${book.id},${tagRows[0].id}) ON CONFLICT DO NOTHING`;
    }
    return json({ item: { ...book, tags } }, request.method === 'POST' ? 201 : 200);
  } catch (e) {
    if (e?.code === '23505') return json({ message: '같은 제목과 글 작가의 도서가 이미 등록되어 있습니다.' }, 409);
    console.error('books error:', e?.message || 'unknown');
    return json({ message: '도서 처리 중 오류가 발생했습니다. 데이터베이스 설정과 테이블을 확인해 주세요.' }, 500);
  }
};
