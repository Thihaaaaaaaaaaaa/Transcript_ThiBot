require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { AssemblyAI } = require('assemblyai');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, Header, Footer, TabStopType, TabStopPosition
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const transcriptStore = {};

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(mp3|wav|mp4|ogg|webm|m4a|aac|flac|mov)$/i) ||
        file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

function getClient() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not set. Add it in your Render environment variables.');
  return new AssemblyAI({ apiKey });
}

// POST /api/transcribe
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

  const sessionId = uuidv4();
  const filePath = req.file.path;
  const originalName = req.file.originalname || 'recording';

  transcriptStore[sessionId] = {
    status: 'processing',
    speakerNames: {},
    utterances: null,
    wordEdits: {},
    error: null,
    fileName: originalName,
    createdAt: Date.now()
  };

  res.json({ sessionId, status: 'processing' });

  (async () => {
    try {
      const client = getClient();

      const transcript = await client.transcripts.transcribe({
        audio: fs.createReadStream(filePath),
        speaker_labels: true,
        speakers_expected: parseInt(req.body.speakersExpected) || 2,
        speech_models: 'best',
        language_detection: true,
        punctuate: true,
        format_text: true,
        disfluencies: false,
      });

      if (transcript.status === 'error') {
        throw new Error(transcript.error || 'Transcription failed');
      }

      // Build utterances with word-level confidence
      const utterances = (transcript.utterances || []).map((u, i) => ({
        id: i,
        speaker: u.speaker,
        text: u.text,
        start: u.start,
        end: u.end,
        confidence: u.confidence,
        words: (u.words || []).map(w => ({
          text: w.text,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker
        }))
      }));

      const speakers = [...new Set(utterances.map(u => u.speaker))];
      const speakerNames = {};
      speakers.forEach(s => { speakerNames[s] = `Speaker ${s}`; });

      transcriptStore[sessionId] = {
        status: 'completed',
        speakerNames,
        utterances,
        wordEdits: {},
        fileName: originalName,
        fullText: transcript.text,
        duration: transcript.audio_duration,
        confidence: transcript.confidence,
        createdAt: transcriptStore[sessionId].createdAt,
        error: null
      };
    } catch (err) {
      console.error('Transcription error:', err);
      transcriptStore[sessionId].status = 'error';
      transcriptStore[sessionId].error = err.message;
    } finally {
      fs.unlink(filePath, () => {});
    }
  })();
});

