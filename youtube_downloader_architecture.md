# YouTube Video Downloader — Project Architecture

## 1. Project Goal

Build a modern, fast, responsive YouTube video downloader web application for videos that the user owns or is authorized to download.

> **Important:** The application should only support downloading content where the user has the necessary rights or permission. Review YouTube's current Terms of Service and applicable copyright laws before production deployment.

---

# 2. Recommended Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide Icons

## Backend

- Node.js
- TypeScript
- Express or Fastify
- REST API

## Database

- PostgreSQL
- Optional: Supabase for PostgreSQL and authentication

## Processing

- FFmpeg
- FFprobe
- Background worker
- Redis
- Job queue

## Storage

Development:
- Local temporary storage

Production:
- S3-compatible object storage

---

# 3. High-Level Architecture

```text
                    ┌──────────────────────┐
                    │       Browser        │
                    │  Next.js Frontend    │
                    └──────────┬───────────┘
                               │
                               │ HTTPS / REST API
                               ▼
                    ┌──────────────────────┐
                    │      API Server      │
                    │ Node.js + TypeScript │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
       ┌───────────┐     ┌───────────┐    ┌─────────────┐
       │ PostgreSQL│     │   Redis   │    │  Storage    │
       │ Database  │     │   Queue   │    │ S3 / Local  │
       └───────────┘     └─────┬─────┘    └─────────────┘
                               │
                               ▼
                       ┌──────────────┐
                       │ Worker       │
                       │ FFmpeg       │
                       │ FFprobe      │
                       └──────────────┘
```

---

# 4. Complete Project Structure

```text
youtube-downloader/
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── download/
│   │   │   ├── history/
│   │   │   ├── privacy/
│   │   │   ├── terms/
│   │   │   └── api/
│   │   │
│   │   ├── components/
│   │   │   ├── DownloaderForm.tsx
│   │   │   ├── VideoPreview.tsx
│   │   │   ├── QualitySelector.tsx
│   │   │   ├── FormatSelector.tsx
│   │   │   ├── DownloadButton.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── ErrorMessage.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── validators.ts
│   │   │   └── utils.ts
│   │   │
│   │   └── public/
│   │       ├── images/
│   │       └── icons/
│   │
│   └── api/
│       ├── src/
│       │   ├── server.ts
│       │   │
│       │   ├── routes/
│       │   │   ├── video.routes.ts
│       │   │   ├── download.routes.ts
│       │   │   └── health.routes.ts
│       │   │
│       │   ├── controllers/
│       │   │   ├── video.controller.ts
│       │   │   └── download.controller.ts
│       │   │
│       │   ├── services/
│       │   │   ├── video.service.ts
│       │   │   ├── download.service.ts
│       │   │   ├── storage.service.ts
│       │   │   └── ffmpeg.service.ts
│       │   │
│       │   ├── workers/
│       │   │   └── download.worker.ts
│       │   │
│       │   ├── middleware/
│       │   │   ├── rateLimit.ts
│       │   │   ├── security.ts
│       │   │   ├── validation.ts
│       │   │   └── errorHandler.ts
│       │   │
│       │   ├── database/
│       │   │   ├── schema/
│       │   │   └── migrations/
│       │   │
│       │   └── utils/
│       │       ├── logger.ts
│       │       └── cleanup.ts
│       │
│       └── package.json
│
├── packages/
│   ├── types/
│   ├── config/
│   └── ui/
│
├── scripts/
│   └── cleanup.ts
│
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── docker-compose.yml
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

---

# 5. Environment Variables

Create `.env.example`:

```env
# ==========================================
# APPLICATION
# ==========================================

NODE_ENV=development

APP_NAME=YouTube Downloader

WEB_URL=http://localhost:3000

API_URL=http://localhost:4000


# ==========================================
# SERVER
# ==========================================

PORT=4000

HOST=0.0.0.0


# ==========================================
# DATABASE
# ==========================================

DATABASE_URL=postgresql://postgres:password@localhost:5432/youtube_downloader


# ==========================================
# REDIS
# ==========================================

REDIS_URL=redis://localhost:6379


# ==========================================
# STORAGE
# ==========================================

STORAGE_PROVIDER=local

TEMP_DOWNLOAD_DIR=./tmp/downloads

MAX_FILE_SIZE_MB=500


# ==========================================
# OBJECT STORAGE
# ==========================================

S3_ENDPOINT=

S3_REGION=

S3_BUCKET=

S3_ACCESS_KEY=

S3_SECRET_KEY=


# ==========================================
# MEDIA PROCESSING
# ==========================================

