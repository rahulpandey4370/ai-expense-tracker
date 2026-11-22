-- One row per AI model call: tokens, estimated cost, latency. Read by the Usage page.
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null,            -- chat, sms, review, parse, insights, …
  model_key text not null,          -- e.g. openai::gpt-5.6-luna
  provider text not null,
  operation text not null,          -- structured | chat | tool_chat
  input_tokens integer not null default 0,   -- all input, cached included
  cached_tokens integer not null default 0,  -- input read from the provider's cache
  output_tokens integer not null default 0,  -- reasoning included
  reasoning_tokens integer not null default 0,
  cost_usd numeric(14, 8),          -- null when the model has no price in the catalog
  latency_ms integer not null default 0,
  ok boolean not null default true,
  error text
);
create index if not exists ai_usage_created_at_idx on ai_usage (created_at desc);
alter table ai_usage enable row level security;
