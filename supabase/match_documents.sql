-- ============================================
-- Supabase Setup for Hidayah Quran AI
-- ============================================
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable pgvector extension
create extension if not exists vector;

-- Ensure embedding column is 3072 dimensions
-- (Run this if you need to recreate the column)
-- ALTER TABLE documents DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE documents ADD COLUMN embedding vector(3072);

-- ============================================
-- Vector Similarity Search Function
-- ============================================
-- No index needed: ~6K Quran verses = fast brute-force search (<50ms)
-- ============================================

create or replace function match_documents(
  query_embedding vector(3072),
  match_count int default 10,
  filter_lang text default 'en',
  similarity_threshold float default 0.3
)
returns table (
  surah int,
  ayah int,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    d.surah,
    d.ayah,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where 
    d.lang = filter_lang
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > similarity_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Grant access to the function
grant execute on function match_documents to anon, authenticated, service_role;

-- ============================================
-- Usage example:
-- ============================================
-- select * from match_documents(
--   '[0.1, 0.2, ...]'::vector(3072),  -- your query embedding
--   10,                                 -- number of results
--   'en',                               -- language filter
--   0.3                                 -- minimum similarity
-- );
