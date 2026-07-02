export interface TableCellData {
  text: string;
  tooltip: string;
  audioUrl: string;
  tts: boolean;
}

export interface TableRowData {
  cells: TableCellData[];
}

export interface TableBlockData {
  headers: string[];
  rows: TableRowData[];
}

export const TABLE_CARD_RADIUS = 18;
export const TABLE_ARROW_CELL_WIDTH = 56;
export const TABLE_CELL_MIN_WIDTH = 220;
export const TABLE_ICON_SIZE = 17;
export const TABLE_HEADER_CELL_PADDING = '24px 30px';
export const TABLE_BODY_CELL_PADDING = '24px 30px';
export const TABLE_HEADER_FONT_SIZE = '0.84rem';
export const TABLE_HEADER_LETTER_SPACING = '0.11em';
export const TABLE_BODY_FONT_SIZE = '1rem';
export const TABLE_BODY_LINE_HEIGHT = '1.5';
export const TABLE_AUDIO_GAP = 10;
export const TABLE_SURFACE_BORDER = '#e7ded2';
export const TABLE_HEADER_BG = 'linear-gradient(180deg, #ffd78a 0%, #ffcf73 100%)';
export const TABLE_HEADER_TEXT = '#3d2817';
export const TABLE_ROW_ALT_BG = '#fff8e8';
export const TABLE_ROW_BG = '#ffffff';
export const TABLE_CELL_TEXT = '#24324a';
export const TABLE_TOOLTIP_TEXT = '#1f5fbf';
export const TABLE_ACCENT = '#f59e0b';
export const TABLE_ARROW_TEXT = '#d8b06e';
export const TABLE_AUDIO_COLOR = '#e3abc6';
export const TABLE_SHADOW = '0 12px 30px rgba(61, 40, 23, 0.07)';

interface ParsedCsvTable {
  headers: string[];
  rows: string[][];
}

type ColumnField = 'text' | 'tooltip' | 'tts' | 'audioUrl';

interface ColumnDescriptor {
  header: string;
  field: ColumnField;
  index: number;
}

interface ColumnGroup {
  key: string;
  label: string;
  textIndex?: number;
  tooltipIndex?: number;
  ttsIndex?: number;
  audioUrlIndex?: number;
}

const TOOLTIP_SUFFIXES = ['hover', 'tooltip'];
const TTS_SUFFIXES = ['tts'];
const AUDIO_SUFFIXES = ['audio', 'audio url', 'audiourl', 'audio_url', 'sound', 'voice'];
const TEXT_SUFFIXES = ['text', 'value'];

