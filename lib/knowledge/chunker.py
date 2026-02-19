"""
Semantic chunker for ICT transcripts.

Splits transcripts into concept-tagged chunks suitable for embedding
and RAG retrieval. Uses ICT concept keywords to tag each chunk.
"""

import re
from dataclasses import dataclass, field
from lib.knowledge.transcript_parser import ParsedTranscript


@dataclass
class Chunk:
    chunk_id: str = ""          # {video_id}_{chunk_index}
    video_id: str = ""
    video_title: str = ""
    video_url: str = ""
    playlist: str = ""
    chunk_index: int = 0
    text: str = ""
    word_count: int = 0
    concept_tags: list[str] = field(default_factory=list)


# ICT concept patterns for tagging
# Each tuple: (tag_name, list of regex patterns to match)
ICT_CONCEPT_PATTERNS = [
    ("Order Block", [
        r"\border\s*block", r"\b[Oo][Bb]\b", r"\bbullish\s*ob\b", r"\bbearish\s*ob\b",
        r"\blast\s+(bearish|bullish)\s+candle\s+before",
    ]),
    ("Fair Value Gap", [
        r"\bfair\s*value\s*gap", r"\b[Ff][Vv][Gg]\b", r"\bimbalance\b",
        r"\bconsequent\s*encroachment", r"\b[Cc][Ee]\b.*gap",
    ]),
    ("Liquidity", [
        r"\bliquidity", r"\bstop\s*hunt", r"\bstop\s*run", r"\bstop\s*raid",
        r"\bbuy\s*side\s*liquidity", r"\bsell\s*side\s*liquidity",
        r"\b[Bb][Ss][Ll]\b", r"\b[Ss][Ss][Ll]\b",
        r"\bequal\s*highs", r"\bequal\s*lows",
        r"\bliquidity\s*pool", r"\bliquidity\s*void",
        r"\bpurge", r"\bsweep",
    ]),
    ("Market Structure", [
        r"\bmarket\s*structure\s*shift", r"\b[Mm][Ss][Ss]\b",
        r"\bbreak\s*of\s*structure", r"\b[Bb][Oo][Ss]\b",
        r"\bchange\s*of\s*character", r"\b[Cc][Hh][Oo][Cc][Hh]\b",
        r"\bswing\s*high", r"\bswing\s*low",
        r"\bhigher\s*high", r"\bhigher\s*low",
        r"\blower\s*high", r"\blower\s*low",
    ]),
    ("Optimal Trade Entry", [
        r"\boptimal\s*trade\s*entry", r"\b[Oo][Tt][Ee]\b",
        r"\bfib(onacci)?\s*(retracement|level)",
        r"\b(61|62|70|71|79)\s*%",
        r"\bsweet\s*spot",
    ]),
    ("Kill Zone", [
        r"\bkill\s*zone", r"\blondon\s*(open|session|kill)",
        r"\bnew\s*york\s*(open|session|kill)", r"\b[Nn][Yy]\s*(open|session|kill)",
        r"\basia(n)?\s*(session|range|kill)",
        r"\blondon\s*close",
    ]),
    ("Power of 3", [
        r"\bpower\s*of\s*(3|three)", r"\b[Pp][Oo]3\b", r"\b[Aa][Mm][Dd]\b",
        r"\baccumulation", r"\bmanipulation", r"\bdistribution",
        r"\bjudas\s*swing",
    ]),
    ("Premium Discount", [
        r"\bpremium", r"\bdiscount",
        r"\bequilibrium", r"\b50\s*%\s*(level|line|mark)",
        r"\bdealing\s*range",
    ]),
    ("Displacement", [
        r"\bdisplacement", r"\bimpulse\s*(move|leg|candle)",
        r"\bdisplac(e|ing)",
    ]),
    ("Breaker Block", [
        r"\bbreaker\s*block", r"\bbreaker\b",
    ]),
    ("Mitigation Block", [
        r"\bmitigation\s*block", r"\bmitigation\b",
    ]),
    ("Silver Bullet", [
        r"\bsilver\s*bullet",
        r"\b10\s*(to|:)\s*11", r"\b2\s*(to|:)\s*3\s*(pm|p\.m\.)",
    ]),
    ("ICT Macro", [
        r"\bmacro\b.*\b(9:50|10:10|10:50|11:10|1:50|2:10)\b",
        r"\bict\s*macro",
    ]),
    ("PD Array", [
        r"\bpd\s*array", r"\bprice\s*delivery\s*array",
        r"\bpd\s*array\s*matrix",
    ]),
    ("Institutional Order Flow", [
        r"\binstitutional\s*order\s*flow", r"\b[Ii][Oo][Ff]\b",
        r"\bsmart\s*money", r"\biofed\b",
    ]),
    ("Risk Management", [
        r"\brisk\s*management", r"\bstop\s*loss",
        r"\brisk\s*(to\s*)?reward", r"\b[Rr]:[Rr]\b", r"\b[Rr]\s*multiple",
        r"\bposition\s*siz(e|ing)",
    ]),
    ("Propulsion Block", [
        r"\bpropulsion\s*block",
    ]),
    ("NWOG / NDOG", [
        r"\bnwog\b", r"\bndog\b",
        r"\bnew\s*week\s*opening\s*gap",
        r"\bnew\s*day\s*opening\s*gap",
    ]),
]


