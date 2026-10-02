-- SQL CHECK accepts NULL: explicitly reject missing required payload values.
ALTER TABLE progression.quest_rewards
    ADD CONSTRAINT quest_xp_amount_required CHECK (kind <> 'XP' OR amount IS NOT NULL);

ALTER TABLE evaluation.submissions
    ADD CONSTRAINT submission_git_commit_required CHECK (
        source_type <> 'GIT' OR
        (commit_sha IS NOT NULL AND commit_sha ~ '^([0-9a-fA-F]{40}|[0-9a-fA-F]{64})$')
    );

-- Keep the two existing username columns consistent without dropping data.
ALTER TABLE identity.users ADD CONSTRAINT users_id_username_unique UNIQUE (id, username);
ALTER TABLE identity.profiles ADD CONSTRAINT profiles_user_username_fk
    FOREIGN KEY (user_id, username) REFERENCES identity.users (id, username)
    ON UPDATE CASCADE ON DELETE CASCADE;
