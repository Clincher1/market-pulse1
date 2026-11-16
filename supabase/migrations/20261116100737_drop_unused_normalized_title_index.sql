-- This index has no matching filter/order in the current functions and recorded zero scans.
-- The normalized_title column and all historical rows remain unchanged.
drop index if exists public.news_articles_shadow_normalized_title_idx;
