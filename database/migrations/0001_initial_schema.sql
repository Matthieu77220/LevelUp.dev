CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS progression;
CREATE SCHEMA IF NOT EXISTS evaluation;
CREATE SCHEMA IF NOT EXISTS social;
CREATE SCHEMA IF NOT EXISTS rewards;
CREATE SCHEMA IF NOT EXISTS boss;
CREATE SCHEMA IF NOT EXISTS system;

CREATE TYPE identity.user_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE learning.rank_code AS ENUM ('UNRANKED', 'E', 'D', 'C', 'B', 'A', 'S');
CREATE TYPE learning.content_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE learning.module_kind AS ENUM ('LESSON', 'EXAMPLE', 'EXERCISE', 'CHALLENGE', 'COOP');
CREATE TYPE progression.progress_status AS ENUM ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'MASTERED');
CREATE TYPE evaluation.submission_source AS ENUM ('INLINE', 'GIT');
CREATE TYPE evaluation.evaluation_status AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED');
CREATE TYPE learning.project_kind AS ENUM ('SOLO', 'COOP', 'TIMED', 'HACKATHON', 'BLOCK_BOSS', 'DOMAIN_FINAL_BOSS');
CREATE TYPE social.team_status AS ENUM ('FORMING', 'ACTIVE', 'COMPLETED', 'DISBANDED');
CREATE TYPE social.team_member_role AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE social.invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');
CREATE TYPE social.review_status AS ENUM ('REQUESTED', 'IN_PROGRESS', 'CHANGES_REQUESTED', 'APPROVED', 'CANCELLED');
CREATE TYPE social.friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
CREATE TYPE progression.quest_kind AS ENUM ('LEARNING', 'PROJECT', 'COOP', 'PEER_REVIEW', 'GIT', 'TIMED', 'CHALLENGE', 'SECRET', 'EVENT', 'BOSS');
CREATE TYPE progression.quest_progress_status AS ENUM ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'CLAIMED');
CREATE TYPE progression.reward_kind AS ENUM ('XP', 'BADGE', 'COSMETIC');
CREATE TYPE rewards.cosmetic_rarity AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');
CREATE TYPE rewards.cosmetic_category AS ENUM ('HAIR', 'HAT', 'GLASSES', 'HEADPHONES', 'TSHIRT', 'HOODIE', 'JACKET', 'ACCESSORY', 'BACKGROUND');
CREATE TYPE boss.attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'FAILED', 'COMPLETED');
CREATE TYPE system.notification_kind AS ENUM ('FRIEND_REQUEST', 'PROJECT_INVITE', 'REVIEW_REQUESTED', 'REVIEW_COMPLETED', 'QUEST_COMPLETED', 'ITEM_UNLOCKED', 'BOSS_UNLOCKED', 'BOSS_COMPLETED');

CREATE TABLE identity.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL UNIQUE,
    password_hash varchar(255),
    status identity.user_status NOT NULL DEFAULT 'PENDING',
    email_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT users_email_length CHECK (length(email::text) <= 320),
    CONSTRAINT users_password_for_local_account CHECK (password_hash IS NULL OR length(password_hash) > 0)
);

CREATE TABLE identity.auth_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    provider varchar(50) NOT NULL,
    provider_account_id varchar(255) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_account_id)
);
CREATE INDEX auth_accounts_user_idx ON identity.auth_accounts(user_id);

CREATE TABLE identity.profiles (
    user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    username citext NOT NULL UNIQUE,
    display_name varchar(80) NOT NULL,
    bio varchar(500),
    global_rank learning.rank_code NOT NULL DEFAULT 'UNRANKED',
    public_badge_limit smallint NOT NULL DEFAULT 3 CHECK (public_badge_limit BETWEEN 0 AND 3),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_username_format CHECK (username::text ~ '^[A-Za-z0-9_]{3,32}$')
);

CREATE TABLE learning.domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
    name varchar(120) NOT NULL,
    description text,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_version varchar(40) NOT NULL
);

