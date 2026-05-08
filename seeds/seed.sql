-- Studio PM Seed Data

-- Clients
INSERT INTO clients (id, name, contact_email, contact_phone, address) VALUES
  ('11111111-0001-0001-0001-000000000001', 'Pixelwave Studios', 'contact@pixelwave.com', '+1 415-555-0101', '100 Market St, San Francisco, CA 94105'),
  ('11111111-0001-0001-0001-000000000002', 'NeonDream Entertainment', 'projects@neondream.io', '+1 310-555-0202', '8500 Wilshire Blvd, Los Angeles, CA 90211'),
  ('11111111-0001-0001-0001-000000000003', 'TurboVFX Asia', 'bd@turbovfx.asia', '+886-2-2555-0303', '100 Songde Rd, Xinyi District, Taipei')
ON CONFLICT DO NOTHING;

-- Team Members (10 members)
INSERT INTO team_members (id, name, role, hourly_rate, status, email, avatar_color) VALUES
  ('22222222-0001-0001-0001-000000000001', '陳志遠', '美術總監', 120.00, 'active', 'chih@studio.pm', '#6366f1'),
  ('22222222-0001-0001-0001-000000000002', '林美玲', '3D 建模師', 85.00, 'active', 'meiling@studio.pm', '#8b5cf6'),
  ('22222222-0001-0001-0001-000000000003', '王大偉', '動畫師', 90.00, 'active', 'dawei@studio.pm', '#ec4899'),
  ('22222222-0001-0001-0001-000000000004', '張雅婷', '材質師', 80.00, 'active', 'yating@studio.pm', '#f59e0b'),
  ('22222222-0001-0001-0001-000000000005', '李俊明', '技術總監', 130.00, 'active', 'junming@studio.pm', '#10b981'),
  ('22222222-0001-0001-0001-000000000006', '吳珊珊', '特效師', 95.00, 'active', 'shanshan@studio.pm', '#3b82f6'),
  ('22222222-0001-0001-0001-000000000007', '鄭文豪', 'Rigging 師', 88.00, 'active', 'wenhao@studio.pm', '#ef4444'),
  ('22222222-0001-0001-0001-000000000008', '黃建國', '合成師', 92.00, 'active', 'jianguo@studio.pm', '#14b8a6'),
  ('22222222-0001-0001-0001-000000000009', 'Mike Johnson', '導演', 150.00, 'active', 'mike@studio.pm', '#f97316'),
  ('22222222-0001-0001-0001-000000000010', 'Sarah Chen', '製作人', 110.00, 'active', 'sarah@studio.pm', '#a855f7')
ON CONFLICT DO NOTHING;

-- Projects (5 projects)
INSERT INTO projects (id, name, client_id, description, budget, status, start_date, end_date, color) VALUES
  ('33333333-0001-0001-0001-000000000001', 'Dragon Chronicle S2', '11111111-0001-0001-0001-000000000001',
   'Season 2 of the Dragon Chronicle animated series. 12 episodes, full 3D production.', 850000.00, 'active',
   CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '120 days', '#6366f1'),
  ('33333333-0001-0001-0001-000000000002', 'NeonCity VFX Pack', '11111111-0001-0001-0001-000000000002',
   'VFX assets and particle systems for NeonDream''s flagship mobile game.', 320000.00, 'active',
   CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '60 days', '#ec4899'),
  ('33333333-0001-0001-0001-000000000003', 'TurboRacer Cinematic', '11111111-0001-0001-0001-000000000003',
   'Opening cinematic for TurboRacer 2025 game title. 3-minute fully rendered sequence.', 180000.00, 'active',
   CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '90 days', '#f59e0b'),
  ('33333333-0001-0001-0001-000000000004', 'Studio Reel 2025', NULL,
   'Internal studio showcase reel for client pitches and awards submissions.', 45000.00, 'planning',
   CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '90 days', '#10b981'),
  ('33333333-0001-0001-0001-000000000005', 'Pixelwave Brand Campaign', '11111111-0001-0001-0001-000000000001',
   'Brand refresh campaign: 3 hero videos, 10 social cuts.', 220000.00, 'completed',
   CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE - INTERVAL '10 days', '#3b82f6')
ON CONFLICT DO NOTHING;