// GET /api/transcript/:id
app.get('/api/transcript/:sessionId', (req, res) => {
  const data = transcriptStore[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Session not found' });
  res.json(data);
});

// PATCH /api/transcript/:id/speakers
app.patch('/api/transcript/:sessionId/speakers', (req, res) => {
  const data = transcriptStore[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Session not found' });
  const { speakerNames } = req.body;
  if (!speakerNames) return res.status(400).json({ error: 'speakerNames required' });
  data.speakerNames = { ...data.speakerNames, ...speakerNames };
  res.json({ success: true, speakerNames: data.speakerNames });
});

// PATCH /api/transcript/:id/word — inline word edit
app.patch('/api/transcript/:sessionId/word', (req, res) => {
  const data = transcriptStore[req.params.sessionId];
  if (!data) return res.status(404).json({ error: 'Session not found' });
  const { uttIdx, wordIdx, newText } = req.body;
  if (uttIdx == null || wordIdx == null || newText == null) {
    return res.status(400).json({ error: 'uttIdx, wordIdx, newText required' });
  }
  if (!data.wordEdits) data.wordEdits = {};
  const key = `${uttIdx}_${wordIdx}`;
  data.wordEdits[key] = newText;

  // Also patch the utterance text
  if (data.utterances[uttIdx] && data.utterances[uttIdx].words[wordIdx]) {
    data.utterances[uttIdx].words[wordIdx].edited = newText;
    // Rebuild utterance text from words
    data.utterances[uttIdx].text = data.utterances[uttIdx].words
      .map(w => w.edited !== undefined ? w.edited : w.text)
      .join(' ');
  }

  res.json({ success: true });
});

// POST /api/transcript/:id/docx — generate Word document
app.post('/api/transcript/:sessionId/docx', async (req, res) => {
  const data = transcriptStore[req.params.sessionId];
  if (!data || data.status !== 'completed') {
    return res.status(404).json({ error: 'Transcript not found or not ready' });
  }

  const {
    includeTimestamps = true,
    includeSpeakerLabels = true,
    includeConfidence = false,
    formatStyle = 'clean', // 'clean' | 'formal' | 'minimal'
    includeMetadata = true
  } = req.body;

  const SPEAKER_COLORS = {
    A: '0099BB', B: '7C3AED', C: 'D97706', D: '059669',
    E: 'DC2626', F: '2563EB', G: 'EA580C', H: 'C026D3'
  };
  const SPEAKER_SHADE = {
    A: 'E8FBFF', B: 'F3EFFF', C: 'FFFBEB', D: 'ECFDF5',
    E: 'FEF2F2', F: 'EFF6FF', G: 'FFF7ED', H: 'FDF4FF'
  };

  const children = [];

  const borderNone = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone };

  // ── Cover / metadata ──────────────────────────────────────────
  if (includeMetadata) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'TRANSCRIPT',
        bold: true,
        size: 52,
        font: 'Arial',
        color: '111827'
      })],
      spacing: { before: 0, after: 200 }
    }));

    children.push(new Paragraph({
      children: [new TextRun({
        text: data.fileName.replace(/\.[^.]+$/, ''),
        size: 28,
        font: 'Arial',
        color: '374151'
      })],
      spacing: { after: 120 }
    }));

    const metaItems = [];
    const date = new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    metaItems.push(`Date: ${date}`);
    if (data.duration) {
      const mins = Math.floor(data.duration / 60);
      const secs = Math.floor(data.duration % 60).toString().padStart(2, '0');
      metaItems.push(`Duration: ${mins}:${secs}`);
    }
    const speakers = Object.keys(data.speakerNames || {});
    if (speakers.length) {
      metaItems.push(`Speakers: ${speakers.map(s => data.speakerNames[s]).join(', ')}`);
    }
    if (data.confidence) {
      metaItems.push(`Overall Accuracy: ${(data.confidence * 100).toFixed(1)}%`);
    }

    metaItems.forEach(item => {
      children.push(new Paragraph({
        children: [new TextRun({ text: item, size: 20, font: 'Arial', color: '6B7280' })],
        spacing: { after: 40 }
      }));
    });

    // Divider
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } },
      spacing: { before: 280, after: 360 },
      children: []
    }));
  }

  // ── Utterances ────────────────────────────────────────────────
  const utterances = data.utterances || [];

  for (const u of utterances) {
    const spk = u.speaker || 'A';
    const color = SPEAKER_COLORS[spk] || '374151';
    const shade = SPEAKER_SHADE[spk] || 'F9FAFB';
    const displayName = (data.speakerNames && data.speakerNames[spk]) || `Speaker ${spk}`;

    const ts = formatTime(u.start / 1000);
    const te = formatTime(u.end / 1000);

    if (formatStyle === 'minimal') {
      // Minimal: just "Name: text"
      const runs = [];
      if (includeSpeakerLabels) {
        runs.push(new TextRun({ text: `${displayName}: `, bold: true, font: 'Arial', size: 22, color }));
      }
      runs.push(new TextRun({ text: getEditedText(u), font: 'Arial', size: 22, color: '111827' }));
      children.push(new Paragraph({ children: runs, spacing: { after: 160 } }));

    } else if (formatStyle === 'formal') {
      // Formal: legal deposition style
      const headerRuns = [];
      if (includeSpeakerLabels) {
        headerRuns.push(new TextRun({ text: displayName.toUpperCase(), bold: true, font: 'Arial', size: 20, color: '111827' }));
      }
      if (includeTimestamps) {
        headerRuns.push(new TextRun({ text: `   [${ts} – ${te}]`, font: 'Courier New', size: 18, color: '9CA3AF' }));
      }
      if (headerRuns.length) {
        children.push(new Paragraph({ children: headerRuns, spacing: { before: 240, after: 60 } }));
      }
      const textRuns = buildWordRuns(u, includeConfidence, '111827', 22);
      children.push(new Paragraph({
        children: textRuns,
        indent: { left: 720 },
        spacing: { after: 60 }
      }));
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' } },
        spacing: { before: 200, after: 40 },
        children: []
      }));

    } else {
      // Clean (default): journalist style with shaded speaker block
      const tableChildren = [];

      // Speaker + time row
      const topRuns = [];
      if (includeSpeakerLabels) {
        topRuns.push(new TextRun({ text: displayName, bold: true, font: 'Arial', size: 22, color }));
      }
      if (includeTimestamps) {
        topRuns.push(new TextRun({ text: `  ${ts} – ${te}`, font: 'Arial', size: 18, color: '9CA3AF' }));
      }
      if (topRuns.length) {
        tableChildren.push(new Paragraph({ children: topRuns, spacing: { after: 80 } }));
      }

      // Text
      const textRuns = buildWordRuns(u, includeConfidence, '1F2937', 22);
      tableChildren.push(new Paragraph({ children: textRuns, spacing: { after: 0 } }));

      if (includeConfidence && u.confidence != null) {
        tableChildren.push(new Paragraph({
          children: [new TextRun({
            text: `Confidence: ${(u.confidence * 100).toFixed(0)}%`,
            font: 'Arial', size: 16, color: '9CA3AF', italics: true
          })],
          spacing: { before: 60, after: 0 }
        }));
      }

      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({
          children: [new TableCell({
            borders: { top: borderNone, bottom: borderNone, left: { style: BorderStyle.SINGLE, size: 12, color }, right: borderNone },
            shading: { fill: shade, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            width: { size: 9360, type: WidthType.DXA },
            children: tableChildren
          })]
        })]
      }));
      children.push(new Paragraph({ children: [], spacing: { after: 160 } }));
    }
  }

  // ── Build document ────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: data.fileName.replace(/\.[^.]+$/, ''), font: 'Arial', size: 18, color: '9CA3AF' }),
              new TextRun({ text: '  |  TRANSCRIPT', font: 'Arial', size: 18, color: 'D1D5DB' })
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' } }
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Generated by SONIQ', font: 'Arial', size: 16, color: 'D1D5DB' }),
              new TextRun({ text: '   —   Page ', font: 'Arial', size: 16, color: 'D1D5DB' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '9CA3AF' })
            ],
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' } }
          })]
        })
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = (data.fileName || 'transcript').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_transcript.docx"`);
  res.send(buffer);
});

// ── Helpers ──────────────────────────────────────────────────────
function formatTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function getEditedText(u) {
  if (!u.words || u.words.length === 0) return u.text;
  return u.words.map(w => w.edited !== undefined ? w.edited : w.text).join(' ');
}

function buildWordRuns(u, includeConfidence, defaultColor, size) {
  if (!u.words || u.words.length === 0) {
    return [new TextRun({ text: getEditedText(u), font: 'Arial', size, color: defaultColor })];
  }

  const runs = [];
  u.words.forEach((w, i) => {
    const txt = (w.edited !== undefined ? w.edited : w.text) + (i < u.words.length - 1 ? ' ' : '');
    const conf = w.confidence || 1;
    const isLow = includeConfidence && conf < 0.8;

    runs.push(new TextRun({
      text: txt,
      font: 'Arial',
      size,
      color: isLow ? 'D97706' : defaultColor,
      underline: isLow ? { type: 'single', color: 'FCA5A5' } : undefined,
      italics: isLow
    }));
  });
  return runs;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🎵 SONIQ running on http://localhost:${PORT}`);
  if (!process.env.ASSEMBLYAI_API_KEY) console.warn('⚠️  ASSEMBLYAI_API_KEY not set');
});
