-- Pass 1: exact safe tag-normalization changes approved after the 2026-10-03 production dry run.
-- This migration is deliberately pinned to the 63 published rows and their exact pre-migration tag arrays.
-- It changes only posts.tags. The posts_set_updated_at trigger is disabled only while the table is locked
-- so this metadata cleanup does not rewrite article chronology. Any drift aborts the whole transaction.

CREATE TEMP TABLE tag_normalization_pass1 (
  post_id integer PRIMARY KEY,
  before_tags text[] NOT NULL,
  after_tags text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO tag_normalization_pass1 (post_id, before_tags, after_tags) VALUES
  (13, ARRAY['Laptops', 'MacBook', 'Dell XPS', 'Reviews']::text[], ARRAY['laptops', 'MacBook', 'Dell XPS', 'Reviews']::text[]),
  (16, ARRAY['Data Breach', 'Healthcare', 'Privacy', 'Security']::text[], ARRAY['data breach', 'Healthcare', 'privacy', 'security']::text[]),
  (94, ARRAY['Scams', 'Smishing', 'Cybersecurity', 'Canada']::text[], ARRAY['scams', 'Smishing', 'cybersecurity', 'Canada']::text[]),
  (98, ARRAY['iPhone', 'Android', 'Privacy', 'Trade-in']::text[], ARRAY['iPhone', 'Android', 'privacy', 'Trade-in']::text[]),
  (99, ARRAY['Passkeys', 'Passwords', 'Cybersecurity', 'Authentication']::text[], ARRAY['passkeys', 'passwords', 'cybersecurity', 'authentication']::text[]),
  (105, ARRAY['Tesla', 'FSD', 'Autonomous Driving', 'AI Safety', 'Electric Vehicles']::text[], ARRAY['Tesla', 'FSD', 'Autonomous Driving', 'AI safety', 'Electric Vehicles']::text[]),
  (151, ARRAY['Canada Tech', 'CRTC', 'Telecom', 'Analysis', 'Consumer Rights']::text[], ARRAY['Canada Tech', 'CRTC', 'Telecom', 'Analysis', 'consumer rights']::text[]),
  (152, ARRAY['Canada Tech', 'CRTC', 'Spam Calls', 'Analysis', 'Privacy']::text[], ARRAY['Canada Tech', 'CRTC', 'Spam Calls', 'Analysis', 'privacy']::text[]),
  (153, ARRAY['AI', 'Canada', 'AI Policy', 'Analysis', 'Transparency']::text[], ARRAY['AI', 'Canada', 'AI policy', 'Analysis', 'Transparency']::text[]),
  (154, ARRAY['Guides', 'Canada', 'Cellphone Plans', 'CRTC', 'Wireless']::text[], ARRAY['Guides', 'Canada', 'cellphone plans', 'CRTC', 'wireless']::text[]),
  (156, ARRAY['Canada Tech', 'CRTC', 'Telecom', 'Explainer', 'Consumer Rights']::text[], ARRAY['Canada Tech', 'CRTC', 'Telecom', 'Explainer', 'consumer rights']::text[]),
  (188, ARRAY['CRTC', 'Cogeco', 'TekSavvy', 'internet competition', 'Ontario']::text[], ARRAY['CRTC', 'Cogeco', 'TekSavvy', 'internet competition', 'ontario']::text[]),
  (191, ARRAY['QR codes', 'phishing', 'scams', 'Canadian Anti-Fraud Centre', 'mobile security']::text[], ARRAY['QR codes', 'phishing', 'scams', 'Canadian Anti-Fraud Centre', 'Mobile security']::text[]),
  (253, ARRAY['Windows 11', 'recovery drive', 'USB', 'backup', 'PC repair']::text[], ARRAY['Windows 11', 'recovery drive', 'USB', 'Backup', 'PC repair']::text[]),
  (264, ARRAY['mobile data', 'Canada', 'telecom', '5G', 'phone plans']::text[], ARRAY['mobile data', 'Canada', 'Telecom', '5G', 'phone plans']::text[]),
  (267, ARRAY['Canada Tech', 'Xanadu', 'Quantum Computing', 'Canada', 'Analysis']::text[], ARRAY['Canada Tech', 'Xanadu', 'quantum computing', 'Canada', 'Analysis']::text[]),
  (268, ARRAY['Apple Maps', 'Canada Tech', 'Apple', 'Advertising', 'Privacy']::text[], ARRAY['Apple Maps', 'Canada Tech', 'Apple', 'advertising', 'privacy']::text[]),
  (270, ARRAY['Nvidia', 'AI Infrastructure', 'Memory', 'Data Centres', 'Analysis']::text[], ARRAY['Nvidia', 'AI infrastructure', 'memory', 'data centres', 'Analysis']::text[]),
  (273, ARRAY['Nvidia', 'AI', 'Earnings', 'Data Centres', 'Analysis']::text[], ARRAY['Nvidia', 'AI', 'Earnings', 'data centres', 'Analysis']::text[]),
  (274, ARRAY['Cybersecurity', 'AI', 'OpenAI', 'Anthropic', 'Analysis']::text[], ARRAY['cybersecurity', 'AI', 'OpenAI', 'Anthropic', 'Analysis']::text[]),
  (275, ARRAY['Anthropic', 'Claude', 'AI Policy', 'Business &amp; Policy', 'Defence']::text[], ARRAY['Anthropic', 'Claude', 'AI policy', 'Business & Policy', 'Defence']::text[]),
  (276, ARRAY['Meta', 'Smart Glasses', 'Privacy', 'Ray-Ban Meta', 'Gadgets']::text[], ARRAY['Meta', 'smart glasses', 'privacy', 'Ray-Ban Meta', 'Gadgets']::text[]),
  (278, ARRAY['Alibaba', 'AI', 'China Tech', 'Semiconductors', 'Business']::text[], ARRAY['Alibaba', 'AI', 'China Tech', 'semiconductors', 'Business']::text[]),
  (279, ARRAY['Cybersecurity', 'Critical Infrastructure', 'Energy', 'Iran', 'News']::text[], ARRAY['cybersecurity', 'critical infrastructure', 'Energy', 'Iran', 'News']::text[]),
  (281, ARRAY['Semiconductors', 'CXMT', 'Xiaomi', 'Memory', 'Business &amp; Policy']::text[], ARRAY['semiconductors', 'CXMT', 'Xiaomi', 'memory', 'Business & Policy']::text[]),
  (282, ARRAY['AI Infrastructure', 'Data Centres', 'Business &amp; Policy', 'Energy', 'Canada']::text[], ARRAY['AI infrastructure', 'data centres', 'Business & Policy', 'Energy', 'Canada']::text[]),
  (283, ARRAY['OpenAI', 'AI Policy', 'California', 'AI Safety', 'Business &amp; Policy']::text[], ARRAY['OpenAI', 'AI policy', 'California', 'AI safety', 'Business & Policy']::text[]),
  (284, ARRAY['AI Safety', 'OpenAI', 'Anthropic', 'Cybersecurity', 'Analysis']::text[], ARRAY['AI safety', 'OpenAI', 'Anthropic', 'cybersecurity', 'Analysis']::text[]),
  (285, ARRAY['Canada Tech', 'Tariffs', 'Electronics', 'Trade', 'Business &amp; Policy']::text[], ARRAY['Canada Tech', 'Tariffs', 'Electronics', 'trade', 'Business & Policy']::text[]),
  (287, ARRAY['OpenAI', 'AI Safety', 'Cybersecurity', 'Frontier AI', 'News']::text[], ARRAY['OpenAI', 'AI safety', 'cybersecurity', 'frontier AI', 'News']::text[]),
  (288, ARRAY['Flock Safety', 'Surveillance', 'Privacy', 'AI', 'Business &amp; Policy']::text[], ARRAY['Flock Safety', 'surveillance', 'privacy', 'AI', 'Business & Policy']::text[]),
  (289, ARRAY['SpaceX', 'Starship', 'Space', 'Louisiana', 'News']::text[], ARRAY['SpaceX', 'Starship', 'space', 'Louisiana', 'News']::text[]),
  (290, ARRAY['Claude', 'Anthropic', 'Software &amp; Apps', 'AI assistants', 'Privacy']::text[], ARRAY['Claude', 'Anthropic', 'Software & Apps', 'AI assistants', 'privacy']::text[]),
  (291, ARRAY['GTA 6', 'Gaming', 'Cybersecurity', 'Malware', 'Rockstar Games']::text[], ARRAY['GTA 6', 'Gaming', 'cybersecurity', 'malware', 'Rockstar Games']::text[]),
  (293, ARRAY['OpenAI', 'Hugging Face', 'AI Safety', 'Cybersecurity', 'Business &amp; Policy']::text[], ARRAY['OpenAI', 'Hugging Face', 'AI safety', 'cybersecurity', 'Business & Policy']::text[]),
  (294, ARRAY['Zillow', 'Redfin', 'FTC', 'Antitrust', 'Business &amp; Policy']::text[], ARRAY['Zillow', 'Redfin', 'FTC', 'Antitrust', 'Business & Policy']::text[]),
  (321, ARRAY['Analysis', 'Privacy', 'Location data', 'Mobile security']::text[], ARRAY['Analysis', 'privacy', 'Location data', 'Mobile security']::text[]),
  (322, ARRAY['Guide', 'WhatsApp', 'iPhone', 'Android', 'Data transfer']::text[], ARRAY['Guide', 'WhatsApp', 'iPhone', 'Android', 'data transfer']::text[]),
  (324, ARRAY['Guide', 'USB-C', 'Cables', 'Charging', 'Displays']::text[], ARRAY['Guide', 'USB-C', 'cables', 'charging', 'Displays']::text[]),
  (370, ARRAY['Analysis', 'Enterprise AI', 'Data Privacy', 'Cybersecurity']::text[], ARRAY['Analysis', 'Enterprise AI', 'data privacy', 'cybersecurity']::text[]),
  (371, ARRAY['Policy', 'AI Regulation', 'Consultation', 'Canada']::text[], ARRAY['Policy', 'AI regulation', 'Consultation', 'Canada']::text[]),
  (372, ARRAY['Security Guide', 'AirTag', 'Android', 'Personal Safety']::text[], ARRAY['Security Guide', 'AirTag', 'Android', 'personal safety']::text[]),
  (373, ARRAY['Photo Recovery', 'iPhone', 'Google Photos', 'Troubleshooting']::text[], ARRAY['photo recovery', 'iPhone', 'Google Photos', 'troubleshooting']::text[]),
  (375, ARRAY['Artificial Intelligence', 'Venture Capital', 'Canadian Startups', 'Radical Ventures', 'Investment']::text[], ARRAY['artificial intelligence', 'Venture Capital', 'Canadian startups', 'Radical Ventures', 'Investment']::text[]),
  (376, ARRAY['Alberta', 'Broadband', 'Rural Internet', 'Canada', 'Telecom']::text[], ARRAY['Alberta', 'broadband', 'rural internet', 'Canada', 'Telecom']::text[]),
  (377, ARRAY['Account Security', 'Google', 'Apple', 'Privacy', 'Connected Apps']::text[], ARRAY['account security', 'Google', 'Apple', 'privacy', 'Connected Apps']::text[]),
  (379, ARRAY['Monitors', 'Windows', 'macOS', 'Troubleshooting', 'USB-C']::text[], ARRAY['Monitors', 'Windows', 'macOS', 'troubleshooting', 'USB-C']::text[]),
  (380, ARRAY['Canada-EU Relations', 'Digital Trade', 'Artificial Intelligence', 'Technology Policy', 'CETA']::text[], ARRAY['Canada-EU Relations', 'digital trade', 'artificial intelligence', 'technology policy', 'CETA']::text[]),
  (381, ARRAY['Claude', 'Anthropic', 'Documents', 'Presentations', 'Productivity']::text[], ARRAY['Claude', 'Anthropic', 'Documents', 'Presentations', 'productivity']::text[]),
  (382, ARRAY['Phone Repair', 'Privacy', 'iPhone', 'Android', 'Backup']::text[], ARRAY['phone repair', 'privacy', 'iPhone', 'Android', 'Backup']::text[]),
  (383, ARRAY['Phone Charging', 'USB-C', 'iPhone', 'Android', 'Troubleshooting']::text[], ARRAY['Phone Charging', 'USB-C', 'iPhone', 'Android', 'troubleshooting']::text[]),
  (384, ARRAY['Privacy', 'App Permissions', 'Camera', 'Microphone', 'Windows', 'macOS']::text[], ARRAY['privacy', 'app permissions', 'Camera', 'Microphone', 'Windows', 'macOS']::text[]),
  (420, ARRAY['Online Safety', 'Australia', 'United States', 'Social Media', 'Digital Policy']::text[], ARRAY['online safety', 'Australia', 'United States', 'social media', 'Digital Policy']::text[]),
  (421, ARRAY['Claude', 'Anthropic', 'AI Models', 'GitHub Copilot', 'AI Safety']::text[], ARRAY['Claude', 'Anthropic', 'AI models', 'GitHub Copilot', 'AI safety']::text[]),
  (422, ARRAY['Credit Reports', 'Identity Theft', 'Fraud', 'Equifax', 'TransUnion']::text[], ARRAY['Credit Reports', 'identity theft', 'fraud', 'Equifax', 'TransUnion']::text[]),
  (423, ARRAY['Smishing', 'Phishing', 'Text Messages', 'Scams', 'Mobile Security']::text[], ARRAY['Smishing', 'phishing', 'Text Messages', 'scams', 'Mobile security']::text[]),
  (424, ARRAY['OpenAI', 'AI agents', 'Cybersecurity', 'Australia', 'Government technology']::text[], ARRAY['OpenAI', 'AI agents', 'cybersecurity', 'Australia', 'Government technology']::text[]),
  (425, ARRAY['FBIJobs', 'ShinyHunters', 'Cybersecurity', 'Data breaches', 'Government technology']::text[], ARRAY['FBIJobs', 'ShinyHunters', 'cybersecurity', 'Data breaches', 'Government technology']::text[]),
  (427, ARRAY['Used phones', 'IMEI', 'Activation Lock', 'Android', 'Consumer advice']::text[], ARRAY['used phones', 'IMEI', 'Activation Lock', 'Android', 'Consumer advice']::text[]),
  (428, ARRAY['Wi-Fi', 'iPhone', 'Android', 'Privacy', 'Mobile security']::text[], ARRAY['Wi-Fi', 'iPhone', 'Android', 'privacy', 'Mobile security']::text[]),
  (436, ARRAY['Data centres', 'Optical networking', 'China', 'Supply chains', 'Cybersecurity']::text[], ARRAY['data centres', 'Optical networking', 'China', 'supply chains', 'cybersecurity']::text[]),
  (437, ARRAY['Tech support scams', 'Browser security', 'Windows', 'Mac', 'Cybersecurity']::text[], ARRAY['Tech support scams', 'browser security', 'Windows', 'Mac', 'cybersecurity']::text[]),
  (438, ARRAY['Data breaches', 'Email security', 'Passwords', 'Identity theft', 'Cybersecurity']::text[], ARRAY['Data breaches', 'email security', 'passwords', 'identity theft', 'cybersecurity']::text[]);

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT COUNT(*)::int
  INTO mismatch_count
  FROM tag_normalization_pass1 m
  LEFT JOIN posts p ON p.id = m.post_id
  WHERE p.id IS NULL
     OR p.status <> 'published'
     OR p.tags IS DISTINCT FROM m.before_tags;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Pass 1 tag normalization aborted: % mapped rows no longer match the reviewed dry run.', mismatch_count;
  END IF;
END
$$;

ALTER TABLE posts DISABLE TRIGGER posts_set_updated_at;

UPDATE posts p
SET tags = m.after_tags
FROM tag_normalization_pass1 m
WHERE p.id = m.post_id
  AND p.status = 'published'
  AND p.tags = m.before_tags;

DO $$
DECLARE
  applied_count integer;
BEGIN
  SELECT COUNT(*)::int
  INTO applied_count
  FROM tag_normalization_pass1 m
  JOIN posts p ON p.id = m.post_id
  WHERE p.status = 'published'
    AND p.tags = m.after_tags;

  IF applied_count <> 63 THEN
    RAISE EXCEPTION 'Pass 1 tag normalization verification failed: expected 63 normalized rows, found %.', applied_count;
  END IF;
END
$$;

ALTER TABLE posts ENABLE TRIGGER posts_set_updated_at;