def tag_chunk(text: str) -> list[str]:
    """Identify ICT concepts present in a chunk of text."""
    tags = []
    text_lower = text.lower()
    for tag_name, patterns in ICT_CONCEPT_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, text_lower):
                tags.append(tag_name)
                break  # One match per concept is enough
    return tags


def chunk_transcript(
    transcript: ParsedTranscript,
    target_words: int = 750,
    overlap_words: int = 100,
) -> list[Chunk]:
    """
    Split a transcript into overlapping chunks of approximately target_words.

    Uses sentence boundaries to avoid cutting mid-sentence.
    Tags each chunk with ICT concepts found in the text.
    """
    text = transcript.cleaned_text
    if not text:
        return []

    # Split into sentences
    sentences = re.split(r"(?<=[.!?])\s+", text)
    if not sentences:
        return []

    chunks = []
    current_words = []
    current_word_count = 0
    chunk_index = 0

    for sentence in sentences:
        sentence_words = sentence.split()
        sentence_word_count = len(sentence_words)

        current_words.extend(sentence_words)
        current_word_count += sentence_word_count

        if current_word_count >= target_words:
            chunk_text = " ".join(current_words)
            tags = tag_chunk(chunk_text)

            vid = transcript.metadata.video_id
            chunks.append(Chunk(
                chunk_id=f"{vid}_{chunk_index}",
                video_id=vid,
                video_title=transcript.metadata.title,
                video_url=transcript.metadata.url,
                playlist=transcript.metadata.playlist,
                chunk_index=chunk_index,
                text=chunk_text,
                word_count=current_word_count,
                concept_tags=tags,
            ))

            chunk_index += 1

            # Keep overlap_words from the end for context continuity
            if overlap_words > 0 and len(current_words) > overlap_words:
                current_words = current_words[-overlap_words:]
                current_word_count = len(current_words)
            else:
                current_words = []
                current_word_count = 0

    # Don't forget the last chunk
    if current_words:
        chunk_text = " ".join(current_words)
        tags = tag_chunk(chunk_text)
        vid = transcript.metadata.video_id
        chunks.append(Chunk(
            chunk_id=f"{vid}_{chunk_index}",
            video_id=vid,
            video_title=transcript.metadata.title,
            video_url=transcript.metadata.url,
            playlist=transcript.metadata.playlist,
            chunk_index=chunk_index,
            text=chunk_text,
            word_count=len(current_words),
            concept_tags=tags,
        ))

    return chunks


def chunk_all_transcripts(
    transcripts: list[ParsedTranscript],
    target_words: int = 750,
    overlap_words: int = 100,
) -> list[Chunk]:
    """Chunk all transcripts and return a flat list of all chunks."""
    all_chunks = []
    for transcript in transcripts:
        chunks = chunk_transcript(transcript, target_words, overlap_words)
        all_chunks.extend(chunks)
    return all_chunks
