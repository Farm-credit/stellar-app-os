CREATE TABLE IF NOT EXISTS sponsor_forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_wallet TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('species-talk', 'volunteer-meetups', 'conservation-news', 'platform-help')
  ),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 8 AND 120),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 20 AND 5000),
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sponsor_forum_posts_status_created_idx
  ON sponsor_forum_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sponsor_forum_posts_category_created_idx
  ON sponsor_forum_posts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS sponsor_forum_posts_tags_idx
  ON sponsor_forum_posts USING GIN (tags);

CREATE TABLE IF NOT EXISTS sponsor_forum_votes (
  post_id UUID NOT NULL REFERENCES sponsor_forum_posts (id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, wallet)
);

CREATE INDEX IF NOT EXISTS sponsor_forum_votes_wallet_idx
  ON sponsor_forum_votes (wallet);

REVOKE ALL ON sponsor_forum_posts, sponsor_forum_votes FROM PUBLIC;
