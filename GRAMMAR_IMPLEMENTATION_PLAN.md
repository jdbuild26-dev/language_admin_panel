# Grammar & Stories Admin Panel — Implementation Plan

## Status Overview

| Layer | Status | Notes |
|---|---|---|
| Backend models | ✅ Done | `language-backend/app/models/sql_models.py` |
| Backend routes | ✅ Done | `language-backend/app/routes/grammar_admin.py` |
| Route registered | ✅ Done | `language-backend/app/main.py` |
| **Database migration** | ⏳ **TODO** | Run the SQL below |
| Supabase bucket | ⏳ TODO | Create `grammar-notes` bucket |
| Frontend Grammar page | ⏳ TODO | Build `Grammar.tsx` |
| Frontend Stories page | ⏳ TODO | Build `Stories.tsx` |

---

## Step 1 — Database Migration

Run this SQL in your **Supabase SQL Editor** (or any PostgreSQL client connected to your database).
The three tables must be created in order because of foreign key dependencies.

```sql
-- ============================================================
-- GRAMMAR PIPELINE MIGRATION
-- Run in Supabase SQL Editor → New Query → Run
-- ============================================================

-- 1. grammar_topics
--    One row per topic (e.g. "Nouns") per language+level combination.
CREATE TABLE IF NOT EXISTS grammar_topics (
    id            SERIAL PRIMARY KEY,
    slug          VARCHAR(150) UNIQUE NOT NULL,
    name_en       VARCHAR(255) NOT NULL,
    name_fr       VARCHAR(255),
    name_de       VARCHAR(255),
    name_es       VARCHAR(255),
    learning_lang VARCHAR(10)  NOT NULL REFERENCES languages(code),
    level_id      INTEGER      NOT NULL REFERENCES levels(id),
    order_index   INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. grammar_subtopics
--    One row per subtopic (e.g. "Perfect Nouns") under a topic.
CREATE TABLE IF NOT EXISTS grammar_subtopics (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER      NOT NULL REFERENCES grammar_topics(id) ON DELETE CASCADE,
    slug        VARCHAR(150) UNIQUE NOT NULL,
    name_en     VARCHAR(255) NOT NULL,
    name_fr     VARCHAR(255),
    name_de     VARCHAR(255),
    name_es     VARCHAR(255),
    order_index INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. grammar_notes
--    One row per note translation.
--    Same concept_id + different known_lang = different translations of the same note.
CREATE TABLE IF NOT EXISTS grammar_notes (
    id               SERIAL PRIMARY KEY,
    subtopic_id      INTEGER      NOT NULL REFERENCES grammar_subtopics(id) ON DELETE CASCADE,
    concept_id       VARCHAR(100) NOT NULL,
    known_lang       VARCHAR(10)  NOT NULL REFERENCES languages(code),
    learning_lang    VARCHAR(10)  NOT NULL REFERENCES languages(code),
    markdown_source  TEXT,
    html_url         TEXT         NOT NULL,
    title            VARCHAR(500),
    description      TEXT,
    order_index      INTEGER      NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_grammar_topics_lang_level
    ON grammar_topics(learning_lang, level_id);

CREATE INDEX IF NOT EXISTS idx_grammar_subtopics_topic
    ON grammar_subtopics(topic_id);

CREATE INDEX IF NOT EXISTS idx_grammar_notes_subtopic
    ON grammar_notes(subtopic_id);

CREATE INDEX IF NOT EXISTS idx_grammar_notes_concept
    ON grammar_notes(concept_id);

-- Unique constraint: one translation per concept per known_lang
ALTER TABLE grammar_notes
    ADD CONSTRAINT uq_grammar_notes_concept_lang
    UNIQUE (concept_id, known_lang);
```

### Verify the migration ran correctly

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('grammar_topics', 'grammar_subtopics', 'grammar_notes')
ORDER BY table_name;
-- Should return 3 rows
```

---

## Step 2 — Supabase Storage Bucket

1. Go to **Supabase Dashboard → Storage → New Bucket**
2. Name: `grammar-notes`
3. Set to **Public** (so the HTML files are accessible via URL)
4. Add the following bucket policy to allow public reads:

```sql
-- In Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('grammar-notes', 'grammar-notes', true)
ON CONFLICT (id) DO NOTHING;
```

---

## Step 3 — Environment Variables

Add to `language-backend/.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

