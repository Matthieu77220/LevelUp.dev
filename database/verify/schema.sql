DO $$
DECLARE
    missing text[];
BEGIN
    SELECT array_agg(expected.name ORDER BY expected.name)
      INTO missing
      FROM (VALUES
        ('identity.users'), ('identity.profiles'), ('identity.sessions'),
        ('identity.authentication_events'),
        ('learning.domains'), ('learning.blocks'), ('learning.skills'), ('learning.exercises'),
        ('progression.xp_transactions'), ('progression.user_skill_progress'),
        ('evaluation.submissions'), ('evaluation.evaluations'),
        ('social.teams'), ('social.peer_reviews'),
        ('rewards.cosmetics'), ('boss.bosses'), ('system.notifications')
      ) AS expected(name)
     WHERE to_regclass(expected.name) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing required tables: %', missing;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM app_private.schema_migrations WHERE version = '0003_data_integrity') THEN
        RAISE EXCEPTION 'Migration 0003_data_integrity is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM app_private.schema_migrations WHERE version = '0004_learning_catalog') THEN
        RAISE EXCEPTION 'Migration 0004_learning_catalog is required';
    END IF;

    SELECT array_agg(expected.name) INTO missing
    FROM (VALUES ('quest_xp_amount_required'), ('submission_git_commit_required'),
                 ('profiles_user_username_fk')) AS expected(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = expected.name AND convalidated);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing validated constraints: %', missing;
    END IF;
END;
$$;

SELECT 'Database schema is ready.' AS result;