CREATE TABLE learning.blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id uuid NOT NULL REFERENCES learning.domains(id) ON DELETE RESTRICT,
    slug varchar(80) NOT NULL,
    name varchar(120) NOT NULL,
    description text,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_version varchar(40) NOT NULL,
    UNIQUE (domain_id, slug),
    UNIQUE (domain_id, sort_order)
);

CREATE TABLE learning.skills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id uuid NOT NULL REFERENCES learning.blocks(id) ON DELETE RESTRICT,
    slug varchar(100) NOT NULL,
    name varchar(120) NOT NULL,
    description text,
    is_transversal boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_version varchar(40) NOT NULL,
    UNIQUE (block_id, slug),
    UNIQUE (block_id, sort_order)
);

CREATE TABLE learning.skill_prerequisites (
    skill_id uuid NOT NULL REFERENCES learning.skills(id) ON DELETE CASCADE,
    prerequisite_skill_id uuid NOT NULL REFERENCES learning.skills(id) ON DELETE RESTRICT,
    minimum_rank learning.rank_code NOT NULL,
    PRIMARY KEY (skill_id, prerequisite_skill_id),
    CHECK (skill_id <> prerequisite_skill_id),
    CHECK (minimum_rank <> 'UNRANKED')
);

CREATE TABLE learning.skill_levels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id uuid NOT NULL REFERENCES learning.skills(id) ON DELETE RESTRICT,
    rank learning.rank_code NOT NULL CHECK (rank <> 'UNRANKED'),
    title varchar(120) NOT NULL,
    description text,
    xp_required integer NOT NULL CHECK (xp_required >= 0),
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    content_version varchar(40) NOT NULL,
    UNIQUE (skill_id, rank),
    UNIQUE (skill_id, sort_order)
);

CREATE TABLE learning.learning_modules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_level_id uuid NOT NULL REFERENCES learning.skill_levels(id) ON DELETE RESTRICT,
    slug varchar(120) NOT NULL,
    title varchar(160) NOT NULL,
    kind learning.module_kind NOT NULL,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    is_required boolean NOT NULL DEFAULT true,
    xp_reward integer NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_ref varchar(255) NOT NULL,
    content_version varchar(40) NOT NULL,
    UNIQUE (skill_level_id, slug),
    UNIQUE (skill_level_id, sort_order)
);

CREATE TABLE learning.exercises (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL UNIQUE REFERENCES learning.learning_modules(id) ON DELETE RESTRICT,
    language varchar(30) NOT NULL,
    entrypoint varchar(255),
    starter_code_ref varchar(255),
    test_bundle_ref varchar(255) NOT NULL,
    time_limit_ms integer NOT NULL CHECK (time_limit_ms > 0),
    memory_limit_mb integer NOT NULL CHECK (memory_limit_mb > 0),
    max_attempts integer CHECK (max_attempts > 0),
    config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object')
);

CREATE TABLE learning.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id uuid REFERENCES learning.domains(id) ON DELETE RESTRICT,
    block_id uuid REFERENCES learning.blocks(id) ON DELETE RESTRICT,
    slug varchar(120) NOT NULL UNIQUE,
    title varchar(160) NOT NULL,
    description text,
    kind learning.project_kind NOT NULL,
    minimum_git_rank learning.rank_code,
    duration_minutes integer CHECK (duration_minutes > 0),
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    project_bundle_ref varchar(255) NOT NULL,
    content_version varchar(40) NOT NULL,
    CHECK (domain_id IS NOT NULL OR block_id IS NOT NULL)
);

CREATE TABLE learning.project_objectives (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES learning.projects(id) ON DELETE CASCADE,
    code varchar(80) NOT NULL,
    title varchar(160) NOT NULL,
    is_required boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    UNIQUE (project_id, code),
    UNIQUE (project_id, sort_order)
);

CREATE TABLE learning.project_skills (
    project_id uuid NOT NULL REFERENCES learning.projects(id) ON DELETE CASCADE,
    skill_id uuid NOT NULL REFERENCES learning.skills(id) ON DELETE RESTRICT,
    xp_reward integer NOT NULL CHECK (xp_reward >= 0),
    PRIMARY KEY (project_id, skill_id)
);

