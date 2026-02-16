"""
Cloud Run FFmpeg Export Service

Processes video export requests:
1. Downloads video clips from provided URLs
2. Applies trims, filters, concatenation via FFmpeg
3. Adds subtitles, music if provided
4. Uploads result to R2
5. Returns download URL
"""

import os
import subprocess
import tempfile
import shutil
import uuid
import asyncio
from pathlib import Path
from typing import Optional

import httpx
import boto3
from botocore.config import Config
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Glimmer Export Service")

# R2 Configuration (S3-compatible)
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "glimmer-videos")

# Service auth token
SERVICE_AUTH_TOKEN = os.environ.get("EXPORT_SERVICE_TOKEN")


def get_r2_client():
    """Create R2 client using S3-compatible API."""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )


# --- Pydantic Models ---

class ClipData(BaseModel):
    url: str  # URL to fetch the video clip
    trimStart: float = 0
    trimEnd: float
    speed: float = 1.0
    volume: float = 1.0
    filter: Optional[str] = None


class SubtitleData(BaseModel):
    text: str
    startTime: float
    endTime: float
    position: str = "bottom"  # top, center, bottom
    x: Optional[float] = None
    y: Optional[float] = None


class MusicClipData(BaseModel):
    url: str
    timelinePosition: float = 0
    trimStart: float = 0
    trimEnd: float
    volume: float = 0.5


class TitleCardData(BaseModel):
    text: str
    subtitle: Optional[str] = None
    durationSeconds: float = 3
    backgroundColor: str = "#000000"
    textColor: str = "#FFFFFF"


class ExportRequest(BaseModel):
    jobId: str
    clips: list[ClipData]
    subtitles: list[SubtitleData] = []
    musicClips: list[MusicClipData] = []
    titleCard: Optional[TitleCardData] = None
    outroCard: Optional[TitleCardData] = None
    resolution: str = "1280x720"


class ExportResponse(BaseModel):
    success: bool
    videoUrl: Optional[str] = None
    r2Key: Optional[str] = None
    error: Optional[str] = None
    durationSeconds: Optional[float] = None
    fileSizeMB: Optional[float] = None


class AsyncExportResponse(BaseModel):
    exportId: str
    status: str  # 'processing', 'complete', 'error'


class ExportStatusResponse(BaseModel):
    exportId: str
    status: str  # 'processing', 'complete', 'error'
    r2Key: Optional[str] = None
    error: Optional[str] = None
    durationSeconds: Optional[float] = None
    fileSizeMB: Optional[float] = None


# In-memory store for async export status (simple solution for single instance)
# For production scale, use Redis or Firestore
export_status_store: dict[str, dict] = {}


# --- FFmpeg Processing ---

# Common encoding args to ensure identical codec params across all clips
# This is CRITICAL for concat to work correctly
COMMON_VIDEO_ARGS = [
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
]
COMMON_AUDIO_ARGS = [
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
]

FILTER_MAP = {
    "grayscale": "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
    "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
    "warm": "colortemperature=temperature=6500",
    "cool": "colortemperature=temperature=10000",
    "vintage": "curves=vintage",
    "vivid": "eq=saturation=1.5:contrast=1.1",
}


async def download_file(url: str, dest_path: str) -> bool:
    """Download a file from URL to local path."""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(response.content)
        return True
    except Exception as e:
        print(f"[Download] Failed to download {url}: {e}")
        return False


def escape_ffmpeg_text(text: str) -> str:
    """Escape text for FFmpeg drawtext filter."""
    return (
        text.replace("\\", "\\\\")
        .replace("'", "'\\''")
        .replace(":", "\\:")
        .replace("%", "%%")
    )