function parseCsv(text: string): ParsedCsvTable {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  const nonEmptyRows = rows.filter(row => row.some(cell => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  return {
    headers: nonEmptyRows[0].map(cell => cell.trim()),
    rows: nonEmptyRows.slice(1),
  };
}

function normalizeToken(value: string): string {
  return value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function stripSuffix(source: string, suffix: string): string | null {
  const normalizedSource = normalizeToken(source);
  const normalizedSuffix = normalizeToken(suffix);
  if (normalizedSource === normalizedSuffix) {
    return '';
  }
  if (normalizedSource.endsWith(` ${normalizedSuffix}`)) {
    return source.slice(0, source.length - normalizedSuffix.length).trim().replace(/[_\s-]+$/, '');
  }
  return null;
}

function detectColumnDescriptor(header: string, index: number): ColumnDescriptor {
  const normalized = normalizeToken(header);

  for (const suffix of TOOLTIP_SUFFIXES) {
    const base = stripSuffix(header, suffix);
    if (base !== null) {
      return { header: base || header, field: 'tooltip', index };
    }
  }

  for (const suffix of TTS_SUFFIXES) {
    const base = stripSuffix(header, suffix);
    if (base !== null) {
      return { header: base || header, field: 'tts', index };
    }
  }

  for (const suffix of AUDIO_SUFFIXES) {
    const base = stripSuffix(header, suffix);
    if (base !== null) {
      return { header: base || header, field: 'audioUrl', index };
    }
  }

  for (const suffix of TEXT_SUFFIXES) {
    const base = stripSuffix(header, suffix);
    if (base !== null) {
      return { header: base || header, field: 'text', index };
    }
  }

  return { header: normalized ? header.trim() : `Column ${index + 1}`, field: 'text', index };
}

function parseTtsEnabled(value: string): boolean {
  const normalized = normalizeToken(value);

  if (!normalized) {
    return false;
  }

  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) {
    return false;
  }

  return true;
}

function buildColumnGroups(headers: string[]): ColumnGroup[] {
  const groups = new Map<string, ColumnGroup[]>();
  const labelCounts = new Map<string, number>();
  const ordered: ColumnGroup[] = [];

  headers.forEach((header, index) => {
    const descriptor = detectColumnDescriptor(header, index);
    const baseLabel = descriptor.header.trim() || `Column ${index + 1}`;
    const candidates = groups.get(baseLabel) ?? [];
    let group = candidates.find(candidate => {
      if (descriptor.field === 'text') return candidate.textIndex === undefined;
      if (descriptor.field === 'tooltip') return candidate.tooltipIndex === undefined;
      if (descriptor.field === 'tts') return candidate.ttsIndex === undefined;
      return candidate.audioUrlIndex === undefined;
    });

    if (!group) {
      const count = (labelCounts.get(baseLabel) ?? 0) + 1;
      labelCounts.set(baseLabel, count);
      const label = count === 1 ? baseLabel : `${baseLabel} ${count}`;
      group = { key: `${baseLabel}::${count}`, label };
      groups.set(baseLabel, [...candidates, group]);
      ordered.push(group);
    }

    if (descriptor.field === 'text' && group.textIndex === undefined) group.textIndex = descriptor.index;
    if (descriptor.field === 'tooltip' && group.tooltipIndex === undefined) group.tooltipIndex = descriptor.index;
    if (descriptor.field === 'tts' && group.ttsIndex === undefined) group.ttsIndex = descriptor.index;
    if (descriptor.field === 'audioUrl' && group.audioUrlIndex === undefined) group.audioUrlIndex = descriptor.index;
  });

  return ordered.filter(group =>
    group.textIndex !== undefined ||
    group.tooltipIndex !== undefined ||
    group.ttsIndex !== undefined ||
    group.audioUrlIndex !== undefined
  );
}

export function parseTableCsvToBlockData(csvText: string): TableBlockData {
  const parsed = parseCsv(csvText);
  const groups = buildColumnGroups(parsed.headers);

  const rows = parsed.rows
    .map(row => ({
      cells: groups.map(group => ({
        text: group.textIndex !== undefined ? (row[group.textIndex] ?? '').trim() : '',
        tooltip: group.tooltipIndex !== undefined ? (row[group.tooltipIndex] ?? '').trim() : '',
        audioUrl: group.audioUrlIndex !== undefined ? (row[group.audioUrlIndex] ?? '').trim() : '',
        tts: group.ttsIndex !== undefined ? parseTtsEnabled(row[group.ttsIndex] ?? '') : false,
      })),
    }))
    .filter(row => row.cells.some(cell => cell.text || cell.tooltip || cell.audioUrl || cell.tts));

  return {
    headers: groups.map(group => group.label),
    rows,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function buildSpeakerIconHtml(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${TABLE_ICON_SIZE}" height="${TABLE_ICON_SIZE}" fill="none" stroke="${TABLE_AUDIO_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>`;
}

function buildAudioButtonHtml(onClick: string, title: string): string {
  return `<button onclick="${onClick}" style="background:none;border:none;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:${TABLE_AUDIO_GAP}px;color:${TABLE_AUDIO_COLOR};line-height:1;flex-shrink:0;" title="${title}" aria-label="${title}">${buildSpeakerIconHtml()}</button>`;
}

export function buildTableBlockHtml(tableData: TableBlockData): string {
  const validRows = tableData.rows.filter(row => row.cells.some(cell => cell.text.trim() || cell.tooltip.trim() || cell.audioUrl.trim() || cell.tts));
  const normalizedTableData: TableBlockData = {
    headers: tableData.headers,
    rows: validRows,
  };
  const metaJson = JSON.stringify({ type: 'table', data: normalizedTableData });
  const metaTag = `<div data-block-meta="1" style="display:none;">${escapeHtml(metaJson)}</div>`;

  const thCells = normalizedTableData.headers.map((header, index) => {
    const isLast = index === normalizedTableData.headers.length - 1;
    return `<th style="padding:${TABLE_HEADER_CELL_PADDING};text-align:center;font-weight:700;font-size:${TABLE_HEADER_FONT_SIZE};text-transform:uppercase;letter-spacing:${TABLE_HEADER_LETTER_SPACING};line-height:1.2;color:${TABLE_HEADER_TEXT};border-right:1px solid rgba(255,255,255,0.35);">${escapeHtml(header)}</th>`
      + (isLast ? '' : `<th style="padding:0;width:${TABLE_ARROW_CELL_WIDTH}px;border-right:1px solid rgba(255,255,255,0.35);"></th>`);
  }).join('');

  const bodyRows = validRows.map((row, rowIndex) => {
    const cellBg = rowIndex % 2 === 0 ? TABLE_ROW_ALT_BG : TABLE_ROW_BG;
    const renderedCells = row.cells.map((cell, colIndex) => {
      const isLast = colIndex === normalizedTableData.headers.length - 1;
      const safeText = escapeHtml(cell.text.trim());
      const safeTooltip = escapeHtml(cell.tooltip.trim());
      const jsSafeText = escapeJsString(cell.text.trim());
      const jsSafeAudioUrl = escapeJsString(cell.audioUrl.trim());
      const audioBtn = cell.tts && cell.text.trim()
        ? buildAudioButtonHtml(`(function(b){var t='${jsSafeText}';if(!t)return;var s=window.speechSynthesis;s.cancel();var u=new SpeechSynthesisUtterance(t);u.lang='fr-FR';var v=s.getVoices();var fv=v.find(function(x){return x.lang==='fr-FR'})||v.find(function(x){return x.lang==='fr-CA'})||v.find(function(x){return x.lang.startsWith('fr')});if(fv)u.voice=fv;s.speak(u);b.style.transform='scale(0.94)';setTimeout(function(){b.style.transform='scale(1)'},180)})(this)`, 'Play TTS')
        : cell.audioUrl.trim()
          ? buildAudioButtonHtml(`(function(b){var a=new Audio('${jsSafeAudioUrl}');a.currentTime=0;a.play();b.style.transform='scale(0.94)';setTimeout(function(){b.style.transform='scale(1)'},180)})(this)`, 'Play audio')
          : '';

      const inner = safeTooltip
        ? `<span style="position:relative;display:inline-block;cursor:pointer;color:${TABLE_TOOLTIP_TEXT};font-weight:500;line-height:${TABLE_BODY_LINE_HEIGHT};border-bottom:1px dashed ${TABLE_ACCENT};" onmouseenter="var t=this.querySelector('.vtt');if(t)t.style.opacity='1';" onmouseleave="var t=this.querySelector('.vtt');if(t)t.style.opacity='0';">${safeText}<span class="vtt" style="opacity:0;transition:opacity 0.15s;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:6px 10px;border-radius:8px;font-size:12px;white-space:nowrap;pointer-events:none;font-weight:400;z-index:10;box-shadow:0 8px 20px rgba(0,0,0,0.16);">${safeTooltip}</span></span>`
        : `<span style="font-weight:500;color:${TABLE_CELL_TEXT};line-height:${TABLE_BODY_LINE_HEIGHT};">${safeText}</span>`;

      return `<td style="padding:${TABLE_BODY_CELL_PADDING};text-align:center;vertical-align:middle;background:${cellBg};border-bottom:1px solid ${TABLE_SURFACE_BORDER};border-right:1px solid ${TABLE_SURFACE_BORDER};min-width:${TABLE_CELL_MIN_WIDTH}px;font-size:${TABLE_BODY_FONT_SIZE};line-height:${TABLE_BODY_LINE_HEIGHT};"><div style="display:inline-flex;align-items:center;justify-content:center;max-width:100%;white-space:normal;overflow-wrap:anywhere;">${inner}${audioBtn}</div></td>`
        + (isLast ? '' : `<td style="padding:0;width:${TABLE_ARROW_CELL_WIDTH}px;text-align:center;vertical-align:middle;background:${cellBg};border-bottom:1px solid ${TABLE_SURFACE_BORDER};border-right:1px solid ${TABLE_SURFACE_BORDER};color:${TABLE_ARROW_TEXT};font-size:30px;font-weight:300;line-height:1;">&rarr;</td>`);
    }).join('');

    return `<tr>${renderedCells}</tr>`;
  }).join('\n');

  return `<div data-vocab-table="1" style="overflow-x:auto;overflow-y:visible;margin:32px 0;-webkit-overflow-scrolling:touch;"><div style="border-radius:${TABLE_CARD_RADIUS}px;box-shadow:${TABLE_SHADOW};border:1px solid ${TABLE_SURFACE_BORDER};background:#ffffff;overflow:hidden;"><table style="width:100%;min-width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:${TABLE_BODY_FONT_SIZE};background:#ffffff;"><thead style="background:${TABLE_HEADER_BG};"><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>${metaTag}</div></div><p><br></p>`;
}
