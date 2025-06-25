import { createClient } from '@supabase/supabase-js';
import { config } from './index';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey
);