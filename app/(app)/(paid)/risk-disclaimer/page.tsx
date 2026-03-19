export default function RiskDisclaimerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Risk Disclaimer</h1>
        <p className="text-chamber-text-dim text-sm mt-1">Government Required Risk Disclaimer and Disclosure Statement</p>
      </div>

      {/* CFTC Rule 4.41 */}
      <Section title="CFTC Rule 4.41">
        <P>
          HYPOTHETICAL OR SIMULATED PERFORMANCE RESULTS HAVE CERTAIN LIMITATIONS. UNLIKE AN ACTUAL
          PERFORMANCE RECORD, SIMULATED RESULTS DO NOT REPRESENT ACTUAL TRADING. ALSO, SINCE THE
          TRADES HAVE NOT BEEN EXECUTED, THE RESULTS MAY HAVE UNDER-OR-OVER COMPENSATED FOR THE
          IMPACT, IF ANY, OF CERTAIN MARKET FACTORS, SUCH AS LACK OF LIQUIDITY. SIMULATED TRADING
          PROGRAMS IN GENERAL ARE ALSO SUBJECT TO THE FACT THAT THEY ARE DESIGNED WITH THE BENEFIT
          OF HINDSIGHT. NO REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY TO
          ACHIEVE PROFIT OR LOSSES SIMILAR TO THOSE SHOWN.
        </P>
      </Section>

      {/* Hypothetical Performance */}
      <Section title="Hypothetical Performance Disclaimer">
        <P>
          Trading performance displayed herein is hypothetical. Hypothetical performance results
          have many inherent limitations, some of which are described below. No representation is
          being made that any account will or is likely to achieve profits or losses similar to
          those shown. In fact, there are frequently sharp differences between hypothetical
          performance results and the actual results subsequently achieved by any particular
          trading program.
        </P>
        <P>
          One of the limitations of hypothetical performance trading results is that they are
          generally prepared with the benefit of hindsight. In addition, hypothetical trading does
          not involve financial risk, and no hypothetical trading record can completely account for
          the impact of financial risk in actual trading. For example, the ability to withstand
          losses or to adhere to a particular trading program in spite of trading losses are
          material points which can also adversely affect actual trading results. There are numerous
          other factors related to the markets in general or to the implementation of any specific
          trading program which cannot be fully accounted for in the preparation of hypothetical
          performance results and all of which can adversely affect actual trading results.
        </P>
      </Section>

      {/* U.S. Government Required Disclaimer */}
      <Section title="U.S. Government Required Disclaimer">
        <P>
          Commodity Futures Trading Commission Futures and Options trading has large potential
          rewards, but also large potential risk. You must be aware of the risks and be willing to
          accept them in order to invest in the futures and options markets. Don&apos;t trade with money
          you can&apos;t afford to lose. This is neither a solicitation nor an offer to Buy/Sell futures
          or options. No representation is being made that any account will or is likely to achieve
          profits or losses similar to those discussed on this web site. The past performance of any
          trading system or methodology is not necessarily indicative of future results.
        </P>
      </Section>

      {/* General Trading Risk */}
      <Section title="General Trading Risk">
        <P>
          Trade at your own risk. The information provided here is of the nature of a general
          comment only and neither purports nor intends to be, specific trading advice. It has been
          prepared without regard to any particular person&apos;s investment objectives, financial
          situation and particular needs. Information should not be considered as an offer or
          enticement to buy, sell or trade.
        </P>
        <P>
          You should seek appropriate advice from your broker, or licensed investment advisor,
          before taking any action. Past performance does not guarantee future results. Simulated
          performance results contain inherent limitations. Unlike actual performance records the
          results may under or over compensate for such factors such as lack of liquidity. No
          representation is being made that any account will or is likely to achieve profits or
          losses to those shown.
        </P>
      </Section>

      {/* Risk of Loss — red border */}
      <div className="bg-chamber-surface border rounded-lg p-6" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
        <h3 className="text-[0.85rem] font-bold tracking-wider uppercase mb-3 text-red-400">
          Risk of Loss
        </h3>
        <P>
          The risk of loss in trading can be substantial. You should therefore carefully consider
          whether such trading is suitable for you in light of your financial condition.
        </P>
        <P>
          If you purchase or sell Equities, Futures, Currencies or Options you may sustain a total
          loss of the initial margin funds and any additional funds that you deposit with your broker
          to establish or maintain your position. If the market moves against your position, you may
          be called upon by your broker to deposit a substantial amount of additional margin funds,
          on short notice in order to maintain your position. If you do not provide the required
          funds within the prescribed time, your position may be liquidated at a loss, and you may
          be liable for any resulting deficit in your account.
        </P>
        <P>
          Under certain market conditions, you may find it difficult or impossible to liquidate a
          position. This can occur, for example, when the market makes a &ldquo;limit move.&rdquo; The placement
          of contingent orders by you, such as a &ldquo;stop-loss&rdquo; or &ldquo;stop-limit&rdquo; order, will not
          necessarily limit your losses to the intended amounts, since market conditions may make it
          impossible to execute such orders.
        </P>
      </div>

      {/* About The Chamber */}
      <Section title="About The Chamber">
        <P>
          The Chamber is a personal trading journal and educational tool. It is not a trading
          system, signal service, or investment advisory service. All AI-generated analysis, bias
          predictions, and trade reviews are for educational and informational purposes only and
          should not be construed as financial advice.
        </P>
        <P>
          The ICT (Inner Circle Trader) methodology referenced throughout this application is based
          on publicly available educational content by Michael J. Huddleston. The Chamber is not
          affiliated with, endorsed by, or officially connected to ICT/Michael J. Huddleston in
          any way. All ICT concepts are used strictly for educational reference.
        </P>
        <P>
          Market data is provided by Yahoo Finance and may be delayed. AI analysis is generated by
          third-party language models and may contain errors, inaccuracies, or hallucinations.
          Always verify any information independently before making trading decisions.
        </P>
      </Section>

      {/* Psychology Framework */}
      <Section title="Psychology Framework">
        <P>
          The mental game assessment tools are based on Jared Tendler&apos;s &ldquo;The Mental Game of Trading&rdquo;
          framework and are provided for self-reflection purposes only. They are not a substitute for
          professional psychological counseling or medical advice.
        </P>
      </Section>

      {/* AI Analysis Disclaimer */}
      <Section title="AI Analysis Disclaimer">
        <P>
          AI-powered trade analyses are generated by language models (Claude, Gemini) and should be
          used as a learning tool only. AI outputs may contain errors and should never be the sole
          basis for trading decisions. Always do your own analysis.
        </P>
      </Section>

      {/* API Key Security */}
      <Section title="API Key Security">
        <P>
          Your API keys are encrypted using AES-256-GCM before being stored in our database. They
          are never logged, displayed in full, or transmitted to any third party other than the
          respective AI provider (Anthropic for Claude, Google for Gemini) for the sole purpose of
          generating your requested analyses.
        </P>
      </Section>

      {/* User Responsibility */}
      <Section title="User Responsibility">
        <P>
          By using The Chamber, you acknowledge that all trading decisions are your own
          responsibility. You accept all risks associated with trading, including the risk of losing
          your entire investment. The creators and operators of this application are not responsible
          for any losses incurred.
        </P>
      </Section>

      {/* How Much Does the AI Cost? */}
      <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6">
        <h3 className="text-[0.85rem] font-bold tracking-wider uppercase mb-1.5 text-chamber-orange">
          How Much Does the AI Cost?
        </h3>
        <P>
          The Chamber does not charge you for AI. You bring your own API key (from Anthropic or
          Google) and pay them directly. Every time you ask a question — in ICT Chat, AI Analysis,
          or Analyze Bias — it costs a tiny amount. Here&apos;s roughly what each question costs:
        </P>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#2a2a2a]">
                <th className="py-2.5 px-4 text-left text-[0.7rem] uppercase tracking-wider text-chamber-text-muted">AI Model</th>
                <th className="py-2.5 px-4 text-center text-[0.7rem] uppercase tracking-wider text-chamber-text-muted">Chat Question</th>
                <th className="py-2.5 px-4 text-center text-[0.7rem] uppercase tracking-wider text-chamber-text-muted">Bias Analysis</th>
                <th className="py-2.5 px-4 text-center text-[0.7rem] uppercase tracking-wider text-chamber-text-muted">Questions Per $1</th>
              </tr>
            </thead>
            <tbody>
              <CostRow model="Gemini 2.0 Flash" color="#4285f4" chat="< $0.001" bias="< $0.001" perDollar="~1,600" />
              <CostRow model="Claude Haiku 4.5" color="#e8651a" chat="~$0.006" bias="~$0.009" perDollar="~170" />
              <CostRow model="Gemini 2.5 Pro" color="#4285f4" chat="~$0.02" bias="~$0.02" perDollar="~65" />
              <CostRow model="Claude Sonnet 4.6" color="#e8651a" chat="~$0.02" bias="~$0.03" perDollar="~50" />
            </tbody>
          </table>
        </div>

        <div className="mt-5 pt-4 border-t border-chamber-border">
          <p className="text-chamber-text-muted text-[0.82rem] font-semibold mb-2">In plain terms:</p>
          <ul className="text-chamber-text-muted text-[0.82rem] leading-loose pl-5 list-disc space-y-0.5">
            <li><span className="text-[#4285f4] font-semibold">Gemini Flash</span> is basically free — <span className="text-chamber-green font-semibold">1,000+ questions for under $1</span></li>
            <li><span className="text-chamber-orange font-semibold">Claude Haiku</span> is very cheap — about <span className="text-chamber-green font-semibold">170 questions per $1</span></li>
            <li><span className="text-chamber-orange font-semibold">Claude Sonnet</span> and <span className="text-[#4285f4] font-semibold">Gemini Pro</span> are the smartest but cost more — roughly <span className="text-white font-semibold">2-3 cents per question</span></li>
            <li><span className="text-chamber-orange font-semibold">Bias Analysis</span> costs a little more than a chat question because it sends candle data + ICT transcripts to the AI</li>
            <li>Uploading a <span className="text-chamber-text-muted font-semibold">chart screenshot</span> costs roughly double a text question</li>
          </ul>
        </div>

        <div className="mt-4 p-3 rounded-md" style={{ background: "rgba(232,101,26,0.06)", border: "1px solid rgba(232,101,26,0.15)" }}>
          <p className="text-chamber-text-muted text-[0.78rem] leading-relaxed">
            These are estimates. Longer conversations cost more because the AI re-reads the whole
            chat each time. You can check your exact spending on your{" "}
            <span className="text-chamber-orange">Anthropic</span> or{" "}
            <span className="text-[#4285f4]">Google AI</span> dashboard.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pt-4 border-t border-chamber-border">
        <p className="text-[#333] text-[0.65rem] tracking-wider">
          BY USING THE CHAMBER YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS DISCLAIMER
        </p>
      </div>
    </div>
  );
}

// Reusable section box
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6">
      <h3 className="text-[0.85rem] font-bold tracking-wider uppercase mb-3 text-chamber-orange">
        {title}
      </h3>
      {children}
    </div>
  );
}

// Reusable paragraph
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-chamber-text-muted text-[0.82rem] leading-relaxed mt-2.5 first:mt-0">{children}</p>;
}

// Cost table row
function CostRow({ model, color, chat, bias, perDollar }: { model: string; color: string; chat: string; bias: string; perDollar: string }) {
  return (
    <tr className="border-b border-chamber-border">
      <td className="py-3 px-4 font-semibold" style={{ color }}>{model}</td>
      <td className="py-3 px-4 text-center text-white font-bold">{chat}</td>
      <td className="py-3 px-4 text-center text-chamber-orange font-bold">{bias}</td>
      <td className="py-3 px-4 text-center text-chamber-green font-semibold">{perDollar}</td>
    </tr>
  );
}
