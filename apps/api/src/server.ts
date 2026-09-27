import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn, execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const ffprobePath = ffprobeInstaller.path;

dotenv.config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;

app.use(express.json());
app.use(cors());
app.use(helmet());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '30'),
});
app.use(limiter);

const TMP_DIR = path.join(__dirname, '../tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function getYtDlpPath(): string {
  const rootExe = path.resolve(__dirname, '../../../bin/yt-dlp.exe');
  const rootBin = path.resolve(__dirname, '../../../bin/yt-dlp');
  if (process.platform === 'win32' && fs.existsSync(rootExe)) {
    return rootExe;
  }
  if (fs.existsSync(rootBin)) {
    return rootBin;
  }
  return 'yt-dlp';
}

const YTDLP_PATH = getYtDlpPath();
const CACHE_DIR = path.join(TMP_DIR, '.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function extractVideoId(url: string): string | null {
  if (!url) return null;
  let str = url.trim();
  try {
    str = decodeURIComponent(str);
  } catch {
    // Keep raw
  }
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
    /^([\w-]{11})$/
  ];
  for (const regex of patterns) {
    const match = str.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}

function sanitizeFilename(name: string): string {
  return (name || 'video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .substring(0, 150);
}

function formatDuration(sec: any): string {
  const seconds = parseInt(sec, 10) || 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViews(views: any): string {
  const n = parseInt(views, 10);
  if (isNaN(n)) return 'N/A';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function validateFileStreams(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean; streams: any[] }> {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name',
      '-of', 'json',
      filePath
    ], (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const hasVideo = streams.some((s: any) => s.codec_type === 'video');
        const hasAudio = streams.some((s: any) => s.codec_type === 'audio');
        resolve({ hasVideo, hasAudio, streams });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function cleanupDir(dirPath: string) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (e: any) {
    console.warn(`Cleanup warning for ${dirPath}:`, e.message);
  }
}

app.get('/api/health', (req: Request, res: Response) => {
  const ffmpegOk = ffmpegPath ? fs.existsSync(ffmpegPath) : false;
  const ffprobeOk = ffprobePath ? fs.existsSync(ffprobePath) : false;
  res.json({
    status: 'ok',
    service: 'YouTube Downloader API Service',
    engine: YTDLP_PATH,
    ffmpeg: { path: ffmpegPath, available: ffmpegOk },
    ffprobe: { path: ffprobePath, available: ffprobeOk },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/info', (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL.' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL format.' });
  }

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    '--js-runtimes', 'node',
    '--cache-dir', CACHE_DIR,
    '--socket-timeout', '10',
    '-J',
    '--no-playlist',
    standardUrl
  ];

  execFile(YTDLP_PATH, args, { maxBuffer: 15 * 1024 * 1024, timeout: 25000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`yt-dlp info error for ${videoId}:`, stderr || error.message);
      const errStr = (stderr || error.message || '').toLowerCase();
      if (errStr.includes('private') || errStr.includes('unavailable') || errStr.includes('removed')) {
        return res.status(404).json({ error: 'Video is private or unavailable on YouTube.' });
      }
      return res.status(500).json({ error: 'Unable to extract video details from YouTube.' });
    }

    try {
      const data = JSON.parse(stdout);
      const videoFormats: any[] = [];
      const seenQualities = new Set<string>();
      const rawFormats = data.formats || [];

      const rawVideoFormats = rawFormats
        .filter((f: any) => f.vcodec && f.vcodec !== 'none')
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

      for (const f of rawVideoFormats) {
        const height = f.height || 0;
        let qualityLabel = f.format_note || (height ? `${height}p` : 'SD');
        if (height >= 2160) qualityLabel = '4K (2160p)';
        else if (height >= 1440) qualityLabel = '2K (1440p)';
        else if (height >= 1080) qualityLabel = '1080p Full HD';
        else if (height >= 720) qualityLabel = '720p HD';
        else if (height >= 480) qualityLabel = '480p SD';
        else if (height >= 360) qualityLabel = '360p Medium';

        if (!seenQualities.has(qualityLabel)) {
          seenQualities.add(qualityLabel);
          let sizeText = 'HD Stream';
          if (f.filesize) {
            sizeText = `${(f.filesize / (1024 * 1024)).toFixed(1)} MB`;
          } else if (f.filesize_approx) {
            sizeText = `~${(f.filesize_approx / (1024 * 1024)).toFixed(1)} MB`;
          }

          videoFormats.push({
            itag: String(f.format_id || '18'),
            quality: qualityLabel,
            format: 'mp4',
            size: sizeText,
            fps: f.fps || 30,
            hasAudio: true,
            url: f.url || null
          });
        }
      }

      if (videoFormats.length === 0) {
        videoFormats.push({ itag: '18', quality: '360p Medium', format: 'mp4', size: 'HD Stream', fps: 30, hasAudio: true });
      }

      const audioFormats: any[] = [];
      const seenAudioKeys = new Set<string>();
      const rawAudioFormats = rawFormats
        .filter((f: any) => f.acodec && f.acodec !== 'none')
        .sort((a: any, b: any) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));

      for (const f of rawAudioFormats) {
        const abr = Math.round(f.abr || f.tbr || 128);
        let qualityText = `${abr} kbps`;
        if (abr >= 256) qualityText = '320 kbps (High Fidelity)';
        else if (abr >= 160) qualityText = '192 kbps (High Quality)';
        else if (abr >= 96) qualityText = '128 kbps (Standard)';

        if (!seenAudioKeys.has(qualityText)) {
          seenAudioKeys.add(qualityText);
          let sizeText = 'Audio Stream';
          if (f.filesize) {
            sizeText = `${(f.filesize / (1024 * 1024)).toFixed(1)} MB`;
          } else if (f.filesize_approx) {
            sizeText = `~${(f.filesize_approx / (1024 * 1024)).toFixed(1)} MB`;
          }

          audioFormats.push({
            itag: String(f.format_id || '140'),
            quality: qualityText,
            format: 'mp3',
            size: sizeText,
            url: f.url || null
          });
        }
      }

      if (audioFormats.length === 0) {
        audioFormats.push({ itag: '140', quality: '320 kbps (High Fidelity)', format: 'mp3', size: 'Audio Stream' });
      }

      const thumbnails = [
        { quality: 'Maxres (1080p)', url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` },
        { quality: 'High (720p)', url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` },
        { quality: 'Medium (480p)', url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` },
        { quality: 'Default (360p)', url: `https://img.youtube.com/vi/${videoId}/default.jpg` }
      ];

      return res.json({
        id: videoId,
        url: standardUrl,
        title: data.title || 'YouTube Video',
        description: (data.description || '').substring(0, 300) + '...',
        author: {
          name: data.uploader || data.channel || 'YouTube Creator',
          channel_url: data.uploader_url || data.channel_url || `https://www.youtube.com/watch?v=${videoId}`
        },
        duration: formatDuration(data.duration),
        durationSeconds: parseInt(data.duration, 10) || 0,
        views: formatViews(data.view_count),
        uploadDate: data.upload_date ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}` : 'Recent',
        thumbnail: data.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        thumbnails,
        videoFormats,
        audioFormats
      });
    } catch (parseErr) {
      console.error('Metadata parse error:', parseErr);
      return res.status(500).json({ error: 'Failed to process metadata.' });
    }
  });
});

app.get('/api/download', async (req: Request, res: Response) => {
  const { url, itag, format = 'mp4', title = 'video', quality = '' } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL query parameter is required.' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL provided.' });
  }

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.error('CRITICAL: FFmpeg binary not found at path:', ffmpegPath);
    return res.status(503).json({ error: 'FFmpeg processing dependency is unavailable on the server.' });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const cleanTitle = sanitizeFilename(title as string);
  const ext = format === 'mp3' ? 'mp3' : 'mp4';

  let targetHeight = 1080;
  const qStr = String(quality).toLowerCase();
  if (qStr.includes('2160') || qStr.includes('4k')) targetHeight = 2160;
  else if (qStr.includes('1440') || qStr.includes('2k')) targetHeight = 1440;
  else if (qStr.includes('1080')) targetHeight = 1080;
  else if (qStr.includes('720')) targetHeight = 720;
  else if (qStr.includes('480')) targetHeight = 480;
  else if (qStr.includes('360')) targetHeight = 360;

  const validItag = (itag && itag !== 'undefined' && itag !== 'null') ? String(itag).trim() : null;

  const sessionDir = path.join(TMP_DIR, `dl_${videoId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const tempOutputFile = path.join(sessionDir, `output.${ext}`);

  const args = [
    '--js-runtimes', 'node',
    '--cache-dir', CACHE_DIR,
    '--ffmpeg-location', ffmpegPath,
    '-N', '8',                        // 8 concurrent fragment download connections
    '--concurrent-fragments', '8',
    '--throttled-rate', '100K',        // Automatically reset throttled HTTP connections
    '--http-chunk-size', '10M',       // High throughput HTTP chunk buffer
    '--socket-timeout', '15',
    '--retries', '10',
    '--fragment-retries', '10',
    '--no-mtime',                     // Don't set file modification time (saves I/O)
    '-S', `res:${targetHeight},ext:mp4:m4a` // Prefer fast MP4/H.264 streams requiring zero transcoding
  ];

  if (format === 'mp3') {
    const audioSpec = validItag ? `${validItag}/ba/140/251/b` : 'ba/140/251/b';
    args.push(
      '-f', audioSpec,
      '-x',                           // Extract audio directly
      '--audio-format', 'mp3',
      '--audio-quality', '0',         // Best VBR MP3 quality
      '-o', tempOutputFile,
      videoUrl
    );
  } else {
    let videoSpec = `bv*[height<=${targetHeight}]+ba/b[height<=${targetHeight}]/best`;
    if (validItag) {
      videoSpec = `${validItag}+ba/${validItag}/bv*[height<=${targetHeight}]+ba/b[height<=${targetHeight}]/best`;
    }
    args.push(
      '-f', videoSpec,
      '--merge-output-format', 'mp4',
      '-o', tempOutputFile,
      videoUrl
    );
  }

  console.log(`[DOWNLOAD PROCESSING] Video ID: ${videoId} | Target: ${ext.toUpperCase()} ${targetHeight}p | Args: -N 8 --throttled-rate 100K`);

  execFile(YTDLP_PATH, args, { timeout: 180000 }, async (err, stdout, stderr) => {
    if (err || !fs.existsSync(tempOutputFile)) {
      console.error(`yt-dlp processing failed for ${videoId}:`, stderr || err?.message);
      cleanupDir(sessionDir);
      
      const errLower = (stderr || err?.message || '').toLowerCase();
      if (errLower.includes('private') || errLower.includes('unavailable')) {
        return res.status(404).json({ error: 'Video is private or unavailable.' });
      }
      return res.status(500).json({ error: 'Video & audio download/merging process failed on server.' });
    }

    try {
      const validation = await validateFileStreams(tempOutputFile);
      console.log(`[FFPROBE VALIDATION] ${videoId} -> Streams:`, validation.streams.map((s: any) => `${s.codec_type}:${s.codec_name}`).join(', '));

      if (format === 'mp4' && (!validation.hasVideo || !validation.hasAudio)) {
        console.error(`[VALIDATION ERROR] Output file for ${videoId} missing required streams (hasVideo: ${validation.hasVideo}, hasAudio: ${validation.hasAudio})`);
        cleanupDir(sessionDir);
        return res.status(422).json({ error: 'Generated video file lacks an audio stream. Download aborted.' });
      }

      if (format === 'mp3' && !validation.hasAudio) {
        console.error(`[VALIDATION ERROR] Output file for ${videoId} missing audio stream`);
        cleanupDir(sessionDir);
        return res.status(422).json({ error: 'Generated audio file is invalid. Download aborted.' });
      }

      const stat = fs.statSync(tempOutputFile);
      const asciiFilename = `${cleanTitle.replace(/[^\x20-\x7E]/g, '_')}.${ext}`;
      const utf8Filename = encodeURIComponent(`${cleanTitle}.${ext}`);

      res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
      res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
      res.setHeader('Content-Length', stat.size);
      res.status(200);

      const readStream = fs.createReadStream(tempOutputFile);
      readStream.pipe(res);

      let cleanedUp = false;
      const doCleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          try {
            readStream.destroy();
          } catch (e) {}
          cleanupDir(sessionDir);
        }
      };

      readStream.on('end', doCleanup);
      readStream.on('error', (streamErr) => {
        console.error('ReadStream error:', streamErr);
        doCleanup();
      });

      req.on('close', () => {
        doCleanup();
      });

    } catch (validErr) {
      console.error('FFprobe validation execution error:', validErr);
      cleanupDir(sessionDir);
      return res.status(500).json({ error: 'Failed to validate generated media streams.' });
    }
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'YouTube Downloader API Service' });
});

app.get('/favicon.ico', (req: Request, res: Response) => {
  res.status(204).end();
});

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled API Error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