CREATE TABLE progression.user_module_progress (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    module_id uuid NOT NULL REFERENCES learning.learning_modules(id) ON DELETE RESTRICT,
    status progression.progress_status NOT NULL DEFAULT 'LOCKED',
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    best_score numeric(5,2) CHECK (best_score BETWEEN 0 AND 100),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, module_id)
);
CREATE INDEX user_module_progress_status_idx ON progression.user_module_progress(user_id, status);

CREATE TABLE progression.user_skill_progress (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    skill_id uuid NOT NULL REFERENCES learning.skills(id) ON DELETE RESTRICT,
    rank learning.rank_code NOT NULL DEFAULT 'UNRANKED',
    xp_total bigint NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX user_skill_progress_rank_idx ON progression.user_skill_progress(user_id, rank);

CREATE TABLE progression.user_block_progress (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    block_id uuid NOT NULL REFERENCES learning.blocks(id) ON DELETE RESTRICT,
    rank learning.rank_code NOT NULL DEFAULT 'UNRANKED',
    boss_completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, block_id)
);

CREATE TABLE progression.user_domain_progress (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    domain_id uuid NOT NULL REFERENCES learning.domains(id) ON DELETE RESTRICT,
    rank learning.rank_code NOT NULL DEFAULT 'UNRANKED',
    final_boss_completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, domain_id)
);

CREATE TABLE progression.xp_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    skill_id uuid REFERENCES learning.skills(id) ON DELETE RESTRICT,
    amount integer NOT NULL CHECK (amount <> 0),
    reason varchar(60) NOT NULL,
    source_type varchar(50) NOT NULL,
    source_id uuid NOT NULL,
    idempotency_key varchar(160) NOT NULL UNIQUE,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_transactions_user_created_idx ON progression.xp_transactions(user_id, created_at DESC);
CREATE INDEX xp_transactions_source_idx ON progression.xp_transactions(source_type, source_id);

CREATE TABLE social.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES learning.projects(id) ON DELETE RESTRICT,
    name varchar(80) NOT NULL,
    status social.team_status NOT NULL DEFAULT 'FORMING',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE social.team_members (
    team_id uuid NOT NULL REFERENCES social.teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    role social.team_member_role NOT NULL DEFAULT 'MEMBER',
    joined_at timestamptz NOT NULL DEFAULT now(),
    left_at timestamptz,
    PRIMARY KEY (team_id, user_id),
    CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE INDEX team_members_user_idx ON social.team_members(user_id);
CREATE UNIQUE INDEX team_one_active_owner_idx ON social.team_members(team_id) WHERE role = 'OWNER' AND left_at IS NULL;

CREATE TABLE social.team_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES social.teams(id) ON DELETE CASCADE,
    invited_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    invited_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    status social.invitation_status NOT NULL DEFAULT 'PENDING',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    CHECK (invited_user_id <> invited_by_user_id),
    CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX team_pending_invitation_idx ON social.team_invitations(team_id, invited_user_id) WHERE status = 'PENDING';

CREATE TABLE social.friendships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    addressee_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    status social.friendship_status NOT NULL DEFAULT 'PENDING',
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair_idx ON social.friendships(LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_addressee_status_idx ON social.friendships(addressee_id, status);

CREATE TABLE rewards.badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    description text,
    asset_ref varchar(255) NOT NULL
);

CREATE TABLE rewards.cosmetics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    category rewards.cosmetic_category NOT NULL,
    rarity rewards.cosmetic_rarity NOT NULL,
    asset_ref varchar(255) NOT NULL,
    status learning.content_status NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE rewards.user_badges (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    badge_id uuid NOT NULL REFERENCES rewards.badges(id) ON DELETE RESTRICT,
    earned_at timestamptz NOT NULL DEFAULT now(),
    display_order smallint CHECK (display_order BETWEEN 1 AND 3),
    PRIMARY KEY (user_id, badge_id),
    UNIQUE (user_id, display_order)
);

CREATE TABLE rewards.user_cosmetics (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    cosmetic_id uuid NOT NULL REFERENCES rewards.cosmetics(id) ON DELETE RESTRICT,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    source_type varchar(50) NOT NULL,
    source_id uuid NOT NULL,
    PRIMARY KEY (user_id, cosmetic_id)
);

CREATE TABLE rewards.avatars (
    user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    body_type varchar(30) NOT NULL,
    skin_tone smallint NOT NULL CHECK (skin_tone BETWEEN 1 AND 5),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards.avatar_items (
    user_id uuid NOT NULL REFERENCES rewards.avatars(user_id) ON DELETE CASCADE,
    category rewards.cosmetic_category NOT NULL,
    cosmetic_id uuid NOT NULL REFERENCES rewards.cosmetics(id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, category)
);

CREATE TABLE progression.quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(120) NOT NULL UNIQUE,
    title varchar(160) NOT NULL,
    description text,
    kind progression.quest_kind NOT NULL,
    is_repeatable boolean NOT NULL DEFAULT false,
    requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(requirements) = 'object'),
    starts_at timestamptz,
    ends_at timestamptz,
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_version varchar(40) NOT NULL,
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE progression.quest_rewards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id uuid NOT NULL REFERENCES progression.quests(id) ON DELETE CASCADE,
    kind progression.reward_kind NOT NULL,
    amount integer,
    badge_id uuid REFERENCES rewards.badges(id) ON DELETE RESTRICT,
    cosmetic_id uuid REFERENCES rewards.cosmetics(id) ON DELETE RESTRICT,
    CONSTRAINT quest_reward_payload CHECK (
        (kind = 'XP' AND amount > 0 AND badge_id IS NULL AND cosmetic_id IS NULL) OR
        (kind = 'BADGE' AND amount IS NULL AND badge_id IS NOT NULL AND cosmetic_id IS NULL) OR
        (kind = 'COSMETIC' AND amount IS NULL AND badge_id IS NULL AND cosmetic_id IS NOT NULL)
    )
);

