-- cp_rankings_current 테이블에 누락된 컬럼 추가
ALTER TABLE public.cp_rankings_current 
ADD COLUMN IF NOT EXISTS hprice integer NULL,
ADD COLUMN IF NOT EXISTS category3 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS category4 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS seller_name character varying(255) NULL,
ADD COLUMN IF NOT EXISTS delivery_type character varying(255) NULL,
ADD COLUMN IF NOT EXISTS is_rocket boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_fresh boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_global boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rating numeric(3,2) NULL,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_wow_deal boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) NULL,
ADD COLUMN IF NOT EXISTS original_price integer NULL,
ADD COLUMN IF NOT EXISTS card_discount integer NULL;

-- cp_rankings_daily 테이블에도 동일한 컬럼 추가
ALTER TABLE public.cp_rankings_daily 
ADD COLUMN IF NOT EXISTS hprice integer NULL,
ADD COLUMN IF NOT EXISTS category3 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS category4 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS seller_name character varying(255) NULL,
ADD COLUMN IF NOT EXISTS delivery_type character varying(255) NULL,
ADD COLUMN IF NOT EXISTS is_rocket boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_fresh boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_global boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rating numeric(3,2) NULL,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_wow_deal boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) NULL,
ADD COLUMN IF NOT EXISTS original_price integer NULL,
ADD COLUMN IF NOT EXISTS card_discount integer NULL;

-- cp_rankings_hourly 테이블에도 동일한 컬럼 추가
ALTER TABLE public.cp_rankings_hourly 
ADD COLUMN IF NOT EXISTS hprice integer NULL,
ADD COLUMN IF NOT EXISTS category3 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS category4 character varying(255) NULL,
ADD COLUMN IF NOT EXISTS seller_name character varying(255) NULL,
ADD COLUMN IF NOT EXISTS delivery_type character varying(255) NULL,
ADD COLUMN IF NOT EXISTS is_rocket boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_fresh boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_rocket_global boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rating numeric(3,2) NULL,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_wow_deal boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) NULL,
ADD COLUMN IF NOT EXISTS original_price integer NULL,
ADD COLUMN IF NOT EXISTS card_discount integer NULL;