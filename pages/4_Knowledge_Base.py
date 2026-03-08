import streamlit as st
from collections import Counter

from lib.knowledge.vector_store import (
    get_collection_stats,
    get_all_metadata,
    query_similar,
)

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("ICT Knowledge Base")

# --- Stats Overview ---
stats = get_collection_stats()

if stats["total_chunks"] == 0:
    st.warning(
        "Knowledge base is empty. Run the indexer to populate it:\n\n"
        "```\npython3 -m scripts.index_knowledge_base\n```"
    )
    st.stop()

# Load all metadata for analysis
all_meta = get_all_metadata()

# Compute stats from metadata
video_titles = set()
playlists = Counter()
concept_counts = Counter()
total_words = 0

for meta in all_meta:
    video_titles.add(meta["video_title"])
    pl = meta.get("playlist", "Unknown") or "Unknown"
    playlists[pl] += 1
    total_words += meta.get("word_count", 0)
    tags = meta.get("concept_tags", "")
    if tags:
        for tag in tags.split(","):
            tag = tag.strip()
            if tag:
                concept_counts[tag] += 1

tagged_chunks = sum(1 for m in all_meta if m.get("concept_tags", ""))

# --- Summary Metrics ---
col1, col2, col3, col4 = st.columns(4)
col1.metric("Total Chunks", f"{stats['total_chunks']:,}")
col2.metric("Videos", f"{len(video_titles):,}")
col3.metric("Total Words", f"{total_words:,.0f}")
col4.metric("Tagged", f"{100 * tagged_chunks // len(all_meta)}%")

st.divider()

# --- Tabs ---
tab_search, tab_concepts, tab_videos, tab_playlists = st.tabs([
    "Search Knowledge Base",
    "ICT Concepts",
    "Videos",
    "Playlists",
])

# --- Search Tab ---
with tab_search:
    st.subheader("Search ICT Teachings")
    query = st.text_input(
        "Search query",
        placeholder="e.g. order block entry during New York session",
        key="kb_search",
    )

    search_col1, search_col2 = st.columns([3, 1])
    with search_col2:
        n_results = st.number_input("Results", min_value=1, max_value=20, value=5, key="kb_n")

    if query:
        with st.spinner("Searching..."):
            results = query_similar(query, n_results=n_results)

        if results:
            for i, r in enumerate(results, 1):
                tags_str = ", ".join(r["concept_tags"]) if r["concept_tags"] else "General"
                similarity = max(0, 1 - r["distance"])  # cosine distance to similarity

                with st.expander(
                    f"**{i}. {r['video_title']}** — {similarity:.0%} match",
                    expanded=(i <= 2),
                ):
                    st.caption(f"Concepts: {tags_str}")
                    if r["video_url"]:
                        st.caption(f"[Watch on YouTube]({r['video_url']})")
                    st.markdown(r["text"][:1500])
                    if len(r["text"]) > 1500:
                        st.caption("*(truncated)*")
        else:
            st.info("No results found.")

# --- Concepts Tab ---
with tab_concepts:
    st.subheader("ICT Concept Coverage")
    st.caption(f"{len(concept_counts)} concepts tagged across {tagged_chunks} chunks")

    if concept_counts:
        # Sort by count descending
        sorted_concepts = concept_counts.most_common()

        for concept, count in sorted_concepts:
            pct = count / len(all_meta)
            st.progress(min(pct * 2, 1.0))  # Scale for visual — cap at 100%
            st.caption(f"**{concept}** — {count} chunks ({pct:.0%})")

# --- Videos Tab ---
with tab_videos:
    st.subheader(f"Indexed Videos ({len(video_titles)})")

    # Build per-video stats
    video_stats = {}
    for meta in all_meta:
        title = meta["video_title"]
        if title not in video_stats:
            video_stats[title] = {
                "url": meta.get("video_url", ""),
                "playlist": meta.get("playlist", "Unknown"),
                "chunks": 0,
                "words": 0,
                "concepts": set(),
            }
        video_stats[title]["chunks"] += 1
        video_stats[title]["words"] += meta.get("word_count", 0)
        tags = meta.get("concept_tags", "")
        if tags:
            for t in tags.split(","):
                t = t.strip()
                if t:
                    video_stats[title]["concepts"].add(t)

    # Search filter
    video_filter = st.text_input(
        "Filter videos",
        placeholder="Type to filter by title...",
        key="video_filter",
    )

    filtered = sorted(video_stats.items())
    if video_filter:
        filtered = [
            (t, s) for t, s in filtered
            if video_filter.lower() in t.lower()
        ]

    st.caption(f"Showing {len(filtered)} of {len(video_stats)} videos")

    for title, vs in filtered[:50]:  # Cap at 50 to avoid performance issues
        concepts_str = ", ".join(sorted(vs["concepts"])) if vs["concepts"] else "None"
        with st.expander(f"**{title}**"):
            vcol1, vcol2, vcol3 = st.columns(3)
            vcol1.metric("Chunks", vs["chunks"])
            vcol2.metric("Words", f"{vs['words']:,}")
            vcol3.metric("Concepts", len(vs["concepts"]))
            st.caption(f"Playlist: {vs['playlist']}")
            st.caption(f"Concepts: {concepts_str}")
            if vs["url"]:
                st.caption(f"[Watch on YouTube]({vs['url']})")

    if len(filtered) > 50:
        st.info(f"Showing first 50 of {len(filtered)} results. Use the filter to narrow down.")

# --- Playlists Tab ---
with tab_playlists:
    st.subheader("Playlists")

    sorted_playlists = playlists.most_common()
    for pl_name, chunk_count in sorted_playlists:
        # Count videos in this playlist
        pl_videos = set(
            m["video_title"] for m in all_meta
            if (m.get("playlist", "Unknown") or "Unknown") == pl_name
        )
        with st.expander(f"**{pl_name}** — {len(pl_videos)} videos, {chunk_count} chunks"):
            for v in sorted(pl_videos):
                st.write(f"- {v}")
