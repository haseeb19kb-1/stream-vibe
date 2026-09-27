"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const ffprobe_1 = __importDefault(require("@ffprobe-installer/ffprobe"));
const ffprobePath = ffprobe_1.default.path;
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '30'),
});
app.use(limiter);
const TMP_DIR = path_1.default.join(__dirname, '../tmp');
if (!fs_1.default.existsSync(TMP_DIR)) {
    fs_1.default.mkdirSync(TMP_DIR, { recursive: true });
}
function getYtDlpPath() {
    const rootExe = path_1.default.resolve(__dirname, '../../../bin/yt-dlp.exe');
    const rootBin = path_1.default.resolve(__dirname, '../../../bin/yt-dlp');
    if (process.platform === 'win32' && fs_1.default.existsSync(rootExe)) {
        return rootExe;
    }
    if (fs_1.default.existsSync(rootBin)) {
        return rootBin;
    }
    return 'yt-dlp';
}
const YTDLP_PATH = getYtDlpPath();
const CACHE_DIR = path_1.default.join(TMP_DIR, '.cache');
if (!fs_1.default.existsSync(CACHE_DIR)) {
    fs_1.default.mkdirSync(CACHE_DIR, { recursive: true });
}
function extractVideoId(url) {
    if (!url)
        return null;
    let str = url.trim();
    try {
        str = decodeURIComponent(str);
    }
    catch {
        // Keep raw
    }
    const patterns = [
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
        /^([\w-]{11})$/
    ];
    for (const regex of patterns) {
        const match = str.match(regex);
        if (match && match[1])
            return match[1];
    }
    return null;
}
function sanitizeFilename(name) {
    return (name || 'video')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim()
        .substring(0, 150);
}
function formatDuration(sec) {
    const seconds = parseInt(sec, 10) || 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatViews(views) {
    const n = parseInt(views, 10);
    if (isNaN(n))
        return 'N/A';
    if (n >= 1_000_000_000)
        return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000)
        return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)
        return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}
