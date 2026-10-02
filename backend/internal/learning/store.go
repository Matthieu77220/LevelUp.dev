package learning

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrLocked = errors.New("skill prerequisites not met")

type Progress struct {
	Rank string `json:"rank"`
	XP   int64  `json:"xp"`
}

type Skill struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Transversal bool   `json:"transversal"`
	Locked      bool   `json:"locked"`
	Progress
}

type Block struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Skills      []Skill `json:"skills"`
}

type Domain struct {
	ID          string   `json:"id"`
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Rank        string   `json:"rank"`
	Blocks      []*Block `json:"blocks"`
}

type Catalog struct {
	GlobalRank string    `json:"globalRank"`
	TotalXP    int64     `json:"totalXP"`
	Domains    []*Domain `json:"domains"`
}

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// All levels of the catalogue are read from the same published-content snapshot.
func (s *Store) Catalog(ctx context.Context, userID string) (Catalog, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return Catalog{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result := Catalog{Domains: []*Domain{}}
	err = tx.QueryRow(ctx, `SELECT global_rank::text,
		(SELECT COALESCE(sum(amount), 0) FROM progression.xp_transactions WHERE user_id = $1)
		FROM identity.profiles WHERE user_id = $1`, userID).Scan(&result.GlobalRank, &result.TotalXP)
	if err != nil {
		return Catalog{}, err
	}
	rows, err := tx.Query(ctx, `SELECT d.id::text, d.slug, d.name, COALESCE(d.description, ''), COALESCE(p.rank, 'UNRANKED')::text
		FROM learning.domains d LEFT JOIN progression.user_domain_progress p ON p.domain_id = d.id AND p.user_id = $1
		WHERE d.status = 'PUBLISHED' ORDER BY d.sort_order, d.slug`, userID)
	if err != nil {
		return Catalog{}, err
	}
	domains, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (*Domain, error) {
		domain := &Domain{Blocks: []*Block{}}
		err := row.Scan(&domain.ID, &domain.Slug, &domain.Name, &domain.Description, &domain.Rank)
		return domain, err
	})
	if err != nil {
		return Catalog{}, err
	}
	result.Domains = domains
	domainByID := make(map[string]*Domain, len(domains))
	for _, domain := range domains {
		domainByID[domain.ID] = domain
	}
	rows, err = tx.Query(ctx, `SELECT b.id::text, b.domain_id::text, b.slug, b.name, COALESCE(b.description, '')
		FROM learning.blocks b JOIN learning.domains d ON d.id = b.domain_id
		WHERE b.status = 'PUBLISHED' AND d.status = 'PUBLISHED' ORDER BY b.sort_order, b.slug`)
	if err != nil {
		return Catalog{}, err
	}
	blockByID := make(map[string]*Block)
	var blockID, domainID, slug, name, description string
	_, err = pgx.ForEachRow(rows, []any{&blockID, &domainID, &slug, &name, &description}, func() error {
		block := &Block{ID: blockID, Slug: slug, Name: name, Description: description, Skills: []Skill{}}
		domainByID[domainID].Blocks = append(domainByID[domainID].Blocks, block)
		blockByID[blockID] = block
		return nil
	})
	if err != nil {
		return Catalog{}, err
	}
	rows, err = tx.Query(ctx, `SELECT s.id::text, s.block_id::text, s.slug, s.name, COALESCE(s.description, ''), s.is_transversal,
		COALESCE(p.rank, 'UNRANKED')::text, COALESCE(p.xp_total, 0),
		EXISTS (SELECT 1 FROM learning.skill_prerequisites prereq
			LEFT JOIN progression.user_skill_progress prior ON prior.skill_id = prereq.prerequisite_skill_id AND prior.user_id = $1
			WHERE prereq.skill_id = s.id AND COALESCE(prior.rank, 'UNRANKED') < prereq.minimum_rank)
		FROM learning.skills s JOIN learning.blocks b ON b.id = s.block_id JOIN learning.domains d ON d.id = b.domain_id
		LEFT JOIN progression.user_skill_progress p ON p.skill_id = s.id AND p.user_id = $1
		WHERE s.status = 'PUBLISHED' AND b.status = 'PUBLISHED' AND d.status = 'PUBLISHED'
		ORDER BY s.sort_order, s.slug`, userID)
	if err != nil {
		return Catalog{}, err
	}
	var skill Skill
	_, err = pgx.ForEachRow(rows, []any{&skill.ID, &blockID, &skill.Slug, &skill.Name, &skill.Description,
		&skill.Transversal, &skill.Rank, &skill.XP, &skill.Locked}, func() error {
		blockByID[blockID].Skills = append(blockByID[blockID].Skills, skill)
		return nil
	})
	if err != nil {
		return Catalog{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Catalog{}, err
	}
	return result, nil
}

// Starting a skill is idempotent: it never resets progress or awards XP.
func (s *Store) StartSkill(ctx context.Context, userID, skillID string) (Progress, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Progress{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var locked bool
	err = tx.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM learning.skill_prerequisites prereq
		LEFT JOIN progression.user_skill_progress prior ON prior.skill_id = prereq.prerequisite_skill_id AND prior.user_id = $1
		WHERE prereq.skill_id = s.id AND COALESCE(prior.rank, 'UNRANKED') < prereq.minimum_rank)
		FROM learning.skills s JOIN learning.blocks b ON b.id = s.block_id JOIN learning.domains d ON d.id = b.domain_id
		WHERE s.id = $2 AND s.status = 'PUBLISHED' AND b.status = 'PUBLISHED' AND d.status = 'PUBLISHED'
		FOR SHARE OF s, b, d`, userID, skillID).Scan(&locked)
	if err != nil {
		return Progress{}, err
	}
	if locked {
		return Progress{}, ErrLocked
	}
	var progress Progress
	err = tx.QueryRow(ctx, `INSERT INTO progression.user_skill_progress (user_id, skill_id, rank)
		VALUES ($1, $2, 'E')
		ON CONFLICT (user_id, skill_id) DO UPDATE SET rank = 'E', updated_at = now()
		WHERE user_skill_progress.rank = 'UNRANKED'
		RETURNING rank::text, xp_total`, userID, skillID).Scan(&progress.Rank, &progress.XP)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT rank::text, xp_total FROM progression.user_skill_progress
			WHERE user_id = $1 AND skill_id = $2`, userID, skillID).Scan(&progress.Rank, &progress.XP)
	}
	if err != nil {
		return Progress{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Progress{}, err
	}
	return progress, nil
}