FFMPEG_PATH=ffmpeg

FFPROBE_PATH=ffprobe


# ==========================================
# SECURITY
# ==========================================

JWT_SECRET=change_this_to_a_long_random_secret

API_SECRET=change_this_to_a_long_random_secret


# ==========================================
# RATE LIMIT
# ==========================================

RATE_LIMIT_WINDOW_MS=60000

RATE_LIMIT_MAX_REQUESTS=20


# ==========================================
# FILE CLEANUP
# ==========================================

FILE_EXPIRATION_MINUTES=30


# ==========================================
# LOGGING
# ==========================================

LOG_LEVEL=info
```

## `.env` Security

Never commit the real `.env` file to Git.

Add this to `.gitignore`:

```gitignore
.env
.env.local
.env.production
node_modules/
tmp/
downloads/
*.log
```

---

# 6. Frontend Requirements

The homepage should be clean, modern, fast, and mobile responsive.

## Header

Include:

- Logo
- Home
- Download
- History
- FAQ
- Privacy
- Terms

## Hero Section

```text
Download Videos Easily

Enter a URL to process an authorized video.

[ Paste video URL here................ ]

[ Get Video Info ]
```

## Video Information Card

After successful URL processing:

```text
┌──────────────────────────────────────────┐
│ Thumbnail                                │
│                                          │
│ Video Title                              │
│ Duration: 05:20                          │
│                                          │
│ Quality                                  │
│ [1080p] [720p] [480p]                   │
│                                          │
│ Format                                   │
│ [ MP4 ▼ ]                                │
│                                          │
│              [ Download ]                │
└──────────────────────────────────────────┘
```

## Loading States

Display:

- Loading spinner
- Processing message
- Progress bar
- Download status

## Error States

Handle:

- Invalid URL
- Unsupported URL
- Video unavailable
- Processing failure
- File too large
- Rate limit exceeded
- Server error

---

# 7. API Architecture

## Health Check

```http
GET /api/health
```

Response:

```json
{
  "success": true,
  "status": "ok"
}
```

---

## Get Video Information

```http
POST /api/video/info
```

Request:

```json
{
  "url": "USER_PROVIDED_URL"
}
```

Response:

```json
{
  "success": true,
  "video": {
    "title": "Example Video",
    "thumbnail": "THUMBNAIL_URL",
    "duration": 320
  },
  "formats": [
    {
      "quality": "720p",
      "format": "mp4",
      "size": 25000000
    },
    {
      "quality": "480p",
      "format": "mp4",
      "size": 15000000
    }
  ]
}
```

---

# 8. Download API

## Create Download Job

```http
POST /api/download
```

Request:

```json
{
  "url": "USER_PROVIDED_URL",
  "quality": "720p",
  "format": "mp4"
}
```

Response:

```json
{
  "success": true,
  "jobId": "JOB_ID"
}
```

---

# 9. Download Progress

```http
GET /api/download/:jobId
```

Response:

```json
{
  "jobId": "JOB_ID",
  "status": "processing",
  "progress": 65
}
```

Possible statuses:

```text
queued
processing
completed
failed
expired
```

---

# 10. Download Processing Flow

```text
User enters URL
       │
       ▼
Validate URL
       │
       ▼
Check supported source
       │
       ▼
Get metadata
       │
       ▼
Show video information
       │
       ▼
User selects quality
       │
       ▼
Create download job
       │
       ▼
Add job to Redis queue
       │
       ▼
Worker receives job
       │
       ▼
Authorized media processing
       │
       ▼
FFmpeg processing if required
       │
       ▼
Save temporary file
       │
       ▼
Upload to storage if production
       │
       ▼
Return temporary download URL
       │
       ▼
User downloads file
       │
       ▼
Automatic cleanup
```

---

# 11. Database Schema

## Users

```text
users
--------------------------------
id
email
password_hash
created_at
updated_at
```

Authentication is optional for the first MVP.

---

## Download Jobs

```text
download_jobs
--------------------------------
id
user_id
source_url
title
quality
format
status
progress
file_path
file_size
created_at
completed_at
expires_at
```

---

## Download Logs

```text
download_logs
--------------------------------
id
job_id
ip_hash
status
error
created_at
```

---

# 12. Security Requirements

## URL Validation

Every submitted URL must be validated before processing.

Flow:

```text
User URL
   ↓
Parse URL
   ↓
Normalize URL
   ↓
Validate hostname
   ↓
Validate protocol
   ↓