Then install the Supabase Python client:

```bash
cd language-backend
.venv\Scripts\pip install supabase markdown
```

---

## Step 4 — API Endpoints Reference

All routes are prefixed with `/api/admin/grammar`.

### Topics

| Method | Path | Description |
|---|---|---|
| GET | `/topics` | List topics. Query params: `learning_lang`, `level_code` |
| POST | `/topics` | Create topic |
| PUT | `/topics/{id}` | Update topic |
| DELETE | `/topics/{id}` | Delete topic (cascades) |

**POST /topics body:**
```json
{
  "name_en": "Nouns",
  "name_fr": "Les noms",
  "learning_lang": "fr",
  "level_code": "A1",
  "order_index": 0
}
```

### Subtopics

| Method | Path | Description |
|---|---|---|
| GET | `/subtopics` | List subtopics. Query param: `topic_id` |
| POST | `/subtopics` | Create subtopic |
| PUT | `/subtopics/{id}` | Update subtopic |
| DELETE | `/subtopics/{id}` | Delete subtopic (cascades) |

**POST /subtopics body:**
```json
{
  "topic_id": 1,
  "name_en": "Perfect Nouns",
  "name_fr": "Noms parfaits",
  "order_index": 0
}
```

### Notes

| Method | Path | Description |
|---|---|---|
| GET | `/notes` | List notes. Query params: `subtopic_id`, `concept_id`, `known_lang` |
| GET | `/notes/{id}/markdown` | Get raw markdown source for editing |
| POST | `/notes` | Create note (compiles markdown → HTML → uploads to Supabase) |
| PUT | `/notes/{id}` | Update note (recompiles if markdown changed) |
| DELETE | `/notes/{id}` | Delete note |
| POST | `/preview-markdown` | Preview compiled HTML without saving |

**POST /notes body:**
```json
{
  "subtopic_id": 1,
  "concept_id": "fr-a1-nouns-perfect",
  "known_lang": "en",
  "learning_lang": "fr",
  "title": "Perfect Nouns in French",
  "markdown_source": "# Perfect Nouns\n\nIn French, nouns have gender...",
  "order_index": 0
}
```

**Adding a translation (same concept, different known_lang):**
```json
{
  "subtopic_id": 1,
  "concept_id": "fr-a1-nouns-perfect",
  "known_lang": "fr",
  "learning_lang": "fr",
  "title": "Les noms parfaits en français",
  "markdown_source": "# Les noms parfaits\n\nEn français, les noms ont un genre...",
  "order_index": 0
}
```

---

## Step 5 — Frontend Implementation

### Install dependencies

```bash
cd language_admin_panel
npm install @uiw/react-md-editor
```

### Files to create

```
language_admin_panel/src/
├── components/
│   └── ContentManager.tsx   ← shared pipeline for Grammar & Stories
├── pages/
│   ├── Grammar.tsx          ← wraps ContentManager with section="grammar"
│   └── Stories.tsx          ← wraps ContentManager with section="stories"
└── services/
    └── grammarApi.ts        ← API calls
```

### User flow

```
Grammar (or Stories) page
  │
  ├─ Select Language (fr / de / es / ...)
  ├─ Select CEFR Level (A1 / A2 / B1 / B2)
  │
  ├─ Topics list  [+ Add Topic]
  │    └─ Click topic →
  │
  ├─ Subtopics list  [+ Add Subtopic]
  │    └─ Click subtopic →
  │
  ├─ Notes list  [+ Create Note]
  │    ├─ "EN: Click here to preview"  → opens html_url in new tab
  │    ├─ "FR: Click here to preview"  → opens html_url in new tab
  │    └─ [+ Add Translation]          → opens editor with same concept_id
  │
  └─ Markdown Editor (modal)
       ├─ Title input
       ├─ Split-pane: markdown left / HTML preview right
       └─ [Save] → POST /notes → compile → upload → save URL
```