-- Tasks for Dragon Chronicle S2
INSERT INTO tasks (id, project_id, name, task_type, status, priority, start_date, end_date, order_index) VALUES
  ('44444444-0001-0001-0001-000000000001', '33333333-0001-0001-0001-000000000001', 'Character Modeling - Dragon Main', 'modeling', 'in-progress', 'high', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '14 days', 1),
  ('44444444-0001-0001-0001-000000000002', '33333333-0001-0001-0001-000000000001', 'Dragon Rigging & Skinning', 'rigging', 'todo', 'high', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '35 days', 2),
  ('44444444-0001-0001-0001-000000000003', '33333333-0001-0001-0001-000000000001', 'Environment - Castle & Ruins', 'modeling', 'in-progress', 'medium', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '20 days', 3),
  ('44444444-0001-0001-0001-000000000004', '33333333-0001-0001-0001-000000000001', 'Episode 1 Animation', 'animation', 'todo', 'high', CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '65 days', 4),
  ('44444444-0001-0001-0001-000000000005', '33333333-0001-0001-0001-000000000001', 'Dragon Fire VFX', 'vfx', 'todo', 'medium', CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE + INTERVAL '75 days', 5),
  ('44444444-0001-0001-0001-000000000006', '33333333-0001-0001-0001-000000000001', 'Compositing & Color Grade', 'compositing', 'todo', 'medium', CURRENT_DATE + INTERVAL '70 days', CURRENT_DATE + INTERVAL '110 days', 6)
ON CONFLICT DO NOTHING;

-- Tasks for NeonCity VFX Pack
INSERT INTO tasks (id, project_id, name, task_type, status, priority, start_date, end_date, order_index) VALUES
  ('44444444-0002-0001-0001-000000000001', '33333333-0001-0001-0001-000000000002', 'Particle System Design', 'vfx', 'in-progress', 'high', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '15 days', 1),
  ('44444444-0002-0001-0001-000000000002', '33333333-0001-0001-0001-000000000002', 'Shader Development', 'vfx', 'todo', 'medium', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '40 days', 2),
  ('44444444-0002-0001-0001-000000000003', '33333333-0001-0001-0001-000000000002', 'City Environment Assets', 'modeling', 'in-progress', 'high', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '25 days', 3)
ON CONFLICT DO NOTHING;

-- Tasks for TurboRacer Cinematic
INSERT INTO tasks (id, project_id, name, task_type, status, priority, start_date, end_date, order_index) VALUES
  ('44444444-0003-0001-0001-000000000001', '33333333-0001-0001-0001-000000000003', 'Car Modeling & Texturing', 'modeling', 'todo', 'high', CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '35 days', 1),
  ('44444444-0003-0001-0001-000000000002', '33333333-0001-0001-0001-000000000003', 'Race Track Environment', 'modeling', 'todo', 'medium', CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '50 days', 2),
  ('44444444-0003-0001-0001-000000000003', '33333333-0001-0001-0001-000000000003', 'Cinematic Animation', 'animation', 'todo', 'high', CURRENT_DATE + INTERVAL '40 days', CURRENT_DATE + INTERVAL '80 days', 3)
ON CONFLICT DO NOTHING;

-- Time Allocations (sample schedule)
INSERT INTO time_allocations (task_id, team_member_id, allocated_days, allocated_hours, start_date, end_date, notes)
VALUES
  -- Dragon: Character Modeling → Lin Meiling (modeler)
  ('44444444-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000002', 30, 240, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '14 days', 'Main dragon body, wings, scales'),
  -- Dragon: Rigging → Zheng Wenhao (rigger)
  ('44444444-0001-0001-0001-000000000002', '22222222-0001-0001-0001-000000000007', 18, 144, CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '35 days', 'Full body rig with wing controls'),
  -- Dragon: Environment → Wang Dawei (animator doing layout)
  ('44444444-0001-0001-0001-000000000003', '22222222-0001-0001-0001-000000000003', 25, 200, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '20 days', 'Castle exterior and interior'),
  -- Dragon: Episode 1 Animation → Wang Dawei
  ('44444444-0001-0001-0001-000000000004', '22222222-0001-0001-0001-000000000003', 25, 200, CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE + INTERVAL '65 days', 'Primary animation pass'),
  -- Dragon: VFX → Wu Shanshan
  ('44444444-0001-0001-0001-000000000005', '22222222-0001-0001-0001-000000000006', 20, 160, CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE + INTERVAL '75 days', 'Fire breath, impact effects'),
  -- Dragon: Compositing → Huang Jianguo
  ('44444444-0001-0001-0001-000000000006', '22222222-0001-0001-0001-000000000008', 28, 224, CURRENT_DATE + INTERVAL '70 days', CURRENT_DATE + INTERVAL '110 days', 'Episode comp and grade'),
  -- NeonCity: Particles → Wu Shanshan
  ('44444444-0002-0001-0001-000000000001', '22222222-0001-0001-0001-000000000006', 20, 160, CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE + INTERVAL '10 days', 'Neon spark and glow systems'),
  -- NeonCity: Shader → Li Junming (tech director)
  ('44444444-0002-0001-0001-000000000002', '22222222-0001-0001-0001-000000000005', 22, 176, CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '40 days', 'Custom HLSL shaders'),
  -- NeonCity: City Assets → Lin Meiling (already on Dragon, later slot)
  ('44444444-0002-0001-0001-000000000003', '22222222-0001-0001-0001-000000000004', 30, 240, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE + INTERVAL '25 days', 'Building facades, props, signs')
