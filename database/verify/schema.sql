DO $$
DECLARE
    missing text[];
BEGIN
    SELECT array_agg(expected.name ORDER BY expected.name)
      INTO missing
      FROM (VALUES
        ('identity.users'), ('identity.profiles'),
        ('learning.domains'), ('learning.skills'), ('learning.exercises'),
        ('progression.xp_transactions'), ('progression.user_skill_progress'),
        ('evaluation.submissions'), ('evaluation.evaluations'),
        ('social.teams'), ('social.peer_reviews'),
        ('rewards.cosmetics'), ('boss.bosses'), ('system.notifications')
      ) AS expected(name)
     WHERE to_regclass(expected.name) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing required tables: %', missing;
    END IF;
END;
$$;

SELECT 'Database schema is ready.' AS result;
