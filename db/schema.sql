-- ============================================================
--  myself-block · 数据库建表脚本（schema.sql）
--  目标库：CloudBase PostgreSQL
--  依据：api-contract.md §9（Day 16 回写版）
--  日期：2026-10-19（Day 16）
-- ------------------------------------------------------------
--  【重要】本脚本开头会 DROP TABLE，执行即清空这两张表的全部数据。
--    · 开发阶段：可反复执行，用于推倒重来。
--    · 第 20 天上线后：禁止执行本脚本，也禁止执行 seed.sql。
--      上线后的结构变更一律写增量 SQL（ALTER TABLE ...）。
-- ------------------------------------------------------------
--  本脚本只建 Day 16 的两张核心表：
--    photo_groups（照片分组，1）
--    photos      （照片，N）—— 通过 photos.group_id 关联
--  其余 4 张单表（site_meta / posts / works / tracks）
--  自身没有外键关系，随各自接口上线时补建（Day 18 起）。
-- ============================================================

-- 先删子表，再删父表（外键依赖顺序）
DROP TABLE IF EXISTS photos;
DROP TABLE IF EXISTS photo_groups;


-- ------------------------------------------------------------
-- 表 1：photo_groups —— 照片分组（EXPERIENCE / FUNNY / HANDSOME）
-- 对应接口：GET /api/photos 的 data.groups[].{id,name}
-- ------------------------------------------------------------
CREATE TABLE photo_groups (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    sort        SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 业务唯一：分组显示名不可重复（前端按 name 渲染标题）
    CONSTRAINT photo_groups_name_uniq UNIQUE (name)
);

COMMENT ON TABLE  photo_groups            IS '照片分组；一行 = 照片墙上的一个分组标题';
COMMENT ON COLUMN photo_groups.id         IS '分组标识，与前端 data.js 的 group id 一致（experience / funny / handsome）';
COMMENT ON COLUMN photo_groups.name       IS '分组显示名，全大写英文（EXPERIENCE / FUNNY / HANDSOME）';
COMMENT ON COLUMN photo_groups.sort       IS '分组在页面上的先后顺序，升序排列，从 1 开始';
COMMENT ON COLUMN photo_groups.created_at IS '记录创建时间，带时区，默认取数据库当前时间';


-- ------------------------------------------------------------
-- 表 2：photos —— 照片
-- 对应接口：GET /api/photos 的 data.groups[].photos[].{id,src,w,h,alt}
-- 关联：photos.group_id  →  photo_groups.id   （多对一）
-- ------------------------------------------------------------
CREATE TABLE photos (
    id          TEXT        PRIMARY KEY,
    group_id    TEXT        NOT NULL,
    src         TEXT        NOT NULL,
    w           INTEGER     NOT NULL,
    h           INTEGER     NOT NULL,
    alt         TEXT        NOT NULL DEFAULT '',
    sort        SMALLINT    NOT NULL DEFAULT 0,
    added_at    DATE        NOT NULL DEFAULT CURRENT_DATE,

    -- 外键：删除分组时拒绝（RESTRICT），避免照片变成孤儿数据
    CONSTRAINT photos_group_fk
        FOREIGN KEY (group_id) REFERENCES photo_groups (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- 宽高必须为正整数（前端瀑布流靠 w/h 计算列高，0 或负数会导致除零）
    CONSTRAINT photos_size_positive CHECK (w > 0 AND h > 0),

    -- 业务唯一：同一分组内，同一张图只能登记一次（防止重复导入）
    CONSTRAINT photos_group_src_uniq UNIQUE (group_id, src)
);

COMMENT ON TABLE  photos              IS '照片；一行 = 照片墙上的一张图';
COMMENT ON COLUMN photos.id           IS '照片标识，与前端 data.js 一致（e1 / f1 / h1 …）';
COMMENT ON COLUMN photos.group_id     IS '所属分组，外键指向 photo_groups.id —— 两张表唯一的关联字段';
COMMENT ON COLUMN photos.src          IS '图片路径，站点根相对路径（如 /public/assets/photos/Funny/photo-01.webp）；域名由接口层拼接，避免换域名时改库';
COMMENT ON COLUMN photos.w            IS '图片像素宽，前端瀑布流分列用';
COMMENT ON COLUMN photos.h            IS '图片像素高，前端瀑布流分列用';
COMMENT ON COLUMN photos.alt          IS '无障碍描述文本（PRD §3.3：只写中性描述，不含地点与人物身份）';
COMMENT ON COLUMN photos.sort         IS '组内展示顺序，升序排列，从 1 开始';
COMMENT ON COLUMN photos.added_at     IS '照片入库日期，页面不直接展示，用于归档与排序兜底';


-- ------------------------------------------------------------
-- 索引：GET /api/photos 的典型查询是
--   SELECT * FROM photos WHERE group_id = $1 ORDER BY sort
-- 该复合索引可同时覆盖「按组过滤」与「组内排序」，无需额外 filesort
-- ------------------------------------------------------------
CREATE INDEX idx_photos_group_sort ON photos (group_id, sort);
