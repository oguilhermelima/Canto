-- Seed home_section rows for existing users.
-- Run after applying migration 0010_public_the_captain.sql.
-- Replace the user IDs below with your actual user IDs from: SELECT id, name FROM "user";

DO $$
DECLARE
  uid TEXT;
  defaults JSONB := '[
    {"position":0,"title":"Spotlight","style":"spotlight","source_type":"db","source_key":"spotlight","config":"{}","enabled":true},
    {"position":1,"title":"Continue Watching","style":"large_video","source_type":"db","source_key":"continue_watching","config":"{}","enabled":true},
    {"position":2,"title":"Recently Added","style":"cover","source_type":"db","source_key":"recently_added","config":"{}","enabled":true},
    {"position":3,"title":"Recommended for you","style":"large_video","source_type":"db","source_key":"recommendations","config":"{}","enabled":true},
    {"position":4,"title":"Trending TV Shows","style":"card","source_type":"tmdb","source_key":"trending","config":"{\"type\":\"show\"}","enabled":true},
    {"position":5,"title":"Action & Adventure Series","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"show\",\"mode\":\"discover\",\"genres\":\"10759\"}","enabled":true},
    {"position":6,"title":"Trending Movies","style":"card","source_type":"tmdb","source_key":"trending","config":"{\"type\":\"movie\"}","enabled":true},
    {"position":7,"title":"Sci-Fi & Fantasy","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"show\",\"mode\":\"discover\",\"genres\":\"10765\"}","enabled":true},
    {"position":8,"title":"Trending Anime","style":"card","source_type":"tmdb","source_key":"trending","config":"{\"type\":\"show\",\"genres\":\"16\",\"language\":\"ja\"}","enabled":true},
    {"position":9,"title":"Thriller Movies","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"movie\",\"mode\":\"discover\",\"genres\":\"53\"}","enabled":true},
    {"position":10,"title":"Trending Anime Movies","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"movie\",\"mode\":\"discover\",\"genres\":\"16\",\"language\":\"ja\"}","enabled":true},
    {"position":11,"title":"Crime & Mystery","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"show\",\"mode\":\"discover\",\"genres\":\"80\"}","enabled":true},
    {"position":12,"title":"Drama Series","style":"card","source_type":"tmdb","source_key":"discover","config":"{\"type\":\"show\",\"mode\":\"discover\",\"genres\":\"18\"}","enabled":true}
  ]'::JSONB;
  rec JSONB;
BEGIN
  FOR uid IN SELECT id FROM "user"
  LOOP
    FOR rec IN SELECT * FROM jsonb_array_elements(defaults)
    LOOP
      INSERT INTO home_section (user_id, "position", title, style, source_type, source_key, config, enabled)
      VALUES (
        uid,
        (rec->>'position')::INT,
        rec->>'title',
        rec->>'style',
        rec->>'source_type',
        rec->>'source_key',
        (rec->>'config')::JSONB,
        (rec->>'enabled')::BOOLEAN
      )
      ON CONFLICT (user_id, "position") DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
