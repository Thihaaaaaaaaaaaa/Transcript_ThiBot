# SONIQ — 3D Audio Visualizer & AI Transcriber

A production-grade web app featuring real-time 3D audio visualization, speaker-differentiated AI transcription, and an inline speaker renaming dashboard — built for deployment on Render.

---

## Features

- **3D Audio Visualizer** — four modes: Bar Spectrum, Waveform, 3D Sphere, Radial — all GPU-rendered on Canvas
- **AI Transcription** — powered by AssemblyAI with high accuracy speech-to-text
- **Speaker Diarization** — automatically separates and color-codes different speakers (Person 1, Person 2, …)
- **Speaker Renaming** — click the ✎ Edit Speakers button, type real names (e.g. "Ben"), saved instantly
- **Audio Playback** — sync playback with live transcript highlighting
- **Export** — copy or download the transcript as a plain-text file
- Supports MP3, WAV, MP4, M4A, OGG, WebM, FLAC up to **200 MB**

---

## Quick Start (Local)

### 1. Clone & install
```bash
git clone <your-repo>
cd soniq-audio-visualizer
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env and paste your AssemblyAI API key
```

Get a free AssemblyAI API key at https://www.assemblyai.com

### 3. Run
```bash
npm start
# → http://localhost:3000
```

---

## Deploy to Render

### Option A — render.yaml (recommended)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render reads `render.yaml` automatically
4. In the service dashboard, add the environment variable:
   - **Key:** `ASSEMBLYAI_API_KEY`
   - **Value:** `your_key_here`
5. Deploy → your app is live at `https://your-app-name.onrender.com`

### Option B — Manual
1. Push to GitHub
2. Render → New → Web Service → connect repo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node version:** 18+
4. Environment Variables → add `ASSEMBLYAI_API_KEY`
5. Deploy

---

## How Speaker Renaming Works

After transcription:

```
Person A: "how did you get to work"
Person B: "I use the bus"
```

Click **✎ Edit Speakers** → a popup appears with each detected speaker → rename "B" to "Ben" → Save:

```
Person A: "how did you get to work"
Ben: "I use the bus"
```

Changes apply instantly to the full transcript view and persist for the session.

---

## Architecture

```
/
├── server.js           Express server + AssemblyAI integration
├── render.yaml         Render deployment config
├── public/
│   ├── index.html      Single-page app shell
│   ├── css/style.css   Full UI styles (dark futuristic theme)
│   └── js/
│       ├── bg.js        Background particle canvas
│       ├── visualizer.js 3D audio visualizer engine (4 modes)
│       └── app.js       App logic, API calls, transcript rendering
└── uploads/            Temp audio files (auto-cleaned)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/transcribe` | Upload audio, start transcription |
| GET | `/api/transcript/:id` | Poll status / get result |
| PATCH | `/api/transcript/:id/speakers` | Rename speakers |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ASSEMBLYAI_API_KEY` | ✅ Yes | AssemblyAI API key |
| `PORT` | No | Server port (default 3000) |
