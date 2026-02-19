"""
Parse ICT YouTube transcript files into structured data.

Each transcript file has this format:
    Title: <video title>
    Video ID: <youtube id>
    URL: <youtube url>
    Playlist: <playlist name>
    Transcribed: <timestamp>
    ============================================================
    <transcript text>
"""

import os
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TranscriptMetadata:
    video_id: str = ""
    title: str = ""
    url: str = ""
    playlist: str = ""
    transcribed: str = ""
    filename: str = ""


@dataclass
class ParsedTranscript:
    metadata: TranscriptMetadata = field(default_factory=TranscriptMetadata)
    raw_text: str = ""
    cleaned_text: str = ""
    word_count: int = 0


def parse_transcript_file(filepath: str) -> Optional[ParsedTranscript]:
    """Parse a single transcript file into structured data."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return None

    if not content.strip():
        return None

    # Split header from body at the separator line
    parts = content.split("=" * 60, 1)

    metadata = TranscriptMetadata(filename=os.path.basename(filepath))
    raw_text = ""

    if len(parts) == 2:
        header = parts[0]
        raw_text = parts[1].strip()

        # Parse header fields
        for line in header.strip().split("\n"):
            line = line.strip()
            if line.startswith("Title:"):
                metadata.title = line[6:].strip()
            elif line.startswith("Video ID:"):
                metadata.video_id = line[9:].strip()
            elif line.startswith("URL:"):
                metadata.url = line[4:].strip()
            elif line.startswith("Playlist:"):
                metadata.playlist = line[9:].strip()
            elif line.startswith("Transcribed:"):
                metadata.transcribed = line[12:].strip()
    else:
        # No separator found — treat entire content as text
        raw_text = content.strip()
        # Try to extract video ID from filename
        name = os.path.splitext(os.path.basename(filepath))[0]
        metadata.video_id = name

    cleaned = clean_transcript(raw_text)

    return ParsedTranscript(
        metadata=metadata,
        raw_text=raw_text,
        cleaned_text=cleaned,
        word_count=len(cleaned.split()),
    )


def clean_transcript(text: str) -> str:
    """
    Clean auto-generated transcript text.
    - Remove filler sounds and artifacts
    - Normalize whitespace
    - Remove repeated words/phrases from auto-caption errors
    """
    if not text:
        return ""

    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)

    # Remove common auto-caption artifacts
    # Patterns like "um", "uh", "you know", repeated stutters
    filler_patterns = [
        r"\bum+\b",
        r"\buh+\b",
        r"\bhmm+\b",
        r"\bahh?\b",
        r"\bohh?\b",
    ]
    for pattern in filler_patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # Remove excessive repeated single words (auto-caption stutter)
    # e.g., "No. No. No. No. No." -> "No."
    text = re.sub(r"(\b\w+\b[.\s,!?]*)\1{3,}", r"\1", text)

    # Clean up resulting double spaces
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([.,!?])", r"\1", text)

    return text.strip()


def parse_all_transcripts(directory: str) -> list[ParsedTranscript]:
    """Parse all transcript files in a directory."""
    transcripts = []
    files = sorted(f for f in os.listdir(directory) if f.endswith(".txt"))

    for filename in files:
        filepath = os.path.join(directory, filename)
        parsed = parse_transcript_file(filepath)
        if parsed and parsed.word_count > 50:  # Skip very short/empty transcripts
            transcripts.append(parsed)

    return transcripts


def get_transcript_stats(transcripts: list[ParsedTranscript]) -> dict:
    """Get summary statistics about parsed transcripts."""
    if not transcripts:
        return {}

    word_counts = [t.word_count for t in transcripts]
    playlists = {}
    for t in transcripts:
        pl = t.metadata.playlist or "Unknown"
        playlists[pl] = playlists.get(pl, 0) + 1

    return {
        "total_transcripts": len(transcripts),
        "total_words": sum(word_counts),
        "avg_words": sum(word_counts) // len(word_counts),
        "min_words": min(word_counts),
        "max_words": max(word_counts),
        "playlists": playlists,
    }
