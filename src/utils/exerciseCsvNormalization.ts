const NORMALIZED_SLUGS = new Set(['translate_typed', 'speak_translate']);

type CsvRow = Record<string, string>;

interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

function normalizeHeaderName(header: string): string {
  return header.replace(/\s+/g, '').toLowerCase();
}

function parseCsv(text: string): ParsedCsv {
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

  const headers = nonEmptyRows[0].map(cell => cell.trim());
  const dataRows = nonEmptyRows.slice(1).map(row => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? '').trim();
    });
    return record;
  });

  return { headers, rows: dataRows };
}

function serializeCsv(headers: string[], rows: CsvRow[]): string {
  const escapeCell = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach(row => {
    lines.push(headers.map(header => escapeCell(row[header] ?? '')).join(','));
  });
  return lines.join('\n');
}

function pickFirstValue(row: CsvRow, aliases: string[]): string {
  const byNormalizedName = new Map<string, string>();
  Object.entries(row).forEach(([key, value]) => {
    byNormalizedName.set(normalizeHeaderName(key), value);
  });

  for (const alias of aliases) {
    const value = byNormalizedName.get(normalizeHeaderName(alias));
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function splitAnswerValues(value: string): string[] {
  return value
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

function joinUniqueValues(values: string[]): string {
  const seen = new Set<string>();
  const ordered = values.filter(value => {
    const key = value.trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return ordered.join(' | ');
}

function normalizeTranslateTypedCsv(parsed: ParsedCsv): ParsedCsv {
  const consumedHeaders = new Set([
    'Complete Sentence_EN',
    'Complete Sentence _EN',
    'Sentence_EN',
    'Complete Sentence_FR',
    'Complete Sentence _FR',
    'Translation_FR',
    'Correct answer_FR',
    'Acceptable Sentence_1_FR',
    'Acceptable Sentence_2_FR',
    'Acceptable Answers_FR',
  ].map(normalizeHeaderName));

  const passthroughHeaders = parsed.headers.filter(header => !consumedHeaders.has(normalizeHeaderName(header)));
  const canonicalHeaders = ['Sentence_EN', 'Translation_FR', 'Acceptable Answers_FR'];

  const rows = parsed.rows.map(row => {
    const sentenceEn = pickFirstValue(row, ['Complete Sentence_EN', 'Complete Sentence _EN', 'Sentence_EN']);
    const translationFr = pickFirstValue(row, [
      'Complete Sentence_FR',
      'Complete Sentence _FR',
      'Translation_FR',
      'Correct answer_FR',
    ]);

    const acceptableAnswers = joinUniqueValues([
      ...splitAnswerValues(pickFirstValue(row, ['Acceptable Answers_FR'])),
      ...splitAnswerValues(pickFirstValue(row, ['Correct answer_FR'])),
      pickFirstValue(row, ['Acceptable Sentence_1_FR']),
      pickFirstValue(row, ['Acceptable Sentence_2_FR']),
    ]);

    const nextRow: CsvRow = {};
    passthroughHeaders.forEach(header => {
      nextRow[header] = row[header] ?? '';
    });
    nextRow.Sentence_EN = sentenceEn;
    nextRow.Translation_FR = translationFr;
    nextRow['Acceptable Answers_FR'] = acceptableAnswers;
    return nextRow;
  });

  return { headers: [...passthroughHeaders, ...canonicalHeaders], rows };
}

function normalizeSpeakTranslateCsv(parsed: ParsedCsv): ParsedCsv {
  const consumedHeaders = new Set([
    'Complete Sentence_EN',
    'Complete Sentence _EN',
    'Sentence_EN',
    'Sentence',
    'Translation_FR',
    'Translation',
    'Complete Sentence_FR',
    'Complete Sentence _FR',
    'Scenario',
    'Scenario_EN',
    'Prompt',
    'Prompt_FR',
    'TimeLimitSeconds',
    'Time',
  ].map(normalizeHeaderName));

  const passthroughHeaders = parsed.headers.filter(header => !consumedHeaders.has(normalizeHeaderName(header)));
  const canonicalHeaders = [
    'Sentence',
    'Translation',
    'Sentence_EN',
    'Translation_FR',
    'Scenario',
    'Scenario_EN',
    'Prompt',
    'Prompt_FR',
    'TimeLimitSeconds',
  ];

  const rows = parsed.rows.map(row => {
    const sentenceEn = pickFirstValue(row, ['Complete Sentence_EN', 'Complete Sentence _EN', 'Sentence_EN', 'Sentence']);
    const translationFr = pickFirstValue(row, ['Translation_FR', 'Translation', 'Complete Sentence_FR', 'Complete Sentence _FR']);
    const scenario = pickFirstValue(row, ['Scenario', 'Scenario_EN']);
    const scenarioEn = pickFirstValue(row, ['Scenario_EN', 'Scenario']);
    const prompt = pickFirstValue(row, ['Prompt', 'Prompt_FR']);
    const promptFr = pickFirstValue(row, ['Prompt_FR', 'Prompt']);
    const timeLimitSeconds = pickFirstValue(row, ['TimeLimitSeconds', 'Time']) || '60';

    const nextRow: CsvRow = {};
    passthroughHeaders.forEach(header => {
      nextRow[header] = row[header] ?? '';
    });
    nextRow.Sentence = pickFirstValue(row, ['Sentence', 'Complete Sentence_EN', 'Complete Sentence _EN', 'Sentence_EN']) || sentenceEn;
    nextRow.Translation = pickFirstValue(row, ['Translation', 'Translation_FR', 'Complete Sentence_FR', 'Complete Sentence _FR']) || translationFr;
    nextRow.Sentence_EN = sentenceEn;
    nextRow.Translation_FR = translationFr;
    nextRow.Scenario = scenario;
    nextRow.Scenario_EN = scenarioEn;
    nextRow.Prompt = prompt;
    nextRow.Prompt_FR = promptFr;
    nextRow.TimeLimitSeconds = timeLimitSeconds;
    return nextRow;
  });

  return { headers: [...passthroughHeaders, ...canonicalHeaders], rows };
}

export async function normalizeExerciseUploadFile(file: File, typeSlug: string): Promise<File> {
  if (!NORMALIZED_SLUGS.has(typeSlug)) {
    return file;
  }

  const rawText = await file.text();
  const parsed = parseCsv(rawText);
  if (parsed.headers.length === 0) {
    return file;
  }

  const normalized = typeSlug === 'translate_typed'
    ? normalizeTranslateTypedCsv(parsed)
    : normalizeSpeakTranslateCsv(parsed);

  const csvText = serializeCsv(normalized.headers, normalized.rows);
  return new File([csvText], file.name, { type: 'text/csv' });
}