def generate_ass_subtitles(subtitles: list[SubtitleData]) -> str:
    """Generate ASS subtitle file content."""
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bottom,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1
Style: Top,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,10,10,30,1
Style: Center,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,5,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def format_time(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = seconds % 60
        return f"{h}:{m:02d}:{s:05.2f}"

    events = []
    for sub in subtitles:
        style = "Top" if sub.position == "top" else "Center" if sub.position == "center" else "Bottom"
        start = format_time(sub.startTime)
        end = format_time(sub.endTime)
        pos_tag = ""
        if sub.x is not None and sub.y is not None:
            pos_tag = f"{{\\pos({int(sub.x * 1280)},{int(sub.y * 720)})}}"
        events.append(f"Dialogue: 0,{start},{end},{style},,0,0,0,,{pos_tag}{sub.text}")

    return header + "\n".join(events) + "\n"


def run_ffmpeg(args: list[str], description: str = "FFmpeg") -> bool:
    """Run FFmpeg command and return success status."""
    cmd = ["ffmpeg", "-y"] + args
    print(f"[{description}] Running: {' '.join(cmd[:20])}...")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )
        if result.returncode != 0:
            print(f"[{description}] Failed: {result.stderr[-500:]}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print(f"[{description}] Timeout after 10 minutes")
        return False
    except Exception as e:
        print(f"[{description}] Error: {e}")
        return False


async def process_export(request: ExportRequest, work_dir: Path) -> tuple[bool, str, Optional[Path]]:
    """
    Process the export request and return (success, message, output_path).
    """
    clips_dir = work_dir / "clips"
    clips_dir.mkdir(exist_ok=True)

    processed_clips: list[Path] = []
    width, height = request.resolution.split("x")

    # --- Download and process each clip ---
    for i, clip in enumerate(request.clips):
        print(f"[Export] Processing clip {i + 1}/{len(request.clips)}")

        # Download
        input_path = clips_dir / f"input_{i}.mp4"
        if not await download_file(clip.url, str(input_path)):
            return False, f"Failed to download clip {i + 1}", None

        # Build filter chain
        vf_parts = [
            f"trim=start={clip.trimStart}:end={clip.trimEnd}",
            "setpts=PTS-STARTPTS",
        ]
        if clip.speed != 1.0:
            vf_parts.append(f"setpts=PTS/{clip.speed}")
        if clip.filter and clip.filter in FILTER_MAP:
            vf_parts.append(FILTER_MAP[clip.filter])
        vf_parts.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:-1:-1:color=black")

        # Audio filters
        af_parts = [
            f"atrim=start={clip.trimStart}:end={clip.trimEnd}",
            "asetpts=PTS-STARTPTS",
        ]
        if clip.speed != 1.0:
            tempo = max(0.5, min(2.0, clip.speed))
            af_parts.append(f"atempo={tempo}")
        af_parts.append(f"volume={clip.volume}")

        # Process clip with standardized encoding
        output_path = clips_dir / f"clip_{i}.mp4"
        success = run_ffmpeg([
            "-i", str(input_path),
            "-vf", ",".join(vf_parts),
            "-af", ",".join(af_parts),
            *COMMON_VIDEO_ARGS,
            *COMMON_AUDIO_ARGS,
            str(output_path),
        ], f"Clip {i + 1}")

        if not success:
            return False, f"Failed to process clip {i + 1}", None

        processed_clips.append(output_path)

        # Delete input to save disk space
        input_path.unlink(missing_ok=True)

    # --- Title card ---
    # Use Noto CJK font for Chinese text support
    FONT_FILE = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

    if request.titleCard:
        tc = request.titleCard
        title_path = work_dir / "title.mp4"
        bg_color = tc.backgroundColor.replace("#", "0x")
        text_color = tc.textColor.replace("#", "0x")

        drawtext = f"drawtext=text='{escape_ffmpeg_text(tc.text)}':fontfile={FONT_FILE}:fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2"
        if tc.subtitle:
            drawtext += f",drawtext=text='{escape_ffmpeg_text(tc.subtitle)}':fontfile={FONT_FILE}:fontsize=28:fontcolor={text_color}:x=(w-text_w)/2:y=(h+text_h)/2+20"

        success = run_ffmpeg([
            "-f", "lavfi", "-i", f"color=c={bg_color}:s={width}x{height}:d={tc.durationSeconds}",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-vf", drawtext,
            *COMMON_VIDEO_ARGS,
            *COMMON_AUDIO_ARGS,
            "-t", str(tc.durationSeconds),
            str(title_path),
        ], "Title card")

        if success:
            processed_clips.insert(0, title_path)

    # --- Outro card ---
    if request.outroCard:
        oc = request.outroCard
        outro_path = work_dir / "outro.mp4"
        bg_color = oc.backgroundColor.replace("#", "0x")
        text_color = oc.textColor.replace("#", "0x")

        drawtext = f"drawtext=text='{escape_ffmpeg_text(oc.text)}':fontfile={FONT_FILE}:fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2"
        if oc.subtitle:
            drawtext += f",drawtext=text='{escape_ffmpeg_text(oc.subtitle)}':fontfile={FONT_FILE}:fontsize=28:fontcolor={text_color}:x=(w-text_w)/2:y=(h+text_h)/2+20"

        success = run_ffmpeg([
            "-f", "lavfi", "-i", f"color=c={bg_color}:s={width}x{height}:d={oc.durationSeconds}",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-vf", drawtext,
            *COMMON_VIDEO_ARGS,
            *COMMON_AUDIO_ARGS,
            "-t", str(oc.durationSeconds),
            str(outro_path),
        ], "Outro card")

        if success:
            processed_clips.append(outro_path)

    # --- Concatenate all clips ---
    concat_list_path = work_dir / "concat.txt"
    with open(concat_list_path, "w") as f:
        for clip_path in processed_clips:
            f.write(f"file '{clip_path}'\n")

    # Debug: verify each processed clip has correct streams before concat
    print(f"[Concat] Verifying {len(processed_clips)} clips before concatenation:")
    for clip_path in processed_clips:
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries",
                 "stream=codec_name,width,height,sample_rate,channels",
                 "-of", "compact", str(clip_path)],
                capture_output=True, text=True, timeout=30,
            )
            print(f"[Concat]   {clip_path.name}: {result.stdout.strip()}")
        except Exception as e:
            print(f"[Concat]   {clip_path.name}: ffprobe error: {e}")

    # Re-encode during concat to ensure compatible output
    # Using -c copy caused corrupted output when codec params didn't match exactly
    concat_output = work_dir / "concatenated.mp4"
    success = run_ffmpeg([
        "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
        "-map", "0:v:0", "-map", "0:a:0",  # Explicit stream selection
        *COMMON_VIDEO_ARGS,
        *COMMON_AUDIO_ARGS,
        "-movflags", "+faststart",  # Enable progressive download
        str(concat_output),
    ], "Concatenate")

    if not success:
        return False, "Failed to concatenate clips", None

    # Cleanup processed clips
    for clip_path in processed_clips:
        clip_path.unlink(missing_ok=True)

    # --- Apply subtitles ---
    current_output = concat_output
    if request.subtitles:
        ass_path = work_dir / "subtitles.ass"
        with open(ass_path, "w") as f:
            f.write(generate_ass_subtitles(request.subtitles))

        subs_output = work_dir / "with_subs.mp4"
        success = run_ffmpeg([
            "-i", str(current_output),
            "-vf", f"ass={ass_path}",
            *COMMON_VIDEO_ARGS,
            "-c:a", "copy",  # Audio unchanged, just copy
            "-movflags", "+faststart",
            str(subs_output),
        ], "Subtitles")

        if not success:
            return False, "Failed to burn subtitles", None

        current_output.unlink(missing_ok=True)
        current_output = subs_output

    # --- Mix music ---
    if request.musicClips:
        music_inputs = ["-i", str(current_output)]
        filter_parts = []
        music_files = []

        for i, mc in enumerate(request.musicClips):
            music_path = work_dir / f"music_{i}.mp3"
            if not await download_file(mc.url, str(music_path)):
                print(f"[Export] Warning: Failed to download music {i + 1}, skipping")
                continue

            music_files.append(music_path)
            music_inputs.extend(["-i", str(music_path)])
            delay_ms = int(mc.timelinePosition * 1000)
            idx = len(music_files)  # 1-indexed since 0 is video
            filter_parts.append(
                f"[{idx}:a]atrim=start={mc.trimStart}:end={mc.trimEnd},asetpts=PTS-STARTPTS,adelay={delay_ms}|{delay_ms},volume={mc.volume}[mc{i}]"
            )

        if filter_parts:
            music_labels = "".join(f"[mc{i}]" for i in range(len(filter_parts)))
            mix_filter = ";".join(filter_parts) + f";[0:a]{music_labels}amix=inputs={len(filter_parts) + 1}:duration=first:dropout_transition=2[aout]"

            music_output = work_dir / "with_music.mp4"
            success = run_ffmpeg([
                *music_inputs,
                "-filter_complex", mix_filter,
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                str(music_output),
            ], "Music mix")

            if success:
                current_output.unlink(missing_ok=True)
                current_output = music_output

            # Cleanup music files
            for mf in music_files:
                mf.unlink(missing_ok=True)

    # --- Final output ---
    final_output = work_dir / "final.mp4"
    shutil.move(str(current_output), str(final_output))

    return True, "Export complete", final_output


