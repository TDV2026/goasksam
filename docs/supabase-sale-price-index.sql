-- Sam Desk record questions: the "highest sale" scan sorts a model-scoped pool by sale_price DESC.
-- Without an index on sale_price, an all-time scan of a HIGH-VOLUME model (BMW M3, Porsche 911)
-- sorts the whole model subset and blows the Supabase statement timeout, returning a flaky
-- query_error. Until this index exists, the Desk record scans a bounded 6-year window (reliable in
-- practice, since the high-value sales are recent) and states that window in the definition.
--
-- Apply once (Sam; Vercel service-role secret is not pullable locally). After this, the record can
-- scan all-time reliably and the window bound in lib/desk/execute.js (RECORD_WINDOW_DAYS) can widen.
CREATE INDEX IF NOT EXISTS idx_sales_archive_sale_price ON sales_archive (sale_price DESC);
-- Optional composite to help the price-sort within a make/model scope:
CREATE INDEX IF NOT EXISTS idx_sales_archive_make_price ON sales_archive (make, sale_price DESC);
