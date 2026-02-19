"""
Psychology framework based on Jared Tendler's "The Mental Game of Trading"

The core framework: Emotions are SIGNALS, not problems. They point to underlying
flaws in thinking, beliefs, or skill gaps that need to be corrected.

5 Core Mental Game Categories (Chapters 4-8):
1. Greed - When ambition compromises decision-making
2. Fear - When uncertainty breeds doubt, worry, and anxiety
3. Tilt (Anger) - When anger shuts down thinking and judgment
4. Confidence - Overconfidence or lack of confidence in skill
5. Discipline - When willpower fails to maintain process

Key Concept: The Inchworm - Improvement happens gradually. Your range
of performance (best to worst) slowly shifts upward over time.

Key Concept: Mapping Your Pattern - Identify signals on a 1-10 scale
of severity so you can catch problems early before they escalate.

Key Concept: Accumulated Emotion - Emotions carry over between sessions.
Yesterday's unresolved tilt makes today's tilt come faster.
"""

# --- Mental State Assessment Categories ---
# Based on the book's framework for tracking psychological state

MENTAL_STATE_CATEGORIES = {
    "sleep": {
        "label": "Sleep Quality",
        "description": "How well did you sleep last night?",
        "scale": (1, 10),
        "low_warning": "Poor sleep drains willpower and makes discipline breakdowns more likely.",
    },
    "energy": {
        "label": "Energy Level",
        "description": "How is your physical and mental energy?",
        "scale": (1, 10),
        "low_warning": "Low energy depletes willpower. Every decision burns energy — you may run out before the session ends.",
    },
    "focus": {
        "label": "Focus",
        "description": "How clear and focused is your mind?",
        "scale": (1, 10),
        "low_warning": "Lack of focus leads to missed signals, wandering attention, and impulsive trades.",
    },
    "mood": {
        "label": "Mood",
        "description": "How is your overall emotional state?",
        "scale": (1, 10),
        "low_warning": "Negative mood can be accumulated tilt or fear from previous sessions bleeding in.",
    },
    "stress": {
        "label": "Stress Level",
        "description": "How stressed are you? (10 = no stress, 1 = extremely stressed)",
        "scale": (1, 10),
        "low_warning": "High stress outside of trading bleeds into your execution. Life stress drains the same willpower pool.",
    },
    "confidence": {
        "label": "Confidence",
        "description": "How confident do you feel in your trading today?",
        "scale": (1, 10),
        "low_warning": "Low confidence signals a skill gap or unresolved fear. High confidence (9-10) may signal overconfidence.",
    },
}

# --- Emotional States ---
# From the book's chapters on each emotion

EMOTIONAL_STATES = [
    # Positive / Neutral
    "Disciplined",
    "Confident",
    "Calm",
    "Focused",
    "Patient",
    "Neutral",
    # Greed signals
    "Greedy",
    "Excited",
    "Euphoric",
    "Impatient (to profit)",
    # Fear signals
    "Fearful",
    "Anxious",
    "Hesitant",
    "Doubtful",
    # Tilt signals
    "Frustrated",
    "Angry",
    "Revenge-minded",
    "Tilted",
    # Confidence issues
    "Overconfident",
    "Insecure",
    "Desperate",
    # Discipline issues
    "Bored",
    "Distracted",
    "Lazy",
    "Impulsive",
]

# --- Trading Mistakes ---
# Organized by the book's 5 mental game categories