def upload_to_r2(file_path: Path, r2_key: str) -> Optional[str]:
    """Upload file to R2 and return public URL."""
    try:
        client = get_r2_client()
        client.upload_file(
            str(file_path),
            R2_BUCKET_NAME,
            r2_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        print(f"[R2] Uploaded to {r2_key}")
        return r2_key
    except Exception as e:
        print(f"[R2] Upload failed: {e}")
        return None


def cleanup_work_dir(work_dir: Path):
    """Remove work directory."""
    try:
        shutil.rmtree(work_dir)
        print(f"[Cleanup] Removed {work_dir}")
    except Exception as e:
        print(f"[Cleanup] Failed: {e}")


# --- API Endpoints ---

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "glimmer-export"}


async def process_export_async(export_id: str, request: ExportRequest, work_dir: Path):
    """Background task to process export and update status."""
    try:
        success, message, output_path = await process_export(request, work_dir)

        if not success or not output_path:
            export_status_store[export_id] = {
                "status": "error",
                "error": message,
            }
            cleanup_work_dir(work_dir)
            return

        # Get file stats
        file_size = output_path.stat().st_size
        file_size_mb = file_size / (1024 * 1024)

        # Get duration
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", str(output_path)],
                capture_output=True, text=True, timeout=30,
            )
            duration = float(result.stdout.strip())
        except:
            duration = None

        # Upload to R2
        r2_key = f"exports/{request.jobId}/{export_id}.mp4"
        if not upload_to_r2(output_path, r2_key):
            export_status_store[export_id] = {
                "status": "error",
                "error": "Failed to upload to storage",
            }
            cleanup_work_dir(work_dir)
            return

        # Update status to complete
        export_status_store[export_id] = {
            "status": "complete",
            "r2Key": r2_key,
            "durationSeconds": duration,
            "fileSizeMB": round(file_size_mb, 2),
        }

        print(f"[Export Async] Complete: {export_id}, {file_size_mb:.2f} MB")
        cleanup_work_dir(work_dir)

    except Exception as e:
        print(f"[Export Async] Error: {e}")
        export_status_store[export_id] = {
            "status": "error",
            "error": str(e),
        }
        cleanup_work_dir(work_dir)


