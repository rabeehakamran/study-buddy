import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useRows } from '../lib/useRows';
import type { Subject } from '../lib/types';
import { getChatUsage, LimitReachedError, streamChat, type ChatMessage, type ChatUsage } from '../lib/ai';
import ErrorBanner from '../components/ErrorBanner';
import Markdown from '../components/Markdown';
import PageHeader from '../components/PageHeader';
import Mascot from '../pixel/Mascot';
import PixelArt from '../pixel/PixelArt';
import { HEART, HEART_EMPTY_PALETTE, HEART_PALETTE, MASCOT_PALETTE, mascotRows } from '../pixel/sprites';

const SUGGESTIONS = [
  'Explain photosynthesis like I’m 10 🌱',
  'Mujhe fractions samajh nahi aa rahe 😭',
  'Make me a 3-day study plan for my maths test',
  'What’s the difference between mitosis and meiosis?',
  'Help me write an essay outline on my favourite book',
];

export default function Tutor() {
  const { session } = useAuth();
  const storeKey = `sb.chat.${session!.user.id}`;
  const subjects = useRows<Subject>('subjects', 'position');
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? '[]') as ChatMessage[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState(() => (location.state as { prompt?: string } | null)?.prompt ?? '');
  const [focus, setFocus] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const outOfMessages = usage !== null && usage.used >= usage.limit;

  useEffect(() => {
    getChatUsage()
      .then(setUsage)
      .catch((e: Error) => setError(e.message));
  }, []);

  // A prompt handed over from the quiz page: use it once, then clear it from history state.
  useEffect(() => {
    if ((location.state as { prompt?: string } | null)?.prompt) {
      navigate(location.pathname, { replace: true, state: null });
      inputRef.current?.focus();
    }
  }, []); // run once on open

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, storeKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming || outOfMessages) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        { messages: history, subjects: subjects.rows.map((s) => s.name), subject: focus },
        (chunk) =>
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
            return copy;
          }),
        ctrl.signal,
        setUsage,
      );
    } catch (e) {
      if (e instanceof LimitReachedError) {
        // Give her message back so it isn't lost, and show the friendly limit note.
        setMessages((m) => m.filter((_, i) => i < m.length - 2));
        setInput(content);
        setUsage((u) => (u ? { ...u, used: u.limit } : u));
      } else if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Drop an empty reply bubble (error or stopped before any text).
      setMessages((m) => (m.length && m[m.length - 1].role === 'assistant' && !m[m.length - 1].content ? m.slice(0, -1) : m));
    }
  }

  function retry() {
    const last = messages[messages.length - 1];
    if (last?.role !== 'user') return;
    setMessages((m) => m.slice(0, -1));
    void send(last.content);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }

  const canRetry = !streaming && error && messages[messages.length - 1]?.role === 'user';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Ask Buddy"
          subtitle="Stuck on something? Ask in English, Hinglish or Urdu 💬"
          art={<Mascot mood="focus" className="w-full" />}
        />
        <div className="flex flex-wrap items-center gap-2">
          {usage && (
            <div
              className="flex items-center gap-1 bg-surface-2 px-3 py-1.5"
              title="Buddy messages left today"
              aria-label={`${Math.max(0, usage.limit - usage.used)} of ${usage.limit} Buddy messages left today`}
            >
              {Array.from({ length: usage.limit }, (_, i) => (
                <PixelArt key={i} rows={HEART} palette={i < usage.limit - usage.used ? HEART_PALETTE : HEART_EMPTY_PALETTE} className="w-4" />
              ))}
              <span className="ml-1 text-xs text-muted">
                {Math.max(0, usage.limit - usage.used)}/{usage.limit} left today
              </span>
            </div>
          )}
          <Link to="/quiz" className="btn btn-ghost">
            Quiz me ✨
          </Link>
          <button className="btn btn-ghost" onClick={newChat} disabled={!messages.length}>
            New chat
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm" role="radiogroup" aria-label="Subject">
        <span className="mr-1 text-muted">Subject:</span>
        {['', ...subjects.rows.map((s) => s.name)].map((name) => (
          <button
            key={name || 'any'}
            role="radio"
            aria-checked={focus === name}
            onClick={() => setFocus(name)}
            className={`px-2.5 py-1 ${focus === name ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`}
          >
            {name || 'Any'}
          </button>
        ))}
      </div>

      <section className="card flex h-[calc(100vh-290px)] min-h-[420px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Mascot mood="happy" className="w-20" />
              <p className="font-pixel text-xl">Hi! What are we learning today?</p>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="bg-surface-2 px-3 py-1.5 text-sm hover:bg-primary-soft" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap bg-primary-strong px-3 py-2 text-white">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2">
                  <PixelArt rows={mascotRows('happy')} palette={MASCOT_PALETTE} className="mt-1 w-8 shrink-0" />
                  <div className="max-w-[85%] bg-surface-2 px-3 py-2">
                    {m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <span className="font-pixel animate-twinkle text-muted">Buddy is thinking…</span>
                    )}
                  </div>
                </div>
              ),
            )
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
            <div className="flex-1">
              <ErrorBanner message={error} onClose={() => setError(null)} />
            </div>
            {canRetry && (
              <button className="btn btn-ghost" onClick={retry}>
                Try again
              </button>
            )}
          </div>
        )}

        {outOfMessages && !streaming ? (
          <div className="flex flex-wrap items-center gap-3 border-t-[3px] border-line p-4">
            <Mascot mood="sleep" className="w-10 shrink-0" />
            <p className="flex-1 text-sm">
              <b className="font-pixel text-base">That’s all {usage!.limit} of today’s Buddy messages 💜</b>
              <br />
              <span className="text-muted">Buddy is resting. Your messages come back tomorrow! You can still make quizzes.</span>
            </p>
            <Link to="/quiz" className="btn btn-primary">
              Make a quiz ✨
            </Link>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t-[3px] border-line p-3">
          <textarea
            ref={inputRef}
            className="input max-h-40 min-h-11 flex-1 resize-none"
            rows={1}
            placeholder="Ask Buddy anything… (Enter to send, Shift+Enter for a new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            aria-label="Message to Buddy"
          />
          {streaming ? (
            <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
        )}
      </section>
      <p className="text-center text-xs text-muted">Buddy is an AI and can make mistakes. Double-check important facts with your book or teacher.</p>
    </div>
  );
}