### grammarApi.ts

```typescript
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const grammarApi = {
  // Topics
  getTopics: (learningLang?: string, levelCode?: string) =>
    fetch(`${API}/admin/grammar/topics?${new URLSearchParams({
      ...(learningLang && { learning_lang: learningLang }),
      ...(levelCode && { level_code: levelCode }),
    })}`).then(r => r.json()),

  createTopic: (data: object) =>
    fetch(`${API}/admin/grammar/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteTopic: (id: number) =>
    fetch(`${API}/admin/grammar/topics/${id}`, { method: 'DELETE' }),

  // Subtopics
  getSubtopics: (topicId: number) =>
    fetch(`${API}/admin/grammar/subtopics?topic_id=${topicId}`).then(r => r.json()),

  createSubtopic: (data: object) =>
    fetch(`${API}/admin/grammar/subtopics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteSubtopic: (id: number) =>
    fetch(`${API}/admin/grammar/subtopics/${id}`, { method: 'DELETE' }),

  // Notes
  getNotes: (subtopicId: number) =>
    fetch(`${API}/admin/grammar/notes?subtopic_id=${subtopicId}`).then(r => r.json()),

  getNoteMarkdown: (id: number) =>
    fetch(`${API}/admin/grammar/notes/${id}/markdown`).then(r => r.json()),

  createNote: (data: object) =>
    fetch(`${API}/admin/grammar/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateNote: (id: number, data: object) =>
    fetch(`${API}/admin/grammar/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteNote: (id: number) =>
    fetch(`${API}/admin/grammar/notes/${id}`, { method: 'DELETE' }),

  previewMarkdown: (markdownText: string) =>
    fetch(`${API}/admin/grammar/preview-markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown_text: markdownText }),
    }).then(r => r.json()),
};
```

---

## Data Model Summary

```
languages (existing)
    code: "fr", "en", "de", "es", ...

levels (existing)
    code: "A1", "A2", "B1", "B2"

grammar_topics
    id, slug, name_en/fr/de/es
    learning_lang → languages.code
    level_id      → levels.id
    order_index, is_active

grammar_subtopics
    id, slug, name_en/fr/de/es
    topic_id → grammar_topics.id  (CASCADE DELETE)
    order_index, is_active

grammar_notes
    id
    subtopic_id   → grammar_subtopics.id  (CASCADE DELETE)
    concept_id    VARCHAR(100)   ← same value across translations
    known_lang    → languages.code  ← language of the explanation
    learning_lang → languages.code  ← language being taught
    markdown_source TEXT
    html_url        TEXT  ← Supabase Storage public URL
    title, description, order_index, is_active

UNIQUE (concept_id, known_lang)  ← one translation per language per concept
```

---

## Concept ID Convention

Use a human-readable, stable string:

```
{learning_lang}-{level}-{topic-slug}-{subtopic-slug}

Examples:
  fr-a1-nouns-perfect-nouns
  fr-b1-verbs-subjunctive
  de-a2-articles-definite
```

This makes it easy to add translations later — just POST a new note with the same `concept_id` and a different `known_lang`.

---

## Troubleshooting

**"Level not found" error on POST /topics**
→ Check that the `levels` table has rows for A1/A2/B1/B2. Run:
```sql
SELECT code FROM levels ORDER BY code;
```

**"language violates foreign key constraint" on POST /topics**
→ Check that the `languages` table has a row for your language code. Run:
```sql
SELECT code FROM languages ORDER BY code;
-- If missing, insert it:
INSERT INTO languages (code, name) VALUES ('fr', 'French') ON CONFLICT DO NOTHING;
```

**Supabase upload returns `__pending__/...` URL**
→ `SUPABASE_URL` / `SUPABASE_KEY` env vars are not set. Set them and restart the server.

**`markdown` package not installed**
→ Run: `pip install markdown` in the backend venv. The route has a fallback so it won't crash without it.
