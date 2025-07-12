create table public.slots (
  id uuid not null default gen_random_uuid (),
  mat_id uuid not null,
  product_id integer not null,
  user_id uuid not null,
  status text not null default 'draft'::text,
  submitted_at timestamp with time zone null default now(),
  processed_at timestamp with time zone null,
  rejection_reason text null,
  input_data jsonb null,
  is_auto_refund_candidate boolean null default false,
  is_auto_continue boolean null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_reason text null,
  mat_reason text null,
  keyword_id bigint null,
  quantity smallint null,
  start_date date null,
  end_date date null,
  user_slot_number integer not null,
  constraint slots_pkey primary key (id),
  constraint unique_mat_slot_number unique (mat_id, user_slot_number),
  constraint slots_product_id_fkey foreign KEY (product_id) references campaigns (id) on delete CASCADE,
  constraint slots_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create index IF not exists idx_slots_product_id on public.slots using btree (product_id) TABLESPACE pg_default;

create index IF not exists idx_slots_status on public.slots using btree (status) TABLESPACE pg_default;

create index IF not exists idx_slots_user_id on public.slots using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_slots_mat_slot_number on public.slots using btree (mat_id, user_slot_number) TABLESPACE pg_default;

create index IF not exists idx_slots_user_mat_slot on public.slots using btree (user_id, mat_id, user_slot_number) TABLESPACE pg_default;

create trigger create_pending_balance_on_slot_insert
after INSERT on slots for EACH row
execute FUNCTION create_slot_pending_balance ();

create trigger set_user_slot_number BEFORE INSERT on slots for EACH row when (new.user_slot_number is null)
execute FUNCTION generate_user_slot_number ();


create table public.campaigns (
  id serial not null,
  group_id character varying(30) null,
  service_type character varying(30) not null,
  campaign_name character varying(50) not null,
  status character varying(20) not null default '''waiting_approval''::character varying'::character varying,
  description text not null,
  detailed_description text null,
  logo character varying(100) not null,
  efficiency numeric(5, 2) null,
  min_quantity integer not null,
  unit_price numeric(10, 2) not null,
  additional_logic integer null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deadline character varying(5) null,
  mat_id uuid null,
  add_info jsonb null,
  rejected_reason text null,
  slot_type character varying(20) null default 'standard'::character varying,
  guarantee_days integer null,
  is_guarantee boolean null default false,
  guarantee_count integer null,
  target_rank integer null,
  is_negotiable boolean null default false,
  min_guarantee_price numeric(10, 2) null,
  max_guarantee_price numeric(10, 2) null,
  guarantee_unit character varying(10) null default '일'::character varying,
  refund_settings jsonb null default '{"type": "immediate", "enabled": true, "delay_days": 0, "cutoff_time": "00:00", "refund_rules": {"refund_rate": 100, "min_usage_days": 0, "partial_refund": true, "max_refund_days": 7}, "approval_roles": ["distributor", "advertiser"], "requires_approval": false}'::jsonb,
  guarantee_period integer null,
  ranking_field_mapping jsonb null,
  constraint campaigns_pkey_new primary key (id),
  constraint guarantee_count_check check (
    (
      (
        ((slot_type)::text = 'guarantee'::text)
        and (guarantee_count is not null)
        and (guarantee_count > 0)
      )
      or (
        ((slot_type)::text = 'standard'::text)
        and (guarantee_count is null)
      )
    )
  ),
  constraint guarantee_period_check check (
    (
      (
        ((slot_type)::text = 'guarantee'::text)
        and (guarantee_period is not null)
        and (guarantee_period > 0)
      )
      or (
        ((slot_type)::text = 'standard'::text)
        and (guarantee_period is null)
      )
    )
  ),
  constraint guarantee_price_check check (
    (
      (
        (is_negotiable = true)
        and (min_guarantee_price is not null)
        and (max_guarantee_price is not null)
        and (min_guarantee_price <= max_guarantee_price)
      )
      or (is_negotiable = false)
    )
  ),
  constraint guarantee_unit_check check (
    (
      (
        (guarantee_unit)::text = any (
          (
            array['일'::character varying, '회'::character varying]
          )::text[]
        )
      )
      or (guarantee_unit is null)
    )
  ),
  constraint slot_type_check check (
    (
      (slot_type)::text = any (
        (
          array[
            'standard'::character varying,
            'guarantee'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint target_rank_check check (
    (
      (
        ((slot_type)::text = 'guarantee'::text)
        and (target_rank is not null)
        and (target_rank > 0)
      )
      or (
        ((slot_type)::text = 'standard'::text)
        and (target_rank is null)
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_campaigns_slot_type on public.campaigns using btree (slot_type) TABLESPACE pg_default;

create index IF not exists idx_campaigns_is_guarantee on public.campaigns using btree (is_guarantee) TABLESPACE pg_default;

create index IF not exists idx_campaigns_guarantee_unit on public.campaigns using btree (guarantee_unit) TABLESPACE pg_default
where
  ((slot_type)::text = 'guarantee'::text);

create index IF not exists idx_campaigns_guarantee_period on public.campaigns using btree (guarantee_period) TABLESPACE pg_default
where
  ((slot_type)::text = 'guarantee'::text);

create index IF not exists idx_campaigns_ranking_field_mapping on public.campaigns using gin (ranking_field_mapping) TABLESPACE pg_default;

create trigger update_campaigns_is_guarantee BEFORE INSERT
or
update OF slot_type on campaigns for EACH row
execute FUNCTION update_is_guarantee_flag ();

create table public.shopping_rankings_current (
  keyword_id uuid not null,
  product_id character varying(255) not null,
  rank integer not null,
  prev_rank integer null,
  title text not null,
  lprice integer not null,
  image text null,
  mall_name character varying(255) null,
  brand character varying(255) null,
  category1 character varying(255) null,
  category2 character varying(255) null,
  link text null,
  collected_at timestamp with time zone not null,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint shopping_rankings_current_pkey primary key (keyword_id, product_id),
  constraint shopping_rankings_current_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_shopping_rankings_current_keyword_rank on public.shopping_rankings_current using btree (keyword_id, rank) TABLESPACE pg_default;

create table public.search_keywords (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  keyword character varying(200) not null,
  pc_count integer not null,
  mobile_count integer not null,
  total_count integer not null,
  pc_ratio numeric(5, 2) not null,
  mobile_ratio numeric(5, 2) not null,
  searched_at timestamp with time zone null default CURRENT_TIMESTAMP,
  is_active boolean null default true,
  type character varying(50) null default 'shopping'::character varying,
  constraint search_keywords_pkey primary key (id),
  constraint search_keywords_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_search_keywords_user on public.search_keywords using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_search_keywords_date on public.search_keywords using btree (searched_at desc) TABLESPACE pg_default;

create index IF not exists idx_search_keywords_keyword on public.search_keywords using btree (keyword) TABLESPACE pg_default;

create index IF not exists idx_search_keywords_type on public.search_keywords using btree (type) TABLESPACE pg_default;

create index IF not exists idx_search_keywords_keyword_type on public.search_keywords using btree (keyword, type) TABLESPACE pg_default;


create table public.shopping_rankings_current (
  keyword_id uuid not null,
  product_id character varying(255) not null,
  rank integer not null,
  prev_rank integer null,
  title text not null,
  lprice integer not null,
  image text null,
  mall_name character varying(255) null,
  brand character varying(255) null,
  category1 character varying(255) null,
  category2 character varying(255) null,
  link text null,
  collected_at timestamp with time zone not null,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint shopping_rankings_current_pkey primary key (keyword_id, product_id),
  constraint shopping_rankings_current_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_shopping_rankings_current_keyword_rank on public.shopping_rankings_current using btree (keyword_id, rank) TABLESPACE pg_default;


create table public.shopping_rankings_daily (
  keyword_id uuid not null,
  product_id character varying(255) not null,
  date date not null,
  rank integer not null,
  title text not null,
  lprice integer not null,
  image text null,
  mall_name character varying(255) null,
  brand character varying(255) null,
  category1 character varying(255) null,
  category2 character varying(255) null,
  link text null,
  last_updated timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint shopping_rankings_daily_pkey primary key (keyword_id, product_id, date),
  constraint shopping_rankings_daily_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_shopping_rankings_daily_keyword_date on public.shopping_rankings_daily using btree (keyword_id, date desc) TABLESPACE pg_default;

create table public.shopping_rankings_hourly (
  keyword_id uuid not null,
  product_id character varying(255) not null,
  hour timestamp with time zone not null,
  rank integer not null,
  title text not null,
  lprice integer not null,
  image text null,
  mall_name character varying(255) null,
  brand character varying(255) null,
  category1 character varying(255) null,
  category2 character varying(255) null,
  link text null,
  collected_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint shopping_rankings_hourly_pkey primary key (keyword_id, product_id, hour),
  constraint shopping_rankings_hourly_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_shopping_rankings_hourly_keyword_hour on public.shopping_rankings_hourly using btree (keyword_id, hour desc) TABLESPACE pg_default;

create view public.shopping_top_products_weekly_trend as
select
  r.keyword_id,
  r.product_id,
  r.title,
  r.brand,
  r.current_rank,
  d1.rank as day_1_ago,
  d2.rank as day_2_ago,
  d3.rank as day_3_ago,
  d4.rank as day_4_ago,
  d5.rank as day_5_ago,
  d6.rank as day_6_ago,
  d7.rank as day_7_ago
from
  (
    select distinct
      on (
        shopping_rankings_current.keyword_id,
        shopping_rankings_current.product_id
      ) shopping_rankings_current.keyword_id,
      shopping_rankings_current.product_id,
      shopping_rankings_current.rank as current_rank,
      shopping_rankings_current.title,
      shopping_rankings_current.brand
    from
      shopping_rankings_current
    where
      shopping_rankings_current.rank <= 10
    order by
      shopping_rankings_current.keyword_id,
      shopping_rankings_current.product_id,
      shopping_rankings_current.rank
  ) r
  left join shopping_rankings_daily d1 on r.keyword_id = d1.keyword_id
  and r.product_id::text = d1.product_id::text
  and d1.date = (CURRENT_DATE - 1)
  left join shopping_rankings_daily d2 on r.keyword_id = d2.keyword_id
  and r.product_id::text = d2.product_id::text
  and d2.date = (CURRENT_DATE - 2)
  left join shopping_rankings_daily d3 on r.keyword_id = d3.keyword_id
  and r.product_id::text = d3.product_id::text
  and d3.date = (CURRENT_DATE - 3)
  left join shopping_rankings_daily d4 on r.keyword_id = d4.keyword_id
  and r.product_id::text = d4.product_id::text
  and d4.date = (CURRENT_DATE - 4)
  left join shopping_rankings_daily d5 on r.keyword_id = d5.keyword_id
  and r.product_id::text = d5.product_id::text
  and d5.date = (CURRENT_DATE - 5)
  left join shopping_rankings_daily d6 on r.keyword_id = d6.keyword_id
  and r.product_id::text = d6.product_id::text
  and d6.date = (CURRENT_DATE - 6)
  left join shopping_rankings_daily d7 on r.keyword_id = d7.keyword_id
  and r.product_id::text = d7.product_id::text
  and d7.date = (CURRENT_DATE - 7);

    -- =====================================================
  -- Supabase 쿠팡(CP) 테이블 - 쇼핑과 완전히 동일한 구조
  -- =====================================================

  -- 1. 현재 순위 테이블
  CREATE TABLE public.cp_rankings_current (
    keyword_id uuid not null,
    product_id character varying(255) not null,
    rank integer not null,
    prev_rank integer null,
    title text not null,
    lprice integer not null,
    image text null,
    mall_name character varying(255) null,
    brand character varying(255) null,
    category1 character varying(255) null,
    category2 character varying(255) null,
    link text null,
    collected_at timestamp with time zone not null,
    updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
    constraint cp_rankings_current_pkey primary key (keyword_id, product_id),
    constraint cp_rankings_current_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
  ) TABLESPACE pg_default;

  CREATE INDEX IF not exists idx_cp_rankings_current_keyword_rank on public.cp_rankings_current using btree (keyword_id, rank) TABLESPACE pg_default;

  -- 2. 일별 순위 테이블
  CREATE TABLE public.cp_rankings_daily (
    keyword_id uuid not null,
    product_id character varying(255) not null,
    date date not null,
    rank integer not null,
    title text not null,
    lprice integer not null,
    image text null,
    mall_name character varying(255) null,
    brand character varying(255) null,
    category1 character varying(255) null,
    category2 character varying(255) null,
    link text null,
    last_updated timestamp with time zone null default CURRENT_TIMESTAMP,
    constraint cp_rankings_daily_pkey primary key (keyword_id, product_id, date),
    constraint cp_rankings_daily_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
  ) TABLESPACE pg_default;

  CREATE INDEX IF not exists idx_cp_rankings_daily_keyword_date on public.cp_rankings_daily using btree (keyword_id, date desc) TABLESPACE pg_default;

  -- 3. 시간별 순위 테이블
  CREATE TABLE public.cp_rankings_hourly (
    keyword_id uuid not null,
    product_id character varying(255) not null,
    hour timestamp with time zone not null,
    rank integer not null,
    title text not null,
    lprice integer not null,
    image text null,
    mall_name character varying(255) null,
    brand character varying(255) null,
    category1 character varying(255) null,
    category2 character varying(255) null,
    link text null,
    collected_at timestamp with time zone null default CURRENT_TIMESTAMP,
    constraint cp_rankings_hourly_pkey primary key (keyword_id, product_id, hour),
    constraint cp_rankings_hourly_keyword_id_fkey foreign KEY (keyword_id) references search_keywords (id) on delete CASCADE
  ) TABLESPACE pg_default;

  CREATE INDEX IF not exists idx_cp_rankings_hourly_keyword_hour on public.cp_rankings_hourly using btree (keyword_id, hour desc) TABLESPACE pg_default;