# Admin Panel — Follow-up Tasks

## Task 1: Grammar/Stories Note Editor Refactor

**Priority:** High  
**Estimated effort:** 3–4 hours  
**Files affected:**
- `language_admin_panel/src/components/ContentManager.tsx`
- `language-backend/app/routes/grammar_admin.py`

---

### 1a. Convert Editor from Modal to Full-Page View

**Current behaviour:** The note editor opens as a fixed overlay modal on top of the notes list.

**Desired behaviour:** The editor should be a full-page view within the existing drill-down navigation, consistent with how Topics → Subtopics → Notes already works.

**Implementation:**
- Add `'editor'` to the `View` type: `type View = 'topics' | 'subtopics' | 'notes' | 'editor'`
- Add `editorState` to `ContentManager` root state:
  ```typescript
  const [editorState, setEditorState] = useState<{
    subtopic: Subtopic;
    existingNote: Note | null;
    translationFor: Note | null;
    takenLangs: string[];
  } | null>(null);
  ```
- When "Create Note", "Edit", or "Add Translation" is clicked, set `editorState` and `setView('editor')`
- Render `<NoteEditorView ... />` when `view === 'editor'`
- The editor view should have a breadcrumb: `Topics / Nouns / Perfect Nouns / Edit Note`
- Back button returns to `view === 'notes'`
- Remove the `NoteEditorModal` component entirely
- Remove the `editorOpen` state from `NotesView`

---

### 1b. Switch Content Format from HTML to Markdown

**Current behaviour:** The editor uses Quill (WYSIWYG) which outputs HTML. The HTML is saved as `markdown_source` in the DB.

**Desired behaviour:** Admin writes in Markdown. Backend compiles Markdown → HTML. Both are stored (markdown for editing, HTML for serving). This allows the same compilation logic to be reused on the main website.

**Why this matters:** If we save markdown, we can always re-compile with updated CSS/templates. If we only save HTML, we lose the ability to re-style without re-writing content.

**Implementation:**

*Frontend:*
- Replace `react-quill-new` with a plain `<textarea>` for markdown input
- Add a simple markdown toolbar (buttons that insert `**`, `##`, `|table|`, etc.)
- The "Paste HTML" panel can stay as-is for importing legacy HTML content
- Preview tab calls `POST /admin/grammar/preview-markdown` and renders the result

*Backend — `compile_markdown_to_html` in `grammar_admin.py`:*
- The function already exists and works
- Currently saves Quill HTML as `markdown_source` — change to save actual markdown
- `html_content` column stores the compiled HTML (already implemented)

*DB:*
- No migration needed — `markdown_source` (TEXT) and `html_content` (TEXT) columns already exist

---

### 1c. Apply Netlify-Style CSS to Preview and Served HTML

**Reference:** https://strong-syrniki-d141e1.netlify.app/

**Current behaviour:** Preview uses generic GitHub markdown CSS. The served HTML (`/api/admin/grammar/notes/{id}/html`) uses the same.

**Desired behaviour:** Both the in-editor preview and the served HTML should use the same CSS as the Netlify reference — structured cards, rule boxes, tip callouts, French term highlighting, clean typography.

**Implementation:**

Extract the CSS from the Netlify site and embed it in `compile_markdown_to_html`:

Key styles to replicate:
```css
/* Typography */
body { font-family: 'Inter', sans-serif; max-width: 860px; margin: 0 auto; padding: 2rem; }
h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.4rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
h3 { font-size: 1.1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }

/* Rule boxes (h3 sections) */
.rule-box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; margin: 1.5rem 0; }
.rule-box h3 { color: #1d4ed8; }

/* Tip callouts (blockquote with 💡) */
blockquote { background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 1rem 1.25rem; }

/* Warning callouts (blockquote with ⚠️) */
blockquote.warning { background: #fff7ed; border-left-color: #f97316; }

/* Tables */
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 10px 14px; }
td { padding: 10px 14px; border-bottom: 1px solid #e5e7eb; }
td em, td strong { color: #1d4ed8; font-style: normal; }

/* French term highlighting */
em { color: #1d4ed8; font-style: normal; font-weight: 500; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
```

