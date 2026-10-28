-- PostgreSQL 17 adds MAINTAIN (VACUUM/ANALYZE/CLUSTER/REINDEX/REFRESH/LOCK).
-- Nothing public should be able to maintain the project's relations either; the
-- previous migration left it alone because write privileges were the point
-- there. Views are covered by ON ALL TABLES: GRANT/REVOKE treat them as tables.
revoke maintain on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke maintain on tables from anon, authenticated;
