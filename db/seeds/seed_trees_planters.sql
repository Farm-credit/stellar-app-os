-- Seed: seed_trees_planters.sql
-- Closes #546
--
-- Provides realistic local dev data for planters, trees, progress_updates,
-- and disputes. Safe to re-run (uses ON CONFLICT DO NOTHING throughout).
-- Run AFTER all migrations 001-006 have been applied.

-- ── Planters ─────────────────────────────────────────────────────────────────

INSERT INTO planters
  (stellar_address, full_name, country_code, region, lat, lng, phone_e164, kyc_status)
VALUES
  ('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
   'Aminu Musa',         'NG', 'Kano, Nigeria',         12.04,  8.48, '+2348012345678', 'verified'),
  ('GBSJ7KFU2NXACVHVN2VWQIXIV5FWH6A423YVXAGKJUOTNUVWD5CMKEZ',
   'Fatima Yusuf',       'NG', 'Kaduna, Nigeria',       10.48,  7.40, '+2348023456789', 'verified'),
  ('GD6WNTESP5P7UDPGM3OODAQGAMM3TBPQ7GJICNPQMHLSXP56BXE4P24',
   'Kwame Asante',       'GH', 'Greater Accra, Ghana',   5.58, -0.18, '+233244567890',  'verified'),
  ('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZEP0MOQPZJQ5CGBGVRFG',
   'Aisha Nakato',       'UG', 'Kampala, Uganda',        0.30, 32.55, '+256712345678',  'pending'),
  ('GBVV2QWHWUQ7PGCDZ4JLJNBXW6CTMFOBGRD4S5XBGCRM53JXDTNNGKC',
   'James Mwangi',       'KE', 'Nairobi, Kenya',        -1.27, 36.78, '+254712345678',  'verified')
ON CONFLICT (stellar_address) DO NOTHING;

-- ── Trees ─────────────────────────────────────────────────────────────────────

INSERT INTO trees
  (contract_address, token_id, tree_ref, planter_id, species_slug,
   lat, lng, region, country_code, status, escrow_account,
   planted_at, verified_at)
VALUES
  -- Kano – Teak (planter 1)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 1,
   'HRV-2024-0001',
   (SELECT id FROM planters WHERE stellar_address = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
   'teak', 12.04, 8.48, 'Kano, Nigeria', 'NG', 'verified',
   'GBW4QY56QDXJL7SCZMBNLXUIMCZ7V6LNJRHE7PBXF7RMEZGMJX5RJBJ',
   '2024-03-12T08:00:00Z', '2024-06-12T08:00:00Z'),

  -- Kano – Moringa (planter 1)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 2,
   'HRV-2024-0002',
   (SELECT id FROM planters WHERE stellar_address = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
   'moringa', 11.98, 8.55, 'Kano, Nigeria', 'NG', 'planted', NULL,
   '2024-05-20T10:30:00Z', NULL),

  -- Kaduna – Eucalyptus (planter 2)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 3,
   'HRV-2024-0003',
   (SELECT id FROM planters WHERE stellar_address = 'GBSJ7KFU2NXACVHVN2VWQIXIV5FWH6A423YVXAGKJUOTNUVWD5CMKEZ'),
   'eucalyptus', 10.48, 7.40, 'Kaduna, Nigeria', 'NG', 'completed', NULL,
   '2023-11-05T14:00:00Z', '2024-02-05T14:00:00Z'),

  -- Greater Accra – Mangrove (planter 3)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 4,
   'HRV-2024-0004',
   (SELECT id FROM planters WHERE stellar_address = 'GD6WNTESP5P7UDPGM3OODAQGAMM3TBPQ7GJICNPQMHLSXP56BXE4P24'),
   'mangrove', 5.58, -0.18, 'Greater Accra, Ghana', 'GH', 'verified', NULL,
   '2024-01-18T09:15:00Z', '2024-04-18T09:15:00Z'),

  -- Kampala – Mangrove — failed (planter 4, pending KYC)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 5,
   'HRV-2024-0005',
   (SELECT id FROM planters WHERE stellar_address = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZEP0MOQPZJQ5CGBGVRFG'),
   'mangrove', 0.30, 32.55, 'Kampala, Uganda', 'UG', 'failed', NULL,
   '2023-09-14T16:20:00Z', NULL),

  -- Nairobi – Teak (planter 5)
  ('CAQJKECMBRDCGQH7RFVKF4JY4LQWMOJJOPSKL2OEKM5YPM2QWBQVWBJ', 6,
   'HRV-2024-0006',
   (SELECT id FROM planters WHERE stellar_address = 'GBVV2QWHWUQ7PGCDZ4JLJNBXW6CTMFOBGRD4S5XBGCRM53JXDTNNGKC'),
   'teak', -1.27, 36.78, 'Nairobi, Kenya', 'KE', 'planted', NULL,
   '2024-02-28T11:00:00Z', NULL)
ON CONFLICT (contract_address, token_id) DO NOTHING;

-- ── Progress Updates ──────────────────────────────────────────────────────────

INSERT INTO progress_updates
  (tree_id, paging_token, update_type, from_status, to_status, lat, lng,
   media_url, submitted_by, created_at)
VALUES
  -- Tree 1 (HRV-2024-0001): funded → planted → verified
  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0001'),
   'HRV-0001-TOKEN-001', 'status_change', 'funded', 'planted',
   12.04, 8.48, NULL,
   'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
   '2024-03-12T08:00:00Z'),

  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0001'),
   'HRV-0001-TOKEN-002', 'photo_submitted', NULL, NULL,
   12.04, 8.48, 'https://ipfs.io/ipfs/QmPlantPhotoTeak001',
   'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
   '2024-03-15T10:30:00Z'),

  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0001'),
   'HRV-0001-TOKEN-003', 'status_change', 'planted', 'verified',
   12.04, 8.48, NULL,
   'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
   '2024-06-12T08:00:00Z'),

  -- Tree 5 (HRV-2024-0005): planted → failed
  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0005'),
   'HRV-0005-TOKEN-001', 'status_change', 'planted', 'failed',
   0.30, 32.55, NULL,
   'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZEP0MOQPZJQ5CGBGVRFG',
   '2023-12-14T16:20:00Z')
ON CONFLICT (paging_token) DO NOTHING;

-- ── Disputes ──────────────────────────────────────────────────────────────────

INSERT INTO disputes
  (tree_id, raised_by, category, description, status, assigned_to, created_at)
VALUES
  -- Dispute on the failed Kampala tree
  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0005'),
   'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
   'survival_failure',
   'Tree reported as failed without sufficient photo evidence. Requesting re-verification.',
   'open', NULL, '2024-01-10T09:00:00Z'),

  -- Resolved GPS mismatch on Kano tree
  ((SELECT id FROM trees WHERE tree_ref = 'HRV-2024-0001'),
   'GBSJ7KFU2NXACVHVN2VWQIXIV5FWH6A423YVXAGKJUOTNUVWD5CMKEZ',
   'gps_mismatch',
   'GPS coordinates differ by >500m from expected farm boundary.',
   'resolved', 'GBVV2QWHWUQ7PGCDZ4JLJNBXW6CTMFOBGRD4S5XBGCRM53JXDTNNGKC',
   '2024-04-01T11:00:00Z')
ON CONFLICT DO NOTHING;