Process only allowed sources
```

Never trust raw user input.

---

## Rate Limiting

Example:

```text
20 requests / minute / IP
```

Rate limits should apply to:

- Metadata requests
- Download jobs
- API requests

---

## File Limits

Configure:

```text
Maximum file size
Maximum processing duration
Maximum concurrent jobs
Maximum requests per IP
```

---

## Temporary Files

Files should not remain on the server indefinitely.

Example:

```text
Download completed
       ↓
File available temporarily
       ↓
Expiration time reached
       ↓
Automatic deletion
```

---

# 13. Redis Queue

Large media processing should not run directly inside the API request.

Recommended architecture:

```text
Frontend
   ↓
API
   ↓
Redis Queue
   ↓
Worker
   ↓
Media Processing
   ↓
Storage
   ↓
Download URL
```

Benefits:

- Better performance
- Multiple workers
- Retry support
- Prevents API blocking
- Better scalability

---

# 14. FFmpeg Requirements

Install:

```text
FFmpeg
FFprobe
```

The backend should use FFmpeg only for legitimate media processing of authorized content.

Possible operations:

- Media inspection
- Audio/video processing
- Format conversion
- Merging compatible authorized media streams
- File validation

Do not expose FFmpeg commands directly to users.

---

# 15. Storage

## Development

Use:

```text
./tmp/downloads
```

## Production

Use:

```text
S3-compatible object storage
```

Recommended flow:

```text
Worker
  ↓
Process file
  ↓
Upload to object storage
  ↓
Generate temporary download URL
  ↓
Return URL
  ↓
Automatic expiration
```

---

# 16. Admin Dashboard

Create:

```text
/admin
```

Dashboard sections:

```text
Dashboard
├── Total Jobs
├── Active Jobs
├── Completed Jobs
├── Failed Jobs
├── Storage Used
├── Users
├── Download Logs
├── Blocked IPs
├── Rate Limits
└── System Health
```

---

# 17. Admin Statistics

Display:

```text
Total Downloads
Today's Downloads
Active Jobs
Failed Jobs
Storage Used
Average Processing Time
Server Status
Database Status
Redis Status
```

---

# 18. Error Handling

Use a centralized error handler.

Example response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Please enter a valid supported URL."
  }
}
```

Suggested error codes:

```text
INVALID_URL
UNSUPPORTED_URL
VIDEO_UNAVAILABLE
PROCESSING_FAILED
FILE_TOO_LARGE
RATE_LIMITED
JOB_NOT_FOUND
STORAGE_ERROR
SERVER_ERROR
```

Do not expose internal stack traces to users.

---

# 19. Performance

Implement:

- Lazy loading
- Image optimization
- API caching where appropriate
- Database indexes
- Redis caching
- Background jobs
- Concurrent workers with limits
- Automatic cleanup
- CDN for static assets
- Compression
- HTTP caching headers

---

# 20. SEO

Add:

```text
Title
Meta description
Open Graph tags
Twitter/X card metadata
Canonical URL
robots.txt
sitemap.xml
Structured data where appropriate
```

Suggested pages:

```text
/
 /download
 /history
 /faq
 /privacy
 /terms
```

---

# 21. Legal / Compliance Pages

Include:

```text
Privacy Policy
Terms of Service
Copyright / Authorized Use Notice
Contact
```

The application should clearly communicate that users are responsible for having permission to download content.

---

# 22. Docker Architecture

Example:

```text
docker-compose.yml

services:

  web:
    Next.js frontend

  api:
    Node.js API

  worker:
    Background processing worker

  postgres:
    PostgreSQL database

  redis:
    Redis queue

  storage:
    Optional local/S3-compatible storage
```

Architecture:

```text
                ┌──────────┐
                │   Web    │
                └────┬─────┘
                     │
                ┌────▼─────┐
                │   API    │
                └────┬─────┘
                     │
          ┌──────────┴──────────┐
          │                     │
     ┌────▼─────┐          ┌────▼─────┐
     │ Postgres │          │  Redis   │
     └──────────┘          └────┬─────┘
                                │
                           ┌────▼─────┐
                           │  Worker  │
                           └────┬─────┘
                                │
                           ┌────▼─────┐
                           │ Storage  │
                           └──────────┘
```

---

# 23. Development Phases

## Phase 1 — UI

Build:

- Header
- Hero section
- URL input
- Video preview
- Quality selector
- Download button
- Loading states
- Error states
- Footer

## Phase 2 — Backend

Build:

- Node.js server
- API routes
- Validation
- Error handling
- Security middleware

## Phase 3 — Metadata

Build:

