-- Supabase PostgreSQL schema for the application

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'manager', 'user', 'influencer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

UPDATE users
SET role = 'user'
WHERE role IS NULL OR role NOT IN ('admin', 'manager', 'user', 'influencer');

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'user', 'influencer'));

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  timezone VARCHAR(100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS influencer_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
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
  follower_count INTEGER CHECK (follower_count IS NULL OR follower_count >= 0),
  engagement_rate NUMERIC(5,2) CHECK (
    engagement_rate IS NULL OR (engagement_rate >= 0 AND engagement_rate <= 100)
  ),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT influencer_profiles_social_link_check CHECK (
    instagram_url IS NOT NULL OR tiktok_url IS NOT NULL OR youtube_url IS NOT NULL OR
    x_url IS NOT NULL OR facebook_url IS NOT NULL OR website_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_influencer_profiles_niche ON influencer_profiles (niche);

-- Example query:
-- SELECT id, firebase_uid, email, role, created_at FROM users ORDER BY created_at DESC;
