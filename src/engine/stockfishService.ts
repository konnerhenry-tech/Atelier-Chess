import { AIPlayStyle } from '../types/chess';
import { uciLineToSan } from '../utils/chessHelpers';

export interface EngineLine {
  multipv: number;
  depth: number;
  cp: number;          // White-relative centipawns
  mate: number | null; // White-relative mate in N (positive = White mates)
  pvUci: string[];
  pvSan: string[];
  bestMoveUci: string;
}

export interface EngineEvalResult {
  fen: string;
  depth: number;
  bestMoveUci: string;
  lines: EngineLine[];
}

interface SearchOptions {
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
  skillLevel?: number;
}

type QueuedTask = {
  run: () => Promise<void>;
};

class StockfishEngineService {
  private worker: Worker | null = null;
  private ready = false;
  private initializing: Promise<void> | null = null;
  private listeners = new Set<(line: string) => void>();
  private queue: QueuedTask[] = [];
  private runningTask = false;
  private currentSkill = 20;

  private async ensureWorker(): Promise<void> {
    if (this.ready && this.worker) return;
    if (this.initializing) return this.initializing;

    this.initializing = new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker('/stockfish/stockfish-19-lite-single.js');
        this.worker = worker;

        let uciOk = false;

        const onMessage = (e: MessageEvent) => {
          const text = typeof e.data === 'string' ? e.data : String(e.data ?? '');
          const lines = text.split('\n');
          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;

            if (line === 'uciok' && !uciOk) {
              uciOk = true;
              worker.postMessage('isready');
            } else if (line === 'readyok' && !this.ready) {
              this.ready = true;
              resolve();
            }

            this.listeners.forEach((cb) => cb(line));
          }
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', (err) => {
          this.ready = false;
          this.initializing = null;
          reject(new Error(`Stockfish worker failed to initialize: ${err.message || 'unknown error'}`));
        });

        worker.postMessage('uci');
      } catch (err) {
        this.initializing = null;
        reject(err);
      }
    });

    return this.initializing;
  }

  private enqueue<T>(taskFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: async () => {
          try {
            const res = await taskFn();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        },
      });
      this.drainQueue();
    });
  }

  private async drainQueue() {
    if (this.runningTask) return;
    this.runningTask = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        await next.run();
      }
    }
    this.runningTask = false;
  }

  public stopCurrent() {
    if (this.worker && this.ready) {
      this.worker.postMessage('stop');
    }
  }

  public async evaluatePosition(
    fen: string,
    opts: SearchOptions = {}
  ): Promise<EngineEvalResult> {
    return this.enqueue(async () => {
      await this.ensureWorker();
      const worker = this.worker!;
      const sideToMove = fen.split(' ')[1] === 'b' ? -1 : 1;
      const depth = opts.depth ?? 12;
      const multiPv = Math.max(1, Math.min(4, opts.multiPv ?? 1));
      const skill = Math.max(0, Math.min(20, opts.skillLevel ?? 20));

      return new Promise<EngineEvalResult>((resolve) => {
        const lineMap = new Map<number, EngineLine>();
        let maxDepthReached = 0;

        const finish = (bestMoveUci: string) => {
          this.listeners.delete(onLine);
          clearTimeout(safetyTimer);
          const sortedLines = Array.from(lineMap.values()).sort((a, b) => a.multipv - b.multipv);
          resolve({
            fen,
            depth: maxDepthReached,
            bestMoveUci: bestMoveUci || sortedLines[0]?.bestMoveUci || '',
            lines: sortedLines,
          });
        };

        const onLine = (line: string) => {
          if (line.startsWith('info ') && line.includes(' pv ')) {
            const depthMatch = line.match(/\bdepth (\d+)/);
            const multipvMatch = line.match(/\bmultipv (\d+)/);
            const cpMatch = line.match(/\bscore cp (-?\d+)/);
            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            const pvMatch = line.match(/\bpv (.+)$/);

            if (pvMatch) {
              const d = depthMatch ? parseInt(depthMatch[1], 10) : 1;
              const mpv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
              const pvUci = pvMatch[1].trim().split(/\s+/);
              let cp = 0;
              let mate: number | null = null;
              if (mateMatch) {
                mate = parseInt(mateMatch[1], 10) * sideToMove;
                cp = mate > 0 ? 10000 - Math.abs(mate) * 10 : -10000 + Math.abs(mate) * 10;
              } else if (cpMatch) {
                cp = parseInt(cpMatch[1], 10) * sideToMove;
              }

              maxDepthReached = Math.max(maxDepthReached, d);
              lineMap.set(mpv, {
                multipv: mpv,
                depth: d,
                cp,
                mate,
                pvUci,
                pvSan: uciLineToSan(fen, pvUci.slice(0, 8)),
                bestMoveUci: pvUci[0] || '',
              });
            }
          } else if (line.startsWith('bestmove ')) {
            const parts = line.split(/\s+/);
            const bm = parts[1] && parts[1] !== '(none)' ? parts[1] : '';
            finish(bm);
          }
        };

        const safetyTimeoutMs = (opts.movetimeMs ?? 5500) + 3500;
        const safetyTimer = window.setTimeout(() => {
          worker.postMessage('stop');
          finish(lineMap.get(1)?.bestMoveUci || '');
        }, safetyTimeoutMs);

        this.listeners.add(onLine);

        if (skill !== this.currentSkill) {
          worker.postMessage(`setoption name Skill Level value ${skill}`);
          this.currentSkill = skill;
        }
        worker.postMessage(`setoption name MultiPV value ${multiPv}`);
        worker.postMessage(`position fen ${fen}`);

        if (opts.movetimeMs) {
          worker.postMessage(`go depth ${depth} movetime ${opts.movetimeMs}`);
        } else {
          worker.postMessage(`go depth ${depth}`);
        }
      });
    });
  }

  public async chooseAIMove(
    fen: string,
    opts: {
      skillLevel: number;
      depth: number;
      thinkTimeMs: number;
      style: AIPlayStyle;
    }
  ): Promise<{ moveUci: string; evalCp: number }> {
    const multiPv = opts.skillLevel <= 10 || opts.style !== 'balanced' ? 3 : 1;
    const res = await this.evaluatePosition(fen, {
      depth: opts.depth,
      movetimeMs: opts.thinkTimeMs,
      multiPv,
      skillLevel: opts.skillLevel,
    });

    if (res.lines.length === 0) {
      return { moveUci: res.bestMoveUci, evalCp: 0 };
    }

    // Style & skill-calibrated candidate selection
    let chosen = res.lines[0];
    if (res.lines.length > 1) {
      const turnMultiplier = fen.split(' ')[1] === 'b' ? -1 : 1;
      const topScore = res.lines[0].cp * turnMultiplier;

      if (opts.style === 'aggressive' || opts.style === 'tactical') {
        // Pick an almost-equal sharp alternative occasionally
        const sharpCandidate = res.lines.find(
          (l, idx) => idx > 0 && topScore - l.cp * turnMultiplier <= 35 && l.pvSan[0]?.includes('x')
        );
        if (sharpCandidate) chosen = sharpCandidate;
      } else if (opts.skillLevel <= 4 && res.lines.length >= 2) {
        // Beginner/Easy occasionally picks 2nd or 3rd engine line within reasonable tolerance
        const roll = Math.random();
        if (roll < 0.35 && res.lines[1]) chosen = res.lines[1];
        else if (roll < 0.5 && res.lines[2] && opts.skillLevel <= 2) chosen = res.lines[2];
      }
    }

    return {
      moveUci: chosen.bestMoveUci || res.bestMoveUci,
      evalCp: chosen.cp,
    };
  }

  public terminate() {
    this.stopCurrent();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.initializing = null;
    this.queue = [];
  }
}

export const stockfishService = new StockfishEngineService();