- URL validation
- Authorized source processing
- Metadata retrieval
- Format detection

## Phase 4 — Download Jobs

Build:

- Job creation
- Redis queue
- Worker
- Progress tracking

## Phase 5 — Media Processing

Build:

- FFmpeg integration
- File validation
- Temporary storage
- Cleanup

## Phase 6 — Database

Build:

- PostgreSQL
- Users
- Download jobs
- Logs
- Indexes

## Phase 7 — Security

Build:

- Rate limiting
- Input validation
- File limits
- Abuse protection
- Secure headers
- CORS configuration

## Phase 8 — Admin

Build:

- Dashboard
- Statistics
- Logs
- System health
- Job management

## Phase 9 — Production

Configure:

- HTTPS
- Domain
- Reverse proxy
- Object storage
- Redis
- PostgreSQL
- Worker server
- Monitoring
- Backups

---

# 24. Production Architecture

```text
                    INTERNET
                       │
                       ▼
                ┌─────────────┐
                │ CDN / WAF   │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ Next.js Web │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ API Server  │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     PostgreSQL      Redis       Storage
          │            │            │
          │            ▼            │
          │         Workers         │
          │            │            │
          │            ▼            │
          │        FFmpeg           │
          │            │            │
          └────────────┴────────────┘
```

---

# 25. Environment Checklist

Before running the application:

```text
[ ] Node.js installed
[ ] PostgreSQL configured
[ ] Redis configured
[ ] FFmpeg installed
[ ] FFprobe installed
[ ] .env configured
[ ] Database migrations completed
[ ] Temporary storage directory created
[ ] API running
[ ] Worker running
[ ] Frontend running
```

---

# 26. Important Development Rules

1. Never expose secrets in frontend code.
2. Never commit `.env`.
3. Validate every URL server-side.
4. Never trust client-provided file size or format.
5. Use rate limiting.
6. Use a queue for long-running processing.
7. Automatically delete temporary files.
8. Do not expose server stack traces.
9. Keep database credentials server-side.
10. Use HTTPS in production.
11. Restrict CORS to trusted origins.
12. Add monitoring and logging.
13. Only process content the user is authorized to download.
14. Keep the frontend responsive on mobile, tablet, and desktop.

---

# 27. MVP Feature List

The first version should contain:

```text
✓ Modern responsive UI
✓ URL input
✓ URL validation
✓ Video metadata
✓ Thumbnail preview
✓ Quality selection
✓ Format selection
✓ Download job
✓ Progress indicator
✓ Error handling
✓ Rate limiting
✓ Temporary storage
✓ Automatic cleanup
✓ Privacy page
✓ Terms page
✓ Mobile responsive design
✓ SEO basics
```

---

# 28. Future Features

After the MVP is stable:

```text
- User accounts
- Download history
- Favorites
- Admin dashboard
- Usage analytics
- Multiple worker servers
- Object storage
- CDN
- API access
- Subscription system
- Usage limits
- Multi-language support
- Dark/light theme
- Advanced monitoring
```

---

# 29. AI Coding Agent Instructions

When implementing this project:

1. First create the complete folder structure.
2. Configure TypeScript.
3. Configure environment variables.
4. Build the frontend UI.
5. Build the backend API.
6. Add database configuration.
7. Add URL validation.
8. Add metadata processing for authorized content.
9. Add Redis job queue.
10. Add worker architecture.
11. Add FFmpeg integration for legitimate media processing.
12. Add progress tracking.
13. Add temporary storage and cleanup.
14. Add security middleware.
15. Add rate limiting.
16. Add error handling.
17. Add SEO.
18. Add Privacy and Terms pages.
19. Add tests.
20. Verify the complete application before production deployment.

Do not leave placeholder buttons that appear functional but do nothing. Every implemented button should have a working action or an explicit disabled state.

Do not hard-code secrets, API keys, passwords, database credentials, or storage credentials.

---

# 30. Final Architecture

```text
Frontend
   │
   ├── Next.js
   ├── React
   ├── TypeScript
   └── Tailwind
   │
   ▼
Backend API
   │
   ├── Validation
   ├── Security
   ├── Rate Limiting
   ├── Metadata
   └── Download Jobs
   │
   ├───────────────┐
   ▼               ▼
PostgreSQL       Redis
                    │
                    ▼
                 Worker
                    │
                    ▼
                 FFmpeg
                    │
                    ▼
                 Storage
                    │
                    ▼
             Temporary URL
                    │
                    ▼
                  User
```

This architecture is designed to start as an MVP and scale into a production application without having to completely rewrite the project.
