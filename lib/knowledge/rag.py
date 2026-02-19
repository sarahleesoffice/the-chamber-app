"""
RAG (Retrieval Augmented Generation) pipeline for ICT knowledge.

Retrieves relevant ICT teaching chunks based on trade data
and builds context for the AI analysis prompt.
"""

from lib.knowledge.vector_store import query_similar
from lib.models import Trade


def build_rag_context(trade: Trade, n_results: int = 5) -> str:
    """
    Retrieve relevant ICT teachings for a trade and format as context.

    Uses the trader's reasoning + pair + direction as the query
    to find the most relevant teaching chunks from ICT's videos.
    """
    # Build a rich query from trade data
    query_parts = []

    if trade.reasoning:
        query_parts.append(trade.reasoning)

    query_parts.append(f"{trade.pair} {trade.direction} trade")

    query = " ".join(query_parts)

    # Retrieve relevant chunks
    results = query_similar(query, n_results=n_results)

    if not results:
        return ""

    # Format into context block
    context_sections = []
    for i, result in enumerate(results, 1):
        tags = ", ".join(result["concept_tags"]) if result["concept_tags"] else "General"
        context_sections.append(
            f"**[Source {i}]** _{result['video_title']}_\n"
            f"Concepts: {tags}\n"
            f"Video: {result['video_url']}\n\n"
            f"{result['text'][:800]}"  # Cap each chunk to avoid token bloat
        )

    return "\n\n---\n\n".join(context_sections)


def build_rag_prompt_section(trade: Trade, n_results: int = 5) -> str:
    """
    Build the RAG context section to inject into the analysis prompt.

    Returns empty string if no knowledge base is available or no results found.
    """
    try:
        context = build_rag_context(trade, n_results=n_results)
    except Exception:
        return ""

    if not context:
        return ""

    return f"""
## Relevant ICT Teachings (from ICT's YouTube lectures)

The following excerpts from ICT's actual teachings are relevant to this trade.
Reference these specific teachings in your analysis when applicable — cite the
video title so the trader can study the source material.

{context}

---

"""
