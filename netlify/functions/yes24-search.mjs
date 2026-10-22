const API_URL = 'https://apis.yes24.com/v1/goods/itemList';

// YES24 작가 정보에서 번역자 등 '/' 뒤의 정보를 제외하고 글 작가 이름만 반환합니다.
function cleanAuthor(value) {
  return String(value || '')
    .split('/')[0]
    // "홍길동 글", "홍길동 글, 김철수 그림" 등에서 글 작가 이름만 남깁니다.
    .replace(/\s*(?:글\s*·\s*그림|글그림|글|그림)(?:\s|,|·|$).*$/u, '')
    .replace(/\s*\([^)]*(?:번역|옮김|그림|글)[^)]*\)\s*$/u, '')
    .trim();
}

export default async (request) => {
  if (request.method !== 'GET') {
    return Response.json({ message: 'GET 요청만 허용됩니다.' }, { status: 405 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  if (query.length < 2) {
    return Response.json({ message: '검색어를 두 글자 이상 입력해 주세요.', items: [] }, { status: 400 });
  }
  if (query.length > 80) {
    return Response.json({ message: '검색어는 80자 이내로 입력해 주세요.', items: [] }, { status: 400 });
  }

  const apiKey = process.env.YES24_API_KEY;
  if (!apiKey) {
    console.error('Missing YES24_API_KEY environment variable');
    return Response.json({ message: 'Netlify에 YES24_API_KEY 환경변수가 설정되어 있는지 확인해 주세요.', items: [] }, { status: 500 });
  }

  const apiUrl = new URL(API_URL);
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('category', 'BOOK');
  apiUrl.searchParams.set('page', '1');
  apiUrl.searchParams.set('pageSize', '12');
  apiUrl.searchParams.set('detail', 'N');

  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
    });
    const payload = await apiResponse.json().catch(() => null);

    if (apiResponse.status === 404 || payload?.errorCode === 'SEARCH_001') {
      return Response.json({ items: [], message: '검색 결과가 없습니다. 제목을 조금 바꾸어 다시 검색해 주세요.' });
    }
    if (!apiResponse.ok || payload?.success === false) {
      const status = apiResponse.status === 401 ? 502 : (apiResponse.status >= 500 ? 502 : 400);
      const message = apiResponse.status === 401
        ? 'YES24 API 인증에 실패했습니다. Netlify 환경변수의 키와 활성 상태를 확인해 주세요.'
        : (payload?.message || 'YES24 도서 검색 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      console.error('YES24 API error:', apiResponse.status, payload?.errorCode || 'unknown');
      return Response.json({ message, items: [] }, { status });
    }

    const rawItems = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const items = rawItems.slice(0, 12).map(item => ({
      itemId: item.itemId ?? null,
      title: item.title ?? '',
      author: cleanAuthor(item.author ?? ''),
      publisher: item.publisher ?? '',
      cover: item.cover ?? '',
      link: item.link ?? '',
      publishDate: item.publishDate ?? '',
      isbn13: item.isbn13 ?? '',
      saleStatus: item.saleStatus ?? item.sellStatus ?? item.status ?? item.stockStatus ?? '',
      isSoldOut: item.isSoldOut === true || item.soldOut === true || item.isSoldout === true || /품절|판매중지|절판/i.test(String(item.saleStatus ?? item.sellStatus ?? item.status ?? item.stockStatus ?? ''))
    }));
    return Response.json({ items, message: items.length ? '' : '검색 결과가 없습니다. 제목을 조금 바꾸어 다시 검색해 주세요.' }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('YES24 request failed:', error?.message || 'unknown');
    return Response.json({ message: 'YES24 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', items: [] }, { status: 502 });
  }
};
