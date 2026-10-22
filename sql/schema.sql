-- 동화책 아카이브 전용 Neon 데이터베이스에서만 실행하세요.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  grade_band TEXT NOT NULL CHECK (grade_band IN ('3-4','5-6','middle+')),
  grade_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  book_url TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  isbn13 TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE books ADD COLUMN IF NOT EXISTS grade_bands TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE books SET grade_bands=ARRAY[grade_band] WHERE cardinality(grade_bands)=0;
CREATE INDEX IF NOT EXISTS books_title_idx ON books (LOWER(title));
CREATE INDEX IF NOT EXISTS books_author_idx ON books (LOWER(author));
CREATE INDEX IF NOT EXISTS books_publisher_idx ON books (LOWER(publisher));
CREATE UNIQUE INDEX IF NOT EXISTS books_title_author_unique ON books (LOWER(REGEXP_REPLACE(BTRIM(title), '\s+', ' ', 'g')), LOWER(REGEXP_REPLACE(BTRIM(author), '\s+', ' ', 'g')));

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS book_tags (
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);
CREATE INDEX IF NOT EXISTS book_tags_tag_id_idx ON book_tags(tag_id);
