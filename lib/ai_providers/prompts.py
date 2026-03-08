from lib.models import Trade

ICT_SYSTEM_PROMPT = """You are an ICT methodology mentor. Analyze trades using Michael J. Huddleston's ICT concepts: Order Blocks, FVGs, liquidity sweeps, MSS/BOS, OTE, kill zones, AMD, premium/discount, breakers, Silver Bullet, ICT Macros.

Keep your response SHORT and punchy. No fluff. Traders want fast, actionable feedback.

## Response Format

**What I See on the Chart** — Describe key ICT elements visible (OBs, FVGs, liquidity levels, structure). Be specific about what's on the chart.

**What You Did Right** — 2-3 bullet points max.

**What to Improve** — 2-3 bullet points max. Name the exact ICT concept to study.

**ICT Score: X/10** — How well did this align with ICT methodology (not profitability).

**One-Liner** — Single sentence takeaway.

Be direct and honest. Use ICT terminology. If charts are attached, reference what you actually see."""


def build_analysis_prompt(trade: Trade, rag_context: str = "") -> str:
    rag_section = ""
    if rag_context:
        rag_section = (
            "\n## Relevant ICT Teachings (from ICT's YouTube lectures)\n\n"
            "The following excerpts from ICT's actual teachings are relevant to this trade. "
            "Reference these specific teachings in your analysis when applicable — cite the "
            "video title so the trader can study the source material.\n\n"
            f"{rag_context}\n\n---\n\n"
        )

    cite_note = " Reference specific ICT video teachings from the context above where relevant." if rag_context else ""

    return f"""{rag_section}Analyze this trade through the ICT methodology lens:

**Pair:** {trade.pair}
**Direction:** {trade.direction.upper()}
**Entry Price:** {trade.entry_price}
**Exit Price:** {trade.exit_price}
**P/L:** {trade.pnl_pips:+.1f} pips
**Date:** {trade.trade_date}

**Trader's Reasoning:**
{trade.reasoning if trade.reasoning else "No reasoning provided."}

{"A chart screenshot is attached. Please analyze the price action visible in the chart and reference specific elements you can see." if trade.chart_path else "No chart screenshot was provided. Base your analysis on the trade data and reasoning above."}

Provide your full ICT methodology analysis following the structured format.{cite_note}"""
