"use client";
import React, {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
  useRef,
} from "react";
import {
  ChevronLeft,
  Plus,
  Trash2,
  X,
  Save,
  Eye,
  Pencil,
  ExternalLink,
  Globe,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Moon,
  Sun,
} from "lucide-react";
import api from "../services/api";
import "react-quill-new/dist/quill.snow.css";
import "quill-better-table/dist/quill-better-table.css";
import StoryEditor from "./StoryEditor";
import {
  buildTableBlockHtml,
  parseTableCsvToBlockData,
  type TableBlockData,
  type TableCellData,
  type TableRowData,
} from "../utils/tableCsv";

// ─── API Prefix Context ───────────────────────────────────────────────────────
// Allows sub-views to call the correct endpoint (grammar vs stories) without prop-drilling.
const ApiPrefixContext = createContext<"grammar" | "stories">("grammar");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Topic {
  id: number;
  slug: string;
  name_en: string;
  name_fr?: string;
  learning_lang: string;
  level_code: string;
  order_index: number;
  is_active: boolean;
  subtopics_count: number;
}
interface Subtopic {
  id: number;
  slug: string;
  topic_id: number;
  topic_name: string;
  name_en: string;
  name_fr?: string;
  order_index: number;
  is_active: boolean;
  notes_count: number;
}
interface Note {
  id: number;
  subtopic_id: number;
  concept_id: string;
  known_lang: string;
  learning_lang: string;
  title: string | null;
  description?: string | null;
  html_url: string;
  s3_key: string | null;
  order_index: number;
  is_active: boolean;
}

type View = "topics" | "subtopics" | "notes" | "editor";

interface EditorState {
  subtopicId: number;
  subtopicName: string;
  learningLang: string;
  levelCode: string;
  existingNote: Note | null;
  translationFor: Note | null;
  takenLangs: string[];
  translations: Note[];
  initialKnownLang?: string;
}

type RichTextEditorComponent = React.ComponentType<{
  theme?: string;
  value: string;
  onChange: (value: string) => void;
  modules?: unknown;
  formats?: string[];
  placeholder?: string;
  className?: string;
}>;

const CEFR_LEVELS = ["A1", "A2", "B1", "B2"];
const LANGUAGES = [
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
];
const KNOWN_LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
];

const emptyKnownLangTextMap = () =>
  KNOWN_LANGS.reduce<Record<string, string>>((acc, lang) => {
    acc[lang.code] = "";
    return acc;
  }, {});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toast({
  ok,
  msg,
  onDone,
}: {
  ok: boolean;
  msg: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className={`alert ${ok ? "alert-success" : "alert-error"}`}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        minWidth: 300,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      {ok ? (
        <CheckCircle2 size={16} style={{ display: "inline", marginRight: 8 }} />
      ) : (
        <AlertCircle size={16} style={{ display: "inline", marginRight: 8 }} />
      )}
      {msg}
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: "90%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ marginBottom: 20, color: "var(--text-muted)" }}>{body}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            style={{
              background: "var(--card-bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: "#dc2626", color: "#fff", border: "none" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: `${color}22`,
    color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  };
}

// ─── Box Modal ───────────────────────────────────────────────────────────────
// Inserts a styled callout/highlight box into the editor