function validateFileStreams(filePath) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'stream=codec_type,codec_name',
            '-of', 'json',
            filePath
        ], (err, stdout, stderr) => {
            if (err)
                return reject(err);
            try {
                const data = JSON.parse(stdout);
                const streams = data.streams || [];
                const hasVideo = streams.some((s) => s.codec_type === 'video');
                const hasAudio = streams.some((s) => s.codec_type === 'audio');
                resolve({ hasVideo, hasAudio, streams });
            }
            catch (e) {
                reject(e);
            }
        });
    });
}
function cleanupDir(dirPath) {
    try {
        if (fs_1.default.existsSync(dirPath)) {
            fs_1.default.rmSync(dirPath, { recursive: true, force: true });
        }
    }
    catch (e) {
        console.warn(`Cleanup warning for ${dirPath}:`, e.message);
    }
}
app.get('/api/health', (req, res) => {
    const ffmpegOk = ffmpeg_static_1.default ? fs_1.default.existsSync(ffmpeg_static_1.default) : false;
    const ffprobeOk = ffprobePath ? fs_1.default.existsSync(ffprobePath) : false;
    res.json({
        status: 'ok',
        service: 'YouTube Downloader API Service',
        engine: YTDLP_PATH,
        ffmpeg: { path: ffmpeg_static_1.default, available: ffmpegOk },
        ffprobe: { path: ffprobePath, available: ffprobeOk },
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});
app.post('/api/info', (req, res) => {
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
    (0, child_process_1.execFile)(YTDLP_PATH, args, { maxBuffer: 15 * 1024 * 1024, timeout: 25000 }, (error, stdout, stderr) => {
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
            const videoFormats = [];
            const seenQualities = new Set();
            const rawFormats = data.formats || [];
            const rawVideoFormats = rawFormats
                .filter((f) => f.vcodec && f.vcodec !== 'none')
                .sort((a, b) => (b.height || 0) - (a.height || 0));
            for (const f of rawVideoFormats) {
                const height = f.height || 0;
                let qualityLabel = f.format_note || (height ? `${height}p` : 'SD');
                if (height >= 2160)
                    qualityLabel = '4K (2160p)';
                else if (height >= 1440)
                    qualityLabel = '2K (1440p)';
                else if (height >= 1080)
                    qualityLabel = '1080p Full HD';
                else if (height >= 720)
                    qualityLabel = '720p HD';
                else if (height >= 480)
                    qualityLabel = '480p SD';
                else if (height >= 360)
                    qualityLabel = '360p Medium';
                if (!seenQualities.has(qualityLabel)) {
                    seenQualities.add(qualityLabel);
                    let sizeText = 'HD Stream';
                    if (f.filesize) {
                        sizeText = `${(f.filesize / (1024 * 1024)).toFixed(1)} MB`;
                    }
                    else if (f.filesize_approx) {
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
            const audioFormats = [];
            const seenAudioKeys = new Set();
            const rawAudioFormats = rawFormats
                .filter((f) => f.acodec && f.acodec !== 'none')
                .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
            for (const f of rawAudioFormats) {
                const abr = Math.round(f.abr || f.tbr || 128);
                let qualityText = `${abr} kbps`;
                if (abr >= 256)
                    qualityText = '320 kbps (High Fidelity)';
                else if (abr >= 160)
                    qualityText = '192 kbps (High Quality)';
                else if (abr >= 96)
                    qualityText = '128 kbps (Standard)';
                if (!seenAudioKeys.has(qualityText)) {
                    seenAudioKeys.add(qualityText);
                    let sizeText = 'Audio Stream';
                    if (f.filesize) {
                        sizeText = `${(f.filesize / (1024 * 1024)).toFixed(1)} MB`;
                    }
                    else if (f.filesize_approx) {
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
        }
        catch (parseErr) {
            console.error('Metadata parse error:', parseErr);
            return res.status(500).json({ error: 'Failed to process metadata.' });
        }
    });
});
app.get('/api/download', async (req, res) => {
    const { url, itag, format = 'mp4', title = 'video', quality = '' } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL query parameter is required.' });
    }
    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL provided.' });
    }
    if (!ffmpeg_static_1.default || !fs_1.default.existsSync(ffmpeg_static_1.default)) {
        console.error('CRITICAL: FFmpeg binary not found at path:', ffmpeg_static_1.default);
        return res.status(503).json({ error: 'FFmpeg processing dependency is unavailable on the server.' });
    }
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const cleanTitle = sanitizeFilename(title);
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    let targetHeight = 1080;
    const qStr = String(quality).toLowerCase();
    if (qStr.includes('2160') || qStr.includes('4k'))
        targetHeight = 2160;
    else if (qStr.includes('1440') || qStr.includes('2k'))
        targetHeight = 1440;
    else if (qStr.includes('1080'))
        targetHeight = 1080;
    else if (qStr.includes('720'))
        targetHeight = 720;
    else if (qStr.includes('480'))
        targetHeight = 480;
    else if (qStr.includes('360'))
        targetHeight = 360;
    const validItag = (itag && itag !== 'undefined' && itag !== 'null') ? String(itag).trim() : null;
    const sessionDir = path_1.default.join(TMP_DIR, `dl_${videoId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs_1.default.mkdirSync(sessionDir, { recursive: true });
    const tempOutputFile = path_1.default.join(sessionDir, `output.${ext}`);
    const args = [
        '--js-runtimes', 'node',
        '--cache-dir', CACHE_DIR,
        '--ffmpeg-location', ffmpeg_static_1.default,
        '-N', '8', // 8 concurrent fragment download connections
        '--concurrent-fragments', '8',
        '--throttled-rate', '100K', // Automatically reset throttled HTTP connections
        '--http-chunk-size', '10M', // High throughput HTTP chunk buffer
        '--socket-timeout', '15',
        '--retries', '10',
        '--fragment-retries', '10',
        '--no-mtime', // Don't set file modification time (saves I/O)
        '-S', `res:${targetHeight},ext:mp4:m4a` // Prefer fast MP4/H.264 streams requiring zero transcoding
    ];
    if (format === 'mp3') {
        const audioSpec = validItag ? `${validItag}/ba/140/251/b` : 'ba/140/251/b';
        args.push('-f', audioSpec, '-x', // Extract audio directly
        '--audio-format', 'mp3', '--audio-quality', '0', // Best VBR MP3 quality
        '-o', tempOutputFile, videoUrl);
    }
    else {
        let videoSpec = `bv*[height<=${targetHeight}]+ba/b[height<=${targetHeight}]/best`;
        if (validItag) {
            videoSpec = `${validItag}+ba/${validItag}/bv*[height<=${targetHeight}]+ba/b[height<=${targetHeight}]/best`;
        }
        args.push('-f', videoSpec, '--merge-output-format', 'mp4', '-o', tempOutputFile, videoUrl);
    }
    console.log(`[DOWNLOAD PROCESSING] Video ID: ${videoId} | Target: ${ext.toUpperCase()} ${targetHeight}p | Args: -N 8 --throttled-rate 100K`);
    (0, child_process_1.execFile)(YTDLP_PATH, args, { timeout: 180000 }, async (err, stdout, stderr) => {
        if (err || !fs_1.default.existsSync(tempOutputFile)) {
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
            console.log(`[FFPROBE VALIDATION] ${videoId} -> Streams:`, validation.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(', '));
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
            const stat = fs_1.default.statSync(tempOutputFile);
            const asciiFilename = `${cleanTitle.replace(/[^\x20-\x7E]/g, '_')}.${ext}`;
            const utf8Filename = encodeURIComponent(`${cleanTitle}.${ext}`);
            res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`);
            res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
            res.setHeader('Content-Length', stat.size);
            res.status(200);
            const readStream = fs_1.default.createReadStream(tempOutputFile);
            readStream.pipe(res);
            let cleanedUp = false;
            const doCleanup = () => {
                if (!cleanedUp) {
                    cleanedUp = true;
                    try {
                        readStream.destroy();
                    }
                    catch (e) { }
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
        }
        catch (validErr) {
            console.error('FFprobe validation execution error:', validErr);
            cleanupDir(sessionDir);
            return res.status(500).json({ error: 'Failed to validate generated media streams.' });
        }
    });
});
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'YouTube Downloader API Service' });
});
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});
app.use((err, req, res, next) => {
    console.error('Unhandled API Error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
});
