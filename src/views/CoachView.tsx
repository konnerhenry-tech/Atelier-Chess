import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { AlertCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { BoardPreferences, PieceType } from '../types/chess';
import { soundEngine } from '../utils/soundEngine';
import { resolveAssetUrl } from '../utils/assetUrls';
import { MiniMarkdown } from '../components/MiniMarkdown';

interface CoachViewProps {
  preferences: BoardPreferences;
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  onChangeSkillLevel: (level: 'Beginner' | 'Intermediate' | 'Advanced') => void;
  initialFen?: string | null;
  initialPgn?: string | null;
  initialEvalSummary?: string | null;
}

interface CoachMessage {
  id: string;
  role: 'user' | 'coach' | 'error';
  text: string;
}

const QUICK_PROMPTS = [
  'Explain the key plans for both sides in this position.',
  'Identify any tactical motifs, pins, forks, or weak squares here.',
  'Recommend an opening repertoire tailored to my skill level.',
  'Create a 7-day chess study and puzzle training plan for me.',
];

export const CoachView: React.FC<CoachViewProps> = ({
  preferences,
  skillLevel,
  onChangeSkillLevel,
  initialFen,
  initialPgn,
  initialEvalSummary,
}) => {
  const [chess] = useState(() => {
    const c = new Chess();
    if (initialFen) {
      try {
        c.load(initialFen);
      } catch {
        // default start
      }
    }
    return c;
  });
  const [fen, setFen] = useState(chess.fen());
  const [pgnContext, setPgnContext] = useState(initialPgn || '');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [evalStale, setEvalStale] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([
    {
      id: 'welcome',
      role: 'coach',
      text: `Hello! I’m your Atelier Grandmaster Coach. I calibrate my explanations to your ${skillLevel} level and analyze the exact position on the board beside me. Move pieces on the board or choose a coaching prompt to begin.`,
    },
  ]);

  useEffect(() => {
    if (initialFen) {
      try {
        chess.load(initialFen);
        setFen(chess.fen());
        setEvalStale(false);
      } catch {
        // ignore invalid FEN
      }
    }
    if (initialPgn !== undefined) {
      setPgnContext(initialPgn || '');
    }
  }, [initialFen, initialPgn, chess]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleBoardMove = (from: string, to: string, promotion?: PieceType) => {
    try {
      const m = chess.move({ from, to, promotion });
      if (!m) return false;
      soundEngine.play(m.captured ? 'capture' : 'move');
      setFen(chess.fen());
      setPgnContext(chess.pgn());
      setEvalStale(true);
      return true;
    } catch {
      return false;
    }
  };

  const askCoach = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    const userMsg: CoachMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const history = messages
      .filter((m) => m.id !== 'welcome' && (m.role === 'user' || m.role === 'coach'))
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 1200) }));
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const resp = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          fen,
          pgn: pgnContext,
          skillLevel,
          evalSummary: evalStale ? undefined : initialEvalSummary || undefined,
          history,
          mode: 'interactive-coach',
        }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'error',
            text:
              data.message ||
              'Unable to reach Gemini AI Coach. Please verify GEMINI_API_KEY in Settings > Secrets.',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `c_${Date.now()}`,
            role: 'coach',
            text: data.answer,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'error',
          text: 'Network error reaching the coaching endpoint. Ensure the server is running.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Interactive Position Setup Board */}
      <div className="xl:col-span-5 space-y-4">
        <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              Coaching Board Context
            </span>
            <button
              type="button"
              onClick={() => {
                chess.reset();
                setFen(chess.fen());
                setPgnContext('');
                setEvalStale(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>

          <Chessboard
            fen={fen}
            preferences={preferences}
            sizeOverridePx={Math.min(430, preferences.boardSizePx)}
            interactive={true}
            onMove={handleBoardMove}
          />

          <div className="text-[11px] font-mono text-neutral-500 truncate">
            FEN: {fen}
          </div>
        </div>
      </div>

      {/* Right: Grandmaster Coach Conversation */}
      <div className="xl:col-span-7 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col min-h-[580px]">
        {/* Coach Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={resolveAssetUrl('/src/assets/images/coach_grandmaster_1795303199713.jpg')}
              alt="Grandmaster Chess Coach"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-full object-cover border border-neutral-300 dark:border-neutral-700"
            />
            <div>
              <h1 className="text-base font-semibold text-neutral-900 dark:text-white">
                Grandmaster AI Coach
              </h1>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Powered by server-side Gemini · Tailored to your skill tier
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#11151C] rounded-lg">
            {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeSkillLevel(lvl)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                  skillLevel === lvl
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Feed */}
        <div ref={feedRef} className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[380px]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`p-3.5 rounded-xl text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-emerald-700 text-white ml-8'
                  : m.role === 'error'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-800 dark:text-amber-300 flex items-start gap-2'
                    : 'bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 mr-6'
              }`}
            >
              {m.role === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              {m.role === 'coach' ? <MiniMarkdown text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
            </div>
          ))}
          {loading && (
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#11151C] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 mr-12">
              Analyzing position and preparing coaching notes…
            </div>
          )}
        </div>

        {/* Quick Prompts + Input */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3 bg-neutral-50/70 dark:bg-[#11151C]">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                type="button"
                onClick={() => askCoach(qp)}
                disabled={loading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 hover:border-emerald-600 text-[11px] font-medium cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-emerald-600" />
                {qp}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              askCoach(question);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask why a move works, request a study plan, or explore tactics…"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