CREATE TABLE progression.user_quest_progress (
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES progression.quests(id) ON DELETE RESTRICT,
    status progression.quest_progress_status NOT NULL DEFAULT 'LOCKED',
    progress jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(progress) = 'object'),
    started_at timestamptz,
    completed_at timestamptz,
    claimed_at timestamptz,
    PRIMARY KEY (user_id, quest_id)
);
CREATE INDEX user_quest_progress_status_idx ON progression.user_quest_progress(user_id, status);

CREATE TABLE boss.bosses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id uuid REFERENCES learning.blocks(id) ON DELETE RESTRICT,
    domain_id uuid REFERENCES learning.domains(id) ON DELETE RESTRICT,
    slug varchar(120) NOT NULL UNIQUE,
    title varchar(160) NOT NULL,
    description text,
    project_id uuid NOT NULL UNIQUE REFERENCES learning.projects(id) ON DELETE RESTRICT,
    status learning.content_status NOT NULL DEFAULT 'DRAFT',
    content_version varchar(40) NOT NULL,
    CHECK (num_nonnulls(block_id, domain_id) = 1)
);

CREATE TABLE boss.boss_gates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boss_id uuid NOT NULL REFERENCES boss.bosses(id) ON DELETE CASCADE,
    code varchar(80) NOT NULL,
    name varchar(120) NOT NULL,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    is_required boolean NOT NULL DEFAULT true,
    config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    UNIQUE (boss_id, code),
    UNIQUE (boss_id, sort_order)
);

CREATE TABLE boss.boss_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boss_id uuid NOT NULL REFERENCES boss.bosses(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    status boss.attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    started_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    completed_at timestamptz,
    UNIQUE (boss_id, user_id, attempt_number)
);
CREATE INDEX boss_attempts_user_status_idx ON boss.boss_attempts(user_id, status);

