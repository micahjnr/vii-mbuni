import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Mic, MicOff, Volume2, VolumeX,
  BookOpen, MessageCircle, Zap, Trophy, RotateCcw, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store';

// ── Learning modes ──────────────────────────────────────────────────────────
const MODES = [
  {
    id: 'conversation',
    label: 'Free Chat',
    icon: '💬',
    desc: 'Talk naturally — ask anything about Zaar language',
    color: 'from-crimson-600 to-rose-700',
  },
  {
    id: 'lesson',
    label: 'Guided Lesson',
    icon: '📖',
    desc: 'Structured lesson: greetings, numbers, family…',
    color: 'from-amber-600 to-orange-700',
  },
  {
    id: 'quiz',
    label: 'Quick Quiz',
    icon: '⚡',
    desc: 'Test yourself — tutor gives you Zaar words to translate',
    color: 'from-emerald-600 to-teal-700',
  },
  {
    id: 'pronunciation',
    label: 'Pronunciation',
    icon: '🎙️',
    desc: 'Speak Zaar words and get feedback',
    color: 'from-violet-600 to-purple-700',
  },
];

const LESSON_TOPICS = [
  'Greetings & Introductions',
  'Numbers 1–20',
  'Family Members',
  'Food & Eating',
  'Daily Routines',
  'Colours & Shapes',
  'Common Verbs',
  'Proverbs & Wisdom',
];

const SYSTEM_PROMPT = `You are Malam Zaar, a warm and encouraging AI language tutor specialising in the Zaar (Sayawa) language spoken by the Sayawa people of Tafawa Balewa, Bauchi State, Nigeria.

Your responsibilities:
- Teach Zaar vocabulary, grammar, and pronunciation
- Always show Zaar words in bold, with phonetic pronunciation in brackets, then English meaning
- Use Hausa as a bridge language when helpful (many Sayawa people speak Hausa)
- Be culturally sensitive and celebrate Sayawa heritage
- Keep responses concise and conversational for a mobile chat interface
- Award encouraging praise ("Madalla!", "Excellent!", "Toh sai haka!") when the user answers correctly
- Correct mistakes gently with the right Zaar form
- If asked something outside Zaar language/culture, gently redirect back to learning

Format responses clearly. For vocabulary, always use this pattern:
**[Zaar word]** (pronunciation) — English meaning

Example: **A cika** (ah chee-kah) — Good morning

Keep responses under 200 words unless teaching a detailed topic.`;

// ── Utility: speak text via Web Speech API ──────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // Strip markdown bold markers for TTS
  const clean = text.replace(/\*\*/g, '').replace(/\[.*?\]/g, '');
  const utt = new SpeechSynthesisUtterance(clean);
  // Prefer Hausa voice if available, else default
  const voices = window.speechSynthesis.getVoices();
  const hausa = voices.find(v => v.lang === 'ha' || v.lang.startsWith('ha-'));
  if (hausa) utt.voice = hausa;
  utt.rate = 0.88;
  utt.pitch = 1.0;
  window.speechSynthesis.speak(utt);
}

