const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  PageNumber, Footer, Header, TabStopType, TabStopPosition,
} = require('docx');

// Speaker color palette (hex for docx)
const SPEAKER_COLORS = ['2E86AB', '7C3AED', 'D97706', '059669', 'DC2626', '2563EB', 'EA580C', 'DB2777'];
const SPEAKER_SHADES = ['E8F7FB', 'F3F0FF', 'FEF3C7', 'D1FAE5', 'FEE2E2', 'DBEAFE', 'FFEDD5', 'FCE7F3'];

function getSpeakerIndex(speaker) {
  const labels = ['A','B','C','D','E','F','G','H'];
  const idx = labels.indexOf(speaker);
  return idx >= 0 ? idx : 0;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function generateDocx(transcriptData, options = {}) {
  const {
    includeTimestamps = true,
    includeSpeakerLabels = true,
    includeConfidence = false,
    style = 'clean',       // 'clean' | 'formal' | 'minimal'
    includeMetadata = true,
    includeWordCount = true,
  } = options;

  const { utterances = [], speakerNames = {}, fileName, duration, confidence, languageCode } = transcriptData;
  const speakers = [...new Set(utterances.map(u => u.speaker))];

  const children = [];

  // ── COVER / METADATA ─────────────────────────────────────────────
  if (includeMetadata) {
    // Title
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'INTERVIEW TRANSCRIPT',
        bold: true,
        size: 40,
        font: 'Arial',
        color: '111827',
      })],
      spacing: { before: 0, after: 120 },
    }));

    // Subtitle line
    const srcName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Audio Recording';
    children.push(new Paragraph({
      children: [new TextRun({
        text: srcName,
        size: 26,
        font: 'Arial',
        color: '6B7280',
        italics: true,
      })],
      spacing: { before: 0, after: 400 },
    }));

    // Divider
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E86AB', space: 1 } },
      spacing: { before: 0, after: 400 },
      children: [],
    }));

    // Meta table
    const metaItems = [];
    if (duration) metaItems.push(['Duration', formatDuration(duration)]);
    metaItems.push(['Speakers', speakers.length.toString()]);
    if (confidence) metaItems.push(['Avg. Confidence', (confidence * 100).toFixed(1) + '%']);
    if (languageCode) metaItems.push(['Language', languageCode.toUpperCase()]);
    metaItems.push(['Generated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })]);
    if (includeWordCount) {
      const wc = utterances.reduce((acc, u) => acc + u.text.split(/\s+/).filter(Boolean).length, 0);
      metaItems.push(['Word Count', wc.toLocaleString()]);
    }

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' };
    const borders = { top: border, bottom: border, left: border, right: border };

    const metaRows = metaItems.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          borders, width: { size: 2500, type: WidthType.DXA },
          shading: { fill: 'F9FAFB', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial', color: '374151' })] })],
        }),
        new TableCell({
          borders, width: { size: 6860, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 20, font: 'Arial', color: '111827' })] })],
        }),
      ]
    }));

    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2500, 6860],
      rows: metaRows,
    }));

    children.push(new Paragraph({ spacing: { before: 400, after: 200 }, children: [] }));

    // Speaker legend
    if (includeSpeakerLabels && speakers.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'SPEAKERS', bold: true, size: 18, font: 'Arial', color: '6B7280', allCaps: true })],
        spacing: { before: 0, after: 120 },
      }));

      speakers.forEach(s => {
        const idx = getSpeakerIndex(s);
        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
        const displayName = speakerNames[s] || `Speaker ${s}`;
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '  ■  ', color, font: 'Arial', size: 20 }),
            new TextRun({ text: displayName, bold: true, size: 20, font: 'Arial', color: '111827' }),
            new TextRun({ text: `  (Speaker ${s})`, size: 18, font: 'Arial', color: '9CA3AF' }),
          ],
          spacing: { before: 40, after: 40 },
        }));
      });

      children.push(new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }));
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
        spacing: { before: 0, after: 600 },
        children: [],
      }));
    }
  }

  // ── TRANSCRIPT BODY ───────────────────────────────────────────────
  if (style === 'formal') {
    children.push(...buildFormalStyle(utterances, speakerNames, { includeTimestamps, includeSpeakerLabels, includeConfidence }));
  } else if (style === 'minimal') {
    children.push(...buildMinimalStyle(utterances, speakerNames, { includeTimestamps, includeSpeakerLabels }));
  } else {
    children.push(...buildCleanStyle(utterances, speakerNames, { includeTimestamps, includeSpeakerLabels, includeConfidence }));
  }

  // ── DOCUMENT ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1260, bottom: 1260, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: 'SONIQ Transcript  •  Confidential', size: 16, color: '9CA3AF', font: 'Arial' }),
              new TextRun({ text: '\t', font: 'Arial' }),
              new TextRun({ text: 'Page ', size: 16, color: '9CA3AF', font: 'Arial' }),
              new PageNumber({ size: 16, color: '9CA3AF', font: 'Arial' }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

// ── CLEAN STYLE ───────────────────────────────────────────────────
function buildCleanStyle(utterances, speakerNames, opts) {
  const { includeTimestamps, includeSpeakerLabels, includeConfidence } = opts;
  const paragraphs = [];
  const border = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borders = { top: border, bottom: border, left: border, right: border };

  utterances.forEach((u, i) => {
    const idx = getSpeakerIndex(u.speaker);
    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
    const shade = SPEAKER_SHADES[idx % SPEAKER_SHADES.length];
    const name = speakerNames[u.speaker] || `Speaker ${u.speaker}`;

    const headerCells = [];

    if (includeSpeakerLabels) {
      headerCells.push(new TableCell({
        borders,
        width: { size: 2200, type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 60, left: 160, right: 100 },
        children: [new Paragraph({
          children: [new TextRun({ text: name, bold: true, size: 20, font: 'Arial', color })],
        })],
      }));
    }

    if (includeTimestamps) {
      headerCells.push(new TableCell({
        borders,
        width: { size: includeSpeakerLabels ? 1200 : 1400, type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 60, left: 100, right: 160 },
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: formatTime(u.start), size: 18, font: 'Courier New', color: '6B7280' })],
        })],
      }));
    }

    const textWidth = 9360 - headerCells.reduce((acc) => acc + (includeSpeakerLabels ? 2200 : 0) + (includeTimestamps ? 1200 : 0), 0);
    const mainWidth = headerCells.length === 0 ? 9360
      : headerCells.length === 2 ? 5960
      : includeSpeakerLabels ? 7160 : 7960;

    // Build word runs with confidence flags
    const wordRuns = [];
    if (u.words && u.words.length > 0) {
      u.words.forEach((w, wi) => {
        const displayText = w.edited ? w.editedText : w.text;
        const isLowConf = !w.edited && w.confidence < 0.8;
        const isEdited = w.edited;
        wordRuns.push(new TextRun({
          text: (wi > 0 ? ' ' : '') + displayText,
          size: 22,
          font: 'Arial',
          color: isEdited ? '059669' : isLowConf ? 'D97706' : '111827',
          bold: isEdited,
          underline: isLowConf && includeConfidence ? { type: 'single', color: 'D97706' } : undefined,
        }));
      });
    } else {
      wordRuns.push(new TextRun({ text: u.text, size: 22, font: 'Arial', color: '111827' }));
    }

    const confText = includeConfidence && u.confidence
      ? `  [${(u.confidence * 100).toFixed(0)}%]`
      : '';

    const textCell = new TableCell({
      borders,
      width: { size: mainWidth, type: WidthType.DXA },
      shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [
        new Paragraph({
          children: [
            ...wordRuns,
            ...(confText ? [new TextRun({ text: confText, size: 18, color: '9CA3AF', font: 'Arial' })] : []),
          ],
          spacing: { line: 360 },
        }),
      ],
    });

    const rowCells = [...headerCells, textCell];

    paragraphs.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: rowCells.map(c => {
        if (includeSpeakerLabels && includeTimestamps) return [2200, 1200, 5960][rowCells.indexOf(c)];
        if (includeSpeakerLabels) return [2200, 7160][rowCells.indexOf(c)];
        if (includeTimestamps) return [1400, 7960][rowCells.indexOf(c)];
        return [9360][0];
      }),
      rows: [new TableRow({ children: rowCells })],
    }));

    paragraphs.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }));
  });

  return paragraphs;
}

