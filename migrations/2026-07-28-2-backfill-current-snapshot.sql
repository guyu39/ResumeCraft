-- snapshot-as-source-of-truth: 数据回填
-- 为每份 resumes 保障 based_on_snapshot_id 指向一个有效快照行；
-- 若为空或指向不存在，则用 resumes.content 建一个 'current' 快照并回填 based_on_snapshot_id。
-- 幂等：已指向有效快照的不会重建。
DO $$
DECLARE
  r RECORD;
  new_id uuid;
  exists_id uuid;
BEGIN
  FOR r IN SELECT id, user_id, content, based_on_snapshot_id FROM resumes WHERE deleted_at IS NULL LOOP
    exists_id := NULL;
    IF r.based_on_snapshot_id IS NOT NULL THEN
      SELECT id INTO exists_id FROM resume_versions
        WHERE id = r.based_on_snapshot_id AND resume_id = r.id AND user_id = r.user_id;
    END IF;
    IF exists_id IS NULL THEN
      INSERT INTO resume_versions (resume_id, user_id, content_snapshot, snapshot_type, label)
        VALUES (r.id, r.user_id, r.content, 'current', '当前')
        RETURNING id INTO new_id;
      UPDATE resumes SET based_on_snapshot_id = new_id WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
