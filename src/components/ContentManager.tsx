"use client";
import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { ChevronLeft, Plus, Trash2, X, Save, Eye, Pencil, ExternalLink, Globe, AlertCircle, CheckCircle2, Loader2, Moon, Sun } from 'lucide-react';
import api from '../services/api';
import 'react-quill-new/dist/quill.snow.css';
import 'quill-better-table/dist/quill-better-table.css';
import StoryEditor from './StoryEditor';

// ─── API Prefix Context ───────────────────────────────────────────────────────
// Allows sub-views to call the correct endpoint (grammar vs stories) without prop-drilling.
const ApiPrefixContext = createContext<'grammar' | 'stories'>('grammar');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Topic {
  id: number; slug: string; name_en: string; name_fr?: string;
  learning_lang: string; level_code: string;
  order_index: number; is_active: boolean; subtopics_count: number;
}
interface Subtopic {
  id: number; slug: string; topic_id: number; topic_name: string;
  name_en: string; name_fr?: string;
  order_index: number; is_active: boolean; notes_count: number;
}
interface Note {
  id: number; subtopic_id: number; concept_id: string;
  known_lang: string; learning_lang: string;
  title: string | null; html_url: string;
  s3_key: string | null;
  order_index: number; is_active: boolean;
}

type View = 'topics' | 'subtopics' | 'notes' | 'editor';

interface EditorState {
  subtopicId: number;
  subtopicName: string;
  learningLang: string;
  existingNote: Note | null;
  translationFor: Note | null;
  takenLangs: string[];
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'];
const LANGUAGES = [
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
];
const KNOWN_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toast({ ok, msg, onDone }: { ok: boolean; msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`alert ${ok ? 'alert-success' : 'alert-error'}`}
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, minWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      {ok ? <CheckCircle2 size={16} style={{ display: 'inline', marginRight: 8 }} /> : <AlertCircle size={16} style={{ display: 'inline', marginRight: 8 }} />}
      {msg}
    </div>
  );
}

