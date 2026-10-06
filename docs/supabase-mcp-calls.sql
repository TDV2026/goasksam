-- mcp_calls: one row per MCP tool invocation (GoAskSam app for ChatGPT / Claude). Run once.
create table if not exists mcp_calls (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  tool        text not null,                 -- market_check | car_history | where_to_sell
  input       text,                          -- the raw tool input (plain car text / VIN / URL); no PII
  client_id   text,                          -- hashed client bucket (rate limit); never PII
  client_name text,                          -- MCP clientInfo.name (e.g. "ChatGPT", "Claude")
  status      text,                          -- ok | refused | rate_limited | error
  result_kind text,                          -- answer | question | refusal
  ms          integer
);
create index if not exists mcp_calls_created_idx on mcp_calls (created_at desc);
create index if not exists mcp_calls_client_idx  on mcp_calls (client_id, created_at desc);

-- Standing DB-security rule: locked from creation. Server uses the service role key; browser gets nothing.
alter table mcp_calls enable row level security;
revoke all on mcp_calls from anon, authenticated;