// ── FORMAL STYLE (legal/deposition) ──────────────────────────────
function buildFormalStyle(utterances, speakerNames, opts) {
  const { includeTimestamps, includeSpeakerLabels, includeConfidence } = opts;
  const paragraphs = [];

  utterances.forEach((u, i) => {
    const name = speakerNames[u.speaker] || `Speaker ${u.speaker}`;
    const idx = getSpeakerIndex(u.speaker);
    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];

    const lineItems = [];

    if (includeTimestamps) {
      lineItems.push(new TextRun({ text: `[${formatTime(u.start)}]  `, size: 20, font: 'Courier New', color: '6B7280' }));
    }
    if (includeSpeakerLabels) {
      lineItems.push(new TextRun({ text: `${name.toUpperCase()}:  `, bold: true, size: 22, font: 'Arial', color, allCaps: false }));
    }

    // Words
    if (u.words && u.words.length > 0) {
      u.words.forEach((w, wi) => {
        const displayText = w.edited ? w.editedText : w.text;
        const isLowConf = !w.edited && w.confidence < 0.8;
        const isEdited = w.edited;
        lineItems.push(new TextRun({
          text: (wi > 0 ? ' ' : '') + displayText,
          size: 22,
          font: 'Arial',
          color: isEdited ? '059669' : isLowConf ? 'D97706' : '111827',
          bold: isEdited,
        }));
      });
    } else {
      lineItems.push(new TextRun({ text: u.text, size: 22, font: 'Arial', color: '111827' }));
    }

    if (includeConfidence && u.confidence) {
      lineItems.push(new TextRun({ text: `  [${(u.confidence * 100).toFixed(0)}%]`, size: 18, color: '9CA3AF', font: 'Arial' }));
    }

    paragraphs.push(new Paragraph({
      children: lineItems,
      spacing: { before: 0, after: 280, line: 360 },
      indent: { left: includeSpeakerLabels ? 1080 : 0, hanging: includeSpeakerLabels ? 1080 : 0 },
    }));
  });

  return paragraphs;
}