function ConfirmModal({ title, body, onConfirm, onCancel, loading }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>{body}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return { width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: `${color}22`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' };
}

// ─── Box Modal ───────────────────────────────────────────────────────────────
// Inserts a styled callout/highlight box into the editor

function BoxModal({ onInsert, onClose, darkMode }: {
  onInsert: (html: string) => void;
  onClose: () => void;
  darkMode: boolean;
}) {
  const [text, setText] = useState('');
  const dm = darkMode;
  const bg = dm ? '#161b22' : '#ffffff';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';

  const handleInsert = () => {
    if (!text.trim()) return;
    // Use <blockquote> — Quill preserves it natively and the grammar CSS template
    // already styles blockquote with the orange left border + cream background.
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const inner = lines.map(l => `<p>${l}</p>`).join('');
    const html = `<blockquote>${inner}</blockquote><p><br></p>`;
    onInsert(html);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', width: 520, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>📦 Insert Box</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: textMuted }}>Creates a highlighted callout box (orange left border)</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type the box content here. Each line becomes a paragraph inside the box."
          rows={5}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
        />
        {/* Preview */}
        {text.trim() && (
          <div style={{ marginTop: 12, background: '#eff6ff', borderLeft: '4px solid #2563eb', borderRadius: 8, padding: '14px 18px' }}>
            {text.split('\n').filter(Boolean).map((l, i) => (
              <p key={i} style={{ margin: '0 0 6px 0', fontSize: 13, color: '#363639' }}>{l}</p>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleInsert} disabled={!text.trim()}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 6, background: '#ffa90a', color: '#fff', cursor: text.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: text.trim() ? 1 : 0.5 }}>
            Insert Box
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vocab Table Modal ────────────────────────────────────────────────────────
// Customizable columns, hover-translate tooltips, audio per cell, arrow separators

interface VocabCell {
  text: string;
  tooltip: string;
  audioUrl: string;
  tts: boolean;
}

interface VocabTableRow {
  cells: VocabCell[];
}


function VocabTableModal({ onInsert, onClose, darkMode, initialData }: {
  onInsert: (html: string, tableData: TableBlockData) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: TableBlockData;
}) {
  const [headers, setHeaders] = useState<string[]>(
    initialData?.headers ?? ['French Singular', 'French Plural']
  );
  const [rows, setRows] = useState<VocabTableRow[]>(
    initialData?.rows ?? [
      { cells: [{ text: '', tooltip: '', audioUrl: '', tts: false }, { text: '', tooltip: '', audioUrl: '', tts: false }] },
      { cells: [{ text: '', tooltip: '', audioUrl: '', tts: false }, { text: '', tooltip: '', audioUrl: '', tts: false }] },
      { cells: [{ text: '', tooltip: '', audioUrl: '', tts: false }, { text: '', tooltip: '', audioUrl: '', tts: false }] },
    ]
  );
  const dm = darkMode;
  const bg = dm ? '#161b22' : '#ffffff';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';
  const inputBorder = dm ? '#30363d' : '#dee2e6';
  const surface = dm ? '#1c2128' : '#f8f9fa';

  const numCols = headers.length;

  const addColumn = () => {
    setHeaders(h => [...h, `Column ${h.length + 1}`]);
    setRows(r => r.map(row => ({ cells: [...row.cells, { text: '', tooltip: '', audioUrl: '', tts: false }] })));
  };
  const removeColumn = (ci: number) => {
    if (numCols <= 1) return;
    setHeaders(h => h.filter((_, i) => i !== ci));
    setRows(r => r.map(row => ({ cells: row.cells.filter((_, i) => i !== ci) })));
  };
  const updateHeader = (ci: number, val: string) => setHeaders(h => h.map((v, i) => i === ci ? val : v));
  const addRow = () => setRows(r => [...r, { cells: Array.from({ length: numCols }, () => ({ text: '', tooltip: '', audioUrl: '', tts: false })) }]);
  const removeRow = (ri: number) => { if (rows.length > 1) setRows(r => r.filter((_, i) => i !== ri)); };
  const updateCell = (ri: number, ci: number, field: keyof VocabCell, val: string | boolean) =>
    setRows(r => r.map((row, i) => i !== ri ? row : { cells: row.cells.map((cell, j) => j !== ci ? cell : { ...cell, [field]: val }) }));

  const hasContent = rows.some(row => row.cells.some(c => c.text.trim()));

  const handleInsert = () => {
    const validRows = rows.filter(row => row.cells.some(c => c.text.trim()));
    if (!validRows.length) return;

    // Structured data embedded as a <script> tag — survives DB round-trip with
    // zero encoding issues. The script tag is invisible in the rendered output.
    const tableData: TableBlockData = { headers, rows: validRows };
    const metaJson = JSON.stringify({ type: 'table', data: tableData });
    const metaTag = `<div data-block-meta="1" style="display:none;">${metaJson}</div>`;

    // Header row — columns separated by narrow arrow columns
    const thCells = headers.map((h, ci) => {
      const isLast = ci === headers.length - 1;
      return `<th style="padding:18px 20px;text-align:center;font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;color:#3d2817;border-right:1px solid rgba(255,255,255,0.3);">${h}</th>`
        + (isLast ? '' : `<th style="padding:0;width:48px;border-right:1px solid rgba(255,255,255,0.3);"></th>`);
    }).join('');

    // Data rows
    const bodyRows = validRows.map((row, ri) => {
      const tdCells = row.cells.map((cell, ci) => {
        const isLast = ci === headers.length - 1;
        const cellBg = ri % 2 === 0 ? '#fffbeb' : '#ffffff';
        const audioBtn = cell.tts && cell.text.trim()
          ? `<button onclick="(function(b){var t=b.getAttribute('data-tts-text');if(!t)return;var s=window.speechSynthesis;s.cancel();var u=new SpeechSynthesisUtterance(t);u.lang='fr-FR';var v=s.getVoices();var fv=v.find(function(x){return x.lang==='fr-FR'})||v.find(function(x){return x.lang==='fr-CA'})||v.find(function(x){return x.lang.startsWith('fr')});if(fv)u.voice=fv;s.speak(u);b.style.transform='scale(0.9)';setTimeout(function(){b.style.transform='scale(1)'},200)})(this)" data-tts-text="${cell.text.trim()}" style="background:none;border:none;cursor:pointer;padding:2px 4px;display:inline-flex;align-items:center;vertical-align:middle;margin-left:6px;" title="Play TTS">🔊</button>`
          : cell.audioUrl.trim()
          ? `<button onclick="(function(b){var a=new Audio('${cell.audioUrl.trim()}');a.currentTime=0;a.play();b.style.transform='scale(0.9)';setTimeout(function(){b.style.transform='scale(1)'},200)})(this)" style="background:none;border:none;cursor:pointer;padding:2px 4px;display:inline-flex;align-items:center;vertical-align:middle;margin-left:6px;" title="Play audio">🔊</button>`
          : '';
        const inner = cell.tooltip.trim()
          ? `<span style="position:relative;display:inline-block;cursor:pointer;color:#2563eb;font-weight:600;" onmouseenter="var t=this.querySelector('.vtt');if(t)t.style.opacity='1';" onmouseleave="var t=this.querySelector('.vtt');if(t)t.style.opacity='0';">${cell.text.trim() || '—'}<span class="vtt" style="opacity:0;transition:opacity 0.15s;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;white-space:nowrap;pointer-events:none;font-weight:400;z-index:10;">${cell.tooltip.trim()}</span></span>`
          : `<span style="font-weight:600;color:#3d2817;">${cell.text.trim() || '—'}</span>`;
        return `<td style="padding:18px 20px;text-align:center;vertical-align:middle;background:${cellBg};border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">${inner}${audioBtn}</td>`
          + (isLast ? '' : `<td style="padding:0;width:48px;text-align:center;vertical-align:middle;background:${cellBg};border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;color:#ffa90a;font-size:18px;">→</td>`);
      }).join('');
      return `<tr>${tdCells}</tr>`;
    }).join('\n');

    const html = `<div data-vocab-table="1" style="overflow-x:auto;margin:24px 0;border-radius:16px;box-shadow:0 4px 16px rgba(0,0,0,0.08);overflow:hidden;">${metaTag}<table style="width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:1rem;background:#ffffff;"><thead style="background:hsl(39,100%,73%);"><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table></div><p><br></p>`;
    onInsert(html, tableData);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', width: 860, maxWidth: '97vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>

        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>📋 Insert Vocabulary Table</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: textMuted }}>Customizable columns · hover tooltip · TTS per cell · arrow separators</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
        </div>

        {/* Column header editors */}
        <div style={{ flexShrink: 0, marginBottom: 12, padding: '10px 12px', background: surface, borderRadius: 8, border: `1px solid ${border}` }}>
          <div style={{ fontSize: 11, color: textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Column Headers</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {headers.map((h, ci) => (
              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {ci > 0 && <span style={{ color: '#ffa90a', fontSize: 16, marginRight: 4 }}>→</span>}
                <input value={h} onChange={e => updateHeader(ci, e.target.value)}
                  style={{ padding: '5px 8px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 12, outline: 'none', background: inputBg, color: textPrimary, width: 150 }} />
                {headers.length > 1 && (
                  <button onClick={() => removeColumn(ci)}
                    style={{ width: 20, height: 20, border: 'none', borderRadius: 4, background: '#ef444422', color: '#ef4444', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addColumn}
              style={{ padding: '5px 10px', border: `1px dashed ${border}`, borderRadius: 6, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> Add Column
            </button>
          </div>
        </div>

        {/* Sub-header labels + Rows — labels are rendered inside each cell so they always align */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              {row.cells.map((cell, ci) => (
                <div key={ci} style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 2fr 90px', gap: 4 }}>
                  {/* Text field */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ri === 0 && (
                      <span style={{ fontSize: 10, color: textMuted, fontWeight: 700, textTransform: 'uppercase', paddingLeft: 2, letterSpacing: '0.05em' }}>Text</span>
                    )}
                    <input value={cell.text} onChange={e => updateCell(ri, ci, 'text', e.target.value)}
                      placeholder="e.g. un chat"
                      style={{ padding: '6px 8px', border: `1px solid ${inputBorder}`, borderRadius: 5, fontSize: 12, outline: 'none', background: inputBg, color: textPrimary, width: '100%' }} />
                  </div>
                  {/* Tooltip field */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ri === 0 && (
                      <span style={{ fontSize: 10, color: textMuted, fontWeight: 700, textTransform: 'uppercase', paddingLeft: 2, letterSpacing: '0.05em' }}>Tooltip (hover)</span>
                    )}
                    <input value={cell.tooltip} onChange={e => updateCell(ri, ci, 'tooltip', e.target.value)}
                      placeholder="a cat"
                      style={{ padding: '6px 8px', border: `1px solid ${inputBorder}`, borderRadius: 5, fontSize: 12, outline: 'none', background: inputBg, color: textPrimary, width: '100%' }} />
                  </div>
                  {/* TTS toggle */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ri === 0 && (
                      <span style={{ fontSize: 10, color: textMuted, fontWeight: 700, textTransform: 'uppercase', paddingLeft: 2, letterSpacing: '0.05em' }}>TTS</span>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', height: 30 }}>
                      <div
                        onClick={() => updateCell(ri, ci, 'tts', !cell.tts)}
                        style={{
                          width: 34, height: 18, borderRadius: 9, background: cell.tts ? '#2563eb' : (dm ? '#30363d' : '#d1d5db'),
                          position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, left: cell.tts ? 18 : 2, width: 14, height: 14,
                          borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: cell.tts ? (dm ? '#93c5fd' : '#2563eb') : textMuted, fontWeight: cell.tts ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {cell.tts ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
              {/* Delete button — aligned to bottom of inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {ri === 0 && <div style={{ height: 17 }} />}{/* spacer matching label height */}
                <button onClick={() => removeRow(ri)} disabled={rows.length <= 1}
                  style={{ width: 32, height: 30, border: 'none', borderRadius: 6, background: rows.length > 1 ? '#ef444422' : 'transparent', color: rows.length > 1 ? '#ef4444' : textMuted, cursor: rows.length > 1 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add row + preview */}
        <div style={{ flexShrink: 0, marginTop: 10 }}>
          <button onClick={addRow}
            style={{ padding: '6px 14px', border: `1px dashed ${border}`, borderRadius: 6, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Add Row
          </button>

          {hasContent && (
            <div style={{ marginTop: 10, background: surface, borderRadius: 8, padding: '10px 14px', border: `1px solid ${border}`, overflowX: 'auto' }}>
              <p style={{ fontSize: 11, color: textMuted, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'hsl(39,100%,73%)' }}>
                    {headers.map((h, ci) => (
                      <React.Fragment key={ci}>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3d2817' }}>{h}</th>
                        {ci < headers.length - 1 && <th style={{ width: 32, padding: 0 }} />}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(row => row.cells.some(c => c.text.trim())).map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? '#fffbeb' : '#ffffff' }}>
                      {row.cells.map((cell, ci) => (
                        <React.Fragment key={ci}>
                          <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
                            <span title={cell.tooltip || undefined}
                              style={{ fontWeight: 600, color: cell.tooltip ? '#2563eb' : '#3d2817', borderBottom: cell.tooltip ? '1px dashed #ffa90a' : 'none', cursor: cell.tooltip ? 'help' : 'default' }}>
                              {cell.text || '—'}
                            </span>
                            {(cell.tts && cell.text.trim()) || cell.audioUrl ? <span style={{ marginLeft: 6 }}>🔊</span> : null}
                          </td>
                          {ci < headers.length - 1 && (
                            <td style={{ width: 32, textAlign: 'center', color: '#ffa90a', fontSize: 16, borderBottom: '1px solid #e5e7eb' }}>→</td>
                          )}
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleInsert} disabled={!hasContent}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: hasContent ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: hasContent ? 1 : 0.5 }}>
            Insert Table
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extract Modal ────────────────────────────────────────────────────────────
// Inserts a styled extract block: text + optional image side-by-side

function ExtractModal({ onInsert, onClose, darkMode, initialData }: {
  onInsert: (html: string, extractData: ExtractBlockData) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: ExtractBlockData;
}) {
  const [text, setText] = useState(initialData?.text ?? '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(initialData?.imageAlt ?? '');
  const [imagePosition, setImagePosition] = useState<'right' | 'left'>(initialData?.imagePosition ?? 'right');
  const dm = darkMode;
  const bg = dm ? '#161b22' : '#ffffff';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';
  const inputBorder = dm ? '#30363d' : '#dee2e6';

  const handleInsert = () => {
    if (!text.trim()) return;
    const extractData: ExtractBlockData = { text, imageUrl, imageAlt, imagePosition };
    const metaJson = JSON.stringify({ type: 'extract', data: extractData });
    const metaTag = `<div data-block-meta="1" style="display:none;">${metaJson}</div>`;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const textHtml = lines.map(l => `<p style="margin:0 0 10px 0;color:#363639;line-height:1.7;">${l}</p>`).join('');
    const imgHtml = imageUrl.trim()
      ? `<img src="${imageUrl.trim()}" alt="${imageAlt.trim() || 'Extract image'}" style="width:200px;max-width:200px;border-radius:10px;object-fit:cover;display:block;" />`
      : '';

    let innerHtml: string;
    if (imgHtml) {
      const textCell = `<td style="padding:0 16px 0 0;vertical-align:top;color:#363639;">${textHtml}</td>`;
      const imgCell = `<td style="padding:0;vertical-align:top;width:210px;">${imgHtml}</td>`;
      const cells = imagePosition === 'right' ? `${textCell}${imgCell}` : `${imgCell}${textCell}`;
      innerHtml = `<table style="width:100%;border-collapse:collapse;border:none;background:transparent;box-shadow:none;"><tbody><tr style="background:transparent;">${cells}</tr></tbody></table>`;
    } else {
      innerHtml = textHtml;
    }

    const html = `<div data-extract="1" style="background:#f3ede6;border-radius:12px;padding:20px 24px;margin:16px 0;font-family:'DM Sans',sans-serif;border:1px solid #e5e7eb;">${metaTag}${innerHtml}</div><p><br></p>`;
    onInsert(html, extractData);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', width: 580, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>🖼 Insert Extract</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: textMuted }}>A styled block with text and an optional image</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
        </div>

        {/* Text */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Text *</label>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type the extract text here. Each line becomes a paragraph."
            rows={5}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${inputBorder}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
          />
        </div>

        {/* Image URL */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Image URL (optional)</label>
          <input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://…/image.jpg"
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${inputBorder}`, borderRadius: 8, fontSize: 13, outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
          />
        </div>

        {imageUrl.trim() && (
          <>
            {/* Alt text */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Image Alt Text</label>
              <input
                value={imageAlt}
                onChange={e => setImageAlt(e.target.value)}
                placeholder="Describe the image for accessibility"
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${inputBorder}`, borderRadius: 8, fontSize: 13, outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
              />
            </div>
            {/* Image position */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Image Position</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['right', 'left'] as const).map(pos => (
                  <button key={pos} onClick={() => setImagePosition(pos)}
                    style={{ padding: '6px 16px', border: `1px solid ${imagePosition === pos ? '#2563eb' : inputBorder}`, borderRadius: 6, background: imagePosition === pos ? '#2563eb22' : 'transparent', color: imagePosition === pos ? '#2563eb' : textMuted, cursor: 'pointer', fontSize: 13, fontWeight: imagePosition === pos ? 600 : 400 }}>
                    Image {pos === 'right' ? '→ Right' : '← Left'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Preview */}
        {text.trim() && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</label>
            <div style={{ background: '#f3ede6', borderRadius: 10, padding: '14px 18px', border: '1px solid #e5e7eb' }}>
              {imageUrl.trim() ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none', background: 'transparent', boxShadow: 'none' }}>
                  <tbody>
                    <tr style={{ background: 'transparent' }}>
                      {imagePosition === 'left' && (
                        <td style={{ width: 120, verticalAlign: 'top', paddingRight: 12, border: 'none' }}>
                          <img src={imageUrl} alt={imageAlt || 'preview'} style={{ width: 110, borderRadius: 8, objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </td>
                      )}
                      <td style={{ verticalAlign: 'top', border: 'none', padding: 0 }}>
                        {text.split('\n').filter(Boolean).map((l, i) => (
                          <p key={i} style={{ margin: '0 0 6px 0', fontSize: 13, color: '#363639', lineHeight: 1.6 }}>{l}</p>
                        ))}
                      </td>
                      {imagePosition === 'right' && (
                        <td style={{ width: 120, verticalAlign: 'top', paddingLeft: 12, border: 'none' }}>
                          <img src={imageUrl} alt={imageAlt || 'preview'} style={{ width: 110, borderRadius: 8, objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div>
                  {text.split('\n').filter(Boolean).map((l, i) => (
                    <p key={i} style={{ margin: '0 0 6px 0', fontSize: 13, color: '#363639', lineHeight: 1.6 }}>{l}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleInsert} disabled={!text.trim()}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 6, background: '#059669', color: '#fff', cursor: text.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: text.trim() ? 1 : 0.5 }}>
            Insert Extract
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section types ────────────────────────────────────────────────────────────

interface NoteSection {
  id: string;
  slNo: number;
  heading: string;
}

// ─── EditorSection — per-section content model ───────────────────────────────

interface EditorSection {
  id: string;
  slNo: number;
  heading: string;
  quillHtml: string;        // text content for this section's textarea
  blocks: AppendedBlock[];  // tables/extracts belonging to this section
}

// ─── Section Modal ────────────────────────────────────────────────────────────
// Asks for Sl No + Heading when adding/editing a section

function SectionModal({ onInsert, onClose, darkMode, initialData }: {
  onInsert: (section: NoteSection) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: NoteSection;
}) {
  const [slNo, setSlNo] = useState(initialData?.slNo?.toString() ?? '');
  const [heading, setHeading] = useState(initialData?.heading ?? '');
  const dm = darkMode;
  const bg = dm ? '#161b22' : '#ffffff';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';
  const inputBorder = dm ? '#30363d' : '#dee2e6';

  const slNoNum = parseInt(slNo, 10);
  const valid = heading.trim().length > 0 && !isNaN(slNoNum) && slNoNum > 0;

  const handleSubmit = () => {
    if (!valid) return;
    onInsert({
      id: initialData?.id ?? `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      slNo: slNoNum,
      heading: heading.trim(),
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>📑 {initialData ? 'Edit Section' : 'Add Section'}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: textMuted }}>Sections appear in the Table of Contents</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
        </div>

        {/* Sl No */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sl No <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            autoFocus
            type="number"
            min={1}
            value={slNo}
            onChange={e => setSlNo(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 1"
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${inputBorder}`, borderRadius: 8, fontSize: 14, outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: textMuted }}>Numbers only — used to order the Table of Contents</p>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section Heading <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={heading}
            onChange={e => setHeading(e.target.value)}
            placeholder="e.g. Introduction"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${inputBorder}`, borderRadius: 8, fontSize: 14, outline: 'none', background: inputBg, color: textPrimary, boxSizing: 'border-box' }}
          />
        </div>

        {/* Preview */}
        {valid && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: dm ? '#1c2128' : '#f9f5f0', borderRadius: 8, border: `1px solid ${border}` }}>
            <p style={{ margin: 0, fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Preview</p>
            <p style={{ margin: 0, fontSize: 13, color: textMuted }}><span style={{ fontWeight: 700, color: '#ffa90a' }}>{slNoNum}.</span> <span style={{ fontWeight: 700, color: textPrimary }}>{heading}</span></p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!valid}
            style={{ padding: '7px 18px', border: 'none', borderRadius: 6, background: '#ffa90a', color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: valid ? 1 : 0.5 }}>
            {initialData ? 'Update Section' : 'Add Section'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Appended block types ─────────────────────────────────────────────────────
// Each inserted block stores its source data as a typed object.
// The data is also embedded in the saved HTML as a hidden <div data-block-meta="1">
// tag so it survives the DB round-trip without any encoding issues.

interface TableBlockData {
  headers: string[];
  rows: VocabTableRow[];
}

interface ExtractBlockData {
  text: string;
  imageUrl: string;
  imageAlt: string;
  imagePosition: 'right' | 'left';
}

interface AppendedBlock {
  id: string;
  type: 'table' | 'extract';
  html: string;             // full rendered HTML saved to DB (includes embedded <script> tag)
  tableData?: TableBlockData;
  extractData?: ExtractBlockData;
}

// ─── extractBlockMeta ─────────────────────────────────────────────────────────
// Read the embedded <div data-block-meta="1" style="display:none"> tag
// from a block wrapper element. Returns the parsed meta object or null.
function extractBlockMeta(el: Element): { type: string; data: any } | null {
  try {
    const metaDiv = el.querySelector('div[data-block-meta="1"]');
    if (!metaDiv) return null;
    return JSON.parse(metaDiv.textContent || '');
  } catch {
    return null;
  }
}

// ─── Rich Text Editor Modal (Quill-based) ────────────────────────────────────

// Quill v2 only accepts formats it has registered blots for.
// 'table' is handled via dangerouslyPasteHTML — do NOT list td/tr/tbody/thead/th
// as named formats or Quill will spam "Cannot register" warnings on every render.
const QUILL_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'indent',
  'blockquote', 'code-block', 'link', 'image', 'align',
];

function NoteEditorView({ subtopicId, subtopicName, learningLang, existingNote, translationFor, takenLangs, onClose, onSaved, showToast }: {
  subtopicId: number; subtopicName: string; learningLang: string;
  existingNote?: Note | null;
  translationFor?: Note | null;
  takenLangs?: string[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [title, setTitle] = useState(existingNote?.title || translationFor?.title || '');
  const [knownLang, setKnownLang] = useState(() => {
    if (existingNote) return existingNote.known_lang;
    if (translationFor) {
      // Pick the first language not already taken
      const taken = new Set(takenLangs || [translationFor.known_lang]);
      const next = KNOWN_LANGS.find(l => !taken.has(l.code));
      return next?.code || 'en';
    }
    return 'en';
  });
  // For translations: lock concept_id to the source note's concept_id
  const [conceptId, setConceptId] = useState(
    existingNote?.concept_id || translationFor?.concept_id || ''
  );
  const isTranslation = !!translationFor && !existingNote;
  const conceptLocked = !!existingNote || isTranslation;

  const [htmlContent, setHtmlContent] = useState('');
  const [rawHtmlInput, setRawHtmlInput] = useState('');
  const [showRawHtmlPanel, setShowRawHtmlPanel] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Insert-block modals
  const [showBoxModal, setShowBoxModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  // Preamble blocks (before any section)
  const [preambleBlocks, setPreambleBlocks] = useState<AppendedBlock[]>([]);
  // Per-section content
  const [editorSections, setEditorSections] = useState<EditorSection[]>([]);
  // Which block is currently being edited: { sectionId: null = preamble, sectionId = section id, index = block index }
  const [editingBlock, setEditingBlock] = useState<{ sectionId: string | null; index: number } | null>(null);
  // Which section id the currently-open modal is targeting (null = preamble)
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);

  // Section modal
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);

  // Dark mode — persisted per editor session
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('editor_dark') === '1'; } catch { return false; }
  });

  // Inject global table styles once on mount — scoped styles don't reach Quill's DOM
  useEffect(() => {
    const id = 'quill-table-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      table.quill-better-table { width: 100% !important; border-collapse: collapse !important; margin: 10px 0 !important; table-layout: fixed !important; }
      table.quill-better-table td { border: 1px solid #adb5bd !important; padding: 6px 10px !important; min-width: 60px !important; min-height: 28px !important; word-break: break-word !important; vertical-align: top !important; }
      .quill-better-table-wrapper { overflow-x: auto !important; margin: 8px 0 !important; }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // Dynamically import ReactQuill to avoid SSR issues
  const [ReactQuill, setReactQuill] = useState<any>(null);
  const [quillRef, setQuillRef] = useState<any>(null);
  const [quillModules, setQuillModules] = useState<any>(null);

  // Insert a plain HTML table at the current cursor position
  const insertTable = useCallback((rows = 3, cols = 3) => {
    if (!quillRef) return;
    const quill = quillRef.getEditor ? quillRef.getEditor() : quillRef;
    if (!quill) return;

    // Build a plain HTML table with placeholder text
    const headerCells = Array.from({ length: cols }, (_, c) =>
      `<td style="border:1px solid #adb5bd;padding:6px 10px;min-width:80px;font-weight:600;background:#f0f0f0;">Header ${c + 1}</td>`
    ).join('');
    const bodyRows = Array.from({ length: rows - 1 }, (_, r) =>
      `<tr>${Array.from({ length: cols }, (_, c) =>
        `<td style="border:1px solid #adb5bd;padding:6px 10px;min-width:80px;">Row ${r + 1}, Col ${c + 1}</td>`
      ).join('')}</tr>`
    ).join('');

    const tableHtml = `<table style="border-collapse:collapse;width:100%;margin:10px 0;table-layout:fixed;">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table><p><br></p>`;

    // Get cursor position and insert HTML
    const range = quill.getSelection(true);
    const index = range ? range.index : quill.getLength();
    quill.clipboard.dangerouslyPasteHTML(index, tableHtml);
    // Move cursor after the table
    quill.setSelection(index + 1, 0);
  }, [quillRef]);

  // Insert raw HTML — for complex blocks (tables, styled divs) we append to a
  // separate blocks array that lives outside Quill's sanitizer.
  // targetSectionId === null → preamble; otherwise → that section's blocks.
  const insertHtmlAtCursor = useCallback((html: string, bypassQuill = false, blockType: 'table' | 'extract' = 'extract', tableData?: TableBlockData, extractData?: ExtractBlockData) => {
    if (bypassQuill) {
      const newBlock: AppendedBlock = {
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: blockType,
        html,
        tableData,
        extractData,
      };
      if (targetSectionId === null) {
        setPreambleBlocks(prev => [...prev, newBlock]);
      } else {
        setEditorSections(prev => prev.map(s =>
          s.id === targetSectionId ? { ...s, blocks: [...s.blocks, newBlock] } : s
        ));
      }
      return;
    }
    if (!quillRef) {
      setHtmlContent(prev => prev + html);
      return;
    }
    const quill = quillRef.getEditor ? quillRef.getEditor() : quillRef;
    if (!quill) { setHtmlContent(prev => prev + html); return; }
    const range = quill.getSelection(true);
    const index = range ? range.index : quill.getLength();
    quill.clipboard.dangerouslyPasteHTML(index, html);
    quill.setSelection(index + 1, 0);
  }, [quillRef, targetSectionId]);

  useEffect(() => {
    import('react-quill-new').then(mod => {
      const modules = {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ indent: '-1' }, { indent: '+1' }],
            ['blockquote', 'code-block'],
            ['link', 'image'],
            [{ align: [] }],
            ['table'],
            ['clean'],
          ],
          handlers: {
            table: () => insertTable(3, 3),
          },
        },
      };
      setQuillModules(modules);
      setReactQuill(() => mod.default);
    });
  }, [insertTable]);

  // Load existing content when editing.
  // Parse the saved HTML into preamble + per-section EditorSections.
  const apiPrefix = useContext(ApiPrefixContext);
  useEffect(() => {
    if (existingNote) {
      setLoading(true);
      api.get(`/admin/${apiPrefix}/notes/${existingNote.id}/markdown`)
        .then(r => {
          let raw: string = r.data.markdown_source || '';

          // Safety net: if the backend returned a full HTML page instead of a
          // raw fragment, extract just the body content before parsing.
          if (/^\s*<!DOCTYPE/i.test(raw) || /^\s*<html/i.test(raw)) {
            const fullDoc = new DOMParser().parseFromString(raw, 'text/html');
            const noteBody = fullDoc.querySelector('.note-body');
            raw = noteBody ? noteBody.innerHTML : fullDoc.body.innerHTML;
          }

          const parser = new DOMParser();
          const doc = parser.parseFromString(`<div id="root">${raw}</div>`, 'text/html');
          const root = doc.getElementById('root');
          if (!root) { setHtmlContent(raw); return; }

          // ── Parse into preamble + sections ──────────────────────────────
          // Strategy: walk child nodes, collect everything before the first
          // data-section-slno h2 into preamble, then group by section.

          const childNodes = Array.from(root.childNodes);

          // Find indices of section h2 elements
          const sectionIndices: number[] = [];
          childNodes.forEach((node, i) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              if (el.tagName.toLowerCase() === 'h2' && el.hasAttribute('data-section-slno')) {
                sectionIndices.push(i);
              }
            }
          });

          // Helper: parse a list of nodes into quillHtml + blocks
          const parseNodes = (nodes: ChildNode[]): { quillHtml: string; blocks: AppendedBlock[] } => {
            let quillHtml = '';
            const blocks: AppendedBlock[] = [];
            nodes.forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                quillHtml += node.textContent;
                return;
              }
              if (node.nodeType !== Node.ELEMENT_NODE) return;
              const el = node as Element;
              const tag = el.tagName.toLowerCase();
              const isVocabTable = tag === 'div' && el.getAttribute('data-vocab-table') === '1';
              const isExtract = tag === 'div' && el.getAttribute('data-extract') === '1';
              const isLegacyExtract = tag === 'div' && !isVocabTable && (
                el.getAttribute('style')?.includes('#f3ede6') ||
                el.getAttribute('style')?.includes('f3ede6')
              );
              if (isVocabTable || isExtract || isLegacyExtract) {
                const meta = extractBlockMeta(el);
                const blockId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${blocks.length}`;
                if (meta?.type === 'table') {
                  blocks.push({ id: blockId, type: 'table', html: el.outerHTML, tableData: meta.data });
                } else if (meta?.type === 'extract') {
                  blocks.push({ id: blockId, type: 'extract', html: el.outerHTML, extractData: meta.data });
                } else {
                  blocks.push({ id: blockId, type: isVocabTable ? 'table' : 'extract', html: el.outerHTML });
                }
              } else {
                quillHtml += el.outerHTML;
              }
            });
            return { quillHtml, blocks };
          };

          if (sectionIndices.length === 0) {
            // No sections — everything is preamble
            const { quillHtml, blocks } = parseNodes(childNodes);
            setHtmlContent(quillHtml);
            setPreambleBlocks(blocks);
            setEditorSections([]);
          } else {
            // Preamble = nodes before first section h2
            const preambleNodes = childNodes.slice(0, sectionIndices[0]);
            const { quillHtml: pHtml, blocks: pBlocks } = parseNodes(preambleNodes);
            setHtmlContent(pHtml);
            setPreambleBlocks(pBlocks);

            // Each section
            const loadedSections: EditorSection[] = [];
            sectionIndices.forEach((secNodeIdx, i) => {
              const h2El = childNodes[secNodeIdx] as Element;
              const slNo = parseInt(h2El.getAttribute('data-section-slno') || '0', 10);
              const secId = h2El.getAttribute('data-section-id') || `sec-${Date.now()}-${i}`;
              const heading = h2El.textContent?.trim() || '';
              if (!slNo || !heading) return;

              // Content nodes: check for new-style <div data-section-content>
              const nextIdx = secNodeIdx + 1;
              const nextNode = nextIdx < childNodes.length ? childNodes[nextIdx] as Element : null;
              const hasContentDiv = nextNode &&
                nextNode.nodeType === Node.ELEMENT_NODE &&
                nextNode.getAttribute('data-section-content') === secId;

              let contentNodes: ChildNode[];
              if (hasContentDiv) {
                contentNodes = Array.from(nextNode.childNodes);
              } else {
                // Legacy: everything between this h2 and the next h2 (or end)
                const endIdx = i + 1 < sectionIndices.length ? sectionIndices[i + 1] : childNodes.length;
                contentNodes = childNodes.slice(secNodeIdx + 1, endIdx);
              }

              const { quillHtml, blocks } = parseNodes(contentNodes);
              loadedSections.push({ id: secId, slNo, heading, quillHtml, blocks });
            });

            setEditorSections(loadedSections.sort((a, b) => a.slNo - b.slNo));
          }
        })
        .catch(() => setHtmlContent(''))
        .finally(() => setLoading(false));
    }
  }, [existingNote, apiPrefix]);

  const isEmpty = (html: string) => {
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    return !stripped || stripped === '<br>';
  };

  const preambleBlocksHtml = preambleBlocks.map(b => b.html).join('');

  // Inject raw HTML directly into Quill by setting it as the editor value
  const handleInjectRawHtml = () => {
    if (!rawHtmlInput.trim()) return;
    // Strip full HTML document wrapper if pasted (keep only body content)
    let html = rawHtmlInput.trim();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) html = bodyMatch[1].trim();
    // Set directly — Quill's controlled value prop parses HTML correctly
    setHtmlContent(html);
    setRawHtmlInput('');
    setShowRawHtmlPanel(false);
    setTab('write');
    showToast(true, 'HTML loaded into editor');
  };

  const handleSave = async () => {
    if (!title.trim()) { showToast(false, 'Title is required'); return; }
    if (!conceptId.trim()) { showToast(false, 'Concept ID is required'); return; }

    // Convert plain text (from section textareas) to HTML paragraphs.
    // If the content already contains HTML tags it's left as-is (Quill output).
    const plainTextToHtml = (text: string): string => {
      if (!text.trim()) return '';
      // If it already looks like HTML, don't double-wrap
      if (/<[a-z][\s\S]*>/i.test(text)) return text;
      // Split on blank lines → paragraphs; single newlines → <br>
      return text
        .split(/\n{2,}/)
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
    };

    // Build combined HTML:
    // 1. Preamble: quill html + preamble blocks
    // 2. Each section: <h2> + <div data-section-content> wrapping textarea text + blocks
    const preamblePart = htmlContent + preambleBlocksHtml;
    const sectionsPart = [...editorSections]
      .sort((a, b) => a.slNo - b.slNo)
      .map(s => {
        const sectionBlocksHtml = s.blocks.map(b => b.html).join('');
        const sectionContent = plainTextToHtml(s.quillHtml);
        return `<h2 data-section-slno="${s.slNo}" data-section-id="${s.id}">${s.heading}</h2>` +
          `<div data-section-content="${s.id}">${sectionContent}${sectionBlocksHtml}</div>`;
      })
      .join('');
    const combinedContent = preamblePart + sectionsPart;
    if (isEmpty(combinedContent)) { showToast(false, 'Content cannot be empty'); return; }
    setSaving(true);
    try {
      if (existingNote) {
        await api.put(`/admin/${apiPrefix}/notes/${existingNote.id}`, {
          markdown_source: combinedContent,
          title,
        });
        showToast(true, 'Note updated');
      } else {
        await api.post(`/admin/${apiPrefix}/notes`, {
          subtopic_id: subtopicId,
          concept_id: conceptId,
          known_lang: knownLang,
          learning_lang: learningLang,
          markdown_source: combinedContent,
          title,
        });
        showToast(true, 'Note created');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dm = darkMode;
  const bg = dm ? '#0e1117' : '#ffffff';
  const surface = dm ? '#161b22' : '#f8f9fa';
  const border = dm ? '#30363d' : '#dee2e6';
  const textPrimary = dm ? '#c9d1d9' : '#1a1a1a';
  const textMuted = dm ? '#8b949e' : '#666';
  const inputBg = dm ? '#0e1117' : '#ffffff';
  const inputBorder = dm ? '#30363d' : '#dee2e6';
  const previewBg = dm ? '#161b22' : '#f9f5f0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: bg, borderRadius: 12, border: `1px solid ${border}` }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.5rem', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0 }}>
        {/* Left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '4px 8px', borderRadius: 6 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: border, fontSize: 16 }}>|</span>
          <div>
            <span style={{ fontSize: 13, color: textMuted }}>{subtopicName} / </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
              {existingNote ? 'Edit Note' : isTranslation ? 'Add Translation' : 'Create Note'}
            </span>
            {isTranslation && <span style={{ marginLeft: 8, fontSize: 12, color: '#0969da', background: '#dbeafe', padding: '2px 8px', borderRadius: 4 }}>Translating: {conceptId}</span>}
          </div>
        </div>

        {/* Right: dark mode + save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { const next = !darkMode; setDarkMode(next); localStorage.setItem('editor_dark', next ? '1' : '0'); }}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={onClose} style={{ padding: '6px 16px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '6px 18px', border: 'none', borderRadius: 6, background: '#0969da', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* ── Meta fields ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', padding: '0.875rem 1.5rem', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Perfect Nouns in French"
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: inputBg, color: textPrimary }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concept ID *</label>
          <input value={conceptId} onChange={e => setConceptId(e.target.value)}
            placeholder="e.g. fr-a1-nouns-perfect" disabled={conceptLocked}
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: conceptLocked ? (dm ? '#1c2128' : '#f8f9fa') : inputBg, color: textPrimary, opacity: conceptLocked ? 0.7 : 1 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explanation Language</label>
          <select value={knownLang} onChange={e => setKnownLang(e.target.value)} disabled={!!existingNote}
            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 13, outline: 'none', background: existingNote ? (dm ? '#1c2128' : '#f8f9fa') : inputBg, color: textPrimary, opacity: existingNote ? 0.7 : 1 }}>
            {KNOWN_LANGS.map(l => {
              const isTaken = isTranslation && (takenLangs || []).includes(l.code);
              return <option key={l.code} value={l.code} disabled={isTaken}>{l.label}{isTaken ? ' (exists)' : ''}</option>;
            })}
          </select>
        </div>
      </div>

      {/* ── Tab bar + action buttons ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, background: surface, flexShrink: 0, alignItems: 'center' }}>
        {(['write', 'preview'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 22px', background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#0969da' : textMuted, borderBottom: tab === t ? '2px solid #0969da' : '2px solid transparent', fontWeight: tab === t ? 600 : 400, fontSize: 13 }}>
            {t === 'write' ? '✏️ Write' : '👁 Preview'}
          </button>
        ))}

        {/* Insert-block buttons — only visible in write mode */}
        {tab === 'write' && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 16, alignItems: 'center' }}>
            <button
              onClick={() => { setEditingSectionIndex(null); setShowSectionModal(true); }}
              title="Add a new section with heading and Sl No"
              style={{ padding: '4px 12px', border: `1px solid ${border}`, borderRadius: 5, background: '#ffa90a22', color: '#ffa90a', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              📑 Add Section
            </button>
            <span style={{ color: border, fontSize: 14 }}>|</span>
            <button
              onClick={() => { setTargetSectionId(null); setShowBoxModal(true); }}
              title="Insert a highlighted callout box"
              style={{ padding: '4px 12px', border: `1px solid ${border}`, borderRadius: 5, background: '#fff8e622', color: '#ffa90a', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              📦 Box
            </button>
            <button
              onClick={() => { setTargetSectionId(null); setEditingBlock(null); setShowTableModal(true); }}
              title="Insert a vocabulary table with audio and hover-translate"
              style={{ padding: '4px 12px', border: `1px solid ${border}`, borderRadius: 5, background: '#2563eb22', color: '#60a5fa', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              📋 Table
            </button>
            <button
              onClick={() => { setTargetSectionId(null); setEditingBlock(null); setShowExtractModal(true); }}
              title="Insert a styled extract block with optional image"
              style={{ padding: '4px 12px', border: `1px solid ${border}`, borderRadius: 5, background: '#05966922', color: '#34d399', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              🖼 Extract
            </button>
          </div>
        )}

        <button
          onClick={() => setShowRawHtmlPanel(p => !p)}
          style={{ marginLeft: 'auto', marginRight: 12, padding: '5px 12px', border: `1px solid ${border}`, borderRadius: 6, background: showRawHtmlPanel ? '#0969da' : 'transparent', color: showRawHtmlPanel ? '#fff' : textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
          {'</>'} Paste HTML
        </button>
      </div>

      {/* ── Paste HTML panel ── */}
      {showRawHtmlPanel && (
        <div style={{ padding: '10px 1.5rem', borderBottom: `1px solid ${border}`, background: dm ? '#1c2128' : '#f0f6ff', flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>Paste raw HTML — click <strong>Inject</strong> to load into editor.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={rawHtmlInput} onChange={e => setRawHtmlInput(e.target.value)}
              placeholder="<h1>Title</h1><p>Content...</p>" rows={3}
              style={{ flex: 1, padding: '7px 10px', border: `1px solid ${inputBorder}`, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: inputBg, color: textPrimary }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={handleInjectRawHtml} disabled={!rawHtmlInput.trim()}
                style={{ padding: '7px 14px', border: 'none', borderRadius: 6, background: '#0969da', color: '#fff', cursor: rawHtmlInput.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, opacity: rawHtmlInput.trim() ? 1 : 0.5 }}>
                Inject
              </button>
              <button onClick={() => { setRawHtmlInput(''); setShowRawHtmlPanel(false); }}
                style={{ padding: '7px 14px', border: `1px solid ${border}`, borderRadius: 6, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor / Preview ── */}
      <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 400, height: 'calc(100vh - 280px)' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: textMuted }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading content…</span>
          </div>
        ) : tab === 'write' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 1.5rem 1rem' }}>
            {/* Quill dark mode override */}
            {dm && <style>{`.ql-toolbar { background: #161b22 !important; border-color: #30363d !important; } .ql-container { border-color: #30363d !important; background: #0e1117; } .ql-editor { color: #c9d1d9 !important; background: #0e1117; } .ql-editor.ql-blank::before { color: #8b949e !important; } .ql-stroke { stroke: #8b949e !important; } .ql-fill { fill: #8b949e !important; } .ql-picker { color: #8b949e !important; } .ql-picker-options { background: #161b22 !important; border-color: #30363d !important; } .ql-picker-item { color: #c9d1d9 !important; }`}</style>}
            {/* Table styles — always injected so tables are visible in both modes */}
            <style>{`
              table.quill-better-table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
                table-layout: fixed;
              }
              table.quill-better-table td {
                border: 1px solid ${dm ? '#555e6b' : '#adb5bd'} !important;
                padding: 6px 10px !important;
                min-width: 60px !important;
                min-height: 28px !important;
                word-break: break-word;
                vertical-align: top;
                color: ${dm ? '#c9d1d9' : '#1a1a1a'};
                background: ${dm ? '#0e1117' : '#ffffff'};
              }
              table.quill-better-table td:focus,
              table.quill-better-table td.qlbt-cell-selected {
                outline: 2px solid #0969da !important;
                background: ${dm ? '#1c2d4a' : '#e8f0fe'} !important;
              }
              .quill-better-table-wrapper {
                overflow-x: auto;
                margin: 8px 0;
              }
            `}</style>

            {/* ── Preamble area (Quill + preamble blocks) ── */}
            {ReactQuill && quillModules ? (
              <ReactQuill
                ref={(el: any) => { if (el && el !== quillRef) setQuillRef(el); }}
                theme="snow"
                value={htmlContent}
                onChange={setHtmlContent}
                modules={quillModules}
                formats={QUILL_FORMATS}
                placeholder="Start writing your note here… Use the toolbar above for formatting."
                style={{ flexShrink: 0, marginTop: '1rem' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: textMuted }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
                Loading editor…
              </div>
            )}

            {/* ── Preamble blocks (tables / extracts before any section) ── */}
            {preambleBlocks.length > 0 && (
              <div style={{ marginTop: 8, borderTop: `1px dashed ${border}`, paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Preamble blocks (Table / Extract)
                  </span>
                  <button
                    onClick={() => setPreambleBlocks([])}
                    title="Remove all preamble blocks"
                    style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                    ✕ Clear all
                  </button>
                </div>
                {preambleBlocks.map((block, idx) => (
                  <div key={block.id} style={{ marginBottom: 10, borderRadius: 8, border: `1px solid ${border}`, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: dm ? '#1c2128' : '#f0f0f0', borderBottom: `1px solid ${border}` }}>
                      <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>
                        {block.type === 'table' ? '📋 Vocabulary Table' : '🖼 Extract'} #{idx + 1}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {block.type === 'table' && block.tableData && (
                          <button
                            onClick={() => { setEditingBlock({ sectionId: null, index: idx }); setTargetSectionId(null); setShowTableModal(true); }}
                            title="Edit this table"
                            style={{ fontSize: 11, color: '#2563eb', background: '#2563eb18', border: '1px solid #2563eb44', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                            ✏️ Edit
                          </button>
                        )}
                        {block.type === 'extract' && block.extractData && (
                          <button
                            onClick={() => { setEditingBlock({ sectionId: null, index: idx }); setTargetSectionId(null); setShowExtractModal(true); }}
                            title="Edit this extract"
                            style={{ fontSize: 11, color: '#059669', background: '#05966918', border: '1px solid #05966944', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                            ✏️ Edit
                          </button>
                        )}
                        <button
                          onClick={() => setPreambleBlocks(prev => prev.filter((_, i) => i !== idx))}
                          title="Remove this block"
                          style={{ fontSize: 11, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444444', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                    <div
                      className="note-preview"
                      style={{ background: dm ? '#1c2128' : '#f9f5f0', padding: '12px 16px', fontSize: 14 }}
                      dangerouslySetInnerHTML={{ __html: block.html }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── Section cards ── */}
            {[...editorSections].sort((a, b) => a.slNo - b.slNo).map((sec, secIdx) => (
              <div key={sec.id} style={{ marginTop: 16, border: `1px solid ${dm ? '#30363d' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                {/* Section header bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: dm ? '#1c2128' : '#ffa90a18' }}>
                  <span style={{ fontWeight: 700, color: textPrimary, fontSize: 14 }}>
                    <span style={{ color: '#ffa90a', marginRight: 6 }}>{sec.slNo}.</span>
                    {sec.heading}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setEditingSectionIndex(secIdx); setShowSectionModal(true); }}
                      title="Edit section heading"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 14, padding: '2px 4px' }}>✏️</button>
                    <button
                      onClick={() => setEditorSections(prev => prev.filter(s => s.id !== sec.id))}
                      title="Delete section"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '2px 4px' }}>✕</button>
                  </div>
                </div>

                {/* Section textarea */}
                <textarea
                  value={sec.quillHtml}
                  onChange={e => setEditorSections(prev => prev.map(s => s.id === sec.id ? { ...s, quillHtml: e.target.value } : s))}
                  placeholder={`Write content for "${sec.heading}"…`}
                  style={{
                    width: '100%',
                    minHeight: 120,
                    padding: '12px 16px',
                    border: 'none',
                    borderTop: `1px solid ${dm ? '#30363d' : '#e5e7eb'}`,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    background: dm ? '#0e1117' : '#ffffff',
                    color: textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                    display: 'block',
                  }}
                />

                {/* Section blocks */}
                {sec.blocks.length > 0 && (
                  <div style={{ padding: '8px 12px', borderTop: `1px solid ${dm ? '#30363d' : '#e5e7eb'}` }}>
                    {sec.blocks.map((block, bIdx) => (
                      <div key={block.id} style={{ marginBottom: 8, borderRadius: 8, border: `1px solid ${border}`, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: dm ? '#161b22' : '#f0f0f0', borderBottom: `1px solid ${border}` }}>
                          <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>
                            {block.type === 'table' ? '📋 Vocabulary Table' : '🖼 Extract'} #{bIdx + 1}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {block.type === 'table' && block.tableData && (
                              <button
                                onClick={() => { setEditingBlock({ sectionId: sec.id, index: bIdx }); setTargetSectionId(sec.id); setShowTableModal(true); }}
                                title="Edit this table"
                                style={{ fontSize: 11, color: '#2563eb', background: '#2563eb18', border: '1px solid #2563eb44', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                                ✏️ Edit
                              </button>
                            )}
                            {block.type === 'extract' && block.extractData && (
                              <button
                                onClick={() => { setEditingBlock({ sectionId: sec.id, index: bIdx }); setTargetSectionId(sec.id); setShowExtractModal(true); }}
                                title="Edit this extract"
                                style={{ fontSize: 11, color: '#059669', background: '#05966918', border: '1px solid #05966944', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                                ✏️ Edit
                              </button>
                            )}
                            <button
                              onClick={() => setEditorSections(prev => prev.map(s => s.id === sec.id ? { ...s, blocks: s.blocks.filter((_, i) => i !== bIdx) } : s))}
                              title="Remove this block"
                              style={{ fontSize: 11, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444444', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontWeight: 600 }}>
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                        <div
                          className="note-preview"
                          style={{ background: dm ? '#1c2128' : '#f9f5f0', padding: '12px 16px', fontSize: 14 }}
                          dangerouslySetInnerHTML={{ __html: block.html }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Add content row for this section */}
                <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: `1px solid ${dm ? '#30363d' : '#e5e7eb'}`, background: dm ? '#161b22' : '#fafafa' }}>
                  <span style={{ fontSize: 11, color: textMuted, alignSelf: 'center', marginRight: 4 }}>Add content:</span>
                  <button
                    onClick={() => { setTargetSectionId(sec.id); setShowBoxModal(true); }}
                    style={{ padding: '3px 10px', border: `1px solid ${border}`, borderRadius: 5, background: '#fff8e622', color: '#ffa90a', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    📦 Box
                  </button>
                  <button
                    onClick={() => { setTargetSectionId(sec.id); setEditingBlock(null); setShowTableModal(true); }}
                    style={{ padding: '3px 10px', border: `1px solid ${border}`, borderRadius: 5, background: '#2563eb22', color: '#60a5fa', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    📋 Table
                  </button>
                  <button
                    onClick={() => { setTargetSectionId(sec.id); setEditingBlock(null); setShowExtractModal(true); }}
                    style={{ padding: '3px 10px', border: `1px solid ${border}`, borderRadius: 5, background: '#05966922', color: '#34d399', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    🖼 Extract
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', background: previewBg }}>
            {(() => {
              const allSectionsHtml = [...editorSections].sort((a, b) => a.slNo - b.slNo)
                .map(s => `<h2>${s.slNo}. ${s.heading}</h2><div>${s.quillHtml}${s.blocks.map(b => b.html).join('')}</div>`)
                .join('');
              const fullHtml = htmlContent + preambleBlocksHtml + allSectionsHtml;
              return isEmpty(fullHtml) ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: textMuted }}>Nothing to preview yet — write something first.</div>
              ) : (
                <div className="note-preview" dangerouslySetInnerHTML={{ __html: fullHtml }} />
              );
            })()}
          </div>
        )}

      </div>

      {/* ── Insert-block modals ── */}
      {showSectionModal && (
        <SectionModal
          onInsert={(sec) => {
            if (editingSectionIndex !== null) {
              // Update existing section heading/slNo, preserve content
              setEditorSections(prev => prev.map((s, i) => i === editingSectionIndex ? { ...s, slNo: sec.slNo, heading: sec.heading, id: sec.id } : s));
              setEditingSectionIndex(null);
            } else {
              // Add new section with empty content
              setEditorSections(prev => [...prev, { ...sec, quillHtml: '', blocks: [] }]);
            }
          }}
          onClose={() => { setShowSectionModal(false); setEditingSectionIndex(null); }}
          darkMode={darkMode}
          initialData={editingSectionIndex !== null ? (() => {
            const s = [...editorSections].sort((a, b) => a.slNo - b.slNo)[editingSectionIndex];
            return s ? { id: s.id, slNo: s.slNo, heading: s.heading } : undefined;
          })() : undefined}
        />
      )}
      {showBoxModal && (
        <BoxModal
          onInsert={(html) => {
            if (targetSectionId !== null) {
              setEditorSections(prev => prev.map(s =>
                s.id === targetSectionId
                  ? { ...s, quillHtml: s.quillHtml + html }
                  : s
              ));
            } else {
              insertHtmlAtCursor(html, false);
            }
          }}
          onClose={() => setShowBoxModal(false)}
          darkMode={darkMode}
        />
      )}
      {showTableModal && (
        <VocabTableModal
          onInsert={(html, tableData) => {
            if (editingBlock !== null) {
              // Editing existing block
              if (editingBlock.sectionId === null) {
                setPreambleBlocks(prev => prev.map((b, i) =>
                  i === editingBlock.index ? { ...b, html, tableData } : b
                ));
              } else {
                setEditorSections(prev => prev.map(s =>
                  s.id === editingBlock.sectionId
                    ? { ...s, blocks: s.blocks.map((b, i) => i === editingBlock.index ? { ...b, html, tableData } : b) }
                    : s
                ));
              }
              setEditingBlock(null);
            } else {
              insertHtmlAtCursor(html, true, 'table', tableData, undefined);
            }
          }}
          onClose={() => { setShowTableModal(false); setEditingBlock(null); }}
          darkMode={darkMode}
          initialData={editingBlock !== null ? (
            editingBlock.sectionId === null
              ? preambleBlocks[editingBlock.index]?.tableData
              : editorSections.find(s => s.id === editingBlock.sectionId)?.blocks[editingBlock.index]?.tableData
          ) : undefined}
        />
      )}
      {showExtractModal && (
        <ExtractModal
          onInsert={(html, extractData) => {
            if (editingBlock !== null) {
              if (editingBlock.sectionId === null) {
                setPreambleBlocks(prev => prev.map((b, i) =>
                  i === editingBlock.index ? { ...b, html, extractData } : b
                ));
              } else {
                setEditorSections(prev => prev.map(s =>
                  s.id === editingBlock.sectionId
                    ? { ...s, blocks: s.blocks.map((b, i) => i === editingBlock.index ? { ...b, html, extractData } : b) }
                    : s
                ));
              }
              setEditingBlock(null);
            } else {
              insertHtmlAtCursor(html, true, 'extract', undefined, extractData);
            }
          }}
          onClose={() => { setShowExtractModal(false); setEditingBlock(null); }}
          darkMode={darkMode}
          initialData={editingBlock !== null ? (
            editingBlock.sectionId === null
              ? preambleBlocks[editingBlock.index]?.extractData
              : editorSections.find(s => s.id === editingBlock.sectionId)?.blocks[editingBlock.index]?.extractData
          ) : undefined}
        />
      )}
    </div>
  );
}
// ─── Notes View ───────────────────────────────────────────────────────────────

function NotesView({ subtopic, onBack, onOpenEditor, showToast }: {
  subtopic: Subtopic;
  onBack: () => void;
  onOpenEditor: (state: { existingNote: Note | null; translationFor: Note | null; takenLangs: string[] }) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/${apiPrefix}/notes`, { params: { subtopic_id: subtopic.id } });
      setNotes(r.data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [subtopic.id, apiPrefix]);

  useEffect(() => { load(); }, [load]);

  // Group notes by concept_id
  const grouped = notes.reduce<Record<string, Note[]>>((acc, n) => {
    if (!acc[n.concept_id]) acc[n.concept_id] = [];
    acc[n.concept_id].push(n);
    return acc;
  }, {});

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/${apiPrefix}/notes/${confirmDelete.id}`);
      showToast(true, 'Note deleted');
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const langLabel = (code: string) => KNOWN_LANGS.find(l => l.code === code)?.label || code.toUpperCase();

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back to subtopics
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{subtopic.name_en}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Notes & Translations</p>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenEditor({ existingNote: null, translationFor: null, takenLangs: [] })}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Create Note
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
          Loading notes...
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <Globe size={40} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No notes yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Create the first note for this subtopic.</p>
          <button className="btn btn-primary" onClick={() => onOpenEditor({ existingNote: null, translationFor: null, takenLangs: [] })}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Create Note
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(grouped).map(([conceptId, conceptNotes]) => (
            <div key={conceptId} className="card" style={{ padding: '1.25rem' }}>
              {/* Concept header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{conceptNotes[0].title || conceptId}</h3>
                  <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{conceptId}</code>
                </div>
                <button
                  onClick={() => onOpenEditor({ existingNote: null, translationFor: conceptNotes[0], takenLangs: conceptNotes.map(n => n.known_lang) })}
                  style={{ ...iconBtn('#1f6feb'), width: 'auto', padding: '0 12px', gap: 6, fontSize: 13 }}>
                  <Plus size={14} /> Add Translation
                </button>
              </div>

              {/* Translations list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conceptNotes.map(note => (
                  <div key={note.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(31,111,235,0.15)', color: '#60a5fa', borderRadius: 4, padding: '2px 8px' }}>
                        {langLabel(note.known_lang)}
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text)' }}>{note.title || 'Untitled'}</span>
                      {!note.is_active && (
                        <span style={{ fontSize: 11, background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>INACTIVE</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Preview link — always available via the serve endpoint */}
                      <a
                        href={`${(api.defaults as any).baseURL || 'http://localhost:8000/api'}/admin/${apiPrefix}/notes/${note.id}/html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...iconBtn('#2ea043'), textDecoration: 'none' }}
                        title="Preview compiled note"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {/* Edit */}
                      <button title="Edit" onClick={() => onOpenEditor({ existingNote: note, translationFor: null, takenLangs: [] })} style={iconBtn('#f59e0b')}>
                        <Pencil size={14} />
                      </button>
                      {/* Delete */}
                      <button title="Delete" onClick={() => setConfirmDelete(note)} style={iconBtn('#ef4444')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Note"
          body={`Delete the ${langLabel(confirmDelete.known_lang)} translation of "${confirmDelete.title || confirmDelete.concept_id}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Subtopics View ───────────────────────────────────────────────────────────

function SubtopicsView({ topic, onBack, onSelectSubtopic, showToast }: {
  topic: Topic; onBack: () => void;
  onSelectSubtopic: (s: Subtopic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Subtopic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/${apiPrefix}/subtopics`, { params: { topic_id: topic.id } });
      setSubtopics(r.data.subtopics || []);
    } catch {
      setSubtopics([]);
    } finally {
      setLoading(false);
    }
  }, [topic.id, apiPrefix]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/${apiPrefix}/subtopics`, { topic_id: topic.id, name_en: newName.trim() });
      showToast(true, `Created "${newName}"`);
      setNewName(''); setCreating(false); load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/${apiPrefix}/subtopics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={16} /> Back to topics
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{topic.name_en}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {topic.level_code} · {LANGUAGES.find(l => l.code === topic.learning_lang)?.label || topic.learning_lang}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Add Subtopic
        </button>
      </div>

      {/* Inline create form */}
      {creating && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-control" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
            placeholder='e.g. "Perfect Nouns"' style={{ flex: 1, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
            {saving ? 'Saving...' : 'Create'}
          </button>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
        </div>
      ) : subtopics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No subtopics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Add subtopics like "Perfect Nouns", "Plural Forms", etc.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Add Subtopic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 50 }}>#</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Subtopic</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 100 }}>Notes</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subtopics.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectSubtopic(s)}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name_en}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    <span style={{ background: 'rgba(31,111,235,0.12)', color: '#60a5fa', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {s.notes_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelectSubtopic(s)} style={iconBtn('#60a5fa')}><Eye size={14} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(s)} style={iconBtn('#ef4444')}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Subtopic"
          body={`Delete "${confirmDelete.name_en}" and all its notes? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Topics View ──────────────────────────────────────────────────────────────

function TopicsView({ learningLang, levelCode, onSelectTopic, showToast }: {
  learningLang: string; levelCode: string;
  onSelectTopic: (t: Topic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/${apiPrefix}/topics`, { params: { learning_lang: learningLang, level_code: levelCode } });
      setTopics(r.data.topics || []);
    } catch {
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [learningLang, levelCode, apiPrefix]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/${apiPrefix}/topics`, { name_en: newName.trim(), learning_lang: learningLang, level_code: levelCode });
      showToast(true, `Created "${newName}"`);
      setNewName(''); setCreating(false); load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Create failed — run the DB migration first');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/${apiPrefix}/topics/${confirmDelete.id}`);
      showToast(true, `Deleted "${confirmDelete.name_en}"`);
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Topics</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {LANGUAGES.find(l => l.code === learningLang)?.label || learningLang} · {levelCode}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Add Topic
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-control" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
            placeholder='e.g. "Nouns", "Verbs", "Tenses"' style={{ flex: 1, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
            {saving ? 'Saving...' : 'Create'}
          </button>
          <button className="btn" style={{ background: 'var(--card-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No topics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            {loading ? '' : 'Add your first topic from the syllabus, e.g. "Nouns", "Verbs", "Articles".'}
          </p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} /> Add Topic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 50 }}>#</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Topic</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Subtopics</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => onSelectTopic(t)}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.name_en}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                    <span style={{ background: 'rgba(31,111,235,0.12)', color: '#60a5fa', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {t.subtopics_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button title="Open" onClick={() => onSelectTopic(t)} style={iconBtn('#60a5fa')}><Eye size={14} /></button>
                      <button title="Delete" onClick={() => setConfirmDelete(t)} style={iconBtn('#ef4444')}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Topic"
          body={`Delete "${confirmDelete.name_en}" and all its subtopics and notes? This cannot be undone.`}
          onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Root ContentManager ──────────────────────────────────────────────────────

interface ContentManagerProps {
  pageTitle: string;
  pageDescription: string;
  /** API prefix for CRUD operations. Defaults to 'grammar'. Pass 'stories' for the stories admin. */
  apiPrefix?: 'grammar' | 'stories';
}

export default function ContentManager({ pageTitle, pageDescription, apiPrefix = 'grammar' }: ContentManagerProps) {
  const [learningLang, setLearningLang] = useState('fr');
  const [levelCode, setLevelCode] = useState('A1');
  const [view, setView] = useState<View>('topics');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<Subtopic | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
  }, []);

  // Reset drill-down when language/level changes
  const handleLangChange = (lang: string) => {
    setLearningLang(lang);
    setView('topics');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };
  const handleLevelChange = (level: string) => {
    setLevelCode(level);
    setView('topics');
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };

  return (
    <ApiPrefixContext.Provider value={apiPrefix}>
    <div>
      <h1>{pageTitle}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: 15 }}>{pageDescription}</p>

      {/* Language + Level selectors */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem', padding: '1.25rem 1.5rem', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 120 }}>Learning Language</span>
          <select className="form-control" value={learningLang} onChange={e => handleLangChange(e.target.value)} style={{ width: 180, fontSize: 14 }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 14, minWidth: 100 }}>CEFR Level</span>
          <select className="form-control" value={levelCode} onChange={e => handleLevelChange(e.target.value)} style={{ width: 180, fontSize: 14 }}>
            {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Breadcrumb trail */}
        {(view === 'subtopics' || view === 'notes' || view === 'editor') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <button onClick={() => { setView('topics'); setSelectedTopic(null); setSelectedSubtopic(null); setEditorState(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, padding: 0 }}>
              Topics
            </button>
            {selectedTopic && (
              <>
                <span>/</span>
                <button onClick={() => { setView('subtopics'); setSelectedSubtopic(null); setEditorState(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: (view === 'notes' || view === 'editor') ? 'var(--accent)' : 'var(--white)', fontSize: 13, padding: 0 }}>
                  {selectedTopic.name_en}
                </button>
              </>
            )}
            {selectedSubtopic && (view === 'notes' || view === 'editor') && (
              <>
                <span>/</span>
                <button onClick={() => { setView('notes'); setEditorState(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: view === 'editor' ? 'var(--accent)' : 'var(--white)', fontSize: 13, padding: 0 }}>
                  {selectedSubtopic.name_en}
                </button>
              </>
            )}
            {view === 'editor' && editorState && (
              <>
                <span>/</span>
                <span style={{ color: 'var(--white)' }}>
                  {editorState.existingNote ? 'Edit' : editorState.translationFor ? 'Translate' : 'Create'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* DB migration warning banner — shown when API returns 500/table not found */}
      <div id="db-warning" style={{ display: 'none', marginBottom: '1rem' }} />

      {/* Views */}
      {view === 'topics' && (
        <TopicsView
          learningLang={learningLang}
          levelCode={levelCode}
          onSelectTopic={t => { setSelectedTopic(t); setView('subtopics'); }}
          showToast={showToast}
        />
      )}
      {view === 'subtopics' && selectedTopic && (
        <SubtopicsView
          topic={selectedTopic}
          onBack={() => { setView('topics'); setSelectedTopic(null); }}
          onSelectSubtopic={s => { setSelectedSubtopic(s); setView('notes'); }}
          showToast={showToast}
        />
      )}
      {view === 'notes' && selectedSubtopic && selectedTopic && (
        <NotesView
          subtopic={selectedSubtopic}
          onBack={() => { setView('subtopics'); setSelectedSubtopic(null); }}
          onOpenEditor={({ existingNote, translationFor, takenLangs }) => {
            setEditorState({ subtopicId: selectedSubtopic.id, subtopicName: selectedSubtopic.name_en, learningLang, existingNote, translationFor, takenLangs });
            setView('editor');
          }}
          showToast={showToast}
        />
      )}
      {view === 'editor' && editorState && selectedSubtopic && (
        apiPrefix === 'stories' && (editorState.existingNote?.s3_key === null) ? (
          <StoryEditor
            exerciseId={editorState.existingNote.concept_id}
            onClose={() => { setView('notes'); setEditorState(null); }}
            onSaved={() => { setView('notes'); setEditorState(null); }}
            showToast={showToast}
          />
        ) : (
          <NoteEditorView
            subtopicId={editorState.subtopicId}
            subtopicName={editorState.subtopicName}
            learningLang={editorState.learningLang}
            existingNote={editorState.existingNote}
            translationFor={editorState.translationFor}
            takenLangs={editorState.takenLangs}
            onClose={() => { setView('notes'); setEditorState(null); }}
            onSaved={() => { setView('notes'); setEditorState(null); }}
            showToast={showToast}
          />
        )
      )}

      {toast && <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
    </ApiPrefixContext.Provider>
  );
}


