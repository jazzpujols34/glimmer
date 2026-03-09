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
import json
import sys
from pathlib import Path
from typing import Optional


def log_export_event(export_id: str, event: str, **kwargs):
    """Structured logging for Cloud Run — shows up in Cloud Logging."""
    severity = kwargs.pop("severity", "INFO")
    entry = {
        "severity": severity,
        "export_id": export_id,
        "event": event,
        **kwargs
    }
    print(json.dumps(entry), file=sys.stdout, flush=True)

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
    templateId: Optional[str] = None  # Layout template
    backgroundImage: Optional[str] = None  # URL to background image


class TransitionData(BaseModel):
    type: str = "none"  # none, fade, fadeblack, fadewhite, wipeleft, wiperight, wipeup, wipedown, slideleft, slideright, slideup, slidedown, dissolve
    durationMs: int = 500  # 300-1500ms


class InterstitialCardData(BaseModel):
    position: int  # Insert BEFORE this clip index
    text: str
    subtitle: Optional[str] = None
    durationSeconds: float = 3
    backgroundColor: str = "#000000"
    textColor: str = "#FFFFFF"
    templateId: Optional[str] = None  # Layout template
    backgroundImage: Optional[str] = None  # URL to background image


class ExportRequest(BaseModel):
    jobId: str
    clips: list[ClipData]
    transitions: list[TransitionData] = []  # transitions[i] = between clips[i] and clips[i+1]
    subtitles: list[SubtitleData] = []
    musicClips: list[MusicClipData] = []
    interstitialCards: list[InterstitialCardData] = []  # Text cards inserted between clips
    titleCard: Optional[TitleCardData] = None
    outroCard: Optional[TitleCardData] = None
    resolution: str = "1280x720"
    watermark: bool = False  # Add "Made with 拾光 Glimmer" watermark (for free tier)


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


# Firestore-backed status store (survives restarts, shared across instances)
from status_store import set_status, get_status


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


def build_card_drawtext(
    text: str,
    subtitle: Optional[str],
    text_color: str,
    font_file: str,
    template_id: Optional[str] = None,
) -> str:
    """
    Build FFmpeg drawtext filter string based on template layout.

    All templates use the same font file and text color — they differ
    in position, size, and optional decorative elements.
    """
    esc_text = escape_ffmpeg_text(text)
    esc_sub = escape_ffmpeg_text(subtitle) if subtitle else None
    tid = template_id or "classic-center"

    if tid == "lower-third":
        # Text at bottom-left area (75% down)
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=42:fontcolor={text_color}:x=w*0.08:y=h*0.72"
        ]
        if esc_sub:
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=24:fontcolor={text_color}@0.8:x=w*0.08:y=h*0.72+56"
            )
        # Thin line above text
        parts.insert(0, f"drawbox=x=w*0.08:y=h*0.70:w=w*0.15:h=2:color={text_color}@0.3:t=fill")
        return ",".join(parts)

    elif tid == "top-title":
        # Title at top center (15% down)
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=42:fontcolor={text_color}:x=(w-text_w)/2:y=h*0.15"
        ]
        if esc_sub:
            # Line separator + subtitle below
            parts.append(f"drawbox=x=(w-60)/2:y=h*0.15+60:w=60:h=2:color={text_color}@0.3:t=fill")
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=24:fontcolor={text_color}@0.8:x=(w-text_w)/2:y=h*0.15+80"
            )
        return ",".join(parts)

    elif tid == "elegant-stack":
        # Large light title centered, small tracked subtitle, dots between
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=56:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2-30"
        ]
        if esc_sub:
            parts.append(
                f"drawtext=text='· · ·':fontfile={font_file}:fontsize=20:fontcolor={text_color}@0.5:x=(w-text_w)/2:y=(h)/2+10"
            )
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=20:fontcolor={text_color}@0.7:x=(w-text_w)/2:y=(h)/2+45"
            )
        return ",".join(parts)

    elif tid == "date-stamp":
        # Semibold title centered, small tracked subtitle for dates
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2-20"
        ]
        if esc_sub:
            parts.append(f"drawbox=x=(w-40)/2:y=(h)/2+10:w=40:h=1:color={text_color}@0.4:t=fill")
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=18:fontcolor={text_color}@0.6:x=(w-text_w)/2:y=(h)/2+30"
            )
        return ",".join(parts)

    elif tid == "minimal":
        # Small text, lots of whitespace
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=36:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2"
        ]
        if esc_sub:
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=14:fontcolor={text_color}@0.5:x=(w-text_w)/2:y=h*0.75"
            )
        return ",".join(parts)

    else:
        # classic-center (default) — original behavior
        parts = [
            f"drawtext=text='{esc_text}':fontfile={font_file}:fontsize=48:fontcolor={text_color}:x=(w-text_w)/2:y=(h-text_h)/2"
        ]
        if esc_sub:
            parts.append(
                f"drawtext=text='{esc_sub}':fontfile={font_file}:fontsize=28:fontcolor={text_color}:x=(w-text_w)/2:y=(h+text_h)/2+20"
            )
        return ",".join(parts)