function BoxModal({
  onInsert,
  onClose,
  darkMode,
  RichTextEditor,
  initialData,
}: {
  onInsert: (html: string, boxData: BoxBlockData) => void;
  onClose: () => void;
  darkMode: boolean;
  RichTextEditor: RichTextEditorComponent | null;
  initialData?: BoxBlockData;
}) {
  const [text, setText] = useState(initialData?.text ?? "");
  const [variant, setVariant] = useState<BoxBlockData["variant"]>(
    initialData?.variant ?? "blue",
  );
  const dm = darkMode;
  const bg = dm ? "#161b22" : "#ffffff";
  const border = dm ? "#30363d" : "#dee2e6";
  const textPrimary = dm ? "#c9d1d9" : "#1a1a1a";
  const textMuted = dm ? "#8b949e" : "#666";
  const hasContent = hasMeaningfulHtml(text);

  const handleInsert = () => {
    if (!hasContent) return;
    const boxData: BoxBlockData = { text, variant };
    onInsert(buildBoxBlockHtml(boxData), boxData);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "1.5rem",
          width: 520,
          maxWidth: "95vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>
              {initialData ? "Edit Box" : "Insert Box"}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: textMuted }}>
              Creates a highlighted callout box
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: textMuted,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["blue", "yellow"] as const).map((option) => {
            const selected = variant === option;
            const palette = getBoxPalette(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => setVariant(option)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: `2px solid ${selected ? palette.accent : border}`,
                  borderRadius: 8,
                  background: palette.background,
                  color: "#363639",
                  cursor: "pointer",
                  fontWeight: selected ? 700 : 500,
                }}
              >
                {option === "blue" ? "Blue Box" : "Yellow Box"}
              </button>
            );
          })}
        </div>
        {RichTextEditor ? (
          <RichTextEditor
            theme="snow"
            value={text}
            onChange={setText}
            modules={RICH_TEXT_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Type and format the box content."
            className="grammar-block-editor"
          />
        ) : (
          <div style={{ padding: "2rem", color: textMuted }}>
            Loading editor…
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: textMuted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!hasContent}
            style={{
              padding: "7px 18px",
              border: "none",
              borderRadius: 6,
              background: "#ffa90a",
              color: "#fff",
              cursor: hasContent ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 600,
              opacity: hasContent ? 1 : 0.5,
            }}
          >
            {initialData ? "Update Box" : "Insert Box"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vocab Table Modal ────────────────────────────────────────────────────────
// Customizable columns, hover-translate tooltips, and audio per cell.

function VocabTableModal({
  onInsert,
  onClose,
  darkMode,
  initialData,
}: {
  onInsert: (html: string, tableData: TableBlockData) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: TableBlockData;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>(
    initialData?.headers ?? ["French Singular", "French Plural"],
  );
  const [rows, setRows] = useState<TableRowData[]>(
    initialData?.rows ?? [
      {
        cells: [
          { text: "", tooltip: "", audioUrl: "", tts: false },
          { text: "", tooltip: "", audioUrl: "", tts: false },
        ],
      },
      {
        cells: [
          { text: "", tooltip: "", audioUrl: "", tts: false },
          { text: "", tooltip: "", audioUrl: "", tts: false },
        ],
      },
      {
        cells: [
          { text: "", tooltip: "", audioUrl: "", tts: false },
          { text: "", tooltip: "", audioUrl: "", tts: false },
        ],
      },
    ],
  );
  const dm = darkMode;
  const bg = dm ? "#161b22" : "#ffffff";
  const border = dm ? "#30363d" : "#dee2e6";
  const textPrimary = dm ? "#c9d1d9" : "#1a1a1a";
  const textMuted = dm ? "#8b949e" : "#666";
  const inputBg = dm ? "#0e1117" : "#ffffff";
  const inputBorder = dm ? "#30363d" : "#dee2e6";
  const surface = dm ? "#1c2128" : "#f8f9fa";

  const numCols = headers.length;

  const addColumn = () => {
    setHeaders((h) => [...h, `Column ${h.length + 1}`]);
    setRows((r) =>
      r.map((row) => ({
        cells: [
          ...row.cells,
          { text: "", tooltip: "", audioUrl: "", tts: false },
        ],
      })),
    );
  };
  const removeColumn = (ci: number) => {
    if (numCols <= 1) return;
    setHeaders((h) => h.filter((_, i) => i !== ci));
    setRows((r) =>
      r.map((row) => ({ cells: row.cells.filter((_, i) => i !== ci) })),
    );
  };
  const updateHeader = (ci: number, val: string) =>
    setHeaders((h) => h.map((v, i) => (i === ci ? val : v)));
  const addRow = () =>
    setRows((r) => [
      ...r,
      {
        cells: Array.from({ length: numCols }, () => ({
          text: "",
          tooltip: "",
          audioUrl: "",
          tts: false,
        })),
      },
    ]);
  const removeRow = (ri: number) => {
    if (rows.length > 1) setRows((r) => r.filter((_, i) => i !== ri));
  };
  const updateCell = (
    ri: number,
    ci: number,
    field: keyof TableCellData,
    val: string | boolean,
  ) =>
    setRows((r) =>
      r.map((row, i) =>
        i !== ri
          ? row
          : {
              cells: row.cells.map((cell, j) =>
                j !== ci ? cell : { ...cell, [field]: val },
              ),
            },
      ),
    );

  const hasContent = rows.some((row) => row.cells.some((c) => c.text.trim()));

  const handleCsvImport = async (file: File) => {
    const tableData = parseTableCsvToBlockData(await file.text());
    if (!tableData.headers.length || !tableData.rows.length) return;
    setHeaders(tableData.headers);
    setRows(tableData.rows);
  };

  const handleInsert = () => {
    const validRows = rows.filter((row) =>
      row.cells.some((c) => c.text.trim()),
    );
    if (!validRows.length) return;

    const tableData: TableBlockData = { headers, rows: validRows };
    const html = buildTableBlockHtml(tableData);
    onInsert(html, tableData);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "1.5rem",
          width: 860,
          maxWidth: "97vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>
              📋 Insert Vocabulary Table
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: textMuted }}>
              Customizable columns · hover tooltip · TTS per cell
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: textMuted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Column header editors */}
        <div
          style={{
            flexShrink: 0,
            marginBottom: 12,
            padding: "10px 12px",
            background: surface,
            borderRadius: 8,
            border: `1px solid ${border}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: textMuted,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Column Headers
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {headers.map((h, ci) => (
              <div
                key={ci}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <input
                  value={h}
                  onChange={(e) => updateHeader(ci, e.target.value)}
                  style={{
                    padding: "5px 8px",
                    border: `1px solid ${inputBorder}`,
                    borderRadius: 6,
                    fontSize: 12,
                    outline: "none",
                    background: inputBg,
                    color: textPrimary,
                    width: 150,
                  }}
                />
                {headers.length > 1 && (
                  <button
                    onClick={() => removeColumn(ci)}
                    style={{
                      width: 20,
                      height: 20,
                      border: "none",
                      borderRadius: 4,
                      background: "#ef444422",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addColumn}
              style={{
                padding: "5px 10px",
                border: `1px dashed ${border}`,
                borderRadius: 6,
                background: "transparent",
                color: textMuted,
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Plus size={12} /> Add Column
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleCsvImport(file);
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "5px 10px",
                border: `1px solid ${border}`,
                borderRadius: 6,
                background: "transparent",
                color: textMuted,
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Plus size={12} /> Import CSV
            </button>
            <span style={{ fontSize: 11, color: textMuted }}>
              Dynamic headers are inferred from CSV columns. Use optional
              `Text`, `Hover`, `Tooltip`, `TTS`, or `Audio` suffixes.
            </span>
          </div>
        </div>

        {/* Sub-header labels + Rows — labels are rendered inside each cell so they always align */}
        <div
          style={{
            overflowY: "auto",
            overflowX: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {rows.map((row, ri) => (
            <div
              key={ri}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "flex-end",
                minWidth: Math.max(numCols * 540, 540),
              }}
            >
              {row.cells.map((cell, ci) => (
                <div
                  key={ci}
                  style={{
                    flex: "0 0 534px",
                    display: "grid",
                    gridTemplateColumns: "2fr 2fr 2fr 90px",
                    gap: 4,
                  }}
                >
                  {/* Text field */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {ri === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: textMuted,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          paddingLeft: 2,
                          letterSpacing: "0.05em",
                        }}
                      >
                        Text
                      </span>
                    )}
                    <input
                      value={cell.text}
                      onChange={(e) =>
                        updateCell(ri, ci, "text", e.target.value)
                      }
                      placeholder="e.g. un chat"
                      style={{
                        padding: "6px 8px",
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 5,
                        fontSize: 12,
                        outline: "none",
                        background: inputBg,
                        color: textPrimary,
                        width: "100%",
                      }}
                    />
                  </div>
                  {/* Tooltip field */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {ri === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: textMuted,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          paddingLeft: 2,
                          letterSpacing: "0.05em",
                        }}
                      >
                        Tooltip (hover)
                      </span>
                    )}
                    <input
                      value={cell.tooltip}
                      onChange={(e) =>
                        updateCell(ri, ci, "tooltip", e.target.value)
                      }
                      placeholder="a cat"
                      style={{
                        padding: "6px 8px",
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 5,
                        fontSize: 12,
                        outline: "none",
                        background: inputBg,
                        color: textPrimary,
                        width: "100%",
                      }}
                    />
                  </div>
                  {/* Audio URL field */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {ri === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: textMuted,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          paddingLeft: 2,
                          letterSpacing: "0.05em",
                        }}
                      >
                        Audio (optional)
                      </span>
                    )}
                    <input
                      value={cell.audioUrl}
                      onChange={(e) =>
                        updateCell(ri, ci, "audioUrl", e.target.value)
                      }
                      placeholder="https://.../audio.mp3"
                      style={{
                        padding: "6px 8px",
                        border: `1px solid ${inputBorder}`,
                        borderRadius: 5,
                        fontSize: 12,
                        outline: "none",
                        background: inputBg,
                        color: textPrimary,
                        width: "100%",
                      }}
                    />
                  </div>
                  {/* TTS toggle */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    {ri === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: textMuted,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          paddingLeft: 2,
                          letterSpacing: "0.05em",
                        }}
                      >
                        TTS
                      </span>
                    )}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        cursor: "pointer",
                        userSelect: "none",
                        height: 30,
                      }}
                    >
                      <div
                        onClick={() => updateCell(ri, ci, "tts", !cell.tts)}
                        style={{
                          width: 34,
                          height: 18,
                          borderRadius: 9,
                          background: cell.tts
                            ? "#2563eb"
                            : dm
                              ? "#30363d"
                              : "#d1d5db",
                          position: "relative",
                          transition: "background 0.2s",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            left: cell.tts ? 18 : 2,
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: "#fff",
                            transition: "left 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: cell.tts
                            ? dm
                              ? "#93c5fd"
                              : "#2563eb"
                            : textMuted,
                          fontWeight: cell.tts ? 600 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cell.tts ? "On" : "Off"}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
              {/* Delete button — aligned to bottom of inputs */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                {ri === 0 && <div style={{ height: 17 }} />}
                {/* spacer matching label height */}
                <button
                  onClick={() => removeRow(ri)}
                  disabled={rows.length <= 1}
                  style={{
                    width: 32,
                    height: 30,
                    border: "none",
                    borderRadius: 6,
                    background: rows.length > 1 ? "#ef444422" : "transparent",
                    color: rows.length > 1 ? "#ef4444" : textMuted,
                    cursor: rows.length > 1 ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add row */}
        <div style={{ flexShrink: 0, marginTop: 10 }}>
          <button
            onClick={addRow}
            style={{
              padding: "6px 14px",
              border: `1px dashed ${border}`,
              borderRadius: 6,
              background: "transparent",
              color: textMuted,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={14} /> Add Row
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: textMuted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!hasContent}
            style={{
              padding: "7px 18px",
              border: "none",
              borderRadius: 6,
              background: "#2563eb",
              color: "#fff",
              cursor: hasContent ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 600,
              opacity: hasContent ? 1 : 0.5,
            }}
          >
            Insert Table
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extract Modal ────────────────────────────────────────────────────────────
// Inserts a styled extract block: text + optional image side-by-side

function ExtractModal({
  onInsert,
  onClose,
  darkMode,
  initialData,
  RichTextEditor,
}: {
  onInsert: (html: string, extractData: ExtractBlockData) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: ExtractBlockData;
  RichTextEditor: RichTextEditorComponent | null;
}) {
  const [text, setText] = useState(() =>
    plainTextToHtml(initialData?.text ?? ""),
  );
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(initialData?.imageAlt ?? "");
  const [imagePosition, setImagePosition] = useState<"right" | "left">(
    initialData?.imagePosition ?? "right",
  );
  const dm = darkMode;
  const bg = dm ? "#161b22" : "#ffffff";
  const border = dm ? "#30363d" : "#dee2e6";
  const textPrimary = dm ? "#c9d1d9" : "#1a1a1a";
  const textMuted = dm ? "#8b949e" : "#666";
  const inputBg = dm ? "#0e1117" : "#ffffff";
  const inputBorder = dm ? "#30363d" : "#dee2e6";
  const hasContent = hasMeaningfulHtml(text);

  const handleInsert = () => {
    if (!hasContent) return;
    const extractData: ExtractBlockData = {
      text,
      imageUrl,
      imageAlt,
      imagePosition,
    };
    onInsert(buildExtractBlockHtml(extractData), extractData);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "1.5rem",
          width: 580,
          maxWidth: "95vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>
              🖼 Insert Extract
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: textMuted }}>
              A styled block with text and an optional image
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: textMuted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Text */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: textMuted,
              marginBottom: 6,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Text *
          </label>
          {RichTextEditor ? (
            <RichTextEditor
              theme="snow"
              value={text}
              onChange={setText}
              modules={RICH_TEXT_MODULES}
              formats={QUILL_FORMATS}
              placeholder="Type and format the extract content."
              className="grammar-block-editor"
            />
          ) : (
            <div style={{ padding: "2rem", color: textMuted }}>
              Loading editor…
            </div>
          )}
        </div>

        {/* Image URL */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: textMuted,
              marginBottom: 6,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Image URL (optional)
          </label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/image.jpg"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: `1px solid ${inputBorder}`,
              borderRadius: 8,
              fontSize: 13,
              outline: "none",
              background: inputBg,
              color: textPrimary,
              boxSizing: "border-box",
            }}
          />
        </div>

        {imageUrl.trim() && (
          <>
            {/* Alt text */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 6,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Image Alt Text
              </label>
              <input
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Describe the image for accessibility"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  background: inputBg,
                  color: textPrimary,
                  boxSizing: "border-box",
                }}
              />
            </div>
            {/* Image position */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 6,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Image Position
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["right", "left"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setImagePosition(pos)}
                    style={{
                      padding: "6px 16px",
                      border: `1px solid ${imagePosition === pos ? "#2563eb" : inputBorder}`,
                      borderRadius: 6,
                      background:
                        imagePosition === pos ? "#2563eb22" : "transparent",
                      color: imagePosition === pos ? "#2563eb" : textMuted,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: imagePosition === pos ? 600 : 400,
                    }}
                  >
                    Image {pos === "right" ? "→ Right" : "← Left"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: textMuted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!hasContent}
            style={{
              padding: "7px 18px",
              border: "none",
              borderRadius: 6,
              background: "#059669",
              color: "#fff",
              cursor: hasContent ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 600,
              opacity: hasContent ? 1 : 0.5,
            }}
          >
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
  quillHtml: string; // text content for this section's textarea
  blocks: AppendedBlock[]; // tables/extracts belonging to this section
}

// ─── Section Modal ────────────────────────────────────────────────────────────
// Asks for Sl No + Heading when adding/editing a section

function SectionModal({
  onInsert,
  onClose,
  darkMode,
  initialData,
  usedSlNos = [],
}: {
  onInsert: (section: NoteSection) => void;
  onClose: () => void;
  darkMode: boolean;
  initialData?: NoteSection;
  usedSlNos?: number[];
}) {
  const [slNo, setSlNo] = useState(initialData?.slNo?.toString() ?? "");
  const [heading, setHeading] = useState(initialData?.heading ?? "");
  const dm = darkMode;
  const bg = dm ? "#161b22" : "#ffffff";
  const border = dm ? "#30363d" : "#dee2e6";
  const textPrimary = dm ? "#c9d1d9" : "#1a1a1a";
  const textMuted = dm ? "#8b949e" : "#666";
  const inputBg = dm ? "#0e1117" : "#ffffff";
  const inputBorder = dm ? "#30363d" : "#dee2e6";

  const slNoNum = parseInt(slNo, 10);
  const duplicateSlNo = !isNaN(slNoNum) && usedSlNos.includes(slNoNum);
  const valid =
    heading.trim().length > 0 &&
    !isNaN(slNoNum) &&
    slNoNum > 0 &&
    !duplicateSlNo;

  const handleSubmit = () => {
    if (!valid) return;
    onInsert({
      id:
        initialData?.id ??
        `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      slNo: slNoNum,
      heading: heading.trim(),
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "1.5rem",
          width: 420,
          maxWidth: "95vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>
              📑 {initialData ? "Edit Section" : "Add Section"}
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: textMuted }}>
              Sections appear in the Table of Contents
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: textMuted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sl No */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: textMuted,
              marginBottom: 6,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Sl No <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            autoFocus
            type="number"
            min={1}
            value={slNo}
            onChange={(e) => setSlNo(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 1"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: `1px solid ${inputBorder}`,
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              background: inputBg,
              color: textPrimary,
              boxSizing: "border-box",
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: textMuted }}>
            Numbers only — used to order the Table of Contents
          </p>
          {duplicateSlNo && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#ef4444" }}>
              Another section already uses this number.
            </p>
          )}
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: textMuted,
              marginBottom: 6,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Section Heading <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g. Introduction"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: `1px solid ${inputBorder}`,
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              background: inputBg,
              color: textPrimary,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: textMuted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid}
            style={{
              padding: "7px 18px",
              border: "none",
              borderRadius: 6,
              background: "#ffa90a",
              color: "#fff",
              cursor: valid ? "pointer" : "not-allowed",
              fontSize: 13,
              fontWeight: 600,
              opacity: valid ? 1 : 0.5,
            }}
          >
            {initialData ? "Update Section" : "Add Section"}
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

interface ExtractBlockData {
  text: string;
  imageUrl: string;
  imageAlt: string;
  imagePosition: "right" | "left";
}

interface BoxBlockData {
  text: string;
  variant: "blue" | "yellow";
}

function getBoxPalette(variant: BoxBlockData["variant"]) {
  return variant === "yellow"
    ? { background: "#fff8d9", border: "#f6c453", accent: "#f59e0b" }
    : { background: "#eaf4ff", border: "#b8d8ff", accent: "#2563eb" };
}

function buildBoxBlockHtml(boxData: BoxBlockData): string {
  const normalizedData: BoxBlockData = {
    text: boxData.text || "",
    variant: boxData.variant === "yellow" ? "yellow" : "blue",
  };
  const metaJson = JSON.stringify({ type: "box", data: normalizedData });
  const metaTag = `<div data-block-meta="1" style="display:none;">${escapeHtml(metaJson)}</div>`;
  const { background, border, accent } = getBoxPalette(normalizedData.variant);

  return `<div data-callout-box="1" data-callout-variant="${normalizedData.variant}" style="background:${background};border:1px solid ${border};border-left:4px solid ${accent};border-radius:14px;padding:16px 20px;margin:16px 0;color:#363639;overflow-wrap:anywhere;line-height:1.65;box-shadow:0 2px 8px rgba(15,23,42,0.04);">${metaTag}${plainTextToHtml(normalizedData.text)}</div><p><br></p>`;
}

function buildExtractBlockHtml(extractData: ExtractBlockData): string {
  const normalizedData: ExtractBlockData = {
    text: extractData.text || "",
    imageUrl: extractData.imageUrl || "",
    imageAlt: extractData.imageAlt || "",
    imagePosition: extractData.imagePosition === "left" ? "left" : "right",
  };
  const { text, imageUrl, imageAlt, imagePosition } = normalizedData;
  const metaJson = JSON.stringify({ type: "extract", data: normalizedData });
  const metaTag = `<div data-block-meta="1" style="display:none;">${escapeHtml(metaJson)}</div>`;
  const textHtml = plainTextToHtml(text);
  const imgHtml = imageUrl.trim()
    ? `<div style="width:200px;max-width:100%;aspect-ratio:2 / 3;border-radius:10px;overflow:hidden;flex:0 1 200px;background:#e5e7eb;"><img src="${escapeHtml(imageUrl.trim())}" alt="${escapeHtml(imageAlt.trim() || "Extract image")}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
    : "";
  const textBlock = `<div style="flex:1 1 280px;min-width:0;overflow-wrap:anywhere;word-break:break-word;">${textHtml}</div>`;
  const content =
    imagePosition === "right"
      ? `${textBlock}${imgHtml}`
      : `${imgHtml}${textBlock}`;
  const innerHtml = imgHtml
    ? `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:20px;max-width:100%;min-width:0;">${content}</div>`
    : textBlock;

  return `<div data-extract="1" style="background:#f3ede6;border-radius:12px;padding:20px 24px;margin:16px 0;font-family:'DM Sans',sans-serif;border:1px solid #e5e7eb;">${metaTag}${innerHtml}</div><p><br></p>`;
}

interface AppendedBlock {
  id: string;
  type: "box" | "table" | "extract";
  html: string; // full rendered HTML saved to DB (includes embedded <script> tag)
  boxData?: BoxBlockData;
  tableData?: TableBlockData;
  extractData?: ExtractBlockData;
}

function getBlockPlaceholderLabel(
  block: AppendedBlock,
  ordinal: number,
): string {
  if (block.type === "table") return `<<< TABLE #${ordinal} >>>`;
  if (block.type === "extract") return `<<< EXTRACT #${ordinal} >>>`;
  if (block.type === "box") {
    return block.boxData?.variant === "yellow"
      ? `<<< NOTE #${ordinal} >>>`
      : `<<< BOX #${ordinal} >>>`;
  }
  return `<<< BLOCK #${ordinal} >>>`;
}

function buildBlockPlaceholderHtml(
  block: AppendedBlock,
  ordinal: number,
): string {
  const label = getBlockPlaceholderLabel(block, ordinal);
  return `<div class="grammar-block-embed" data-grammar-block-id="${escapeHtml(block.id)}" data-grammar-block-type="${escapeHtml(block.type)}" data-grammar-block-label="${escapeHtml(label)}" contenteditable="false"><span class="grammar-block-embed-line"></span><span class="grammar-block-embed-label">${escapeHtml(label)}</span><span class="grammar-block-delete" data-grammar-block-delete="1" title="Delete block">Delete</span><span class="grammar-block-embed-line"></span></div>`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBlockPlaceholderIndexFromText(value: string): number | null {
  const match = value.match(
    /<<<\s*(?:TABLE|BOX|NOTE|EXTRACT|BLOCK)\s*#(\d+)\s*>>>/i,
  );
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function getEventElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) return null;
  return target.nodeType === Node.ELEMENT_NODE
    ? (target as HTMLElement)
    : target.parentElement;
}

function compilePlaceholdersToBlocks(
  html: string,
  blocks: AppendedBlock[],
): string {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const doc = new DOMParser().parseFromString(
    `<div id="grammar-compile-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("grammar-compile-root");
  if (!root) return html;

  root.querySelectorAll("[data-grammar-block-id]").forEach((node) => {
    const blockId = node.getAttribute("data-grammar-block-id") || "";
    const block = blockById.get(blockId);
    if (!block) {
      node.remove();
      return;
    }
    const template = doc.createElement("template");
    template.innerHTML = block.html;
    node.replaceWith(template.content.cloneNode(true));
  });

  let compiled = root.innerHTML;
  blocks.forEach((block, index) => {
    const blockId = escapeRegExp(block.id);
    const legacyAttributedPattern = new RegExp(
      `<p>\\s*<(?:button|span)[^>]*data-grammar-block-id=["']${blockId}["'][\\s\\S]*?<\\/(?:button|span)>\\s*<\\/p>`,
      "g",
    );
    compiled = compiled.replace(legacyAttributedPattern, block.html);

    const label = getBlockPlaceholderLabel(block, index + 1);
    const rawLabel = escapeRegExp(label);
    const escapedLabel = escapeRegExp(escapeHtml(label));
    const textPattern = new RegExp(
      `<p>\\s*(?:${rawLabel}|${escapedLabel})\\s*<\\/p>`,
      "g",
    );
    compiled = compiled.replace(textPattern, block.html);

    const wrappedTextPattern = new RegExp(
      `<p>\\s*(?:<[^>]+>\\s*)*(?:${rawLabel}|${escapedLabel})(?:\\s*<\\/[^>]+>)*\\s*<\\/p>`,
      "g",
    );
    compiled = compiled.replace(wrappedTextPattern, block.html);
  });
  return compiled;
}

