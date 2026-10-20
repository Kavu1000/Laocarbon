-- Demo projects. IDs 1–3 match the projects registered on-chain by scripts/seed.ts.
insert into public.projects
  (id, status, name, company, type, description, area_ha, estimated_credits, credit_period, standard, province, district, village,
   co_benefits, contact_first, contact_last, contact_email, contact_phone, ipfs_cid, submitted_at)
values
  (1, 'approved', 'Nam Ha Forest Conservation Project', 'Nam Ha Conservation Co., Ltd.', 'REDD+ (Avoided Deforestation)',
   'Protects over 200,000 hectares of high-biodiversity forest in northern Lao PDR. The project prevents deforestation, supports local communities, and conserves critical habitat for endangered species.',
   120000, 120000, '2020 – 2030', 'VCS', 'Luang Namtha', 'Luang Namtha', 'Ban Nam Ha',
   '{Biodiversity,"Community Livelihoods","Watershed Protection"}', 'Somphone', 'Vongsa', 'contact@namha.la', '+856 20 5555 0101',
   'bafkreinamhaforestconservationpdd', '2024-01-15T10:30:00Z'),
  (2, 'approved', 'Phou Khao Reforestation Project', 'Green Mountains Ltd.', 'Afforestation / Reforestation',
   'Community-based reforestation initiative restoring degraded forests in Oudomxay with native species and village-managed nurseries.',
   42000, 85000, '2021 – 2041', 'VCS', 'Oudomxay', 'Xay', 'Ban Phou Khao',
   '{"Community Livelihoods","Soil Restoration"}', 'Khamla', 'Phommachanh', 'info@greenmountains.la', '+856 20 5555 0202',
   'bafkreiphoukhaoreforestationpdd', '2024-01-12T09:00:00Z'),
  (3, 'approved', 'Xe Pian Forest Restoration Project', 'Mekong Green Development', 'Sustainable Forest Management',
   'Large-scale forest restoration in the Xe Pian landscape supporting biodiversity, wetland protection and local livelihoods.',
   160000, 300000, '2019 – 2039', 'Gold Standard', 'Champasak', 'Pathoumphone', 'Ban Kiet Ngong',
   '{Biodiversity,"Wetland Protection","Community Livelihoods"}', 'Bounmy', 'Sisavath', 'hello@mekonggreen.la', '+856 20 5555 0303',
   'bafkreixepianrestorationpdd', '2024-01-10T08:15:00Z'),
  (4, 'in_validation', 'Dak Cheung Sustainable Forest Management', 'Lao Forest Partners', 'Sustainable Forest Management',
   'Sustainable forest management promoting responsible timber production and carbon sequestration in the Dak Cheung plateau.',
   38000, 75000, '2024 – 2034', 'VCS', 'Xekong', 'Dak Cheung', 'Ban Dak Cheung',
   '{"Sustainable Timber","Community Livelihoods"}', 'Vanh', 'Keomany', 'team@laoforest.la', '+856 20 5555 0404',
   null, '2024-01-08T14:20:00Z'),
  (5, 'pending_review', 'Nam Et-Phou Louey Conservation', 'Community Forest Alliance', 'REDD+ (Avoided Deforestation)',
   'Avoided deforestation across the Nam Et-Phou Louey National Protected Area buffer zone, co-managed with 30 villages.',
   95000, 140000, '2024 – 2034', 'VCS', 'Houaphanh', 'Viengthong', 'Ban Sakok',
   '{Biodiversity,"Community Livelihoods"}', 'Noy', 'Inthavong', 'nep@cfa.la', '+856 20 5555 0505',
   null, '2024-01-05T11:00:00Z'),
  (6, 'pending_review', 'Xe Bang Fai REDD+ Project', 'Sustainable Laos Co., Ltd.', 'REDD+ (Avoided Deforestation)',
   'Protects lowland dry dipterocarp forest along the Xe Bang Fai river from agricultural conversion.',
   60000, 90000, '2024 – 2034', 'VCS', 'Savannakhet', 'Xonnabouly', 'Ban Xe Bang Fai',
   '{"Watershed Protection",Biodiversity}', 'Phet', 'Douangchanh', 'redd@sustainablelaos.la', '+856 20 5555 0606',
   null, '2024-01-03T16:40:00Z')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.projects', 'id'), greatest((select max(id) from public.projects), 1));
