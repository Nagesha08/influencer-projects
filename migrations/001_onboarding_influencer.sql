-- Safe, idempotent migration for onboarding and influencer profiles.
-- Target: existing public.users(id, firebase_uid, email, created_at, role)
-- This file is for manual review/application in Supabase. It is not executed by the application.

BEGIN;

-- Preserve all existing users and rows. Replace only the known role constraint
-- so the existing role values remain valid while influencer becomes supported.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'user', 'influencer'));

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE
    REFERENCES public.users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  timezone VARCHAR(100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.influencer_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE
    REFERENCES public.users(id) ON DELETE CASCADE,
  display_name VARCHAR(150) NOT NULL,
  bio TEXT,
  niche VARCHAR(150) NOT NULL,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  x_url TEXT,
  facebook_url TEXT,
  website_url TEXT,
  location VARCHAR(150),
  follower_count INTEGER,
  engagement_rate NUMERIC(5,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT influencer_profiles_follower_count_check
    CHECK (follower_count IS NULL OR follower_count >= 0),
  CONSTRAINT influencer_profiles_engagement_rate_check
    CHECK (
      engagement_rate IS NULL
      OR (engagement_rate >= 0 AND engagement_rate <= 100)
    ),
  CONSTRAINT influencer_profiles_social_link_check
    CHECK (
      NULLIF(BTRIM(instagram_url), '') IS NOT NULL
      OR NULLIF(BTRIM(tiktok_url), '') IS NOT NULL
      OR NULLIF(BTRIM(youtube_url), '') IS NOT NULL
      OR NULLIF(BTRIM(x_url), '') IS NOT NULL
      OR NULLIF(BTRIM(facebook_url), '') IS NOT NULL
      OR NULLIF(BTRIM(website_url), '') IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid
  ON public.users (firebase_uid);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON public.users (email);

CREATE INDEX IF NOT EXISTS idx_influencer_profiles_niche
  ON public.influencer_profiles (niche);

COMMIT;
