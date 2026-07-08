import {
  TABLE_AUDIO_GAP,
  TABLE_AUDIO_COLOR,
  TABLE_CARD_RADIUS,
  TABLE_BODY_CELL_PADDING,
  TABLE_BODY_FONT_SIZE,
  TABLE_BODY_LINE_HEIGHT,
  TABLE_CELL_MIN_WIDTH,
  TABLE_CELL_TEXT,
  TABLE_HEADER_BG,
  TABLE_HEADER_CELL_PADDING,
  TABLE_HEADER_FONT_SIZE,
  TABLE_HEADER_LETTER_SPACING,
  TABLE_HEADER_TEXT,
  TABLE_ICON_SIZE,
  TABLE_ROW_ALT_BG,
  TABLE_ROW_BG,
  TABLE_SHADOW,
  TABLE_SURFACE_BORDER,
  TABLE_TOOLTIP_TEXT,
  type TableBlockData,
} from '../utils/tableCsv';

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={TABLE_ICON_SIZE}
      height={TABLE_ICON_SIZE}
      fill="none"
      stroke={TABLE_AUDIO_COLOR}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export default function TableBlockPreview({ tableData }: { tableData: TableBlockData }) {
  const visibleRows = tableData.rows.filter(row => row.cells.some(cell => cell.text.trim() || cell.tooltip.trim() || cell.audioUrl.trim() || cell.tts));
  const tableMinWidth = Math.max(tableData.headers.length * TABLE_CELL_MIN_WIDTH, TABLE_CELL_MIN_WIDTH);

  return (
    <div
      style={{
        overflowX: 'auto',
        overflowY: 'visible',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          border: `1px solid ${TABLE_SURFACE_BORDER}`,
          borderRadius: TABLE_CARD_RADIUS,
          boxShadow: TABLE_SHADOW,
          background: '#fff',
          overflow: 'hidden',
          minWidth: tableMinWidth,
        }}
      >
      <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', fontSize: TABLE_BODY_FONT_SIZE }}>
        <thead>
          <tr style={{ background: TABLE_HEADER_BG, position: 'sticky', top: 0 }}>
            {tableData.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  style={{
                    padding: TABLE_HEADER_CELL_PADDING,
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: TABLE_HEADER_FONT_SIZE,
                    textTransform: 'uppercase',
                    letterSpacing: TABLE_HEADER_LETTER_SPACING,
                    lineHeight: 1.2,
                    color: TABLE_HEADER_TEXT,
                    whiteSpace: 'nowrap',
                    borderRight: index < tableData.headers.length - 1 ? '1px solid rgba(255,255,255,0.35)' : 'none',
                  }}
                >
                  {header}
                </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} style={{ background: rowIndex % 2 === 0 ? TABLE_ROW_ALT_BG : TABLE_ROW_BG }}>
              {row.cells.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    style={{
                      padding: TABLE_BODY_CELL_PADDING,
                      textAlign: 'center',
                      borderBottom: `1px solid ${TABLE_SURFACE_BORDER}`,
                      borderRight: cellIndex < tableData.headers.length - 1 ? `1px solid ${TABLE_SURFACE_BORDER}` : 'none',
                      verticalAlign: 'middle',
                      minWidth: TABLE_CELL_MIN_WIDTH,
                      fontSize: TABLE_BODY_FONT_SIZE,
                      lineHeight: TABLE_BODY_LINE_HEIGHT,
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                      <span
                        title={cell.tooltip || undefined}
                        style={{
                          fontWeight: 500,
                          color: cell.tooltip ? TABLE_TOOLTIP_TEXT : TABLE_CELL_TEXT,
                          borderBottom: cell.tooltip ? '1px dashed #f59e0b' : 'none',
                          cursor: cell.tooltip ? 'help' : 'default',
                          lineHeight: TABLE_BODY_LINE_HEIGHT,
                        }}
                      >
                        {cell.text}
                      </span>
                      {(cell.tts && cell.text.trim()) || cell.audioUrl ? (
                        <span style={{ marginLeft: TABLE_AUDIO_GAP, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SpeakerIcon />
                        </span>
                      ) : null}
                    </div>
                  </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