ON CONFLICT DO NOTHING;

-- Contracts
INSERT INTO contracts (id, project_id, client_id, contract_number, amount, currency, signed_date, effective_date, expiry_date, status, notes)
VALUES
  ('55555555-0001-0001-0001-000000000001', '33333333-0001-0001-0001-000000000001', '11111111-0001-0001-0001-000000000001',
   'CNT-2025-001', 850000.00, 'USD', CURRENT_DATE - INTERVAL '65 days', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '180 days', 'signed', 'Full production contract for Dragon Chronicle Season 2. Payment in 3 milestones.'),
  ('55555555-0001-0001-0001-000000000002', '33333333-0001-0001-0001-000000000002', '11111111-0001-0001-0001-000000000002',
   'CNT-2025-002', 320000.00, 'USD', CURRENT_DATE - INTERVAL '35 days', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '90 days', 'signed', 'VFX asset pack delivery contract.'),
  ('55555555-0001-0001-0001-000000000003', '33333333-0001-0001-0001-000000000003', '11111111-0001-0001-0001-000000000003',
   'CNT-2025-003', 180000.00, 'USD', NULL, CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '120 days', 'draft', 'Pending client legal review.')
ON CONFLICT DO NOTHING;

-- Invoices
INSERT INTO invoices (id, project_id, contract_id, invoice_number, amount, currency, issued_date, due_date, status, notes)
VALUES
  ('66666666-0001-0001-0001-000000000001', '33333333-0001-0001-0001-000000000001', '55555555-0001-0001-0001-000000000001',
   'INV-2025-001', 283333.34, 'USD', CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE - INTERVAL '15 days', 'paid', 'Milestone 1: Pre-production & Character Assets'),
  ('66666666-0001-0001-0001-000000000002', '33333333-0001-0001-0001-000000000001', '55555555-0001-0001-0001-000000000001',
   'INV-2025-002', 283333.33, 'USD', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days', 'sent', 'Milestone 2: Animation Production'),
  ('66666666-0001-0001-0001-000000000003', '33333333-0001-0001-0001-000000000002', '55555555-0001-0001-0001-000000000002',
   'INV-2025-003', 160000.00, 'USD', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '20 days', 'sent', '50% deposit for VFX Pack'),
  ('66666666-0001-0001-0001-000000000004', '33333333-0001-0001-0001-000000000005', NULL,
   'INV-2025-004', 220000.00, 'USD', CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '5 days', 'overdue', 'Brand Campaign - Final delivery invoice')
ON CONFLICT DO NOTHING;

-- Invoice Items for INV-2025-001
INSERT INTO invoice_items (invoice_id, team_member_id, description, hours, rate, amount)
VALUES
  ('66666666-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000001', '美術總監 — 前期製作監督', 80, 120.00, 9600.00),
  ('66666666-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000002', '3D 建模師 — 龍角色建模', 200, 85.00, 17000.00),
  ('66666666-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000007', 'Rigging 師 — 骨架設定', 100, 88.00, 8800.00),
  ('66666666-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000009', '導演 — 故事版與概念審核', 60, 150.00, 9000.00),
  ('66666666-0001-0001-0001-000000000001', '22222222-0001-0001-0001-000000000010', '製作人 — 專案管理', 80, 110.00, 8800.00)
ON CONFLICT DO NOTHING;