// ── MINIMAL STYLE (dialogue only) ────────────────────────────────
function buildMinimalStyle(utterances, speakerNames, opts) {
  const { includeTimestamps, includeSpeakerLabels } = opts;
  const paragraphs = [];
  let lastSpeaker = null;

  utterances.forEach((u) => {
    const name = speakerNames[u.speaker] || `Speaker ${u.speaker}`;
    const idx = getSpeakerIndex(u.speaker);
    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];

    // Group consecutive same-speaker lines
    if (includeSpeakerLabels && u.speaker !== lastSpeaker) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: name, bold: true, size: 20, font: 'Arial', color }),
          ...(includeTimestamps ? [new TextRun({ text: `  ${formatTime(u.start)}`, size: 18, color: '9CA3AF', font: 'Arial' })] : []),
        ],
        spacing: { before: 240, after: 60 },
      }));
    }

    const wordRuns = [];
    if (u.words && u.words.length > 0) {
      u.words.forEach((w, wi) => {
        const displayText = w.edited ? w.editedText : w.text;
        const isEdited = w.edited;
        wordRuns.push(new TextRun({
          text: (wi > 0 ? ' ' : '') + displayText,
          size: 22,
          font: 'Arial',
          color: isEdited ? '059669' : '111827',
        }));
      });
    } else {
      wordRuns.push(new TextRun({ text: u.text, size: 22, font: 'Arial', color: '111827' }));
    }

    paragraphs.push(new Paragraph({
      children: wordRuns,
      spacing: { before: 0, after: 80, line: 320 },
    }));

    lastSpeaker = u.speaker;
  });

  return paragraphs;
}

module.exports = { generateDocx };