function createIntroductionSection(
  quillHtml = "",
  blocks: AppendedBlock[] = [],
): EditorSection {
  return {
    id: `sec-introduction-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    slNo: 1,
    heading: "Introduction",
    quillHtml,
    blocks,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasMeaningfulHtml(value: string): boolean {
  if (!value.trim()) return false;
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (
    (doc.body.textContent || "").trim().length > 0 ||
    !!doc.body.querySelector("img")
  );
}

function normalizeBreakableSpaces(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = (node.textContent || "").replace(/\u00a0/g, " ");
    return;
  }
  Array.from(node.childNodes).forEach(normalizeBreakableSpaces);
}

function plainTextToHtml(text: string): string {
  if (!text.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) {
    const doc = new DOMParser().parseFromString(
      `<div id="fragment-root">${text}</div>`,
      "text/html",
    );
    const root = doc.getElementById("fragment-root");
    if (!root) return text;
    normalizeBreakableSpaces(root);
    return Array.from(root.childNodes)
      .map((node) =>
        node.nodeType === Node.TEXT_NODE
          ? plainTextToHtml(node.textContent || "")
          : (node as Element).outerHTML,
      )
      .join("");
  }
  const escapedText = escapeHtml(text.replace(/\u00a0/g, " "));
  return escapedText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function mergeAdjacentBlockquotes(html: string): string {
  // Quill stores each paragraph in a multi-line callout as a sibling blockquote.
  // Join those lines before preview/save so the template renders one box.
  return html.replace(/<\/blockquote>\s*<blockquote>/gi, "<br>");
}

function serializeNoteContent(
  sections: EditorSection[],
  preambleHtml = "",
  preambleBlocks: AppendedBlock[] = [],
): string {
  const sectionsHtml = [...sections]
    .sort((a, b) => a.slNo - b.slNo)
    .map((section) => {
      const sectionContent = compilePlaceholdersToBlocks(
        plainTextToHtml(section.quillHtml),
        section.blocks,
      );
      return (
        `<h2 data-section-slno="${section.slNo}" data-section-id="${section.id}">${section.heading}</h2>` +
        `<div data-section-content="${section.id}">${sectionContent}</div>`
      );
    })
    .join("");

  return mergeAdjacentBlockquotes(
    preambleHtml +
      preambleBlocks.map((block) => block.html).join("") +
      sectionsHtml,
  );
}

// ─── extractBlockMeta ─────────────────────────────────────────────────────────
// Read the embedded <div data-block-meta="1" style="display:none"> tag
// from a block wrapper element. Returns the parsed meta object or null.
function extractBlockMeta(el: Element): { type: string; data: any } | null {
  try {
    const metaDiv = el.querySelector('div[data-block-meta="1"]');
    if (!metaDiv) return null;
    return JSON.parse(metaDiv.textContent || "");
  } catch {
    return null;
  }
}

function parseSerializedNoteContent(
  rawHtml: string,
  sectionOnly: boolean,
): {
  htmlContent: string;
  preambleBlocks: AppendedBlock[];
  editorSections: EditorSection[];
} {
  let raw = rawHtml;
  if (/^\s*<!DOCTYPE/i.test(raw) || /^\s*<html/i.test(raw)) {
    const fullDoc = new DOMParser().parseFromString(raw, "text/html");
    const noteBody = fullDoc.querySelector(".note-body");
    raw = noteBody ? noteBody.innerHTML : fullDoc.body.innerHTML;
  }

  const doc = new DOMParser().parseFromString(
    `<div id="root">${raw}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) {
    return {
      htmlContent: raw,
      preambleBlocks: [],
      editorSections: sectionOnly ? [createIntroductionSection(raw)] : [],
    };
  }

  const childNodes = Array.from(root.childNodes);
  const sectionIndices: number[] = [];
  childNodes.forEach((node, index) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (
      el.tagName.toLowerCase() === "h2" &&
      el.hasAttribute("data-section-slno")
    ) {
      sectionIndices.push(index);
    }
  });

  const parseNodes = (
    nodes: ChildNode[],
  ): { quillHtml: string; blocks: AppendedBlock[] } => {
    let quillHtml = "";
    const blocks: AppendedBlock[] = [];
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        quillHtml += plainTextToHtml(node.textContent || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const isBox =
        tag === "div" && el.getAttribute("data-callout-box") === "1";
      const isVocabTable =
        tag === "div" && el.getAttribute("data-vocab-table") === "1";
      const isExtract =
        tag === "div" && el.getAttribute("data-extract") === "1";
      if (isBox || isVocabTable || isExtract) {
        const meta = extractBlockMeta(el);
        const blockId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${blocks.length}`;
        let parsedBlock: AppendedBlock;
        if (meta?.type === "box") {
          parsedBlock = {
            id: blockId,
            type: "box",
            html: buildBoxBlockHtml(meta.data),
            boxData: meta.data,
          };
        } else if (meta?.type === "table") {
          parsedBlock = {
            id: blockId,
            type: "table",
            html: el.outerHTML,
            tableData: meta.data,
          };
        } else if (meta?.type === "extract") {
          parsedBlock = {
            id: blockId,
            type: "extract",
            html: buildExtractBlockHtml(meta.data),
            extractData: meta.data,
          };
        } else {
          parsedBlock = {
            id: blockId,
            type: isBox ? "box" : isVocabTable ? "table" : "extract",
            html: el.outerHTML,
          };
        }
        blocks.push(parsedBlock);
        quillHtml += buildBlockPlaceholderHtml(parsedBlock, blocks.length);
      } else {
        quillHtml += el.outerHTML;
      }
    });
    return { quillHtml, blocks };
  };

  if (sectionIndices.length === 0) {
    const { quillHtml, blocks } = parseNodes(childNodes);
    return sectionOnly
      ? {
          htmlContent: "",
          preambleBlocks: [],
          editorSections: [createIntroductionSection(quillHtml, blocks)],
        }
      : { htmlContent: quillHtml, preambleBlocks: blocks, editorSections: [] };
  }

  const preambleNodes = childNodes.slice(0, sectionIndices[0]);
  const { quillHtml: pHtml, blocks: pBlocks } = parseNodes(preambleNodes);
  const loadedSections: EditorSection[] = [];
  sectionIndices.forEach((secNodeIdx, index) => {
    const h2El = childNodes[secNodeIdx] as Element;
    const parsedSlNo = parseInt(
      h2El.getAttribute("data-section-slno") || "",
      10,
    );
    const slNo =
      Number.isFinite(parsedSlNo) && parsedSlNo > 0 ? parsedSlNo : index + 1;
    const secId =
      h2El.getAttribute("data-section-id") || `sec-${Date.now()}-${index}`;
    const heading =
      h2El.textContent?.trim() ||
      (index === 0 ? "Introduction" : `Section ${index + 1}`);

    let nextIdx = secNodeIdx + 1;
    while (
      nextIdx < childNodes.length &&
      childNodes[nextIdx].nodeType === Node.TEXT_NODE &&
      !(childNodes[nextIdx].textContent || "").trim()
    ) {
      nextIdx += 1;
    }
    const nextNode =
      nextIdx < childNodes.length ? (childNodes[nextIdx] as Element) : null;
    const hasContentDiv =
      nextNode &&
      nextNode.nodeType === Node.ELEMENT_NODE &&
      nextNode.getAttribute("data-section-content") === secId;

    const endIdx =
      index + 1 < sectionIndices.length
        ? sectionIndices[index + 1]
        : childNodes.length;
    const contentNodes = hasContentDiv
      ? Array.from(nextNode.childNodes)
      : childNodes.slice(secNodeIdx + 1, endIdx);
    const { quillHtml, blocks } = parseNodes(contentNodes);
    loadedSections.push({ id: secId, slNo, heading, quillHtml, blocks });
  });

  const sortedSections = loadedSections.sort((a, b) => a.slNo - b.slNo);
  const hasLegacyPreamble =
    pBlocks.length > 0 ||
    pHtml.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "").trim().length > 0;

  return sectionOnly
    ? {
        htmlContent: "",
        preambleBlocks: [],
        editorSections: hasLegacyPreamble
          ? [
              createIntroductionSection(pHtml, pBlocks),
              ...sortedSections.map((section) => ({
                ...section,
                slNo: section.slNo + 1,
              })),
            ]
          : sortedSections,
      }
    : {
        htmlContent: pHtml,
        preambleBlocks: pBlocks,
        editorSections: sortedSections,
      };
}

const QUILL_FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "indent",
  "blockquote",
  "code-block",
  "link",
  "image",
  "align",
  "grammarBlock",
];

const RICH_TEXT_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["blockquote", "link"],
    [{ align: [] }],
    ["clean"],
  ],
};

function NoteEditorView({
  subtopicId,
  subtopicName,
  learningLang,
  levelCode,
  existingNote,
  translationFor,
  takenLangs,
  translations,
  initialKnownLang,
  onSelectTranslation,
  onAddTranslation,
  onClose,
  onSaved,
  showToast,
}: {
  subtopicId: number;
  subtopicName: string;
  learningLang: string;
  levelCode: string;
  existingNote?: Note | null;
  translationFor?: Note | null;
  takenLangs?: string[];
  translations?: Note[];
  initialKnownLang?: string;
  onSelectTranslation?: (note: Note) => void;
  onAddTranslation?: (source: Note, takenLangs: string[]) => void;
  onClose: () => void;
  onSaved: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const sectionOnly = apiPrefix === "grammar";
  const learningLangLabel =
    LANGUAGES.find((lang) => lang.code === learningLang)?.label ||
    learningLang.toUpperCase();
  const [titlesByLang, setTitlesByLang] = useState<Record<string, string>>(
    () => {
      const next = emptyKnownLangTextMap();
      (translations || []).forEach((note) => {
        next[note.known_lang] = note.title || "";
      });
      const seedNote = existingNote || translationFor;
      if (seedNote) next[seedNote.known_lang] = seedNote.title || "";
      if (sectionOnly) {
        next.en =
          seedNote?.title ||
          translations?.find((note) => note.known_lang === "en")?.title ||
          translations?.[0]?.title ||
          "";
      }
      return next;
    },
  );
  const [translatedTitle] = useState(
    existingNote?.description || translationFor?.description || "",
  );
  const [knownLang, setKnownLang] = useState(() => {
    if (existingNote) return existingNote.known_lang;
    if (initialKnownLang) return initialKnownLang;
    if (translationFor) {
      // Pick the first language not already taken
      const taken = new Set(takenLangs || [translationFor.known_lang]);
      const next = KNOWN_LANGS.find((l) => !taken.has(l.code));
      return next?.code || "en";
    }
    return "en";
  });
  // For translations: lock concept_id to the source note's concept_id
  const [conceptId, setConceptId] = useState(
    existingNote?.concept_id ||
      translationFor?.concept_id ||
      (apiPrefix === "grammar" ? `grammar-subtopic-${subtopicId}` : ""),
  );
  const isTranslation = !!translationFor && !existingNote;
  const conceptLocked = !!existingNote || isTranslation;
  const title = sectionOnly
    ? titlesByLang.en || ""
    : titlesByLang[knownLang] || "";

  const [htmlContent, setHtmlContent] = useState("");
  const [rawHtmlInput, setRawHtmlInput] = useState("");
  const [showRawHtmlPanel, setShowRawHtmlPanel] = useState(false);
  const [showExtractHtmlModal, setShowExtractHtmlModal] = useState(false);
  const [extractedHtml, setExtractedHtml] = useState("");
  const [pastedHtmlSnapshot, setPastedHtmlSnapshot] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [compiledPreviewHtml, setCompiledPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTitlesByLang((prev) => {
      const next = { ...emptyKnownLangTextMap(), ...prev };
      (translations || []).forEach((note) => {
        next[note.known_lang] = note.title || "";
      });
      const seedNote = existingNote || translationFor;
      if (seedNote) next[seedNote.known_lang] = seedNote.title || "";
      if (sectionOnly) {
        next.en =
          seedNote?.title ||
          translations?.find((note) => note.known_lang === "en")?.title ||
          translations?.[0]?.title ||
          "";
      }
      return next;
    });
  }, [existingNote, sectionOnly, translationFor, translations]);

  // Insert-block modals
  const [showBoxModal, setShowBoxModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [preambleBlocks, setPreambleBlocks] = useState<AppendedBlock[]>([]);
  // Per-section content
  const [editorSections, setEditorSections] = useState<EditorSection[]>(() =>
    sectionOnly && !existingNote ? [createIntroductionSection()] : [],
  );
  const markEditorContentChanged = () => setPastedHtmlSnapshot(null);
  // Which section block is currently being edited.
  const [editingBlock, setEditingBlock] = useState<{
    sectionId: string | null;
    index: number;
  } | null>(null);
  // Which section id the currently-open block modal is targeting.
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);

  // Section modal
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  // Dark mode — persisted per editor session
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("editor_dark") === "1";
    } catch {
      return false;
    }
  });

  // Inject global table styles once on mount — scoped styles don't reach Quill's DOM
  useEffect(() => {
    const id = "quill-table-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      table.quill-better-table { width: 100% !important; border-collapse: collapse !important; margin: 10px 0 !important; table-layout: fixed !important; }
      table.quill-better-table td { border: 1px solid #adb5bd !important; padding: 6px 10px !important; min-width: 60px !important; min-height: 28px !important; word-break: break-word !important; vertical-align: top !important; }
      .quill-better-table-wrapper { overflow-x: auto !important; margin: 8px 0 !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  const [ReactQuill, setReactQuill] = useState<any>(null);
  const [quillRef, setQuillRef] = useState<any>(null);
  const [quillModules, setQuillModules] = useState<any>(null);
  const sectionQuillRefs = useRef<Record<string, any>>({});
  const sectionSelectionRefs = useRef<Record<string, number>>({});

  const getSectionQuill = useCallback((sectionId: string | null) => {
    if (!sectionId) return null;
    const ref = sectionQuillRefs.current[sectionId];
    return ref?.getEditor ? ref.getEditor() : ref || null;
  }, []);

  const rememberSectionSelection = useCallback(
    (sectionId: string, range?: { index: number } | null) => {
      setTargetSectionId(sectionId);
      if (range) sectionSelectionRefs.current[sectionId] = range.index;
    },
    [],
  );

  const prepareSectionBlockInsert = useCallback(() => {
    if (!sectionOnly) {
      setTargetSectionId(null);
      setEditingBlock(null);
      return;
    }
    const sortedSections = [...editorSections].sort((a, b) => a.slNo - b.slNo);
    const sectionId = targetSectionId || sortedSections[0]?.id || null;
    setTargetSectionId(sectionId);
    setEditingBlock(null);
    const quill = getSectionQuill(sectionId);
    const range = quill?.getSelection?.();
    if (sectionId && range)
      sectionSelectionRefs.current[sectionId] = range.index;
  }, [editorSections, getSectionQuill, sectionOnly, targetSectionId]);

  const insertBlockEmbedIntoSection = useCallback(
    (sectionId: string, block: AppendedBlock, ordinal: number) => {
      const quill = getSectionQuill(sectionId);
      if (!quill) return false;
      const liveRange = quill.getSelection?.();
      const rememberedIndex = sectionSelectionRefs.current[sectionId];
      const fallbackIndex = Math.max(0, (quill.getLength?.() || 1) - 1);
      const index =
        liveRange?.index ??
        (Number.isFinite(rememberedIndex) ? rememberedIndex : fallbackIndex);
      quill.insertEmbed(
        index,
        "grammarBlock",
        {
          id: block.id,
          type: block.type,
          label: getBlockPlaceholderLabel(block, ordinal),
        },
        "user",
      );
      quill.insertText(index + 1, "\n", "user");
      quill.setSelection(index + 2, 0, "silent");
      sectionSelectionRefs.current[sectionId] = index + 2;
      return true;
    },
    [getSectionQuill],
  );

  const insertTable = useCallback(
    (rows = 3, cols = 3) => {
      if (!quillRef) return;
      const quill = quillRef.getEditor ? quillRef.getEditor() : quillRef;
      if (!quill) return;
      const headerCells = Array.from(
        { length: cols },
        (_, c) =>
          `<td style="border:1px solid #adb5bd;padding:6px 10px;min-width:80px;font-weight:600;background:#f0f0f0;">Header ${c + 1}</td>`,
      ).join("");
      const bodyRows = Array.from(
        { length: rows - 1 },
        (_, r) =>
          `<tr>${Array.from(
            { length: cols },
            (_, c) =>
              `<td style="border:1px solid #adb5bd;padding:6px 10px;min-width:80px;">Row ${r + 1}, Col ${c + 1}</td>`,
          ).join("")}</tr>`,
      ).join("");
      const tableHtml = `<table style="border-collapse:collapse;width:100%;margin:10px 0;table-layout:fixed;"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`;
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.clipboard.dangerouslyPasteHTML(index, tableHtml);
      quill.setSelection(index + 1, 0);
    },
    [quillRef],
  );

  // Complex blocks remain outside the Section content textarea so their typed
  // metadata survives editing and the existing HTML save format stays intact.
  const appendBlockToTargetSection = useCallback(
    (
      html: string,
      blockType: "box" | "table" | "extract",
      tableData?: TableBlockData,
      extractData?: ExtractBlockData,
      boxData?: BoxBlockData,
    ) => {
      markEditorContentChanged();
      const newBlock: AppendedBlock = {
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: blockType,
        html,
        boxData,
        tableData,
        extractData,
      };
      if (!targetSectionId) {
        if (!sectionOnly) setPreambleBlocks((prev) => [...prev, newBlock]);
        return;
      }
      let insertedOrdinal = 1;
      setEditorSections((prev) =>
        prev.map((section) => {
          if (section.id !== targetSectionId) return section;
          const nextBlocks = [...section.blocks, newBlock];
          insertedOrdinal = nextBlocks.length;
          return {
            ...section,
            blocks: nextBlocks,
          };
        }),
      );
      window.setTimeout(() => {
        const insertedIntoEditor = insertBlockEmbedIntoSection(
          targetSectionId,
          newBlock,
          insertedOrdinal,
        );
        if (!insertedIntoEditor) {
          setEditorSections((prev) =>
            prev.map((section) =>
              section.id === targetSectionId
                ? {
                    ...section,
                    quillHtml:
                      section.quillHtml +
                      buildBlockPlaceholderHtml(newBlock, insertedOrdinal),
                  }
                : section,
            ),
          );
        }
      }, 0);
    },
    [insertBlockEmbedIntoSection, sectionOnly, targetSectionId],
  );

  useEffect(() => {
    import("react-quill-new").then((mod) => {
      const Quill = mod.Quill || mod.default.Quill;
      if (Quill && !(window as any).__grammarBlockBlotRegistered) {
        const BlockEmbed = Quill.import("blots/block/embed") as any;
        class GrammarBlockBlot extends BlockEmbed {
          static blotName = "grammarBlock";
          static tagName = "div";
          static className = "grammar-block-embed";

          static create(value: { id?: string; type?: string; label?: string }) {
            const node = super.create(value) as HTMLElement;
            const label = value?.label || "<<< BLOCK >>>";
            node.setAttribute("contenteditable", "false");
            node.setAttribute("data-grammar-block-id", value?.id || "");
            node.setAttribute("data-grammar-block-type", value?.type || "");
            node.setAttribute("data-grammar-block-label", label);
            node.innerHTML = `<span class="grammar-block-embed-line"></span><span class="grammar-block-embed-label">${escapeHtml(label)}</span><span class="grammar-block-delete" data-grammar-block-delete="1" title="Delete block">Delete</span><span class="grammar-block-embed-line"></span>`;
            return node;
          }

          static value(node: HTMLElement) {
            return {
              id: node.getAttribute("data-grammar-block-id") || "",
              type: node.getAttribute("data-grammar-block-type") || "",
              label:
                node.getAttribute("data-grammar-block-label") ||
                node.textContent?.trim() ||
                "<<< BLOCK >>>",
            };
          }
        }
        (Quill as any).register(GrammarBlockBlot as any, true);
        (window as any).__grammarBlockBlotRegistered = true;
      }
      setQuillModules({
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ indent: "-1" }, { indent: "+1" }],
            ["blockquote", "code-block"],
            ["link", "image"],
            [{ align: [] }],
            ["table"],
            ["clean"],
          ],
          handlers: { table: () => insertTable(3, 3) },
        },
      });
      setReactQuill(() => mod.default);
    });
  }, [insertTable]);

  // Load existing content when editing.
  // Parse the saved HTML into per-section EditorSections.
  useEffect(() => {
    if (existingNote) {
      setLoading(true);
      api
        .get(`/admin/${apiPrefix}/notes/${existingNote.id}/markdown`)
        .then((r) => {
          let raw: string = r.data.markdown_source || "";

          // Safety net: if the backend returned a full HTML page instead of a
          // raw fragment, extract just the body content before parsing.
          if (/^\s*<!DOCTYPE/i.test(raw) || /^\s*<html/i.test(raw)) {
            const fullDoc = new DOMParser().parseFromString(raw, "text/html");
            const noteBody = fullDoc.querySelector(".note-body");
            raw = noteBody ? noteBody.innerHTML : fullDoc.body.innerHTML;
          }

          const parser = new DOMParser();
          const doc = parser.parseFromString(
            `<div id="root">${raw}</div>`,
            "text/html",
          );
          const root = doc.getElementById("root");
          if (!root) {
            setHtmlContent(raw);
            return;
          }

          // ── Parse into preamble + sections ──────────────────────────────
          // Strategy: walk child nodes, collect everything before the first
          // data-section-slno h2 into preamble, then group by section.

          const childNodes = Array.from(root.childNodes);

          // Find indices of section h2 elements
          const sectionIndices: number[] = [];
          childNodes.forEach((node, i) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              if (
                el.tagName.toLowerCase() === "h2" &&
                el.hasAttribute("data-section-slno")
              ) {
                sectionIndices.push(i);
              }
            }
          });

          // Helper: parse a list of nodes into quillHtml + blocks
          const parseNodes = (
            nodes: ChildNode[],
          ): { quillHtml: string; blocks: AppendedBlock[] } => {
            let quillHtml = "";
            const blocks: AppendedBlock[] = [];
            nodes.forEach((node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                quillHtml += plainTextToHtml(node.textContent || "");
                return;
              }
              if (node.nodeType !== Node.ELEMENT_NODE) return;
              const el = node as Element;
              const tag = el.tagName.toLowerCase();
              const isBox =
                tag === "div" && el.getAttribute("data-callout-box") === "1";
              const isVocabTable =
                tag === "div" && el.getAttribute("data-vocab-table") === "1";
              const isExtract =
                tag === "div" && el.getAttribute("data-extract") === "1";
              if (isBox || isVocabTable || isExtract) {
                const meta = extractBlockMeta(el);
                const blockId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${blocks.length}`;
                let parsedBlock: AppendedBlock;
                if (meta?.type === "box") {
                  parsedBlock = {
                    id: blockId,
                    type: "box",
                    html: buildBoxBlockHtml(meta.data),
                    boxData: meta.data,
                  };
                } else if (meta?.type === "table") {
                  parsedBlock = {
                    id: blockId,
                    type: "table",
                    html: el.outerHTML,
                    tableData: meta.data,
                  };
                } else if (meta?.type === "extract") {
                  parsedBlock = {
                    id: blockId,
                    type: "extract",
                    html: buildExtractBlockHtml(meta.data),
                    extractData: meta.data,
                  };
                } else {
                  parsedBlock = {
                    id: blockId,
                    type: isBox ? "box" : isVocabTable ? "table" : "extract",
                    html: el.outerHTML,
                  };
                }
                blocks.push(parsedBlock);
                quillHtml += buildBlockPlaceholderHtml(
                  parsedBlock,
                  blocks.length,
                );
              } else {
                quillHtml += el.outerHTML;
              }
            });
            return { quillHtml, blocks };
          };

          if (sectionIndices.length === 0) {
            // No sections — everything is preamble
            const { quillHtml, blocks } = parseNodes(childNodes);
            if (sectionOnly) {
              setHtmlContent("");
              setPreambleBlocks([]);
              setEditorSections([createIntroductionSection(quillHtml, blocks)]);
            } else {
              setHtmlContent(quillHtml);
              setPreambleBlocks(blocks);
              setEditorSections([]);
            }
          } else {
            // Preamble = nodes before first section h2
            const preambleNodes = childNodes.slice(0, sectionIndices[0]);
            const { quillHtml: pHtml, blocks: pBlocks } =
              parseNodes(preambleNodes);

            // Each section
            const loadedSections: EditorSection[] = [];
            sectionIndices.forEach((secNodeIdx, i) => {
              const h2El = childNodes[secNodeIdx] as Element;
              const parsedSlNo = parseInt(
                h2El.getAttribute("data-section-slno") || "",
                10,
              );
              const slNo =
                Number.isFinite(parsedSlNo) && parsedSlNo > 0
                  ? parsedSlNo
                  : i + 1;
              const secId =
                h2El.getAttribute("data-section-id") ||
                `sec-${Date.now()}-${i}`;
              const heading =
                h2El.textContent?.trim() ||
                (i === 0 ? "Introduction" : `Section ${i + 1}`);

              // Content nodes: check for new-style <div data-section-content>
              let nextIdx = secNodeIdx + 1;
              while (
                nextIdx < childNodes.length &&
                childNodes[nextIdx].nodeType === Node.TEXT_NODE &&
                !(childNodes[nextIdx].textContent || "").trim()
              ) {
                nextIdx += 1;
              }
              const nextNode =
                nextIdx < childNodes.length
                  ? (childNodes[nextIdx] as Element)
                  : null;
              const hasContentDiv =
                nextNode &&
                nextNode.nodeType === Node.ELEMENT_NODE &&
                nextNode.getAttribute("data-section-content") === secId;

              let contentNodes: ChildNode[];
              if (hasContentDiv) {
                contentNodes = Array.from(nextNode.childNodes);
              } else {
                // Legacy: everything between this h2 and the next h2 (or end)
                const endIdx =
                  i + 1 < sectionIndices.length
                    ? sectionIndices[i + 1]
                    : childNodes.length;
                contentNodes = childNodes.slice(secNodeIdx + 1, endIdx);
              }

              const { quillHtml, blocks } = parseNodes(contentNodes);
              loadedSections.push({
                id: secId,
                slNo,
                heading,
                quillHtml,
                blocks,
              });
            });

            const sortedSections = loadedSections.sort(
              (a, b) => a.slNo - b.slNo,
            );
            const hasLegacyPreamble =
              pBlocks.length > 0 ||
              pHtml.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "").trim().length > 0;
            if (sectionOnly) {
              setHtmlContent("");
              setPreambleBlocks([]);
              setEditorSections(
                hasLegacyPreamble
                  ? [
                      createIntroductionSection(pHtml, pBlocks),
                      ...sortedSections.map((section) => ({
                        ...section,
                        slNo: section.slNo + 1,
                      })),
                    ]
                  : sortedSections,
              );
            } else {
              setHtmlContent(pHtml);
              setPreambleBlocks(pBlocks);
              setEditorSections(sortedSections);
            }
          }
        })
        .catch(() => {
          setHtmlContent("");
          setPreambleBlocks([]);
          setEditorSections(sectionOnly ? [createIntroductionSection()] : []);
        })
        .finally(() => setLoading(false));
    }
  }, [existingNote, apiPrefix, sectionOnly]);

  const isEmpty = (html: string) => {
    const stripped = html.replace(/<[^>]*>/g, "").trim();
    return !stripped || stripped === "<br>";
  };

  const buildSerializedContent = () =>
    pastedHtmlSnapshot ??
    serializeNoteContent(
      editorSections,
      sectionOnly ? "" : htmlContent,
      sectionOnly ? [] : preambleBlocks,
    );

  const preambleBlocksHtml = preambleBlocks.map((block) => block.html).join("");

  useEffect(() => {
    if (!sectionOnly || tab !== "preview") return;

    const previewSource = serializeNoteContent(editorSections);
    if (isEmpty(previewSource)) {
      setCompiledPreviewHtml("");
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");

    api
      .post("/admin/grammar/preview-markdown", {
        markdown_text: previewSource,
        title,
        description: translatedTitle || undefined,
      })
      .then((response) => {
        if (!cancelled) setCompiledPreviewHtml(response.data.html || "");
      })
      .catch((error: any) => {
        if (!cancelled) {
          setCompiledPreviewHtml("");
          setPreviewError(
            error.response?.data?.detail || "Failed to compile preview",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editorSections, sectionOnly, tab, title, translatedTitle]);

  // Inject raw HTML directly into Quill by setting it as the editor value
  const handleInjectRawHtml = () => {
    if (!rawHtmlInput.trim()) return;
    const pastedHtml = rawHtmlInput.trim();
    const parsed = parseSerializedNoteContent(pastedHtml, sectionOnly);
    setHtmlContent(parsed.htmlContent);
    setPreambleBlocks(parsed.preambleBlocks);
    setEditorSections(parsed.editorSections);
    setPastedHtmlSnapshot(pastedHtml);
    setRawHtmlInput("");
    setShowRawHtmlPanel(false);
    setTab("write");
    showToast(true, "HTML loaded into editor");
    // Set directly — Quill's controlled value prop parses HTML correctly
  };

  const handleOpenExtractHtml = () => {
    const html = buildSerializedContent();
    if (isEmpty(html)) {
      showToast(false, "Nothing to extract");
      return;
    }
    setExtractedHtml(html);
    setShowExtractHtmlModal(true);
  };

  const handleCopyExtractedHtml = async () => {
    try {
      await navigator.clipboard.writeText(extractedHtml);
      showToast(true, "HTML copied to clipboard");
    } catch {
      showToast(false, "Copy failed");
    }
  };

  const handleDownloadExtractedHtml = () => {
    const blob = new Blob([extractedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      (title || "grammar-language-page")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "grammar-language-page"
    }.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showToast(false, "Title is required");
      return;
    }
    if (!conceptId.trim()) {
      showToast(false, "Concept ID is required");
      return;
    }
    if (sectionOnly && editorSections.length === 0) {
      showToast(false, "Add at least one Section before saving");
      return;
    }

    const combinedContent = buildSerializedContent();
    if (isEmpty(combinedContent)) {
      showToast(false, "Content cannot be empty");
      return;
    }
    setSaving(true);
    try {
      if (existingNote) {
        await api.put(`/admin/${apiPrefix}/notes/${existingNote.id}`, {
          markdown_source: combinedContent,
          title,
          ...(sectionOnly ? { description: translatedTitle } : {}),
        });
        showToast(true, "Note updated");
      } else {
        await api.post(`/admin/${apiPrefix}/notes`, {
          subtopic_id: subtopicId,
          concept_id: conceptId,
          known_lang: knownLang,
          learning_lang: learningLang,
          markdown_source: combinedContent,
          title,
          ...(sectionOnly ? { description: translatedTitle } : {}),
        });
        showToast(true, "Note created");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dm = darkMode;
  const bg = dm ? "#0e1117" : "#ffffff";
  const surface = dm ? "#161b22" : "#f8f9fa";
  const border = dm ? "#30363d" : "#dee2e6";
  const textPrimary = dm ? "#c9d1d9" : "#1a1a1a";
  const textMuted = dm ? "#8b949e" : "#666";
  const inputBg = dm ? "#0e1117" : "#ffffff";
  const inputBorder = dm ? "#30363d" : "#dee2e6";
  const previewBg = dm ? "#161b22" : "#f9f5f0";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 5rem)",
        background: bg,
        borderRadius: 12,
        border: `1px solid ${border}`,
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.875rem 1.5rem",
          borderBottom: `1px solid ${border}`,
          background: surface,
          flexShrink: 0,
        }}
      >
        {/* Left: back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: textMuted,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            <ChevronLeft size={16} /> Back
          </button>
          <span style={{ color: border, fontSize: 16 }}>|</span>
          <div>
            <span style={{ fontSize: 13, color: textMuted }}>
              {subtopicName} /{" "}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
              {sectionOnly
                ? existingNote
                  ? "Edit Language Page"
                  : "Create Language Page"
                : existingNote
                  ? "Edit Note"
                  : isTranslation
                    ? "Add Translation"
                    : "Create Note"}
            </span>
            {!sectionOnly && isTranslation && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: "#0969da",
                  background: "#dbeafe",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                Translating: {conceptId}
              </span>
            )}
          </div>
        </div>

        {/* Right: dark mode + save */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!sectionOnly && !!translations?.length && (
            <select
              value={existingNote ? String(existingNote.id) : "new"}
              onChange={(e) => {
                const selected = translations.find(
                  (note) => note.id === Number(e.target.value),
                );
                if (selected) onSelectTranslation?.(selected);
              }}
              title="Explanation language"
              style={{
                padding: "6px 10px",
                border: `1px solid ${border}`,
                borderRadius: 6,
                background: inputBg,
                color: textPrimary,
                fontSize: 12,
              }}
            >
              {isTranslation && <option value="new">New translation</option>}
              {translations.map((note) => (
                <option key={note.id} value={note.id}>
                  {KNOWN_LANGS.find((lang) => lang.code === note.known_lang)
                    ?.label || note.known_lang.toUpperCase()}
                </option>
              ))}
            </select>
          )}
          {!sectionOnly &&
            !!translations?.length &&
            !isTranslation &&
            translations.length < KNOWN_LANGS.length && (
              <button
                onClick={() =>
                  onAddTranslation?.(
                    translations[0],
                    translations.map((note) => note.known_lang),
                  )
                }
                style={{
                  padding: "6px 12px",
                  border: `1px solid ${border}`,
                  borderRadius: 6,
                  background: "#1f6feb22",
                  color: "#60a5fa",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Plus size={13} style={{ display: "inline", marginRight: 5 }} />
                Add Translation
              </button>
            )}
          <button
            onClick={() => {
              const next = !darkMode;
              setDarkMode(next);
              localStorage.setItem("editor_dark", next ? "1" : "0");
            }}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: `1px solid ${border}`,
              background: "transparent",
              cursor: "pointer",
              color: textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: textMuted,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "6px 18px",
              border: "none",
              borderRadius: 6,
              background: "#0969da",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Save size={13} />
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>

      {/* ── Meta fields ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            apiPrefix === "grammar"
              ? "repeat(4, minmax(0, 1fr))"
              : "repeat(3, minmax(0, 1fr))",
          gap: "1rem",
          padding: "0.875rem 1.5rem",
          borderBottom: `1px solid ${border}`,
          background: surface,
          flexShrink: 0,
        }}
      >
        {apiPrefix === "grammar" ? (
          <>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 4,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Learning Language
              </label>
              <div
                style={{
                  padding: "7px 10px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                  background: dm ? "#1c2128" : "#f8f9fa",
                  color: textPrimary,
                }}
              >
                {learningLangLabel}
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 4,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Explanation Language
              </label>
              <select
                value={knownLang}
                onChange={(e) => setKnownLang(e.target.value)}
                disabled={!!existingNote}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  background: existingNote
                    ? dm
                      ? "#1c2128"
                      : "#f8f9fa"
                    : inputBg,
                  color: textPrimary,
                  opacity: existingNote ? 0.7 : 1,
                }}
              >
                {KNOWN_LANGS.map((l) => {
                  const isTaken =
                    isTranslation && (takenLangs || []).includes(l.code);
                  return (
                    <option key={l.code} value={l.code} disabled={isTaken}>
                      {l.label}
                      {isTaken ? " (exists)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 4,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                CEFR Level
              </label>
              <div
                style={{
                  padding: "7px 10px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                  background: dm ? "#1c2128" : "#f8f9fa",
                  color: textPrimary,
                }}
              >
                {levelCode}
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: textMuted,
                  marginBottom: 4,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Title *
              </label>
              <input
                value={title}
                onChange={(e) =>
                  setTitlesByLang((prev) => ({
                    ...prev,
                    en: e.target.value,
                  }))
                }
                placeholder="e.g. Perfect Nouns in French"
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                  background: inputBg,
                  color: textPrimary,
                }}
              />
            </div>
          </>
        ) : (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: textMuted,
                marginBottom: 4,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Title *
            </label>
            <input
              value={title}
              onChange={(e) =>
                setTitlesByLang((prev) => ({
                  ...prev,
                  [knownLang]: e.target.value,
                }))
              }
              placeholder="e.g. Perfect Nouns in French"
              style={{
                width: "100%",
                padding: "7px 10px",
                border: `1px solid ${inputBorder}`,
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                background: inputBg,
                color: textPrimary,
              }}
            />
          </div>
        )}
        {apiPrefix !== "grammar" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: textMuted,
                marginBottom: 4,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Concept ID *
            </label>
            <input
              value={conceptId}
              onChange={(e) => setConceptId(e.target.value)}
              placeholder="e.g. fr-a1-nouns-perfect"
              disabled={conceptLocked}
              style={{
                width: "100%",
                padding: "7px 10px",
                border: `1px solid ${inputBorder}`,
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                background: conceptLocked
                  ? dm
                    ? "#1c2128"
                    : "#f8f9fa"
                  : inputBg,
                color: textPrimary,
                opacity: conceptLocked ? 0.7 : 1,
              }}
            />
          </div>
        )}
        {apiPrefix !== "grammar" && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: textMuted,
                marginBottom: 4,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Explanation Language
            </label>
            <select
              value={knownLang}
              onChange={(e) => setKnownLang(e.target.value)}
              disabled={!!existingNote}
              style={{
                width: "100%",
                padding: "7px 10px",
                border: `1px solid ${inputBorder}`,
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                background: existingNote
                  ? dm
                    ? "#1c2128"
                    : "#f8f9fa"
                  : inputBg,
                color: textPrimary,
                opacity: existingNote ? 0.7 : 1,
              }}
            >
              {KNOWN_LANGS.map((l) => {
                const isTaken =
                  isTranslation && (takenLangs || []).includes(l.code);
                return (
                  <option key={l.code} value={l.code} disabled={isTaken}>
                    {l.label}
                    {isTaken ? " (exists)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* ── Tab bar + action buttons ── */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${border}`,
          background: surface,
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        {/*
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "9px 22px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: tab === t ? "#0969da" : textMuted,
              borderBottom:
                tab === t ? "2px solid #0969da" : "2px solid transparent",
              fontWeight: tab === t ? 600 : 400,
              fontSize: 13,
            }}
          >
            {t === "write" ? "✏️ Write" : "👁 Preview"}
          </button>
        ))}
        */}

        {/* Insert-block buttons — only visible in write mode */}
        {/*
        Preview tab is intentionally hidden for now. Keep this condition here
        if the tab switcher is restored later.
        */}
        {
          <div
            style={{
              display: "flex",
              gap: 6,
              marginLeft: 12,
              alignItems: "center",
            }}
          >
            <button
              onClick={() => {
                setEditingSectionId(null);
                setShowSectionModal(true);
              }}
              title="Add a new section with heading and Sl No"
              style={{
                padding: "4px 12px",
                border: `1px solid ${border}`,
                borderRadius: 5,
                background: "#ffa90a22",
                color: "#ffa90a",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              📑 Add Section
            </button>
            {
              <>
                <span style={{ color: border, fontSize: 14 }}>|</span>
                <button
                  onClick={() => {
                    prepareSectionBlockInsert();
                    setShowBoxModal(true);
                  }}
                  title="Insert a highlighted callout box"
                  style={{
                    padding: "4px 12px",
                    border: `1px solid ${border}`,
                    borderRadius: 5,
                    background: "#fff8e622",
                    color: "#ffa90a",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  📦 Box
                </button>
                <button
                  onClick={() => {
                    prepareSectionBlockInsert();
                    setShowTableModal(true);
                  }}
                  title="Insert a vocabulary table with audio and hover-translate"
                  style={{
                    padding: "4px 12px",
                    border: `1px solid ${border}`,
                    borderRadius: 5,
                    background: "#2563eb22",
                    color: "#60a5fa",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  📋 Table
                </button>
                <button
                  onClick={() => {
                    prepareSectionBlockInsert();
                    setShowExtractModal(true);
                  }}
                  title="Insert a styled extract block with optional image"
                  style={{
                    padding: "4px 12px",
                    border: `1px solid ${border}`,
                    borderRadius: 5,
                    background: "#05966922",
                    color: "#34d399",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  🖼 Extract
                </button>
              </>
            }
          </div>
        }

        <div
          style={{
            marginLeft: "auto",
            marginRight: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={handleOpenExtractHtml}
            style={{
              padding: "5px 12px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: "transparent",
              color: textMuted,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {"</>"} Extract HTML
          </button>
          <button
            onClick={() => setShowRawHtmlPanel((p) => !p)}
            style={{
              padding: "5px 12px",
              border: `1px solid ${border}`,
              borderRadius: 6,
              background: showRawHtmlPanel ? "#0969da" : "transparent",
              color: showRawHtmlPanel ? "#fff" : textMuted,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {"</>"} Paste HTML
          </button>
        </div>
      </div>

      {/* ── Paste HTML panel ── */}
      {showRawHtmlPanel && (
        <div
          style={{
            padding: "10px 1.5rem",
            borderBottom: `1px solid ${border}`,
            background: dm ? "#1c2128" : "#f0f6ff",
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>
            Paste raw HTML — click <strong>Inject</strong> to load it into{" "}
            {sectionOnly ? "the first Section" : "the editor"}.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              value={rawHtmlInput}
              onChange={(e) => setRawHtmlInput(e.target.value)}
              placeholder="<h1>Title</h1><p>Content...</p>"
              rows={3}
              style={{
                flex: 1,
                padding: "7px 10px",
                border: `1px solid ${inputBorder}`,
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "monospace",
                resize: "vertical",
                outline: "none",
                background: inputBg,
                color: textPrimary,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                onClick={handleInjectRawHtml}
                disabled={!rawHtmlInput.trim()}
                style={{
                  padding: "7px 14px",
                  border: "none",
                  borderRadius: 6,
                  background: "#0969da",
                  color: "#fff",
                  cursor: rawHtmlInput.trim() ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: rawHtmlInput.trim() ? 1 : 0.5,
                }}
              >
                Inject
              </button>
              <button
                onClick={() => {
                  setRawHtmlInput("");
                  setShowRawHtmlPanel(false);
                }}
                style={{
                  padding: "7px 14px",
                  border: `1px solid ${border}`,
                  borderRadius: 6,
                  background: "transparent",
                  color: textMuted,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor / Preview ── */}
      {showExtractHtmlModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "min(980px, 92vw)",
              maxHeight: "86vh",
              display: "flex",
              flexDirection: "column",
              background: surface,
              color: textPrimary,
              border: `1px solid ${border}`,
              borderRadius: 8,
              boxShadow: "0 20px 60px rgba(0,0,0,.35)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: `1px solid ${border}`,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Extract HTML
              </h3>
              <button
                onClick={() => setShowExtractHtmlModal(false)}
                title="Close"
                style={{
                  width: 30,
                  height: 30,
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: textMuted,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div
              style={{
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 0,
              }}
            >
              <textarea
                value={extractedHtml}
                readOnly
                rows={18}
                style={{
                  width: "100%",
                  minHeight: 360,
                  maxHeight: "56vh",
                  resize: "vertical",
                  padding: "12px 14px",
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 6,
                  background: inputBg,
                  color: textPrimary,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <button
                  onClick={handleCopyExtractedHtml}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    borderRadius: 6,
                    background: "#0969da",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleDownloadExtractedHtml}
                  style={{
                    padding: "8px 14px",
                    border: `1px solid ${border}`,
                    borderRadius: 6,
                    background: "transparent",
                    color: textPrimary,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Download HTML
                </button>
                <button
                  onClick={() => setShowExtractHtmlModal(false)}
                  style={{
                    padding: "8px 14px",
                    border: `1px solid ${border}`,
                    borderRadius: 6,
                    background: "transparent",
                    color: textMuted,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          overflow: tab === "write" ? "auto" : "hidden",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: 12,
              color: textMuted,
            }}
          >
            <Loader2
              size={24}
              style={{ animation: "spin 1s linear infinite" }}
            />
            <span>Loading content…</span>
          </div>
        ) : tab === "write" ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "0 1.5rem 1rem",
            }}
          >
            {/* Quill dark mode override */}
            {dm && (
              <style>{`.ql-toolbar { background: #161b22 !important; border-color: #30363d !important; } .ql-container { border-color: #30363d !important; background: #0e1117; } .ql-editor { color: #c9d1d9 !important; background: #0e1117; } .ql-editor.ql-blank::before { color: #8b949e !important; } .ql-stroke { stroke: #8b949e !important; } .ql-fill { fill: #8b949e !important; } .ql-picker { color: #8b949e !important; } .ql-picker-options { background: #161b22 !important; border-color: #30363d !important; } .ql-picker-item { color: #c9d1d9 !important; }`}</style>
            )}
            {/* Table styles — always injected so tables are visible in both modes */}
            <style>{`
              table.quill-better-table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
                table-layout: fixed;
              }
              table.quill-better-table td {
                border: 1px solid ${dm ? "#555e6b" : "#adb5bd"} !important;
                padding: 6px 10px !important;
                min-width: 60px !important;
                min-height: 28px !important;
                word-break: break-word;
                vertical-align: top;
                color: ${dm ? "#c9d1d9" : "#1a1a1a"};
                background: ${dm ? "#0e1117" : "#ffffff"};
              }
              table.quill-better-table td:focus,
              table.quill-better-table td.qlbt-cell-selected {
                outline: 2px solid #0969da !important;
                background: ${dm ? "#1c2d4a" : "#e8f0fe"} !important;
              }
              .quill-better-table-wrapper {
                overflow-x: auto;
                margin: 8px 0;
              }
              .grammar-block-embed {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                margin: 10px 0;
                padding: 4px 2px;
                color: ${dm ? "#dbeafe" : "#1f2937"};
                font-size: 13px;
                font-weight: 700;
                line-height: 1.4;
                cursor: pointer;
                user-select: none;
              }
              .grammar-block-embed-line {
                flex: 1;
                border-top: 1px solid ${dm ? "#475569" : "#cbd5e1"};
              }
              .grammar-block-embed-label {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                max-width: 100%;
                padding: 3px 8px;
                border: 1px solid ${dm ? "#475569" : "#cbd5e1"};
                border-radius: 4px;
                background: ${dm ? "#111827" : "#f8fafc"};
                white-space: nowrap;
              }
              .grammar-block-delete {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 54px;
                height: 24px;
                padding: 0 10px;
                border: 1px solid ${dm ? "#991b1b" : "#fca5a5"};
                border-radius: 4px;
                background: ${dm ? "#2a1111" : "#fef2f2"};
                color: #ef4444;
                font-size: 12px;
                font-weight: 800;
                line-height: 1;
                cursor: pointer;
                white-space: nowrap;
              }
              .grammar-block-delete:hover {
                background: ${dm ? "#3b1414" : "#fee2e2"};
              }
            `}</style>

            {!sectionOnly && (
              <>
                {ReactQuill && quillModules ? (
                  <ReactQuill
                    ref={(el: any) => {
                      if (el && el !== quillRef) setQuillRef(el);
                    }}
                    theme="snow"
                    value={htmlContent}
                    onChange={(value: string) => {
                      markEditorContentChanged();
                      setHtmlContent(value);
                    }}
                    modules={quillModules}
                    formats={QUILL_FORMATS}
                    placeholder="Start writing your note here… Use the toolbar above for formatting."
                    style={{ flexShrink: 0, marginTop: "1rem" }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2rem",
                      color: textMuted,
                    }}
                  >
                    <Loader2
                      size={20}
                      style={{
                        animation: "spin 1s linear infinite",
                        marginRight: 8,
                      }}
                    />
                    Loading editor…
                  </div>
                )}

                {preambleBlocks.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      borderTop: `1px dashed ${border}`,
                      paddingTop: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: textMuted,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Preamble blocks (Table / Extract)
                      </span>
                      <button
                        onClick={() => setPreambleBlocks([])}
                        title="Remove all preamble blocks"
                        style={{
                          fontSize: 11,
                          color: "#ef4444",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        ✕ Clear all
                      </button>
                    </div>
                    {preambleBlocks.map((block, idx) => (
                      <div
                        key={block.id}
                        style={{
                          marginBottom: 10,
                          borderRadius: 8,
                          border: `1px solid ${border}`,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "4px 10px",
                            background: dm ? "#1c2128" : "#f0f0f0",
                            borderBottom: `1px solid ${border}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: textMuted,
                              fontWeight: 600,
                            }}
                          >
                            {block.type === "box"
                              ? `${block.boxData?.variant === "yellow" ? "Yellow" : "Blue"} Box`
                              : block.type === "table"
                                ? "Vocabulary Table"
                                : "Extract"}{" "}
                            #{idx + 1}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {block.type === "box" && block.boxData && (
                              <button
                                onClick={() => {
                                  setEditingBlock({
                                    sectionId: null,
                                    index: idx,
                                  });
                                  setTargetSectionId(null);
                                  setShowBoxModal(true);
                                }}
                                title="Edit this box"
                                style={{
                                  fontSize: 11,
                                  color: "#b45309",
                                  background: "#f59e0b18",
                                  border: "1px solid #f59e0b44",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  padding: "2px 8px",
                                  fontWeight: 600,
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {block.type === "table" && block.tableData && (
                              <button
                                onClick={() => {
                                  setEditingBlock({
                                    sectionId: null,
                                    index: idx,
                                  });
                                  setTargetSectionId(null);
                                  setShowTableModal(true);
                                }}
                                title="Edit this table"
                                style={{
                                  fontSize: 11,
                                  color: "#2563eb",
                                  background: "#2563eb18",
                                  border: "1px solid #2563eb44",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  padding: "2px 8px",
                                  fontWeight: 600,
                                }}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {block.type === "extract" && block.extractData && (
                              <button
                                onClick={() => {
                                  setEditingBlock({
                                    sectionId: null,
                                    index: idx,
                                  });
                                  setTargetSectionId(null);
                                  setShowExtractModal(true);
                                }}
                                title="Edit this extract"
                                style={{
                                  fontSize: 11,
                                  color: "#059669",
                                  background: "#05966918",
                                  border: "1px solid #05966944",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  padding: "2px 8px",
                                  fontWeight: 600,
                                }}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setPreambleBlocks((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                              title="Remove this block"
                              style={{
                                fontSize: 11,
                                color: "#ef4444",
                                background: "#ef444418",
                                border: "1px solid #ef444444",
                                borderRadius: 4,
                                cursor: "pointer",
                                padding: "2px 8px",
                                fontWeight: 600,
                              }}
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBlock({ sectionId: null, index: idx });
                            setTargetSectionId(null);
                            if (block.type === "box") setShowBoxModal(true);
                            if (block.type === "table") setShowTableModal(true);
                            if (block.type === "extract")
                              setShowExtractModal(true);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px 12px",
                            border: "none",
                            background: dm ? "#10151d" : "#f8fafc",
                            color: textPrimary,
                            fontSize: 13,
                            fontWeight: 700,
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          {getBlockPlaceholderLabel(block, idx + 1)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Section cards ── */}
            {[...editorSections]
              .sort((a, b) => a.slNo - b.slNo)
              .map((sec) => (
                <div
                  key={sec.id}
                  style={{
                    marginTop: 16,
                    border: `1px solid ${dm ? "#30363d" : "#e5e7eb"}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    marginBottom: 16,
                  }}
                >
                  {/* Section header bar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 14px",
                      background: dm ? "#1c2128" : "#ffa90a18",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: textPrimary,
                        fontSize: 14,
                      }}
                    >
                      <span style={{ color: "#ffa90a", marginRight: 6 }}>
                        {sec.slNo}.
                      </span>
                      {sec.heading}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditingSectionId(sec.id);
                          setShowSectionModal(true);
                        }}
                        title="Edit section heading"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#2563eb",
                          fontSize: 14,
                          padding: "2px 4px",
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => {
                          markEditorContentChanged();
                          setEditorSections((prev) =>
                            prev.filter((s) => s.id !== sec.id),
                          );
                        }}
                        disabled={sectionOnly && editorSections.length === 1}
                        title={
                          sectionOnly && editorSections.length === 1
                            ? "Every note must contain at least one Section"
                            : "Delete section"
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor:
                            sectionOnly && editorSections.length === 1
                              ? "not-allowed"
                              : "pointer",
                          color: "#ef4444",
                          fontSize: 14,
                          padding: "2px 4px",
                          opacity:
                            sectionOnly && editorSections.length === 1
                              ? 0.35
                              : 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {ReactQuill ? (
                    <div
                      onClickCapture={(event) => {
                        const target = getEventElement(event.target);
                        if (!target) return;
                        const placeholder = target.closest(
                          "[data-grammar-block-id]",
                        ) as HTMLElement | null;
                        if (!placeholder) return;
                        const blockId = placeholder?.getAttribute(
                          "data-grammar-block-id",
                        );
                        const attributedBlockIndex = blockId
                          ? sec.blocks.findIndex(
                              (block) => block.id === blockId,
                            )
                          : -1;
                        const textBlockIndex = getBlockPlaceholderIndexFromText(
                          (placeholder || target.closest("p") || target)
                            .textContent || "",
                        );
                        const blockIndex =
                          attributedBlockIndex !== -1
                            ? attributedBlockIndex
                            : (textBlockIndex ?? -1);
                        if (blockIndex === -1) return;
                        const block = sec.blocks[blockIndex];
                        event.preventDefault();
                        event.stopPropagation();
                        if (target.closest("[data-grammar-block-delete]")) {
                          markEditorContentChanged();
                          const quill = getSectionQuill(sec.id);
                          const quillConstructor = quill?.constructor as any;
                          const blot = quillConstructor?.find?.(placeholder);
                          if (quill && blot) {
                            const index = quill.getIndex(blot);
                            quill.deleteText(index, 1, "user");
                          } else {
                            placeholder.remove();
                          }
                          setEditorSections((prev) =>
                            prev.map((section) =>
                              section.id === sec.id
                                ? {
                                    ...section,
                                    blocks: section.blocks.filter(
                                      (item) => item.id !== block.id,
                                    ),
                                  }
                                : section,
                            ),
                          );
                          return;
                        }
                        setEditingBlock({
                          sectionId: sec.id,
                          index: blockIndex,
                        });
                        setTargetSectionId(sec.id);
                        if (block.type === "box") setShowBoxModal(true);
                        if (block.type === "table") setShowTableModal(true);
                        if (block.type === "extract") setShowExtractModal(true);
                      }}
                    >
                      <ReactQuill
                        ref={(el: any) => {
                          if (el) sectionQuillRefs.current[sec.id] = el;
                          else delete sectionQuillRefs.current[sec.id];
                        }}
                        theme="snow"
                        value={sec.quillHtml}
                        onChange={(value: string) => {
                          markEditorContentChanged();
                          setEditorSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id ? { ...s, quillHtml: value } : s,
                            ),
                          );
                        }}
                        onFocus={(range: any) =>
                          rememberSectionSelection(sec.id, range)
                        }
                        onChangeSelection={(range: any) =>
                          rememberSectionSelection(sec.id, range)
                        }
                        modules={RICH_TEXT_MODULES}
                        formats={QUILL_FORMATS}
                        placeholder={`Write content for "${sec.heading}"…`}
                        className="grammar-section-editor"
                      />
                    </div>
                  ) : (
                    <div style={{ padding: "2rem", color: textMuted }}>
                      Loading editor…
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflowY: sectionOnly ? "hidden" : "auto",
              background: previewBg,
            }}
          >
            {sectionOnly ? (
              previewLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 300,
                    color: textMuted,
                  }}
                >
                  <Loader2
                    size={22}
                    style={{
                      animation: "spin 1s linear infinite",
                      marginRight: 8,
                    }}
                  />
                  Compiling preview…
                </div>
              ) : previewError ? (
                <div className="alert alert-error" style={{ margin: "1.5rem" }}>
                  {previewError}
                </div>
              ) : compiledPreviewHtml ? (
                <iframe
                  title="Compiled grammar note preview"
                  srcDoc={compiledPreviewHtml}
                  sandbox="allow-scripts allow-same-origin"
                  style={{
                    display: "block",
                    flex: 1,
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    border: "none",
                    background: "#f9f5f0",
                  }}
                />
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: textMuted,
                  }}
                >
                  Nothing to preview yet — write something first.
                </div>
              )
            ) : (
              (() => {
                const sortedSections = [...editorSections].sort(
                  (a, b) => a.slNo - b.slNo,
                );
                const tocHtml =
                  sortedSections.length > 0
                    ? `<aside class="note-preview-sidebar">
                    <div class="note-preview-sidebar-title">Table of Contents</div>
                    <nav class="note-preview-sidebar-nav">
                      ${sortedSections
                        .map(
                          (s, idx) => `
                        <a href="#preview-section-${s.slNo}" class="note-preview-sidebar-link">
                          <span class="note-preview-sidebar-icon">${idx === 0 ? "🏠" : "🔖"}</span>
                          <span>${s.heading}</span>
                        </a>
                      `,
                        )
                        .join("")}
                    </nav>
                  </aside>`
                    : "";
                const allSectionsHtml = sortedSections
                  .map(
                    (s) =>
                      `<section class="note-preview-section"><h2 id="preview-section-${s.slNo}">${s.heading}</h2><div>${compilePlaceholdersToBlocks(s.quillHtml, s.blocks)}</div></section>`,
                  )
                  .join("");
                const fullHtml = `
                <div class="note-preview-page ${sortedSections.length > 0 ? "has-sidebar" : ""}">
                  ${tocHtml}
                  <article class="article note-preview-article">
                    ${htmlContent}
                    ${preambleBlocksHtml}
                    ${allSectionsHtml}
                  </article>
                </div>
              `;
                return isEmpty(fullHtml) ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "3rem",
                      color: textMuted,
                    }}
                  >
                    Nothing to preview yet — write something first.
                  </div>
                ) : (
                  <div
                    className="note-preview note-preview-document"
                    dangerouslySetInnerHTML={{ __html: fullHtml }}
                  />
                );
              })()
            )}
          </div>
        )}
      </div>

      {/* ── Insert-block modals ── */}
      {showSectionModal && (
        <SectionModal
          onInsert={(sec) => {
            markEditorContentChanged();
            if (editingSectionId !== null) {
              // Update existing section heading/slNo, preserve content
              setEditorSections((prev) =>
                prev.map((s) =>
                  s.id === editingSectionId
                    ? { ...s, slNo: sec.slNo, heading: sec.heading }
                    : s,
                ),
              );
              setEditingSectionId(null);
            } else {
              // Add new section with empty content
              setEditorSections((prev) => [
                ...prev,
                { ...sec, quillHtml: "", blocks: [] },
              ]);
            }
          }}
          onClose={() => {
            setShowSectionModal(false);
            setEditingSectionId(null);
          }}
          darkMode={darkMode}
          initialData={
            editingSectionId !== null
              ? (() => {
                  const s = editorSections.find(
                    (section) => section.id === editingSectionId,
                  );
                  return s
                    ? { id: s.id, slNo: s.slNo, heading: s.heading }
                    : undefined;
                })()
              : undefined
          }
          usedSlNos={editorSections
            .filter((section) => section.id !== editingSectionId)
            .map((section) => section.slNo)}
        />
      )}
      {showBoxModal && (
        <BoxModal
          onInsert={(html, boxData) => {
            markEditorContentChanged();
            if (editingBlock !== null) {
              if (editingBlock.sectionId === null) {
                setPreambleBlocks((prev) =>
                  prev.map((block, index) =>
                    index === editingBlock.index
                      ? { ...block, html, boxData }
                      : block,
                  ),
                );
              } else {
                setEditorSections((prev) =>
                  prev.map((s) =>
                    s.id === editingBlock.sectionId
                      ? {
                          ...s,
                          blocks: s.blocks.map((block, index) =>
                            index === editingBlock.index
                              ? { ...block, html, boxData }
                              : block,
                          ),
                        }
                      : s,
                  ),
                );
              }
              setEditingBlock(null);
            } else {
              appendBlockToTargetSection(
                html,
                "box",
                undefined,
                undefined,
                boxData,
              );
            }
          }}
          onClose={() => {
            setShowBoxModal(false);
            setEditingBlock(null);
            setTargetSectionId(null);
          }}
          darkMode={darkMode}
          RichTextEditor={ReactQuill}
          initialData={
            editingBlock !== null
              ? editingBlock.sectionId === null
                ? preambleBlocks[editingBlock.index]?.boxData
                : editorSections.find(
                    (section) => section.id === editingBlock.sectionId,
                  )?.blocks[editingBlock.index]?.boxData
              : undefined
          }
        />
      )}
      {showTableModal && (
        <VocabTableModal
          onInsert={(html, tableData) => {
            markEditorContentChanged();
            if (editingBlock !== null) {
              if (editingBlock.sectionId === null) {
                setPreambleBlocks((prev) =>
                  prev.map((block, index) =>
                    index === editingBlock.index
                      ? { ...block, html, tableData }
                      : block,
                  ),
                );
              } else {
                setEditorSections((prev) =>
                  prev.map((s) =>
                    s.id === editingBlock.sectionId
                      ? {
                          ...s,
                          blocks: s.blocks.map((b, i) =>
                            i === editingBlock.index
                              ? { ...b, html, tableData }
                              : b,
                          ),
                        }
                      : s,
                  ),
                );
              }
              setEditingBlock(null);
            } else {
              appendBlockToTargetSection(html, "table", tableData, undefined);
            }
          }}
          onClose={() => {
            setShowTableModal(false);
            setEditingBlock(null);
            setTargetSectionId(null);
          }}
          darkMode={darkMode}
          initialData={
            editingBlock !== null
              ? editingBlock.sectionId === null
                ? preambleBlocks[editingBlock.index]?.tableData
                : editorSections.find((s) => s.id === editingBlock.sectionId)
                    ?.blocks[editingBlock.index]?.tableData
              : undefined
          }
        />
      )}
      {showExtractModal && (
        <ExtractModal
          onInsert={(html, extractData) => {
            markEditorContentChanged();
            if (editingBlock !== null) {
              if (editingBlock.sectionId === null) {
                setPreambleBlocks((prev) =>
                  prev.map((block, index) =>
                    index === editingBlock.index
                      ? { ...block, html, extractData }
                      : block,
                  ),
                );
              } else {
                setEditorSections((prev) =>
                  prev.map((s) =>
                    s.id === editingBlock.sectionId
                      ? {
                          ...s,
                          blocks: s.blocks.map((b, i) =>
                            i === editingBlock.index
                              ? { ...b, html, extractData }
                              : b,
                          ),
                        }
                      : s,
                  ),
                );
              }
              setEditingBlock(null);
            } else {
              appendBlockToTargetSection(
                html,
                "extract",
                undefined,
                extractData,
              );
            }
          }}
          onClose={() => {
            setShowExtractModal(false);
            setEditingBlock(null);
            setTargetSectionId(null);
          }}
          darkMode={darkMode}
          RichTextEditor={ReactQuill}
          initialData={
            editingBlock !== null
              ? editingBlock.sectionId === null
                ? preambleBlocks[editingBlock.index]?.extractData
                : editorSections.find((s) => s.id === editingBlock.sectionId)
                    ?.blocks[editingBlock.index]?.extractData
              : undefined
          }
        />
      )}
    </div>
  );
}
// ─── Notes View ───────────────────────────────────────────────────────────────

function NotesView({
  subtopic,
  onBack,
  onOpenEditor,
  showToast,
}: {
  subtopic: Subtopic;
  onBack: () => void;
  onOpenEditor: (state: {
    existingNote: Note | null;
    translationFor: Note | null;
    takenLangs: string[];
    translations: Note[];
    initialKnownLang?: string;
  }) => void;
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
      const r = await api.get(`/admin/${apiPrefix}/notes`, {
        params: { subtopic_id: subtopic.id },
      });
      setNotes(r.data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [subtopic.id, apiPrefix]);

  useEffect(() => {
    load();
  }, [load]);
  // Group notes by concept_id
  const grouped = notes.reduce<Record<string, Note[]>>((acc, n) => {
    if (!acc[n.concept_id]) acc[n.concept_id] = [];
    acc[n.concept_id].push(n);
    return acc;
  }, {});
  const grammarConceptId = notes[0]?.concept_id;
  const grammarPages = grammarConceptId
    ? notes.filter((note) => note.concept_id === grammarConceptId)
    : [];
  const grammarPageForLang = (code: string) =>
    grammarPages.find((note) => note.known_lang === code) || null;

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/${apiPrefix}/notes/${confirmDelete.id}`);
      showToast(true, "Note deleted");
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || "Delete failed");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const langLabel = (code: string) =>
    KNOWN_LANGS.find((l) => l.code === code)?.label || code.toUpperCase();

  return (
    <div>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: "0.5rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 14,
          }}
        >
          <ChevronLeft size={16} /> Back to subtopics
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>{subtopic.name_en}</h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {apiPrefix === "grammar"
              ? "Language Pages"
              : "Notes & Translations"}
          </p>
        </div>
        {!loading && (apiPrefix !== "grammar" || notes.length === 0) && (
          <button
            className="btn btn-primary"
            onClick={() =>
              onOpenEditor({
                existingNote: null,
                translationFor: null,
                takenLangs: [],
                translations: [],
              })
            }
          >
            <Plus size={16} style={{ display: "inline", marginRight: 6 }} />{" "}
            Create Note
          </button>
        )}
      </div>

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-muted)",
          }}
        >
          <Loader2
            size={24}
            style={{
              animation: "spin 1s linear infinite",
              margin: "0 auto 8px",
              display: "block",
            }}
          />
          {apiPrefix === "grammar"
            ? "Loading language pages..."
            : "Loading notes..."}
        </div>
      ) : apiPrefix === "grammar" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          {grammarPages.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "4rem",
                color: "var(--text-muted)",
                border: "2px dashed var(--border)",
                borderRadius: 12,
              }}
            >
              <Globe
                size={40}
                style={{
                  opacity: 0.3,
                  margin: "0 auto 12px",
                  display: "block",
                }}
              />
              <p style={{ fontWeight: 600, marginBottom: 8 }}>
                No language pages yet
              </p>
              <p style={{ fontSize: 13, marginBottom: 16 }}>
                Create the first grammar language page for this subtopic.
              </p>
              <button
                className="btn btn-primary"
                onClick={() =>
                  onOpenEditor({
                    existingNote: null,
                    translationFor: null,
                    takenLangs: [],
                    translations: [],
                  })
                }
              >
                <Plus size={14} style={{ display: "inline", marginRight: 6 }} />{" "}
                Create English Page
              </button>
            </div>
          )}
          {grammarPages.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
              }}
            >
              {KNOWN_LANGS.map((lang) => {
                const page = grammarPageForLang(lang.code);
                return (
                  <div
                    key={lang.code}
                    className="card"
                    style={{
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{lang.label}</div>
                        <div
                          style={{ fontSize: 12, color: "var(--text-muted)" }}
                        >
                          {page ? page.title || "Untitled" : "Not created"}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          borderRadius: 999,
                          padding: "3px 8px",
                          background: page ? "#2ea04322" : "var(--bg)",
                          color: page ? "#2ea043" : "var(--text-muted)",
                        }}
                      >
                        {page ? "READY" : "EMPTY"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {page ? (
                        <>
                          <a
                            href={`${(api.defaults as any).baseURL || "http://localhost:8000/api"}/admin/${apiPrefix}/notes/${page.id}/html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              ...iconBtn("#2ea043"),
                              textDecoration: "none",
                            }}
                            title="Preview language page"
                          >
                            <ExternalLink size={14} />
                          </a>
                          <button
                            title="Edit language page"
                            onClick={() =>
                              onOpenEditor({
                                existingNote: page,
                                translationFor: null,
                                takenLangs: [],
                                translations: grammarPages,
                              })
                            }
                            style={iconBtn("#f59e0b")}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            title="Delete language page"
                            onClick={() => setConfirmDelete(page)}
                            style={iconBtn("#ef4444")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() =>
                            onOpenEditor({
                              existingNote: null,
                              translationFor: grammarPages[0],
                              takenLangs: grammarPages.map((n) => n.known_lang),
                              translations: grammarPages,
                              initialKnownLang: lang.code,
                            })
                          }
                          style={{
                            ...iconBtn("#1f6feb"),
                            width: "auto",
                            padding: "0 12px",
                            gap: 6,
                            fontSize: 13,
                          }}
                        >
                          <Plus size={14} /> Add Page
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem",
            color: "var(--text-muted)",
            border: "2px dashed var(--border)",
            borderRadius: 12,
          }}
        >
          <Globe
            size={40}
            style={{ opacity: 0.3, margin: "0 auto 12px", display: "block" }}
          />
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No notes yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            Create the first note for this subtopic.
          </p>
          <button
            className="btn btn-primary"
            onClick={() =>
              onOpenEditor({
                existingNote: null,
                translationFor: null,
                takenLangs: [],
                translations: [],
              })
            }
          >
            <Plus size={14} style={{ display: "inline", marginRight: 6 }} />{" "}
            Create Note
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {Object.entries(grouped).map(([conceptId, conceptNotes]) => (
            <div
              key={conceptId}
              className="card"
              style={{ padding: "1.25rem" }}
            >
              {/* Concept header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    {conceptNotes[0].title || conceptId}
                  </h3>
                  <code style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {conceptId}
                  </code>
                </div>
                <button
                  onClick={() =>
                    onOpenEditor({
                      existingNote: null,
                      translationFor: conceptNotes[0],
                      takenLangs: conceptNotes.map((n) => n.known_lang),
                      translations: conceptNotes,
                    })
                  }
                  style={{
                    ...iconBtn("#1f6feb"),
                    width: "auto",
                    padding: "0 12px",
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <Plus size={14} /> Add Translation
                </button>
              </div>

              {/* Translations list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {conceptNotes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--bg)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          background: "rgba(31,111,235,0.15)",
                          color: "#60a5fa",
                          borderRadius: 4,
                          padding: "2px 8px",
                        }}
                      >
                        {langLabel(note.known_lang)}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--text)" }}>
                        {note.title || "Untitled"}
                      </span>
                      {!note.is_active && (
                        <span
                          style={{
                            fontSize: 11,
                            background: "#ef444422",
                            color: "#ef4444",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontWeight: 600,
                          }}
                        >
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      {/* Preview link — always available via the serve endpoint */}
                      <a
                        href={`${(api.defaults as any).baseURL || "http://localhost:8000/api"}/admin/${apiPrefix}/notes/${note.id}/html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...iconBtn("#2ea043"),
                          textDecoration: "none",
                        }}
                        title="Preview compiled note"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {/* Edit */}
                      <button
                        title="Edit"
                        onClick={() =>
                          onOpenEditor({
                            existingNote: note,
                            translationFor: null,
                            takenLangs: [],
                            translations: conceptNotes,
                          })
                        }
                        style={iconBtn("#f59e0b")}
                      >
                        <Pencil size={14} />
                      </button>
                      {/* Delete */}
                      <button
                        title="Delete"
                        onClick={() => setConfirmDelete(note)}
                        style={iconBtn("#ef4444")}
                      >
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

function SubtopicsView({
  topic,
  onBack,
  onSelectSubtopic,
  showToast,
}: {
  topic: Topic;
  onBack: () => void;
  onSelectSubtopic: (s: Subtopic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Subtopic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/${apiPrefix}/subtopics`, {
        params: { topic_id: topic.id },
      });
      setSubtopics(r.data.subtopics || []);
    } catch {
      setSubtopics([]);
    } finally {
      setLoading(false);
    }
  }, [topic.id, apiPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/${apiPrefix}/subtopics`, {
        topic_id: topic.id,
        name_en: newName.trim(),
      });
      showToast(true, `Created "${newName}"`);
      setNewName("");
      setCreating(false);
      load();
    } catch (e: any) {
      showToast(false, e.response?.data?.detail || "Create failed");
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
      showToast(false, e.response?.data?.detail || "Delete failed");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleOpenPreview = async (subtopic: Subtopic) => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      showToast(false, "Allow pop-ups to open the note in a new page");
      return;
    }

    previewWindow.opener = null;
    previewWindow.document.title = "Loading note...";
    previewWindow.document.body.textContent = "Loading note...";
    setPreviewLoadingId(subtopic.id);

    try {
      const response = await api.get("/admin/grammar/notes", {
        params: { subtopic_id: subtopic.id },
      });
      const notes: Note[] = response.data.notes || [];
      const canonicalConceptId = notes[0]?.concept_id;
      const translations = notes.filter(
        (note) => note.concept_id === canonicalConceptId,
      );
      const preferred =
        translations.find((note) => note.known_lang === "en") ||
        translations[0];

      if (!preferred) {
        throw new Error("This subtopic does not have a saved note yet");
      }

      const apiBase =
        (api.defaults as any).baseURL || "http://localhost:8000/api";
      previewWindow.location.replace(
        `${apiBase}/admin/grammar/notes/${preferred.id}/html`,
      );
    } catch (error: any) {
      previewWindow.close();
      showToast(
        false,
        error.response?.data?.detail || error.message || "Failed to open note",
      );
    } finally {
      setPreviewLoadingId(null);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: "0.5rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 14,
          }}
        >
          <ChevronLeft size={16} /> Back to topics
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>{topic.name_en}</h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {topic.level_code} ·{" "}
            {LANGUAGES.find((l) => l.code === topic.learning_lang)?.label ||
              topic.learning_lang}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: "inline", marginRight: 6 }} /> Add
          Subtopic
        </button>
      </div>

      {/* Inline create form */}
      {creating && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            padding: "1rem",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            className="form-control"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder='e.g. "Perfect Nouns"'
            style={{ flex: 1, fontSize: 14 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
          >
            {saving ? "Saving..." : "Create"}
          </button>
          <button
            className="btn"
            style={{
              background: "var(--card-bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-muted)",
          }}
        >
          <Loader2
            size={24}
            style={{
              animation: "spin 1s linear infinite",
              margin: "0 auto 8px",
              display: "block",
            }}
          />
        </div>
      ) : subtopics.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem",
            color: "var(--text-muted)",
            border: "2px dashed var(--border)",
            borderRadius: 12,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No subtopics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            Add subtopics like "Perfect Nouns", "Plural Forms", etc.
          </p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: "inline", marginRight: 6 }} /> Add
            Subtopic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          >
            <thead>
              <tr
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 50,
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Subtopic
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 100,
                  }}
                >
                  Notes
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 120,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {subtopics.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.02)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  onClick={() => onSelectSubtopic(s)}
                >
                  <td
                    style={{ padding: "12px 16px", color: "var(--text-muted)" }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                    {s.name_en}
                  </td>
                  <td
                    style={{ padding: "12px 16px", color: "var(--text-muted)" }}
                  >
                    <span
                      style={{
                        background: "rgba(31,111,235,0.12)",
                        color: "#60a5fa",
                        borderRadius: 12,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {s.notes_count}
                    </span>
                  </td>
                  <td
                    style={{ padding: "12px 16px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        title="Open"
                        onClick={() => onSelectSubtopic(s)}
                        style={iconBtn("#60a5fa")}
                      >
                        <Eye size={14} />
                      </button>
                      {apiPrefix === "grammar" && s.notes_count > 0 && (
                        <button
                          title="Open saved note in a new page"
                          onClick={() => handleOpenPreview(s)}
                          disabled={previewLoadingId === s.id}
                          style={iconBtn("#2ea043")}
                        >
                          {previewLoadingId === s.id ? (
                            <Loader2
                              size={14}
                              style={{ animation: "spin 1s linear infinite" }}
                            />
                          ) : (
                            <ExternalLink size={14} />
                          )}
                        </button>
                      )}
                      <button
                        title="Delete"
                        onClick={() => setConfirmDelete(s)}
                        style={iconBtn("#ef4444")}
                      >
                        <Trash2 size={14} />
                      </button>
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
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}

// ─── Topics View ──────────────────────────────────────────────────────────────

function TopicsView({
  learningLang,
  levelCode,
  onSelectTopic,
  showToast,
}: {
  learningLang: string;
  levelCode: string;
  onSelectTopic: (t: Topic) => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const apiPrefix = useContext(ApiPrefixContext);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/${apiPrefix}/topics`, {
        params: { learning_lang: learningLang, level_code: levelCode },
      });
      setTopics(r.data.topics || []);
    } catch {
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [learningLang, levelCode, apiPrefix]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/${apiPrefix}/topics`, {
        name_en: newName.trim(),
        learning_lang: learningLang,
        level_code: levelCode,
      });
      showToast(true, `Created "${newName}"`);
      setNewName("");
      setCreating(false);
      load();
    } catch (e: any) {
      showToast(
        false,
        e.response?.data?.detail ||
          "Create failed — run the DB migration first",
      );
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
      showToast(false, e.response?.data?.detail || "Delete failed");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Topics</h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {LANGUAGES.find((l) => l.code === learningLang)?.label ||
              learningLang}{" "}
            · {levelCode}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} style={{ display: "inline", marginRight: 6 }} /> Add
          Topic
        </button>
      </div>

      {creating && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            padding: "1rem",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            className="form-control"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder='e.g. "Nouns", "Verbs", "Tenses"'
            style={{ flex: 1, fontSize: 14 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
          >
            {saving ? "Saving..." : "Create"}
          </button>
          <button
            className="btn"
            style={{
              background: "var(--card-bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-muted)",
          }}
        >
          <Loader2
            size={24}
            style={{
              animation: "spin 1s linear infinite",
              margin: "0 auto 8px",
              display: "block",
            }}
          />
        </div>
      ) : topics.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem",
            color: "var(--text-muted)",
            border: "2px dashed var(--border)",
            borderRadius: 12,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No topics yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            {loading
              ? ""
              : 'Add your first topic from the syllabus, e.g. "Nouns", "Verbs", "Articles".'}
          </p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: "inline", marginRight: 6 }} /> Add
            Topic
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
          >
            <thead>
              <tr
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 50,
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Topic
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 120,
                  }}
                >
                  Subtopics
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    width: 120,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t, i) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.02)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  onClick={() => onSelectTopic(t)}
                >
                  <td
                    style={{ padding: "12px 16px", color: "var(--text-muted)" }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                    {t.name_en}
                  </td>
                  <td
                    style={{ padding: "12px 16px", color: "var(--text-muted)" }}
                  >
                    <span
                      style={{
                        background: "rgba(31,111,235,0.12)",
                        color: "#60a5fa",
                        borderRadius: 12,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {t.subtopics_count}
                    </span>
                  </td>
                  <td
                    style={{ padding: "12px 16px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        title="Open"
                        onClick={() => onSelectTopic(t)}
                        style={iconBtn("#60a5fa")}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => setConfirmDelete(t)}
                        style={iconBtn("#ef4444")}
                      >
                        <Trash2 size={14} />
                      </button>
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
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteLoading}
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
  apiPrefix?: "grammar" | "stories";
}

export default function ContentManager({
  pageTitle,
  pageDescription,
  apiPrefix = "grammar",
}: ContentManagerProps) {
  const [learningLang, setLearningLang] = useState("fr");
  const [levelCode, setLevelCode] = useState("A1");
  const [view, setView] = useState<View>("topics");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<Subtopic | null>(
    null,
  );
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
  }, []);

  // Reset drill-down when language/level changes
  const handleLangChange = (lang: string) => {
    setLearningLang(lang);
    setView("topics");
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };
  const handleLevelChange = (level: string) => {
    setLevelCode(level);
    setView("topics");
    setSelectedTopic(null);
    setSelectedSubtopic(null);
  };

  return (
    <ApiPrefixContext.Provider value={apiPrefix}>
      <div>
        <h1>{pageTitle}</h1>
        <p
          style={{
            color: "var(--text-muted)",
            marginBottom: "2rem",
            fontSize: 15,
          }}
        >
          {pageDescription}
        </p>

        {/* Language + Level selectors */}
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "center",
            marginBottom: "2rem",
            padding: "1.25rem 1.5rem",
            background: "var(--card-bg)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-muted)",
                fontSize: 14,
                minWidth: 120,
              }}
            >
              Learning Language
            </span>
            <select
              className="form-control"
              value={learningLang}
              onChange={(e) => handleLangChange(e.target.value)}
              style={{ width: 180, fontSize: 14 }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-muted)",
                fontSize: 14,
                minWidth: 100,
              }}
            >
              CEFR Level
            </span>
            <select
              className="form-control"
              value={levelCode}
              onChange={(e) => handleLevelChange(e.target.value)}
              style={{ width: 180, fontSize: 14 }}
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Breadcrumb trail */}
          {(view === "subtopics" || view === "notes" || view === "editor") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--text-muted)",
                marginLeft: "auto",
              }}
            >
              <button
                onClick={() => {
                  setView("topics");
                  setSelectedTopic(null);
                  setSelectedSubtopic(null);
                  setEditorState(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--accent)",
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Topics
              </button>
              {selectedTopic && (
                <>
                  <span>/</span>
                  <button
                    onClick={() => {
                      setView("subtopics");
                      setSelectedSubtopic(null);
                      setEditorState(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color:
                        view === "notes" || view === "editor"
                          ? "var(--accent)"
                          : "var(--white)",
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    {selectedTopic.name_en}
                  </button>
                </>
              )}
              {selectedSubtopic && (view === "notes" || view === "editor") && (
                <>
                  <span>/</span>
                  <button
                    onClick={() => {
                      setView("notes");
                      setEditorState(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color:
                        view === "editor" ? "var(--accent)" : "var(--white)",
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    {selectedSubtopic.name_en}
                  </button>
                </>
              )}
              {view === "editor" && editorState && (
                <>
                  <span>/</span>
                  <span style={{ color: "var(--white)" }}>
                    {editorState.existingNote
                      ? "Edit"
                      : apiPrefix === "grammar"
                        ? "Create Page"
                        : editorState.translationFor
                          ? "Translate"
                          : "Create"}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* DB migration warning banner — shown when API returns 500/table not found */}
        <div
          id="db-warning"
          style={{ display: "none", marginBottom: "1rem" }}
        />

        {/* Views */}
        {view === "topics" && (
          <TopicsView
            learningLang={learningLang}
            levelCode={levelCode}
            onSelectTopic={(t) => {
              setSelectedTopic(t);
              setView("subtopics");
            }}
            showToast={showToast}
          />
        )}
        {view === "subtopics" && selectedTopic && (
          <SubtopicsView
            topic={selectedTopic}
            onBack={() => {
              setView("topics");
              setSelectedTopic(null);
            }}
            onSelectSubtopic={(s) => {
              setSelectedSubtopic(s);
              setView("notes");
            }}
            showToast={showToast}
          />
        )}
        {view === "notes" && selectedSubtopic && selectedTopic && (
          <NotesView
            subtopic={selectedSubtopic}
            onBack={() => {
              setView("subtopics");
              setSelectedSubtopic(null);
            }}
            onOpenEditor={({
              existingNote,
              translationFor,
              takenLangs,
              translations,
              initialKnownLang,
            }) => {
              setEditorState({
                subtopicId: selectedSubtopic.id,
                subtopicName: selectedSubtopic.name_en,
                learningLang,
                levelCode,
                existingNote,
                translationFor,
                takenLangs,
                translations,
                initialKnownLang,
              });
              setView("editor");
            }}
            showToast={showToast}
          />
        )}
        {view === "editor" &&
          editorState &&
          selectedSubtopic &&
          (apiPrefix === "stories" &&
          editorState.existingNote?.s3_key === null ? (
            <StoryEditor
              exerciseId={editorState.existingNote.concept_id}
              onClose={() => {
                setView("notes");
                setEditorState(null);
              }}
              onSaved={() => {
                setView("notes");
                setEditorState(null);
              }}
              showToast={showToast}
            />
          ) : (
            <NoteEditorView
              key={
                editorState.existingNote
                  ? `note-${editorState.existingNote.id}`
                  : editorState.translationFor
                    ? `translation-${editorState.translationFor.concept_id}-${editorState.initialKnownLang || "next"}`
                    : "new-note"
              }
              subtopicId={editorState.subtopicId}
              subtopicName={editorState.subtopicName}
              learningLang={editorState.learningLang}
              levelCode={editorState.levelCode}
              existingNote={editorState.existingNote}
              translationFor={editorState.translationFor}
              takenLangs={editorState.takenLangs}
              translations={editorState.translations}
              initialKnownLang={editorState.initialKnownLang}
              onSelectTranslation={(note) =>
                setEditorState((prev) =>
                  prev
                    ? {
                        ...prev,
                        existingNote: note,
                        translationFor: null,
                        takenLangs: [],
                      }
                    : prev,
                )
              }
              onAddTranslation={(source, existingLangs) =>
                setEditorState((prev) =>
                  prev
                    ? {
                        ...prev,
                        existingNote: null,
                        translationFor: source,
                        takenLangs: existingLangs,
                      }
                    : prev,
                )
              }
              onClose={() => {
                setEditorState(null);
                if (apiPrefix === "grammar") {
                  setView("notes");
                } else {
                  setView("notes");
                }
              }}
              onSaved={() => {
                setEditorState(null);
                if (apiPrefix === "grammar") {
                  setView("notes");
                } else {
                  setView("notes");
                }
              }}
              showToast={showToast}
            />
          ))}

        {toast && (
          <Toast ok={toast.ok} msg={toast.msg} onDone={() => setToast(null)} />
        )}
      </div>
    </ApiPrefixContext.Provider>
  );
}