CREATE TABLE evaluation.submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    exercise_id uuid REFERENCES learning.exercises(id) ON DELETE RESTRICT,
    project_id uuid REFERENCES learning.projects(id) ON DELETE RESTRICT,
    team_id uuid REFERENCES social.teams(id) ON DELETE RESTRICT,
    boss_attempt_id uuid REFERENCES boss.boss_attempts(id) ON DELETE RESTRICT,
    source_type evaluation.submission_source NOT NULL,
    language varchar(30) NOT NULL,
    source_code text,
    repository_url varchar(500),
    branch varchar(255),
    commit_sha varchar(64),
    status evaluation.evaluation_status NOT NULL DEFAULT 'QUEUED',
    content_version varchar(40) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    CONSTRAINT submission_one_target CHECK (num_nonnulls(exercise_id, project_id, boss_attempt_id) = 1),
    CONSTRAINT submission_source_payload CHECK (
        (source_type = 'INLINE' AND source_code IS NOT NULL AND repository_url IS NULL AND branch IS NULL AND commit_sha IS NULL) OR
        (source_type = 'GIT' AND source_code IS NULL AND repository_url IS NOT NULL AND branch IS NOT NULL AND commit_sha ~ '^[0-9a-fA-F]{40,64}$')
    ),
    CONSTRAINT submission_team_project CHECK (team_id IS NULL OR project_id IS NOT NULL),
    CONSTRAINT submission_timestamps CHECK (
        (started_at IS NULL OR started_at >= created_at) AND
        (finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at))
    )
);
CREATE INDEX submissions_user_created_idx ON evaluation.submissions(user_id, created_at DESC);
CREATE INDEX submissions_queue_idx ON evaluation.submissions(status, created_at) WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX submissions_exercise_idx ON evaluation.submissions(exercise_id) WHERE exercise_id IS NOT NULL;
CREATE INDEX submissions_project_idx ON evaluation.submissions(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE evaluation.evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL UNIQUE REFERENCES evaluation.submissions(id) ON DELETE CASCADE,
    worker_job_id varchar(120) UNIQUE,
    constraint_passed boolean,
    compile_passed boolean,
    tests_passed boolean,
    memory_passed boolean,
    performance_passed boolean,
    execution_time_ms integer CHECK (execution_time_ms >= 0),
    memory_used_mb numeric(10,2) CHECK (memory_used_mb >= 0),
    score numeric(5,2) CHECK (score BETWEEN 0 AND 100),
    failure_category varchar(60),
    error_message text,
    result_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation.test_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id uuid NOT NULL REFERENCES evaluation.evaluations(id) ON DELETE CASCADE,
    test_key varchar(120) NOT NULL,
    passed boolean NOT NULL,
    visible boolean NOT NULL,
    execution_time_ms integer CHECK (execution_time_ms >= 0),
    memory_used_mb numeric(10,2) CHECK (memory_used_mb >= 0),
    feedback_category varchar(60),
    public_feedback text,
    UNIQUE (evaluation_id, test_key)
);

CREATE TABLE social.peer_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES evaluation.submissions(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    reviewer_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    status social.review_status NOT NULL DEFAULT 'REQUESTED',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (submission_id, reviewer_id),
    CHECK (author_id <> reviewer_id)
);
CREATE INDEX peer_reviews_reviewer_status_idx ON social.peer_reviews(reviewer_id, status);

CREATE TABLE social.review_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid NOT NULL REFERENCES social.peer_reviews(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    body text NOT NULL CHECK (length(btrim(body)) > 0),
    file_path varchar(500),
    line_number integer CHECK (line_number > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE boss.boss_gate_results (
    attempt_id uuid NOT NULL REFERENCES boss.boss_attempts(id) ON DELETE CASCADE,
    gate_id uuid NOT NULL REFERENCES boss.boss_gates(id) ON DELETE RESTRICT,
    passed boolean NOT NULL,
    result_payload jsonb,
    evaluated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, gate_id)
);

CREATE TABLE system.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    kind system.notification_kind NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON system.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE system.audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    action varchar(100) NOT NULL,
    entity_type varchar(80) NOT NULL,
    entity_id uuid,
    payload jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON system.audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON system.audit_events(actor_user_id, occurred_at DESC);

CREATE FUNCTION app_private.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON identity.users
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON identity.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();
CREATE TRIGGER evaluations_set_updated_at BEFORE UPDATE ON evaluation.evaluations
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE FUNCTION app_private.prevent_xp_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'XP transactions are append-only';
END;
$$;

CREATE TRIGGER xp_transactions_immutable
BEFORE UPDATE OR DELETE ON progression.xp_transactions
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_xp_mutation();