// ── Markdown-lite renderer ──────────────────────────────────────────────────
function renderMessage(text) {
  // Bold **word** → <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-amber-400 font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Typing indicator ────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── XP badge ───────────────────────────────────────────────────────────────
function XPToast({ xp }) {
  return (
    <div className="flex items-center gap-2 font-bold text-amber-400">
      <Zap size={16} className="fill-amber-400" />
      +{xp} XP
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ZaarTutor() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState(null);          // selected mode
  const [topic, setTopic] = useState(null);         // lesson topic
  const [messages, setMessages] = useState([]);     // chat history
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [recording, setRecording] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);
  const [streak, setStreak] = useState(0);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Send message to Groq via Netlify function ───────────────────────────
  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim() || loading) return;

    const userMsg = { role: 'user', content: userText.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/.netlify/functions/zaar-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          mode,
          topic,
          systemPrompt: SYSTEM_PROMPT,
        }),
      });

      if (!res.ok) throw new Error('Tutor unavailable');

      const data = await res.json();
      const reply = data.reply || "I didn't catch that. Please try again!";

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      // TTS
      if (ttsEnabled) speak(reply);

      // Award XP for engagement
      const xpEarned = mode === 'quiz' ? 10 : 3;
      setSessionXP(prev => prev + xpEarned);
      setStreak(prev => prev + 1);

      if (streak > 0 && (streak + 1) % 5 === 0) {
        toast.custom(() => <XPToast xp={xpEarned * 3} />, { duration: 2000 });
      }
    } catch (err) {
      toast.error('Malam Zaar is unavailable right now. Try again shortly.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, loading, mode, topic, ttsEnabled, streak]);

  // ── Start a mode ────────────────────────────────────────────────────────
  const startMode = useCallback(async (selectedMode, selectedTopic = null) => {
    setMode(selectedMode);
    setTopic(selectedTopic);
    setMessages([]);
    setSessionXP(0);
    setStreak(0);
    setLoading(true);

    // Build opening prompt based on mode
    let openingPrompt;
    if (selectedMode === 'conversation') {
      openingPrompt = 'Start with a warm greeting in Zaar, introduce yourself as Malam Zaar, and invite the user to ask anything about the Zaar language.';
    } else if (selectedMode === 'lesson') {
      openingPrompt = `Start a structured lesson on "${selectedTopic}". Begin with 3–5 key Zaar words/phrases for this topic, formatted clearly.`;
    } else if (selectedMode === 'quiz') {
      openingPrompt = 'Start a Zaar vocabulary quiz. Give the user an English word and ask them to write it in Zaar. Start with something easy.';
    } else if (selectedMode === 'pronunciation') {
      openingPrompt = 'Start a pronunciation practice session. Give 3 simple Zaar words with their phonetic transcriptions and ask the user to type them back or describe how they sound.';
    }

    try {
      const res = await fetch('/.netlify/functions/zaar-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: openingPrompt }],
          mode: selectedMode,
          topic: selectedTopic,
          systemPrompt: SYSTEM_PROMPT,
        }),
      });

      const data = await res.json();
      const reply = data.reply || 'Sannu! Welcome to Zaar lessons!';
      setMessages([{ role: 'assistant', content: reply }]);
      if (ttsEnabled) speak(reply);
    } catch {
      setMessages([{
        role: 'assistant',
        content: '**Sannu!** (Hello!) I\'m Malam Zaar, your Zaar language tutor. How can I help you learn today?',
      }]);
    } finally {
      setLoading(false);
    }
  }, [ttsEnabled]);

  // ── Voice input (mic → browser speech recognition) ─────────────────────
  const toggleRecording = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error('Voice input not supported on this browser');
      return;
    }
    if (recording) {
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US'; // Fallback; Zaar not available in browser SR
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setRecording(false);
    };
    recognition.onerror = () => {
      toast.error('Could not understand audio. Please try again.');
      setRecording(false);
    };
    recognition.onend = () => setRecording(false);
    recognition.start();
    setRecording(true);
  }, [recording]);

  // ── Handle key press ────────────────────────────────────────────────────
  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Quick reply chips ────────────────────────────────────────────────────
  const quickReplies = mode === 'conversation'
    ? ['How do I say "thank you"?', 'Teach me a greeting', 'What are tone marks in Zaar?']
    : mode === 'quiz'
    ? ['Give me a harder word', 'Repeat that', 'Show me the answer']
    : mode === 'lesson'
    ? ['Give me more examples', 'Quiz me on this', 'Explain the grammar']
    : ['Say that slower', 'Give me another word', 'How do I practice?'];

  // ═══════════════════════════════════════════════════════════════════════
  // MODE SELECTION SCREEN
  // ═══════════════════════════════════════════════════════════════════════
  if (!mode) {
    return (
      <div className="min-h-screen bg-surface-900 text-white flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur border-b border-surface-700 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-700 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-bold text-lg leading-tight">Malam Zaar</h1>
            <p className="text-xs text-surface-400">AI Language Tutor</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 pb-safe">
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-3">🦅</div>
            <h2 className="text-2xl font-bold mb-1">Learn Zaar with AI</h2>
            <p className="text-surface-400 text-sm max-w-xs mx-auto">
              Your personal tutor for the Sayawa language — anytime, anywhere.
            </p>
            {sessionXP > 0 && (
              <div className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-semibold">
                <Trophy size={14} />
                {sessionXP} XP this session
              </div>
            )}
          </div>

          {/* Mode cards */}
          <div className="space-y-3 mb-8">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => m.id === 'lesson' ? null : startMode(m.id)}
                className="w-full text-left"
              >
                <div className={`rounded-2xl p-4 bg-gradient-to-r ${m.color} hover:scale-[1.01] active:scale-[0.99] transition-transform`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{m.icon}</span>
                    <div className="flex-1">
                      <div className="font-bold text-base">{m.label}</div>
                      <div className="text-white/70 text-xs mt-0.5">{m.desc}</div>
                    </div>
                  </div>
                  {/* Lesson topic selector inline */}
                  {m.id === 'lesson' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {LESSON_TOPICS.map(t => (
                        <button
                          key={t}
                          onClick={(e) => { e.stopPropagation(); startMode('lesson', t); }}
                          className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-2 text-xs font-medium text-left transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Tips */}
          <div className="bg-surface-800 rounded-2xl p-4">
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Tips</div>
            <ul className="space-y-1.5 text-sm text-surface-300">
              <li>🔊 Tap the speaker icon to hear words read aloud</li>
              <li>🎤 Use the mic button to speak your answers</li>
              <li>⚡ Earn XP for every message — quiz mode gives 3×</li>
              <li>📖 Try Guided Lesson to learn topic by topic</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHAT SCREEN
  // ═══════════════════════════════════════════════════════════════════════
  const currentMode = MODES.find(m => m.id === mode);

  return (
    <div className="min-h-screen bg-surface-900 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur border-b border-surface-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode(null)}
            className="p-2 rounded-full hover:bg-surface-700 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-xl">{currentMode?.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm leading-tight">
              Malam Zaar — {currentMode?.label}
              {topic && <span className="text-amber-400"> · {topic}</span>}
            </div>
            <div className="text-xs text-surface-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Online
              {sessionXP > 0 && (
                <span className="text-amber-400 font-semibold">· {sessionXP} XP</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTtsEnabled(v => !v)}
              className="p-2 rounded-full hover:bg-surface-700 transition-colors text-surface-400"
              title={ttsEnabled ? 'Mute tutor' : 'Unmute tutor'}
            >
              {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={() => { setMessages([]); startMode(mode, topic); }}
              className="p-2 rounded-full hover:bg-surface-700 transition-colors text-surface-400"
              title="Restart session"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm mr-2 mt-auto flex-shrink-0">
                🦅
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-surface-800 text-surface-100 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant'
                ? renderMessage(msg.content)
                : msg.content}
              {msg.role === 'assistant' && ttsEnabled && (
                <button
                  onClick={() => speak(msg.content)}
                  className="mt-1.5 flex items-center gap-1 text-surface-500 hover:text-amber-400 transition-colors text-xs"
                >
                  <Volume2 size={12} /> Play
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm mr-2 flex-shrink-0">
              🦅
            </div>
            <div className="bg-surface-800 rounded-2xl rounded-bl-sm">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      {messages.length > 0 && !loading && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {quickReplies.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="flex-shrink-0 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-full px-3 py-1.5 text-xs text-surface-300 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-surface-700 bg-surface-900 px-3 py-3 pb-safe">
        <div className="flex items-end gap-2">
          <button
            onMouseDown={toggleRecording}
            className={`p-2.5 rounded-full flex-shrink-0 transition-colors ${
              recording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-surface-700 text-surface-400 hover:bg-surface-600'
            }`}
          >
            {recording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type in English or Zaar…"
            className="flex-1 bg-surface-800 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-surface-500 resize-none outline-none border border-surface-600 focus:border-brand-500 transition-colors max-h-28 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
            disabled={loading}
          />

          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