The markdown author can use:
- `## Rule 1: Add -s` → renders as a rule section header
- `> 💡 Key Point` → renders as a blue tip callout
- `> ⚠️ Exception` → renders as an orange warning callout
- `*French term*` → renders as highlighted blue term
- Standard markdown tables → renders with clean styling

**Backend change** — update `compile_markdown_to_html` to use this CSS instead of GitHub markdown CSS.

**Frontend change** — update the `.note-preview` CSS in `ContentManager.tsx` to match.

---

## Task 2: Stories Page — Same Pipeline as Grammar

**Priority:** Medium  
**Estimated effort:** 1 hour (reuse Grammar infrastructure)

**Current behaviour:** Stories page uses the same `ContentManager` component as Grammar, which works for topic/subtopic/note management. However, the terminology is wrong ("Topics" should be "Story Collections", "Subtopics" should be "Stories", "Notes" should be "Story Content").

**Desired behaviour:** Stories should have its own terminology and potentially different fields (e.g., difficulty level, story length, audio URL).

**Options:**
1. **Quick:** Pass `mode="stories"` prop to `ContentManager` and adjust labels
2. **Full:** Create a separate `StoriesManager` component with story-specific fields

---

## Task 3: Supabase Storage Integration

**Priority:** Low (nice to have)  
**Estimated effort:** 1 hour

**Current behaviour:** Compiled HTML is stored in the `html_content` DB column. The `html_url` points to `/api/admin/grammar/notes/{id}/html` which serves it from the DB.

**Desired behaviour:** Upload compiled HTML to Supabase Storage bucket `grammar-notes` and store the public CDN URL in `html_url`. This makes the notes accessible without the backend running.

**Steps:**
1. Add to `language-backend/.env`:
   ```
   SUPABASE_URL=https://cwqqqonzsfjalebsvqaq.supabase.co
   SUPABASE_KEY=<anon or service role key from Supabase dashboard>
   ```
2. Create bucket `grammar-notes` in Supabase dashboard → Storage → New Bucket → Public
3. The `_try_supabase_upload` function in `grammar_admin.py` is already implemented — it will automatically activate once the env vars are set
4. Restart the backend — new notes will upload to Supabase automatically

**Note:** Existing notes with `__db__` URLs will continue to work via the serve endpoint. Only new/updated notes will get Supabase URLs.

---

## Task 4: DB Migration for Existing Deployments

**Priority:** High (required before production)

If the grammar tables were created with the old schema (where `html_url` was `NOT NULL`), run this in Supabase SQL Editor:

```sql
-- Fix grammar_notes table for existing deployments
ALTER TABLE grammar_notes ALTER COLUMN html_url DROP NOT NULL;
ALTER TABLE grammar_notes ADD COLUMN IF NOT EXISTS html_content TEXT;

-- Verify
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'grammar_notes'
ORDER BY ordinal_position;
```

---

## Current Status Summary

| Feature | Status | Notes |
|---|---|---|
| Grammar/Stories topic management | ✅ Working | Create, edit, delete topics |
| Subtopic management | ✅ Working | Create, edit, delete subtopics |
| Note creation (Quill editor) | ✅ Working | Saves HTML to DB |
| Note preview (in-editor) | ✅ Working | Renders Quill HTML |
| Note preview (external link) | ✅ Working | Served from DB via `/notes/{id}/html` |
| Add Translation | ✅ Working | Locks concept_id, disables taken languages |
| Duplicate prevention | ✅ Working | 409 error with clear message |
| Markdown editor | ⏳ Task 1b | Currently using Quill (HTML) |
| Full-page editor view | ⏳ Task 1a | Currently a modal |
| Netlify-style CSS | ⏳ Task 1c | Currently GitHub markdown CSS |
| Supabase Storage upload | ⏳ Task 3 | Needs env vars configured |