@app.post("/export-async", response_model=AsyncExportResponse)
async def export_video_async(request: ExportRequest, background_tasks: BackgroundTasks):
    """
    Start async video export. Returns immediately with exportId.
    Poll /export-status/{exportId} to check completion.
    """
    export_id = str(uuid.uuid4())[:8]
    work_dir = Path(f"/tmp/exports/{request.jobId}_{export_id}")
    work_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Export Async] Starting job {request.jobId} with {len(request.clips)} clips, exportId={export_id}")

    # Initialize status
    export_status_store[export_id] = {"status": "processing"}

    # Start background processing
    background_tasks.add_task(process_export_async, export_id, request, work_dir)

    return AsyncExportResponse(exportId=export_id, status="processing")


@app.get("/export-status/{export_id}", response_model=ExportStatusResponse)
async def get_export_status(export_id: str):
    """Check status of an async export."""
    if export_id not in export_status_store:
        raise HTTPException(status_code=404, detail="Export not found")

    status_data = export_status_store[export_id]
    return ExportStatusResponse(
        exportId=export_id,
        status=status_data.get("status", "unknown"),
        r2Key=status_data.get("r2Key"),
        error=status_data.get("error"),
        durationSeconds=status_data.get("durationSeconds"),
        fileSizeMB=status_data.get("fileSizeMB"),
    )


@app.post("/export", response_model=ExportResponse)
async def export_video(request: ExportRequest, background_tasks: BackgroundTasks):
    """
    Process video export request.

    1. Downloads clips from provided URLs
    2. Processes with FFmpeg (trim, filter, concatenate)
    3. Applies subtitles and music
    4. Uploads to R2
    5. Returns download URL
    """
    # Create unique work directory
    export_id = str(uuid.uuid4())[:8]
    work_dir = Path(f"/tmp/exports/{request.jobId}_{export_id}")
    work_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Export] Starting job {request.jobId} with {len(request.clips)} clips")

    try:
        # Process the export
        success, message, output_path = await process_export(request, work_dir)

        if not success or not output_path:
            background_tasks.add_task(cleanup_work_dir, work_dir)
            return ExportResponse(success=False, error=message)

        # Get file stats
        file_size = output_path.stat().st_size
        file_size_mb = file_size / (1024 * 1024)

        # Get duration using ffprobe
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", str(output_path)],
                capture_output=True, text=True, timeout=30,
            )
            duration = float(result.stdout.strip())
        except:
            duration = None

        # Upload to R2
        r2_key = f"exports/{request.jobId}/{export_id}.mp4"
        if not upload_to_r2(output_path, r2_key):
            background_tasks.add_task(cleanup_work_dir, work_dir)
            return ExportResponse(success=False, error="Failed to upload to storage")

        # Schedule cleanup
        background_tasks.add_task(cleanup_work_dir, work_dir)

        print(f"[Export] Complete: {file_size_mb:.2f} MB, {duration:.1f}s")

        return ExportResponse(
            success=True,
            r2Key=r2_key,
            durationSeconds=duration,
            fileSizeMB=round(file_size_mb, 2),
        )

    except Exception as e:
        print(f"[Export] Error: {e}")
        background_tasks.add_task(cleanup_work_dir, work_dir)
        return ExportResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