async def render_card_clip(
    output_path: Path,
    text: str,
    subtitle: Optional[str],
    duration: float,
    bg_color: str,
    text_color: str,
    width: str,
    height: str,
    font_file: str,
    template_id: Optional[str] = None,
    background_image_url: Optional[str] = None,
    work_dir: Optional[Path] = None,
    label: str = "Card",
) -> bool:
    """
    Render a card clip (title/outro/interstitial) with optional background image.
    If background_image_url is provided, downloads the image and uses it as background.
    Otherwise uses a solid color.
    """
    drawtext = build_card_drawtext(text, subtitle, text_color, font_file, template_id)

    if background_image_url and work_dir:
        # Download background image
        bg_path = work_dir / f"bg_{output_path.stem}.jpg"
        if await download_file(background_image_url, str(bg_path)):
            # Use image as background: loop single image for duration, scale to resolution, overlay text
            # Add text shadow for readability on images
            shadow_drawtext = f"drawbox=x=0:y=0:w=iw:h=ih:color=black@0.2:t=fill,{drawtext}"
            success = run_ffmpeg([
                "-loop", "1", "-i", str(bg_path),
                "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:-1:-1:color=black,{shadow_drawtext}",
                *COMMON_VIDEO_ARGS,
                *COMMON_AUDIO_ARGS,
                "-t", str(duration),
                str(output_path),
            ], f"{label} (bg image)")

            bg_path.unlink(missing_ok=True)
            if success:
                return True
            print(f"[Export] {label}: bg image render failed, falling back to solid color")

    # Solid color background (default / fallback)
    return run_ffmpeg([
        "-f", "lavfi", "-i", f"color=c={bg_color}:s={width}x{height}:d={duration}",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", drawtext,
        *COMMON_VIDEO_ARGS,
        *COMMON_AUDIO_ARGS,
        "-t", str(duration),
        str(output_path),
    ], label)


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


