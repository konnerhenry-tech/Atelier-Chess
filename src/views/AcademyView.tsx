import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { ArrowRight, Award, CheckCircle2, Flame, HelpCircle, RotateCcw } from 'lucide-react';
import { Chessboard } from '../components/Chessboard';
import { ACADEMY_LESSONS } from '../data/courses';
import { AcademyLesson, BoardPreferences, PieceType } from '../types/chess';
import { soundEngine } from '../utils/soundEngine';

interface AcademyViewProps {
  preferences: BoardPreferences;
  completedLessons: string[];
  xp: number;
  streakDays: number;
  onCompleteLesson: (lessonId: string, xpReward: number) => void;
}

export const AcademyView: React.FC<AcademyViewProps> = ({
  preferences,
  completedLessons,
  xp,
  streakDays,
  onCompleteLesson,
}) => {
  const [tierFilter, setTierFilter] = useState<'All' | 'Beginner' | 'Intermediate' | 'Advanced'>('All');
  const [activeLesson, setActiveLesson] = useState<AcademyLesson>(ACADEMY_LESSONS[0]);
  const [stepIndex, setStepIndex] = useState(0);
  const [fen, setFen] = useState(ACADEMY_LESSONS[0].steps[0].fen);
  const [stepSolved, setStepSolved] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'hint'; text: string } | null>(null);
  const [lessonFinished, setLessonFinished] = useState(false);

  const filteredLessons = useMemo(
    () =>
      tierFilter === 'All'
        ? ACADEMY_LESSONS
        : ACADEMY_LESSONS.filter((l) => l.tier === tierFilter),
    [tierFilter]
  );

  const currentStep = activeLesson.steps[stepIndex] || activeLesson.steps[0];

  const selectLesson = (lesson: AcademyLesson) => {
    setActiveLesson(lesson);
    setStepIndex(0);
    setFen(lesson.steps[0].fen);
    setStepSolved(false);
    setFeedback(null);
    setLessonFinished(false);
  };

  const resetCurrentStep = () => {
    setFen(currentStep.fen);
    setStepSolved(false);
    setFeedback(null);
  };

  const handleMove = (from: string, to: string, promotion?: PieceType) => {
    if (stepSolved) return false;
    const c = new Chess();
    try {
      c.load(fen);
      const m = c.move({ from, to, promotion });
      if (!m) return false;

      const uci = `${m.from}${m.to}${m.promotion || ''}`;
      const expected = currentStep.expectedMoves || [];
      const isMatch = expected.includes(uci) || expected.includes(m.san);

      if (isMatch) {
        setFen(c.fen());
        setStepSolved(true);
        setFeedback({ type: 'success', text: currentStep.successMessage });
        soundEngine.play('puzzle-success');

        if (stepIndex === activeLesson.steps.length - 1) {
          setLessonFinished(true);
          onCompleteLesson(activeLesson.id, activeLesson.xpReward);
        }
        return true;
      } else {
        soundEngine.play('puzzle-error');
        setFeedback({
          type: 'error',
          text: `Not quite (${m.san}). Look closely at the goal or tap Hint for guidance.`,
        });
        return false;
      }
    } catch {
      return false;
    }
  };

  const nextStep = () => {
    if (stepIndex < activeLesson.steps.length - 1) {
      const nextIdx = stepIndex + 1;
      setStepIndex(nextIdx);
      setFen(activeLesson.steps[nextIdx].fen);
      setStepSolved(false);
      setFeedback(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Academy Progress Header */}
      <div className="bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Interactive Chess Academy
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Structured Beginner, Intermediate, and Advanced lessons played directly on the board.
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
            <Flame className="w-4 h-4" />
            <span>{streakDays}d Streak</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
            <Award className="w-4 h-4" />
            <span>{xp} XP</span>
          </div>
          <div className="text-neutral-600 dark:text-neutral-300 font-semibold">
            {completedLessons.length}/{ACADEMY_LESSONS.length} Lessons
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Curriculum Tree */}
        <div className="xl:col-span-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-xl w-fit">
            {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  tierFilter === tier
                    ? 'bg-white dark:bg-[#1F2633] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {filteredLessons.map((lesson) => {
              const isSelected = activeLesson.id === lesson.id;
              const isDone = completedLessons.includes(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => selectLesson(lesson)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-600'
                      : 'bg-white dark:bg-[#151921] border-neutral-200 dark:border-neutral-800 hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {lesson.tier} · Lesson {lesson.order} · +{lesson.xpReward} XP
                    </div>
                    {isDone && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white mt-1">
                    {lesson.title}
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {lesson.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Interactive Board Lesson */}
        <div className="xl:col-span-7 bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {activeLesson.tier} · Step {stepIndex + 1} of {activeLesson.steps.length}
              </div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                {currentStep.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              {activeLesson.steps.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStepIndex(idx);
                    setFen(s.fen);
                    setStepSolved(false);
                    setFeedback(null);
                    setLessonFinished(false);
                  }}
                  className={`w-7 h-2 rounded-full transition-colors cursor-pointer ${
                    idx === stepIndex
                      ? 'bg-emerald-600'
                      : idx < stepIndex
                        ? 'bg-emerald-600/40'
                        : 'bg-neutral-200 dark:bg-neutral-700'
                  }`}
                  aria-label={`Go to step ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
            {currentStep.instruction}
          </p>

          <Chessboard
            fen={fen}
            orientation={fen.split(' ')[1] === 'b' ? 'b' : 'w'}
            preferences={preferences}
            sizeOverridePx={Math.min(480, preferences.boardSizePx)}
            interactive={!stepSolved}
            onMove={handleMove}
          />

          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : feedback.type === 'error'
                    ? 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFeedback({ type: 'hint', text: currentStep.hint })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-medium cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Hint
              </button>
              <button
                type="button"
                onClick={resetCurrentStep}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Step
              </button>
            </div>

            {stepSolved && stepIndex < activeLesson.steps.length - 1 && (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                Next Exercise
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {lessonFinished && (
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Lesson Completed! +{activeLesson.xpReward} XP earned.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
