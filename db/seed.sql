-- ============================================================
--  myself-block · 种子数据脚本（seed.sql）
--  目标库：CloudBase PostgreSQL
--  日期：2026-10-19（Day 16）
-- ------------------------------------------------------------
--  【用途】仅用于开发阶段，验证「脚本可重复执行」这一能力。
--    · 数据取自 client/api/data.js 的真实分组与真实图片宽高，
--      不是随手编的数字，因此可直接对照前端 mock 校验。
--    · 第 17 天接入真实数据后，页面主数据不再依赖本脚本。
-- ------------------------------------------------------------
--  【重要】第 20 天上线后禁止再执行本脚本：
--    开头两条 DELETE 会清空 photos 与 photo_groups 的全部真实数据。
--    上线后的数据变更一律使用增量 SQL（INSERT / UPDATE / ALTER），
--    不要再整表重置。
-- ------------------------------------------------------------
--  【执行前提】先执行 schema.sql 建表，否则本脚本会报
--    ERROR: relation "photos" does not exist
-- ------------------------------------------------------------
--  【可重复执行】先删后插：
--    第 1 次执行 → 3 组 + 17 张照片
--    第 N 次执行 → 结果完全相同，不报错、不重复累积
-- ============================================================

-- 先清子表，再清父表（外键依赖顺序）
DELETE FROM photos;
DELETE FROM photo_groups;


-- ------------------------------------------------------------
-- 1. 分组：3 行
-- ------------------------------------------------------------
INSERT INTO photo_groups (id, name, sort, created_at) VALUES
    ('experience', 'EXPERIENCE', 1, '2026-09-28 10:00:00+08'),
    ('funny',      'FUNNY',      2, '2026-09-28 10:00:00+08'),
    ('handsome',   'HANDSOME',   3, '2026-09-28 10:00:00+08');


-- ------------------------------------------------------------
-- 2. 照片：17 行（EXPERIENCE 3 + FUNNY 7 + HANDSOME 7）
--    src 用站点根相对路径；w/h 为转换产物真实像素
-- ------------------------------------------------------------
INSERT INTO photos (id, group_id, src, w, h, alt, sort, added_at) VALUES
    -- EXPERIENCE
    ('e1', 'experience', '/public/assets/photos/Experience/photo-01.webp', 1078,  598, 'EXPERIENCE 照片 01', 1, '2026-09-28'),
    ('e2', 'experience', '/public/assets/photos/Experience/photo-02.webp', 1170, 1525, 'EXPERIENCE 照片 02', 2, '2026-10-02'),
    ('e3', 'experience', '/public/assets/photos/Experience/photo-03.webp', 1079,  609, 'EXPERIENCE 照片 03', 3, '2026-10-05'),

    -- FUNNY
    ('f1', 'funny',      '/public/assets/photos/Funny/photo-01.webp',     1600, 1273, 'FUNNY 照片 01',      1, '2026-09-29'),
    ('f2', 'funny',      '/public/assets/photos/Funny/photo-02.webp',      784, 1055, 'FUNNY 照片 02',      2, '2026-10-01'),
    ('f3', 'funny',      '/public/assets/photos/Funny/photo-03.webp',      720, 1600, 'FUNNY 照片 03',      3, '2026-10-03'),
    ('f4', 'funny',      '/public/assets/photos/Funny/photo-04.webp',     1280,  960, 'FUNNY 照片 04',      4, '2026-10-06'),
    ('f5', 'funny',      '/public/assets/photos/Funny/photo-05.webp',     1600,  900, 'FUNNY 照片 05',      5, '2026-10-08'),
    ('f6', 'funny',      '/public/assets/photos/Funny/photo-06.webp',     1600,  900, 'FUNNY 照片 06',      6, '2026-10-10'),
    ('f7', 'funny',      '/public/assets/photos/Funny/photo-07.webp',     1600,  899, 'FUNNY 照片 07',      7, '2026-10-12'),

    -- HANDSOME
    ('h1', 'handsome',   '/public/assets/photos/Handsome/photo-01.webp',  1600,  842, 'HANDSOME 照片 01',   1, '2026-09-30'),
    ('h2', 'handsome',   '/public/assets/photos/Handsome/photo-02.webp',  1600,  882, 'HANDSOME 照片 02',   2, '2026-10-02'),
    ('h3', 'handsome',   '/public/assets/photos/Handsome/photo-03.webp',  1600,  844, 'HANDSOME 照片 03',   3, '2026-10-04'),
    ('h4', 'handsome',   '/public/assets/photos/Handsome/photo-04.webp',  1600,  900, 'HANDSOME 照片 04',   4, '2026-10-07'),
    ('h5', 'handsome',   '/public/assets/photos/Handsome/photo-05.webp',  1600, 1132, 'HANDSOME 照片 05',   5, '2026-10-09'),
    ('h6', 'handsome',   '/public/assets/photos/Handsome/photo-06.webp',  1600, 1067, 'HANDSOME 照片 06',   6, '2026-10-11'),
    ('h7', 'handsome',   '/public/assets/photos/Handsome/photo-07.webp',  1600,  900, 'HANDSOME 照片 07',   7, '2026-10-13');