MISTAKES_BY_CATEGORY = {
    "Greed": [
        "Moved profit target further away",
        "Added to a winning position without plan",
        "Oversized position for bigger gains",
        "Held past exit signal hoping for more",
        "Took a trade just because others were profiting",
        "Ignored risk for potential reward",
        "Chased entry after missing ideal level",
        "Focused on P&L instead of process",
    ],
    "Fear": [
        "Hesitated on a valid setup",
        "Exited too early (locked in small profit)",
        "Reduced position size out of fear",
        "Moved stop to breakeven too soon",
        "Skipped a trade that fit the plan",
        "Froze and couldn't pull the trigger",
        "Second-guessed analysis mid-trade",
        "Avoided trading after a loss",
    ],
    "Tilt / Anger": [
        "Revenge traded after a loss",
        "Doubled down to make back losses",
        "Ignored stop loss",
        "Traded without thinking (fired off trades)",
        "Fixated on a past mistake during session",
        "Became blind to risk",
        "Broke rules out of frustration",
        "Traded to prove something",
    ],
    "Confidence": [
        "Traded a setup outside my skill level",
        "Assumed I couldn't lose",
        "Ignored warning signs (overconfidence)",
        "Gave up too quickly on a valid approach",
        "Compared myself to other traders",
        "Let a losing streak destroy my conviction",
        "Refused to admit a mistake",
        "Took credit for luck",
    ],
    "Discipline": [
        "Traded outside kill zone",
        "Traded without a plan",
        "Didn't do pre-market prep",
        "Skipped post-session review",
        "Got distracted during session",
        "Overtraded (too many setups)",
        "Entered before confirmation",
        "Didn't follow position sizing rules",
        "Quit session early after a win",
        "Procrastinated on journaling",
    ],
}

# Flat list of all mistakes for UI
ALL_MISTAKES = []
for category, mistakes in MISTAKES_BY_CATEGORY.items():
    for mistake in mistakes:
        ALL_MISTAKES.append(f"{mistake}")

# --- ICT-Specific Setup Tags ---

ICT_SETUPS = [
    "Order Block Entry",
    "Fair Value Gap Fill",
    "Liquidity Sweep",
    "OTE (Optimal Trade Entry)",
    "Market Structure Shift",
    "Break of Structure",
    "Silver Bullet",
    "Breaker Block",
    "Mitigation Block",
    "Power of 3 Play",
    "ICT Macro Entry",
    "Propulsion Block",
    "Judas Swing",
    "CE (Consequent Encroachment)",
    "IOFED Setup",
]

# --- Market Conditions ---

MARKET_CONDITIONS = [
    "Trending (Strong)",
    "Trending (Weak)",
    "Ranging / Consolidation",
    "Choppy / Indecisive",
    "News-Driven / Volatile",
    "Low Volume / Thin",
    "Reversal Day",
    "Expansion Day",
]

# --- Readiness Assessment ---

def assess_readiness(scores: dict[str, int]) -> tuple[int, str, str]:
    """
    Calculate trading readiness from mental state scores.
    Returns (score_out_of_10, recommendation, reasoning).

    Based on the book's principle that willpower is finite and
    emotions from life bleed into trading.
    """
    if not scores:
        return 5, "Incomplete", "Complete your mental state assessment first."

    avg = sum(scores.values()) / len(scores)

    # Check for any critically low scores
    critical_low = {k: v for k, v in scores.items() if v <= 3}
    low_scores = {k: v for k, v in scores.items() if v <= 5}

    if avg >= 8 and not critical_low:
        readiness = 9
        rec = "Optimal"
        reasoning = "You're in a strong mental state. Execute your plan with confidence, but stay aware of overconfidence if you've been on a winning streak."
    elif avg >= 6.5 and not critical_low:
        readiness = 7
        rec = "Good to trade"
        reasoning = "Solid mental state. Stick to your A+ setups and follow your rules."
    elif avg >= 5 and len(critical_low) <= 1:
        readiness = 5
        rec = "Trade with caution"
        reasoning = "Some areas are compromised. Reduce position size and only take the highest conviction setups."
        if critical_low:
            cat = list(critical_low.keys())[0]
            info = MENTAL_STATE_CATEGORIES.get(cat, {})
            reasoning += f" Watch out: {info.get('low_warning', '')}"
    elif avg >= 3.5:
        readiness = 3
        rec = "Not recommended"
        reasoning = "Your mental state is significantly compromised. Consider doing analysis and journaling only — no live trades. Protect your capital for when you're at your best."
    else:
        readiness = 1
        rec = "Do not trade"
        reasoning = "Step away from the screens. Your willpower and emotional state are depleted. Trading today risks compounding problems. Rest, recover, review — but don't trade."

    return readiness, rec, reasoning