def probe_has_audio(file_path: str) -> bool:
    """Check if a video file has an audio stream using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0",
             file_path],
            capture_output=True, text=True, timeout=30,
        )
        # If output contains "audio", the file has an audio stream
        return "audio" in result.stdout
    except Exception as e:
        print(f"[Probe] Error checking audio for {file_path}: {e}")
        # Assume no audio if probe fails - safer to add silent audio
        return False


def get_video_duration(file_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=30,
        )
        return float(result.stdout.strip())
    except Exception as e:
        print(f"[Probe] Error getting duration for {file_path}: {e}")
        return 10.0  # Default fallback


def concatenate_with_transitions(
    clip_paths: list[Path],
    transitions: list[TransitionData],
    output_path: Path,
    work_dir: Path,
) -> bool:
    """
    Concatenate clips using xfade transitions.

    Uses FFmpeg xfade filter for video and acrossfade for audio.
    Falls back to simple concat for 'none' transitions.
    """
    if len(clip_paths) < 2:
        # Single clip - just copy
        if clip_paths:
            shutil.copy(str(clip_paths[0]), str(output_path))
        return True if clip_paths else False

    # Get durations of all clips
    durations = [get_video_duration(str(p)) for p in clip_paths]
    print(f"[Transitions] Clip durations: {durations}")

    # Check if any transitions are non-none
    has_transitions = any(
        t.type != "none" for t in transitions[:len(clip_paths) - 1]
    )

    if not has_transitions:
        # All transitions are 'none' - use simple concat
        print("[Transitions] All transitions are 'none', using simple concat")
        return False  # Signal to use regular concat

    # Build filter_complex for xfade
    # Input format: -i clip0.mp4 -i clip1.mp4 -i clip2.mp4 ...
    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", str(p)])

    # Calculate cumulative offsets and build filter chains
    # Naming: [v0] = result of first xfade, [v1] = result of second, etc.
    video_filters = []
    audio_filters = []

    # Track cumulative duration (accounting for overlaps)
    cumulative_duration = durations[0]

    for i in range(len(clip_paths) - 1):
        transition = transitions[i] if i < len(transitions) else TransitionData()
        trans_type = transition.type if transition.type != "none" else "fade"
        trans_duration = transition.durationMs / 1000.0  # Convert ms to seconds

        # For 'none' transitions, use minimal duration
        if transitions[i].type == "none" if i < len(transitions) else True:
            trans_duration = 0.016  # ~1 frame at 60fps

        # Calculate offset: when this transition should start
        # offset = cumulative duration so far - transition duration
        offset = cumulative_duration - trans_duration

        # Ensure offset is positive
        offset = max(0.0, offset)

        # Determine input and output labels
        if i == 0:
            # First pair: [0:v][1:v] -> [v0]
            input_a = "[0:v]"
            input_b = "[1:v]"
            audio_a = "[0:a]"
            audio_b = "[1:a]"
        else:
            # Subsequent: [vN-1][N+1:v] -> [vN]
            input_a = f"[v{i-1}]"
            input_b = f"[{i+1}:v]"
            audio_a = f"[a{i-1}]"
            audio_b = f"[{i+1}:a]"

        output_v = f"[v{i}]"
        output_a = f"[a{i}]"

        # Build video filter
        video_filters.append(
            f"{input_a}{input_b}xfade=transition={trans_type}:duration={trans_duration:.3f}:offset={offset:.3f}{output_v}"
        )

        # Build audio filter (acrossfade)
        audio_filters.append(
            f"{audio_a}{audio_b}acrossfade=d={trans_duration:.3f}{output_a}"
        )

        # Update cumulative duration (add next clip, subtract overlap)
        cumulative_duration = offset + trans_duration + durations[i + 1] - trans_duration
        # Simplified: cumulative_duration = offset + durations[i + 1]
        cumulative_duration = offset + durations[i + 1]

    # Final output labels (last xfade result)
    n = len(clip_paths) - 2  # Index of last transition
    final_video = f"[v{n}]"
    final_audio = f"[a{n}]"

    # Combine all filters
    filter_complex = ";".join(video_filters + audio_filters)

    print(f"[Transitions] Filter complex ({len(video_filters)} transitions):")
    print(f"[Transitions]   {filter_complex[:1000]}...")

    # Run FFmpeg with xfade
    success = run_ffmpeg([
        *inputs,
        "-filter_complex", filter_complex,
        "-map", final_video,
        "-map", final_audio,
        *COMMON_VIDEO_ARGS,
        *COMMON_AUDIO_ARGS,
        "-movflags", "+faststart",
        str(output_path),
    ], "Transitions xfade")

    return success


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

        # Check if input has audio stream
        has_audio = probe_has_audio(str(input_path))
        print(f"[Export] Clip {i + 1} has audio: {has_audio}")

        # If no audio, add silent audio track first
        if not has_audio:
            duration = get_video_duration(str(input_path))
            input_with_audio = clips_dir / f"input_{i}_with_audio.mp4"
            success = run_ffmpeg([
                "-i", str(input_path),
                "-f", "lavfi", "-t", str(duration), "-i", "anullsrc=r=44100:cl=stereo",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                str(input_with_audio),
            ], f"Add silent audio to clip {i + 1}")

            if not success:
                print(f"[Export] Warning: Failed to add silent audio to clip {i + 1}, trying without audio filters")
            else:
                input_path.unlink(missing_ok=True)
                input_path = input_with_audio

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

    # --- Interstitial text cards ---
    # Use Noto CJK font for Chinese text support
    FONT_FILE = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

    interstitial_clips: dict[int, Path] = {}  # position -> rendered clip path
    for ic_idx, ic in enumerate(request.interstitialCards):
        ic_path = work_dir / f"interstitial_{ic_idx}.mp4"
        bg_color = ic.backgroundColor.replace("#", "0x")
        text_color = ic.textColor.replace("#", "0x")

        success = await render_card_clip(
            ic_path, ic.text, ic.subtitle, ic.durationSeconds,
            bg_color, text_color, width, height, FONT_FILE,
            ic.templateId, ic.backgroundImage, work_dir,
            f"Interstitial card {ic_idx + 1}",
        )

        if success:
            interstitial_clips[ic.position] = ic_path
            print(f"[Export] Interstitial card {ic_idx + 1}: \"{ic.text}\" at position {ic.position}")

    # Insert interstitial cards into processed_clips at correct positions
    # Process in reverse order so insertion indices remain valid
    for position in sorted(interstitial_clips.keys(), reverse=True):
        clip_path = interstitial_clips[position]
        # Clamp position to valid range
        insert_at = min(position, len(processed_clips))
        processed_clips.insert(insert_at, clip_path)

    # --- Title card ---

    if request.titleCard:
        tc = request.titleCard
        title_path = work_dir / "title.mp4"
        bg_color = tc.backgroundColor.replace("#", "0x")
        text_color = tc.textColor.replace("#", "0x")

        success = await render_card_clip(
            title_path, tc.text, tc.subtitle, tc.durationSeconds,
            bg_color, text_color, width, height, FONT_FILE,
            tc.templateId, tc.backgroundImage, work_dir, "Title card",
        )

        if success:
            processed_clips.insert(0, title_path)

    # --- Outro card ---
    if request.outroCard:
        oc = request.outroCard
        outro_path = work_dir / "outro.mp4"
        bg_color = oc.backgroundColor.replace("#", "0x")
        text_color = oc.textColor.replace("#", "0x")

        success = await render_card_clip(
            outro_path, oc.text, oc.subtitle, oc.durationSeconds,
            bg_color, text_color, width, height, FONT_FILE,
            oc.templateId, oc.backgroundImage, work_dir, "Outro card",
        )

        if success:
            processed_clips.append(outro_path)

    # --- Concatenate all clips (with transitions if provided) ---

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

    concat_output = work_dir / "concatenated.mp4"

    # Try transitions if provided
    use_simple_concat = True
    if request.transitions and len(request.transitions) > 0:
        # Check if any transitions are non-none
        has_real_transitions = any(t.type != "none" for t in request.transitions)
        if has_real_transitions:
            print(f"[Concat] Using xfade transitions ({len(request.transitions)} transitions)")
            success = concatenate_with_transitions(
                processed_clips,
                request.transitions,
                concat_output,
                work_dir,
            )
            if success:
                use_simple_concat = False
            else:
                print("[Concat] xfade failed, falling back to simple concat")

    if use_simple_concat:
        # Simple concat (no transitions or fallback)
        concat_list_path = work_dir / "concat.txt"
        with open(concat_list_path, "w") as f:
            for clip_path in processed_clips:
                f.write(f"file '{clip_path}'\n")

        # Re-encode during concat to ensure compatible output
        # Use -map 0:a:0? (optional) as safety net in case any clip still lacks audio
        success = run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(concat_list_path),
            "-map", "0:v:0", "-map", "0:a:0?",
            *COMMON_VIDEO_ARGS,
            *COMMON_AUDIO_ARGS,
            "-movflags", "+faststart",
            str(concat_output),
        ], "Concatenate (simple)")

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

            # Check if music needs looping (audio shorter than requested trim range)
            music_duration = get_video_duration(str(music_path))
            requested_duration = mc.trimEnd - mc.trimStart
            needs_loop = requested_duration > music_duration + 0.5

            music_files.append(music_path)
            if needs_loop:
                # Use -stream_loop to repeat audio until trim range is covered
                music_inputs.extend(["-stream_loop", "-1", "-i", str(music_path)])
                print(f"[Export] Music {i + 1}: looping ({music_duration:.1f}s audio for {requested_duration:.1f}s requested)")
            else:
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

    # --- Apply watermark (free tier) ---
    if request.watermark:
        watermark_text = "Made with 拾光 Glimmer"
        # Bottom-right corner, semi-transparent white, with shadow for readability
        drawtext = (
            f"drawtext=text='{escape_ffmpeg_text(watermark_text)}':"
            f"fontfile={FONT_FILE}:fontsize=20:"
            f"fontcolor=white@0.8:shadowcolor=black@0.5:shadowx=1:shadowy=1:"
            f"x=w-tw-20:y=h-th-15"
        )

        watermark_output = work_dir / "with_watermark.mp4"
        success = run_ffmpeg([
            "-i", str(current_output),
            "-vf", drawtext,
            *COMMON_VIDEO_ARGS,
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(watermark_output),
        ], "Watermark")

        if success:
            current_output.unlink(missing_ok=True)
            current_output = watermark_output
            print(f"[Export] Watermark applied")
        else:
            print(f"[Export] Warning: Watermark failed, continuing without")

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
        log_export_event(export_id, "export_started", clips_count=len(request.clips), job_id=request.jobId)
        success, message, output_path = await process_export(request, work_dir)

        if not success or not output_path:
            log_export_event(export_id, "export_failed", error=message, severity="ERROR")
            set_status(export_id, {
                "status": "error",
                "error": message,
            })
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
            log_export_event(export_id, "r2_upload_failed", severity="ERROR")
            set_status(export_id, {
                "status": "error",
                "error": "Failed to upload to storage",
            })
            cleanup_work_dir(work_dir)
            return

        # Update status to complete
        set_status(export_id, {
            "status": "complete",
            "r2Key": r2_key,
            "durationSeconds": duration,
            "fileSizeMB": round(file_size_mb, 2),
        })

        log_export_event(export_id, "export_complete", duration_sec=duration, file_size_mb=round(file_size_mb, 2))
        cleanup_work_dir(work_dir)

    except Exception as e:
        log_export_event(export_id, "export_error", error=str(e), severity="ERROR")
        set_status(export_id, {
            "status": "error",
            "error": str(e),
        })
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

    log_export_event(export_id, "export_async_started", job_id=request.jobId, clips_count=len(request.clips))

    # Initialize status in Firestore
    set_status(export_id, {"status": "processing"})

    # Start background processing
    background_tasks.add_task(process_export_async, export_id, request, work_dir)

    return AsyncExportResponse(exportId=export_id, status="processing")


@app.get("/export-status/{export_id}", response_model=ExportStatusResponse)
async def get_export_status_endpoint(export_id: str):
    """Check status of an async export."""
    status_data = get_status(export_id)
    if not status_data:
        raise HTTPException(
            status_code=404,
            detail="Export not found. It may have expired or the service restarted."
        )

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
