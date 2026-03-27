import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle, Heart, Send, Trash2, ChevronDown, ChevronUp,
  Volume2, BookOpen, Feather, ImageIcon, Users, Loader2, X,
  Search, BookMarked, ChevronRight, Star, Shuffle, RotateCcw,
  Trophy, ChevronLeft, Zap, CheckCircle, XCircle,
  Mic, MicOff, Play, ThumbsUp, Brain, CalendarClock, Upload
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
// zaarDict is loaded lazily at runtime from /zaarDict.json
// to avoid bundling 640 KB of data into the ZaarCulture JS chunk.
let _ZAAR_DICT = []
let _ZAAR_SENTENCES = []
let _dictPromise = null
const _dictListeners = new Set()

function loadDict() {
  if (!_dictPromise) {
    _dictPromise = fetch('/zaarDict.json')
      .then(r => r.json())
      .then(({ zaarDictionary, ZAAR_SENTENCES: sentences }) => {
        _ZAAR_DICT = zaarDictionary.map(e => ({
          z: e.zaar,
          p: e.pos ? e.pos + '.' : '',
          e: e.english,
          h: e.hausa,
          n: e.notes,
          section: e.section,
          posLabel: e.posLabel,
        }))
        _ZAAR_SENTENCES = sentences
        // Notify all mounted useDictionary hooks
        _dictListeners.forEach(fn => fn())
      })
      .catch(err => console.error('Failed to load Zaar dictionary:', err))
  }
  return _dictPromise
}

function useDictionary() {
  const [dictReady, setDictReady] = useState(_ZAAR_DICT.length > 0)
  useEffect(() => {
    if (_ZAAR_DICT.length > 0) return
    const notify = () => setDictReady(true)
    _dictListeners.add(notify)
    loadDict()
    return () => _dictListeners.delete(notify)
  }, [])
  return { ZAAR_DICT: _ZAAR_DICT, ZAAR_SENTENCES: _ZAAR_SENTENCES, dictReady }
}
import Avatar from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ─── Brand colour ─────────────────────────────────────────────
const R = '#c8102e'

// ─── Static cultural data ─────────────────────────────────────

const LANGUAGE_LESSONS = [
  { id: 'g1', category: 'Greetings', sayawa: 'KŒ mbút tÉ sÉmbËrwà: wuri?', phonetic: 'ko mbut te semburrwa wuri', english: 'Good morning (How did you spend the night?)', notes: 'Standard morning greeting. Expected reply: La:fíya káláw (Very well).' },
  { id: 'g2', category: 'Greetings', sayawa: 'La:fíya káláw', phonetic: 'la-fee-ya ka-law', english: 'Very well, thank you', notes: 'Standard reply to any morning or afternoon greeting.' },
  { id: 'g3', category: 'Greetings', sayawa: 'KŒ vyá: wuri?', phonetic: 'ko vya wuri', english: 'Good afternoon (How did you spend the day?)', notes: 'Afternoon greeting. Reply: La:fíya káláw.' },
  { id: 'g4', category: 'Greetings', sayawa: 'Gàjíya wuri?', phonetic: 'ga-jee-ya wuri', english: 'How are you? (Are you tired?)', notes: 'Casual greeting. Reply: Là:fíya kálâw (Very well).' },
  { id: 'g5', category: 'Greetings', sayawa: 'CoghÑ ga:ghŒ •a', phonetic: 'cog-n ga-go da', english: 'May God bless you', notes: 'Respectful blessing, especially used when greeting a chief.' },
  { id: 'g6', category: 'Greetings', sayawa: 'wurÉ', phonetic: 'wu-re', english: 'To greet someone', notes: 'The verb meaning to greet. Hausa: Gaisuwa.' },
  { id: 'f1', category: 'Family', sayawa: 'amarya', phonetic: '', english: 'Younger wife', notes: 'Hausa: Amarya. Syn: gÈt mu:ri.' },
  { id: 'f2', category: 'Family', sayawa: 'àwtá', phonetic: '', english: 'Youngest son', notes: 'Hausa: Auta' },
  { id: 'f3', category: 'Family', sayawa: 'Bàtú:re', phonetic: '', english: 'European, white man', notes: 'Hausa: Bature' },
  { id: 'f4', category: 'Family', sayawa: 'bazara', phonetic: '', english: 'Hot season before the rains', notes: 'Hausa: Bazara' },
  { id: 'f5', category: 'Family', sayawa: 'bÈdŒrwa', phonetic: '', english: 'Girl', notes: 'Hausa: Budurwa' },
  { id: 'f6', category: 'Family', sayawa: 'bÈndÉÑ', phonetic: '', english: 'Person with a speech impediment', notes: 'Hausa: Mai i\'ina' },
  { id: 'f7', category: 'Family', sayawa: 'da:', phonetic: '', english: '1) Father', notes: 'Hausa: Uba. Pl: daktÉ. 2) Person. Appears only in the definite' },
  { id: 'f8', category: 'Family', sayawa: 'dà:da', phonetic: '', english: 'Grandfather', notes: 'Hausa: Kaka' },
  { id: 'f9', category: 'Family', sayawa: 'dàlí:li', phonetic: '', english: 'Reason, cause', notes: 'Hausa: Dalili' },
  { id: 'f10', category: 'Family', sayawa: 'dè:', phonetic: '', english: 'Reason', notes: 'Hausa: Dalili. NŒ dwa:ndŒ ghŒn átâ katkŒ slÉ:r •a yèlwósà: kó:' },
  { id: 'f11', category: 'Family', sayawa: 'd†:pm', phonetic: '', english: 'Mason-ants, white ants', notes: 'Hausa: Gara. Small ants building galleries and' },
  { id: 'f12', category: 'Family', sayawa: '•ÉghŒr', phonetic: '', english: 'Madness, mad person', notes: 'Hausa: Wauta. Kúni gín ci nŒ' },
  { id: 'd1', category: 'Daily Life', sayawa: 'álkáma', phonetic: '', english: 'Wheat', notes: 'Hausa: Alkama' },
  { id: 'd2', category: 'Daily Life', sayawa: 'ba:gále', phonetic: '', english: 'Leather pants', notes: 'Hausa: Walki' },
  { id: 'd3', category: 'Daily Life', sayawa: 'bànkâwra', phonetic: '', english: 'Millet sp', notes: 'Hausa: Dawa sp' },
  { id: 'd4', category: 'Daily Life', sayawa: 'bàtkàlàÑ', phonetic: '', english: 'Tree sp', notes: 'Hausa: Doka. Isoberlinia doka (Leguminosae:' },
  { id: 'd5', category: 'Daily Life', sayawa: 'bazara', phonetic: '', english: 'Hot season before the rains', notes: 'Hausa: Bazara' },
  { id: 'd6', category: 'Daily Life', sayawa: 'bÈbÈk', phonetic: '', english: 'Tree sp', notes: 'Hausa: Wa. Ficus umbellata (Moraceae). A species of fig-tree' },
  { id: 'd7', category: 'Daily Life', sayawa: 'bosáÑdi', phonetic: '', english: '1) Tree sp', notes: 'Hausa: ¯o§iya. Strychnos spinosa (Loganiaceae). A tree' },
  { id: 'd8', category: 'Daily Life', sayawa: 'burgàl', phonetic: '', english: 'Tree sp', notes: 'Hausa: Bishiya sp. Sericanthe chevalieri (Rubiaceae). A shrub,' },
  { id: 'd9', category: 'Daily Life', sayawa: 'ßá:tsŒ', phonetic: '', english: 'African elemi tree', notes: 'Hausa: Atili. Canarium schweinfurthii (Burseraceae).' },
  { id: 'd10', category: 'Daily Life', sayawa: 'ßázhèl', phonetic: '', english: 'Fig tree sp', notes: 'Hausa: Ce•iya sp. Ficus dicranostyla (Moraceae).' },
  { id: 'd11', category: 'Daily Life', sayawa: 'da:', phonetic: '', english: 'Tree sp', notes: 'Hausa: Bishiya sp' },
  { id: 'd12', category: 'Daily Life', sayawa: 'dàdÈn', phonetic: '', english: 'Abandoned house', notes: 'Hausa: Kufai' },
  { id: 's1', category: 'Spirituality', sayawa: 'àdúwa', phonetic: '', english: 'Prayer', notes: 'Hausa: Aduwa' },
  { id: 's2', category: 'Spirituality', sayawa: 'AÓlla', phonetic: '', english: 'God', notes: 'Hausa: Allah. Syn: CoghÑ; Da: gòpm coghÑ.' },
  { id: 's3', category: 'Spirituality', sayawa: 'bawtá', phonetic: '', english: 'Worship', notes: 'Hausa: Bauta' },
  { id: 's4', category: 'Spirituality', sayawa: 'CoghÑ', phonetic: '', english: 'God', notes: 'Hausa: Allah. CoghÑ ga:ghŒ •a. May God bless' },
  { id: 's5', category: 'Spirituality', sayawa: 'cóghÑ', phonetic: '', english: 'Heaven', notes: 'Hausa: Sama. See: CoghÑ.' },
  { id: 's6', category: 'Spirituality', sayawa: 'Da:', phonetic: '', english: 'God (Lit', notes: 'Hausa: \'our father in the sky\'). Allah. Syn: AÓlla;' },
  { id: 's7', category: 'Spirituality', sayawa: '•úghËn', phonetic: '', english: 'Muslim prayer (Hum.)', notes: 'Hausa: Salla' },
  { id: 's8', category: 'Spirituality', sayawa: 'gùÑ', phonetic: '', english: 'Chief', notes: 'Hausa: Sarki. Der: guÑdÉ \'chieftaincy\' \'sarauta\'.' },
  { id: 's9', category: 'Spirituality', sayawa: 'guÑdÉ', phonetic: '', english: 'Chieftainship', notes: 'Hausa: Sarauta. See: gùÑ.' },
  { id: 's10', category: 'Spirituality', sayawa: 'hukúma', phonetic: '', english: 'Administrative district chief', notes: 'Hausa: Hukuma' },
  { id: 'a1', category: 'Animals', sayawa: 'àgwà:gwâ:', phonetic: '', english: 'Duck', notes: 'Hausa: Agwagwa' },
  { id: 'a2', category: 'Animals', sayawa: 'a:tsÉ', phonetic: '', english: 'Mouse', notes: 'Hausa: Kusu' },
  { id: 'a3', category: 'Animals', sayawa: 'bàmdì', phonetic: '', english: '1) Red patas monkey', notes: 'Hausa: Biri' },
  { id: 'a4', category: 'Animals', sayawa: 'bàÑ', phonetic: '', english: 'Roan antelope', notes: 'Hausa: Gwanki' },
  { id: 'a5', category: 'Animals', sayawa: 'bìki', phonetic: '', english: 'Celebration', notes: 'Hausa: Biki' },
  { id: 'a6', category: 'Animals', sayawa: 'ßáli', phonetic: '', english: 'Lizard', notes: 'Hausa: ¯adangare' },
  { id: 'a7', category: 'Animals', sayawa: 'ße•í', phonetic: '', english: 'Small fish sp', notes: 'Hausa: Kifi sp' },
  { id: 'a8', category: 'Animals', sayawa: 'cólâk', phonetic: '', english: 'Bird sp', notes: 'Hausa: Tsuntsu sp' },
  { id: 'a9', category: 'Animals', sayawa: 'da:', phonetic: '', english: 'Agama lizard, jan gwada', notes: 'Hausa: Kiski' },
  { id: 'a10', category: 'Animals', sayawa: 'dÈllÈkcì', phonetic: '', english: 'Bird sp', notes: 'Hausa: Tsuntsu sp' },
  { id: 'a11', category: 'Animals', sayawa: 'dúr', phonetic: '', english: 'Celebration', notes: 'Hausa: (Shagalin) biki' },
  { id: 'a12', category: 'Animals', sayawa: '•urmbul', phonetic: '', english: 'Snake sp', notes: 'Hausa: Maciji sp' },
  { id: 'b1', category: 'Body', sayawa: 'bubzÈÑ', phonetic: '', english: 'Beard', notes: 'Hausa: Gemu' },
  { id: 'b2', category: 'Body', sayawa: 'ßwâ:n', phonetic: '', english: 'Harmattan', notes: 'Hausa: Hunturu' },
  { id: 'b3', category: 'Body', sayawa: 'da:', phonetic: '', english: 'Skink lizard', notes: 'Hausa: Kulßa' },
  { id: 'b4', category: 'Body', sayawa: 'dagh', phonetic: '', english: 'Finger millet', notes: 'Hausa: Tamba' },
  { id: 'b5', category: 'Body', sayawa: 'da:n', phonetic: '', english: 'Chair', notes: 'Hausa: Kujera' },
  { id: 'b6', category: 'Body', sayawa: 'dànkíná', phonetic: '', english: 'Antbear, aardvark', notes: 'Hausa: Dabgi, dabganya' },
  { id: 'b7', category: 'Body', sayawa: 'dàÑtsÈyèr', phonetic: '', english: 'Nape of the neck', notes: 'Hausa: ¯eya' },
  { id: 'b8', category: 'Body', sayawa: 'dÈngÈt', phonetic: '', english: 'Gum (of teeth)', notes: 'Hausa: Dasashi' },
  { id: 'b9', category: 'Body', sayawa: 'dus', phonetic: '', english: 'Swarm of bee', notes: 'Hausa: Taron zuma' },
  { id: 'b10', category: 'Body', sayawa: 'ga:m', phonetic: '', english: '1) Head', notes: 'Hausa: 2) When suffixed with irregular genitive' },
  { id: 'b11', category: 'Body', sayawa: 'gamvòràÑ', phonetic: '', english: 'Knee', notes: 'Hausa: Gwiwa' },
  { id: 'b12', category: 'Body', sayawa: 'gŒ:p', phonetic: '', english: '1) Chest', notes: 'Hausa: Gaba' },
]

const PROVERBS = [
  { id: 1, sayawa: 'Mutum shine farkon komai.', english: 'A person is the beginning of everything.', meaning: 'People — not wealth, not land — are the true foundation of any community. Human relationships come first.' },
  { id: 2, sayawa: 'Hannu daya ba ya dauke jinka.', english: 'One hand cannot lift a load.', meaning: 'Nothing great is built alone. Collective effort and community cooperation are the Sayawa way.' },
  { id: 3, sayawa: 'Daji ba ya dauke shi wanda ya san hanya.', english: 'The forest does not consume one who knows the path.', meaning: 'Knowledge passed down from elders is a shield. Those who honour tradition will not be lost.' },
  { id: 4, sayawa: 'Ruwa ya fi zuma idan kana ji kishirwa.', english: 'Water is sweeter than honey when you are thirsty.', meaning: 'The value of a thing depends on the moment of need. Gratitude and humility are virtues.' },
  { id: 5, sayawa: 'Tsufa ita ce asalin hikima.', english: 'Old age is the root of wisdom.', meaning: 'Elders carry lived knowledge. Listening to them is not submission — it is wisdom itself.' },
  { id: 6, sayawa: 'Gida ne inda zuciya take.', english: 'Home is where the heart is.', meaning: 'For those in the diaspora: no matter how far you wander, Sayawa land and people live inside you.' },
]

const STORIES = [
  {
    id: 1, title: 'The Founding of Tafawa Balewa', era: 'Origins', emoji: '🌍',
    body: `Long before the town bore the name of a Prime Minister, the land of Tafawa Balewa belonged to the Sayawa people — farmers, warriors, and keepers of deep spiritual knowledge. The name itself derives from "Tafawa," meaning "flat ground" in Hausa, describing the plateau terrain the Sayawa cultivated for generations.

According to oral tradition, the first Sayawa settlers came from the northeast, guided by a great elder named Dangaladima, who carried with him the seeds of three sacred crops: millet, sorghum, and groundnuts. He planted the first farm where the town now stands, and declared the land blessed.

The community built around that original farm became the nucleus of Sayawa identity — a place where the mountain air and fertile soil shaped a people known for their resilience, their hospitality, and their fierce love of independence.`,
    author: 'Oral tradition, compiled by the Sayawa Cultural Archive'
  },
  {
    id: 2, title: 'The Drum of Kokis', era: 'Ceremony', emoji: '🥁',
    body: `In every Sayawa village, there exists a drum that speaks a language older than words. Called the "kuge" drum, it is not merely an instrument — it is a living voice, a messenger between the world of the living and the world of the ancestors.

The Kokis festival, held at harvest time, begins when the oldest drummer in the village strikes the kuge three times at dawn. The sound does not simply travel through air; according to Sayawa belief, it travels through time, reaching the ears of those who came before.

Young men and women paint their faces with red ochre and white clay — red for the blood of those who built the land, white for the purity of the new season's harvest. They dance in concentric circles: the elders innermost, the youngest outermost, mirroring the rings of a tree.

The Kokis drum still sounds every November in Tafawa Balewa. Those who have heard it say that for a moment, you feel as though every Sayawa person who ever lived is standing beside you.`,
    author: 'As told by Malam Yakubu Dogo, elder of Tafawa Balewa, 2019'
  },
  {
    id: 3, title: 'The Women of the Grinding Stone', era: 'Heritage', emoji: '🌾',
    body: `Before electric mills arrived in Tafawa Balewa, the grinding stone — "dutsen niƙa" — was the heartbeat of the Sayawa household. Every morning, before the sun fully rose, women gathered at the stone to grind millet into flour.

But grinding was never merely work. It was a school. Grandmothers sang histories while their hands moved. Young girls learned the names of rivers, the stories of past harvests, the names of the dead who must be remembered. The rhythm of the stone was the rhythm of memory itself.

There is a particular song — "Waƙar Niƙa" — that women sang only at the grinding stone, its lyrics encoded with names of medicinal plants, instructions for difficult births, and the genealogy of the community going back seven generations. Linguists believe this song preserved knowledge that no written record held.

Today, a small group of women in Tafawa Balewa are documenting Waƙar Niƙa before it is lost forever. Their work is the grinding stone of our digital age.`,
    author: "Contributed by Hajiya Ramatu Ibrahim, women's cultural archive, 2022"
  },
]

const HERITAGE_PHOTOS = [
  { id: 1, url: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=600&q=80', caption: 'Highland farmlands of the Jos Plateau — the ancestral terrain of the Sayawa people', year: 'Timeless' },
  { id: 2, url: 'https://images.unsplash.com/photo-1594608661623-aa0bd3a69799?w=600&q=80', caption: 'Traditional clay pottery — Sayawa craftswomen have shaped clay into vessels for over 800 years', year: 'Heritage' },
  { id: 3, url: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=600&q=80', caption: 'Millet at harvest — the crop that built the Sayawa economy and spiritual calendar', year: 'Annual' },
  { id: 4, url: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=600&q=80', caption: 'Bauchi State highlands at dusk — the landscape that shaped Sayawa identity for generations', year: 'Landscape' },
  { id: 5, url: 'https://images.unsplash.com/photo-1504019347908-b45f9b0b8dd5?w=600&q=80', caption: 'Hand-woven baskets — patterns passed from grandmother to granddaughter across centuries', year: 'Craft' },
  { id: 6, url: 'https://images.unsplash.com/photo-1474314243412-cd4a79f02271?w=600&q=80', caption: 'Morning light over the plateau — the land the Sayawa have farmed since time immemorial', year: 'Dawn' },
]

// ─── Tribal SVG border ────────────────────────────────────────
function TribalBorder() {
  return (
    <svg viewBox="0 0 800 30" style={{ width: '100%', height: 30, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <pattern id="tribal2" x="0" y="0" width="40" height="30" patternUnits="userSpaceOnUse">
          <polygon points="20,2 36,15 20,28 4,15" fill="none" stroke={R} strokeWidth="2" />
          <rect x="17" y="12" width="6" height="6" fill={R} transform="rotate(45 20 15)" />
        </pattern>
      </defs>
      <rect width="800" height="30" fill="url(#tribal2)" />
    </svg>
  )
}

// ─── Section header ───────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: R }}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Language Lessons ─────────────────────────────────────────
function LanguageSection() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const categories = ['All', 'Greetings', 'Family', 'Daily Life', 'Spirituality', 'Animals', 'Body']
  const filtered = activeCategory === 'All' ? LANGUAGE_LESSONS : LANGUAGE_LESSONS.filter(l => l.category === activeCategory)

  return (
    <section className="mb-12">
      <SectionHeader icon={BookOpen} title="Language Lessons" subtitle="Learn the words of our ancestors — Sayawa phrases, phonetics, and meaning" />
      <div className="flex gap-2 flex-wrap mb-5">
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={clsx('px-4 py-1.5 rounded-full text-sm font-semibold border transition-all', activeCategory === cat ? 'text-white border-transparent' : 'bg-white dark:bg-surface-800 text-gray-600 dark:text-gray-300 border-surface-200 dark:border-white/10 hover:border-red-300')}
            style={activeCategory === cat ? { background: R, borderColor: R } : {}}>
            {cat}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map(lesson => (
          <div key={lesson.id} className="card overflow-hidden cursor-pointer" onClick={() => setExpanded(expanded === lesson.id ? null : lesson.id)}>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: R }}>
                  {lesson.category.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 dark:text-white zaar-text">{lesson.sayawa}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{lesson.english}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                {lesson.phonetic && <span className="hidden sm:block text-xs text-gray-400 italic">/{lesson.phonetic}/</span>}
                <Volume2 size={16} className="text-gray-400" />
                {expanded === lesson.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>
            {expanded === lesson.id && (
              <div className="px-4 pb-4 border-t border-surface-100 dark:border-white/5 pt-3">
                <div className="flex flex-wrap gap-6 mb-3">
                  {lesson.phonetic && <div><div className="text-xs text-gray-400 mb-1">Phonetic</div><div className="text-sm font-mono text-gray-700 dark:text-gray-200">/{lesson.phonetic}/</div></div>}
                  <div><div className="text-xs text-gray-400 mb-1">Translation</div><div className="text-sm text-gray-700 dark:text-gray-200">{lesson.english}</div></div>
                  <div><div className="text-xs text-gray-400 mb-1">Category</div><div className="text-sm font-semibold" style={{ color: R }}>{lesson.category}</div></div>
                </div>
                {lesson.notes && (
                  <div className="bg-surface-50 dark:bg-white/5 rounded-xl p-3 border-l-4" style={{ borderColor: R }}>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic">{lesson.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Proverbs ─────────────────────────────────────────────────
function ProverbsSection() {
  const [revealed, setRevealed] = useState(new Set())
  const toggle = (id) => setRevealed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <section className="mb-12">
      <SectionHeader icon={Feather} title="Proverbs & Wisdom" subtitle="Sayings passed through generations — tap each card to reveal its meaning" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROVERBS.map(p => {
          const isOpen = revealed.has(p.id)
          return (
            <div key={p.id} className="card p-5 cursor-pointer transition-all" onClick={() => toggle(p.id)}
              style={isOpen ? { background: R, border: 'none' } : {}}>
              <p className="font-bold leading-relaxed mb-2" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: isOpen ? '#ffffff' : undefined }}>
                "{p.sayawa}"
              </p>
              <p className={clsx('text-sm mb-3', isOpen ? 'text-white/85' : 'text-gray-500 dark:text-gray-400')}>
                {p.english}
              </p>
              {isOpen && <p className="text-sm text-white leading-relaxed border-t border-white/20 pt-3">{p.meaning}</p>}
              <div className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color: isOpen ? 'rgba(255,255,255,0.7)' : R }}>
                {isOpen ? <><ChevronUp size={12} /> Tap to close</> : <><ChevronDown size={12} /> Tap for meaning</>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
// ─── Cultural Stories ─────────────────────────────────────────
function StoriesSection() {
  const [open, setOpen] = useState(null)
  return (
    <section className="mb-12">
      <SectionHeader icon={BookOpen} title="Cultural Stories" subtitle="Histories, legends, and oral traditions of the Sayawa people" />
      <div className="space-y-4">
        {STORIES.map(story => (
          <div key={story.id} className="card overflow-hidden">
            <div className="p-5 cursor-pointer flex items-start gap-4" onClick={() => setOpen(open === story.id ? null : story.id)}>
              <div className="text-3xl flex-shrink-0 mt-0.5">{story.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-extrabold text-gray-900 dark:text-white zaar-text">{story.title}</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: R }}>{story.era}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{story.body.slice(0, 120)}…</p>
              </div>
              {open === story.id ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0 mt-1" />}
            </div>
            {open === story.id && (
              <div className="px-5 pb-5 border-t border-surface-100 dark:border-white/5 pt-4">
                {story.body.split('\n\n').map((para, i) => (
                  <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3 zaar-text">{para}</p>
                ))}
                <div className="mt-4 pt-3 border-t border-surface-100 dark:border-white/5 text-xs text-gray-400 italic">— {story.author}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Heritage Photos ──────────────────────────────────────────
function HeritagePhotos() {
  const [lightbox, setLightbox] = useState(null)
  return (
    <section className="mb-12">
      <SectionHeader icon={ImageIcon} title="Heritage Gallery" subtitle="Images of Sayawa land, craft, and tradition — a visual archive" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {HERITAGE_PHOTOS.map(photo => (
          <div key={photo.id} className="relative rounded-2xl overflow-hidden cursor-pointer group" style={{ aspectRatio: '4/3' }} onClick={() => setLightbox(photo)}>
            <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
              <p className="text-white text-xs leading-snug line-clamp-2">{photo.caption}</p>
            </div>
            <div className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: R }}>{photo.year}</div>
          </div>
        ))}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}><X size={28} /></button>
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url.replace('w=600', 'w=1200')} alt={lightbox.caption} className="w-full rounded-2xl" />
            <p className="text-white/80 text-sm mt-4 leading-relaxed italic zaar-text">{lightbox.caption}</p>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Community Discussion Board ───────────────────────────────
function DiscussionBoard() {
  const { user, profile } = useAuthStore()
  const qc = useQueryClient()
  const [newPost, setNewPost] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [expandedReplies, setExpandedReplies] = useState(new Set())

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['zaar-discussion'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('posts')
        .select('id, content, created_at, user_id, profiles:user_id(id, username, full_name, avatar_url), likes(count), comments(count)')
        .eq('post_type', 'zaar_discussion')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      const { data: myLikes } = await sb.from('likes').select('post_id').eq('user_id', user?.id)
      const likedSet = new Set((myLikes || []).map(l => l.post_id))
      return (data || []).map(p => {
        const { likes, comments, ...rest } = p
        return {
          ...rest,
          likeCount: Number(likes?.[0]?.count ?? 0),
          commentCount: Number(comments?.[0]?.count ?? 0),
          isLiked: likedSet.has(p.id),
        }
      })
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const { data: replies = {} } = useQuery({
    queryKey: ['zaar-replies', [...expandedReplies].sort().join(',')],
    queryFn: async () => {
      const result = {}
      await Promise.all([...expandedReplies].map(async postId => {
        const { data } = await sb.from('comments')
          .select('*, profiles:user_id(id, username, full_name, avatar_url)')
          .eq('post_id', postId)
          .order('created_at', { ascending: true })
          .limit(20)
        result[postId] = data || []
      }))
      return result
    },
    enabled: expandedReplies.size > 0,
  })

  const postMutation = useMutation({
    mutationFn: async (content) => {
      const { error } = await sb.from('posts').insert({ user_id: user.id, content: content.trim(), post_type: 'zaar_discussion', is_published: true })
      if (error) throw error
    },
    onSuccess: () => { setNewPost(''); qc.invalidateQueries(['zaar-discussion']); toast.success('Posted to the community!') },
    onError: () => toast.error('Failed to post. Please try again.'),
  })

  const replyMutation = useMutation({
    mutationFn: async ({ postId, content }) => {
      const { error } = await sb.from('comments').insert({ post_id: postId, user_id: user.id, content: content.trim() })
      if (error) throw error
    },
    onSuccess: (_, { postId }) => {
      setReplyText(''); setReplyingTo(null)
      qc.invalidateQueries(['zaar-discussion'])
      qc.invalidateQueries(['zaar-replies'])
      setExpandedReplies(prev => new Set([...prev, postId]))
    },
    onError: () => toast.error('Failed to reply. Please try again.'),
  })

  const likeMutation = useMutation({
    mutationFn: async ({ postId, isLiked }) => {
      if (isLiked) await sb.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
      else await sb.from('likes').upsert({ post_id: postId, user_id: user.id, reaction_type: 'like' }, { onConflict: 'post_id,user_id' })
    },
    onMutate: async ({ postId, isLiked }) => {
      await qc.cancelQueries(['zaar-discussion'])
      qc.setQueryData(['zaar-discussion'], old =>
        (old || []).map(p => p.id === postId ? { ...p, isLiked: !isLiked, likeCount: Number(p.likeCount || 0) + (isLiked ? -1 : 1) } : p)
      )
    },
    onError: () => { qc.invalidateQueries(['zaar-discussion']); toast.error('Failed to update like.') },
  })

  const deleteMutation = useMutation({
    mutationFn: async (postId) => {
      const { error } = await sb.from('posts').delete().eq('id', postId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['zaar-discussion']); toast.success('Post deleted.') },
  })

  const toggleReplies = (postId) => setExpandedReplies(prev => {
    const n = new Set(prev); n.has(postId) ? n.delete(postId) : n.add(postId); return n
  })

  return (
    <section className="mb-12">
      <SectionHeader icon={Users} title="Community Board" subtitle="Share stories, ask questions, and connect with Sayawa people worldwide" />

      {/* Compose */}
      <div className="card p-4 mb-5">
        <div className="flex gap-3">
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size={38} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={e => setNewPost(e.target.value)}
              placeholder="Share something about Sayawa culture, ask a question, or tell a story…"
              rows={3}
              className="w-full input resize-none text-sm leading-relaxed"
              style={{ minHeight: 80 }}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-400">{newPost.length}/500</span>
              <button
                onClick={() => { if (newPost.trim()) postMutation.mutate(newPost) }}
                disabled={!newPost.trim() || newPost.length > 500 || postMutation.isPending}
                className="btn-primary text-sm px-5 py-2 flex items-center gap-2"
                style={newPost.trim() ? { background: R, borderColor: R } : {}}
              >
                {postMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Posts list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-200 dark:bg-white/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-200 dark:bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-surface-200 dark:bg-white/10 rounded w-2/3" />
                  <div className="h-3 bg-surface-200 dark:bg-white/10 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🏺</div>
          <p className="font-bold text-gray-900 dark:text-white mb-1">Be the first to share</p>
          <p className="text-sm text-gray-400">Start a conversation about Sayawa culture, heritage, or language.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={post.profiles?.avatar_url} name={post.profiles?.full_name} size={38} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{post.profiles?.full_name || 'Community Member'}</div>
                      <div className="text-xs text-gray-400">@{post.profiles?.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</div>
                    </div>
                  </div>
                  {post.user_id === user?.id && (
                    <button onClick={() => { if (window.confirm('Delete this post?')) deleteMutation.mutate(post.id) }} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap mb-4">{post.content}</p>
                <div className="flex items-center gap-4 pt-3 border-t border-surface-100 dark:border-white/5">
                  <button
                    onClick={() => likeMutation.mutate({ postId: post.id, isLiked: post.isLiked })}
                    className={clsx('flex items-center gap-1.5 text-sm font-semibold transition-colors', post.isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500')}
                  >
                    <Heart size={16} fill={post.isLiked ? 'currentColor' : 'none'} />
                    {post.likeCount > 0 && Number(post.likeCount)}
                  </button>
                  <button
                    onClick={() => { setReplyingTo(replyingTo === post.id ? null : post.id); toggleReplies(post.id) }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-brand-500 transition-colors"
                  >
                    <MessageCircle size={16} />
                    {post.commentCount > 0 ? `${post.commentCount} ${post.commentCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
                  </button>
                  {post.commentCount > 0 && (
                    <button onClick={() => toggleReplies(post.id)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-auto flex items-center gap-1">
                      {expandedReplies.has(post.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {expandedReplies.has(post.id) ? 'Hide' : 'Show'} replies
                    </button>
                  )}
                </div>
              </div>
              {(expandedReplies.has(post.id) || replyingTo === post.id) && (
                <div className="bg-surface-50 dark:bg-white/[0.02] border-t border-surface-100 dark:border-white/5 px-4 py-3 space-y-3">
                  {(replies[post.id] || []).map(reply => (
                    <div key={reply.id} className="flex gap-3">
                      <Avatar src={reply.profiles?.avatar_url} name={reply.profiles?.full_name} size={28} className="flex-shrink-0 mt-0.5" />
                      <div className="flex-1 bg-white dark:bg-surface-800 rounded-xl p-3 border border-surface-100 dark:border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{reply.profiles?.full_name}</span>
                          <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}</span>
                        </div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{reply.content}</p>
                      </div>
                    </div>
                  ))}
                  {replyingTo === post.id && (
                    <div className="flex gap-3 mt-2">
                      <Avatar src={profile?.avatar_url} name={profile?.full_name} size={28} className="flex-shrink-0 mt-1" />
                      <div className="flex-1 flex gap-2">
                        <input
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Write a reply…"
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) { e.preventDefault(); replyMutation.mutate({ postId: post.id, content: replyText }) } }}
                          className="input flex-1 text-sm py-2"
                          autoFocus
                        />
                        <button
                          onClick={() => { if (replyText.trim()) replyMutation.mutate({ postId: post.id, content: replyText }) }}
                          disabled={!replyText.trim() || replyMutation.isPending}
                          className="btn-primary px-4 py-2 text-sm flex-shrink-0"
                          style={{ background: R, borderColor: R }}
                        >
                          {replyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Main Page ────────────────────────────────────────────────


// ─── Reusable Favourite Button ────────────────────────────────
function FavButton({ word, english, hausa, pos }) {
  const { user } = useAuthStore()
  const [faved, setFaved] = useState(false)
  useEffect(() => {
    if (!user) return
    sb.from('zaar_favourites').select('id').eq('user_id', user.id).eq('zaar_word', word)
      .maybeSingle().then(({ data }) => { if (data) setFaved(true) })
  }, [user, word])
  const toggle = async (e) => {
    e.stopPropagation()
    if (!user) return
    if (faved) {
      await sb.from('zaar_favourites').delete().eq('user_id', user.id).eq('zaar_word', word)
      setFaved(false)
    } else {
      await sb.from('zaar_favourites').upsert({ user_id: user.id, zaar_word: word, english, hausa, pos }, { onConflict: 'user_id,zaar_word' })
      setFaved(true)
    }
  }
  return (
    <button onClick={toggle}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-100 dark:bg-white/10 transition-colors">
      <Star size={12} className={faved ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'} />
      {faved ? 'Saved' : 'Save'}
    </button>
  )
}

// ─── POS badge colours ─────────────────────────────────────────
const POS_STYLE = {
  'n.':     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'v.':     'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'v.t.':   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'v.i.':   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'excl.':  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'adv.':   'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'prep.':  'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  'conj.':  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'prt.':   'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300',
  'id.':    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300',
}
const posStyle = (p) => POS_STYLE[p] || 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'
const posLabel = (p) => ({
  'n.': 'noun', 'v.': 'verb', 'v.t.': 'verb', 'v.i.': 'verb',
  'excl.': 'exclamation', 'adv.': 'adverb', 'prep.': 'preposition',
  'conj.': 'conjunction', 'prt.': 'particle', 'id.': 'ideophone',
  'pro.': 'pronoun', 'pro.sbj.': 'pronoun', 'a.v.': 'attributive',
})[p] || p?.replace('.','') || ''

function DictionarySection() {
  const { ZAAR_DICT, dictReady } = useDictionary()
  const [query, setQuery]     = useState('')
  const [mode, setMode]       = useState('zaar')   // 'zaar' | 'english' | 'hausa'
  const [expanded, setExpanded] = useState(null)
  const debounceRef = useRef(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return []
    // Word-boundary matching: exact word match first, then starts-with, then contains
    // This prevents "come" from matching "become", "income", "welcome" etc.
    const wordBoundary = (text) => {
      if (!text) return false
      const t = text.toLowerCase()
      // Exact match
      if (t === q) return true
      // Starts with query followed by space, comma, punctuation
      if (new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|,|;|\\.|$)`, 'i').test(t)) return true
      // Query appears as a whole word (preceded and followed by non-word chars)
      if (new RegExp(`(^|\\s|,|;)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|,|;|\\.|$)`, 'i').test(t)) return true
      return false
    }
    const exact = ZAAR_DICT.filter(e => {
      if (mode === 'zaar')    return wordBoundary(e.z)
      if (mode === 'english') return wordBoundary(e.e)
      if (mode === 'hausa')   return wordBoundary(e.h)
      return false
    })
    // If no exact/word matches, fall back to contains (so search is never empty)
    const fallback = exact.length === 0 ? ZAAR_DICT.filter(e => {
      if (mode === 'zaar')    return e.z?.toLowerCase().includes(q)
      if (mode === 'english') return e.e?.toLowerCase().includes(q)
      if (mode === 'hausa')   return e.h?.toLowerCase().includes(q)
      return false
    }) : []
    return [...exact, ...fallback].slice(0, 60)
  }, [debouncedQuery, mode])

  const [showZaarKb, setShowZaarKb] = useState(false)
  const searchRef = useRef(null)

  const speak = (text) => {
    if (!window.speechSynthesis) return
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'ha'   // closest available — Hausa
    utt.rate = 0.85
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utt)
  }

  const insertChar = (ch) => {
    setQuery(q => q + ch)
    searchRef.current?.focus()
  }

  const totalCount = ZAAR_DICT.length

  if (!dictReady) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Loading dictionary…
    </div>
  )

  return (
    <section className="mb-12">
      <SectionHeader
        icon={BookMarked}
        title="Zaar–English–Hausa Dictionary"
        subtitle={`Search all ${totalCount.toLocaleString()} entries — Zaar language, English meanings, Hausa equivalents`}
      />

      {/* Search bar */}
      <div className="card p-4 mb-4">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setExpanded(null) }}
            placeholder={mode === 'zaar' ? 'Search Zaar word…' : mode === 'english' ? 'Search English meaning…' : 'Search Hausa equivalent…'}
            className="input pl-10"
            autoCorrect="off"
            autoCapitalize="none"
          />
          {query && (
            <button onClick={() => { setQuery(''); setExpanded(null) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Zaar special character keyboard */}
        {showZaarKb && (
          <div className="mb-3 p-2.5 rounded-2xl border border-surface-200 dark:border-white/10 bg-surface-50 dark:bg-white/5 animate-fade-in">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-0.5">Tap to insert special characters</p>
            <div className="flex flex-wrap gap-1">
              {['á','à','â','ã','ā','Á','é','è','ê','É','È','Ë','í','ì','î','Í','ó','ò','ô','ö','Œ','œ','ú','ù','û','ü','ñ','Ñ','ŋ','ß','•','ʼ',':'].map(ch => (
                <button key={ch} onClick={() => { insertChar(ch); setExpanded(null) }}
                  className="min-w-[32px] h-8 px-1 rounded-lg text-sm font-bold zaar-text bg-white dark:bg-surface-800 border border-surface-200 dark:border-white/10 hover:border-red-400 hover:text-red-500 transition-colors shadow-sm active:scale-90"
                  style={{ color: 'inherit' }}>
                  {ch}
                </button>
              ))}
              <button onClick={() => { setQuery(q => q.slice(0, -1)); setExpanded(null) }}
                className="min-w-[40px] h-8 px-2 rounded-lg text-sm font-bold bg-white dark:bg-surface-800 border border-surface-200 dark:border-white/10 hover:border-red-400 hover:text-red-500 transition-colors shadow-sm text-gray-500">
                ⌫
              </button>
            </div>
          </div>
        )}

        {/* Mode selector */}
        <div className="flex gap-1.5">
          {[
            { k: 'zaar',    label: '🔤 Zaar'    },
            { k: 'english', label: '🇬🇧 English' },
            { k: 'hausa',   label: '🟢 Hausa'   },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => { setMode(k); setExpanded(null) }}
              className={clsx('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                mode === k ? 'text-white shadow-sm' : 'bg-surface-100 dark:bg-white/5 text-gray-500 dark:text-gray-400'
              )}
              style={mode === k ? { background: R } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row when no search */}
      {!query && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total entries', value: totalCount.toLocaleString() },
            { label: 'Nouns', value: ZAAR_DICT.filter(e => e.p === 'n.').length.toLocaleString() },
            { label: 'Verbs', value: ZAAR_DICT.filter(e => e.p?.startsWith('v')).length.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className="text-xl font-extrabold text-gray-900 dark:text-white" style={{ color: R }}>{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {query && results.length === 0 && debouncedQuery && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-semibold">No results for "{debouncedQuery}"</p>
          <p className="text-sm mt-1">Try searching in a different language mode</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-xs text-gray-400 mb-2 px-1">
            {results.length >= 60 ? '60+' : results.length} result{results.length !== 1 ? 's' : ''} for "{debouncedQuery}"
          </p>
          <div className="space-y-2">
            {results.map((entry, i) => {
              const key = `${entry.z}-${i}`
              const isOpen = expanded === key
              return (
                <div key={key}
                  className={clsx('card overflow-hidden transition-all cursor-pointer', isOpen && 'ring-1')}
                  style={isOpen ? { ringColor: R } : {}}
                  onClick={() => setExpanded(isOpen ? null : key)}>
                  <div className="p-3.5 flex items-start gap-3">
                    {/* Zaar word */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-gray-900 dark:text-white zaar-text">
                          {entry.z}
                        </span>
                        {entry.p && (
                          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', posStyle(entry.p))}>
                            {posLabel(entry.p)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-1">
                        {entry.e}
                      </p>
                      {entry.h && (
                        <p className="text-xs text-gray-400 mt-0.5">🇳🇬 {entry.h}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); speak(entry.z) }}
                        className="w-7 h-7 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors"
                        title="Pronounce">
                        <Volume2 size={13} />
                      </button>
                      <ChevronRight size={14} className={clsx('text-gray-400 transition-transform', isOpen && 'rotate-90')} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-surface-100 dark:border-white/10 space-y-2 animate-fade-in">
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="bg-surface-50 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Zaar</div>
                          <div className="font-semibold text-sm text-gray-900 dark:text-white zaar-text">{entry.z}</div>
                        </div>
                        <div className="bg-surface-50 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">English</div>
                          <div className="text-sm text-gray-900 dark:text-white">{entry.e}</div>
                        </div>
                        {entry.h && (
                          <div className="bg-surface-50 dark:bg-white/5 rounded-xl p-2.5">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hausa</div>
                            <div className="text-sm text-gray-900 dark:text-white">{entry.h}</div>
                          </div>
                        )}
                        {entry.p && (
                          <div className="bg-surface-50 dark:bg-white/5 rounded-xl p-2.5">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Part of Speech</div>
                            <div className={clsx('inline-block text-xs font-semibold px-2 py-0.5 rounded-full', posStyle(entry.p))}>{posLabel(entry.p)}</div>
                          </div>
                        )}
                      </div>
                      {entry.n && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2.5">
                          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Notes</div>
                          <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{entry.n}</div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); speak(entry.z) }}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors text-white"
                          style={{ background: R }}>
                          <Volume2 size={12} /> Hear pronunciation
                        </button>
                        <FavButton word={entry.z} english={entry.e} hausa={entry.h} pos={entry.p} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {results.length >= 60 && (
            <p className="text-center text-xs text-gray-400 mt-3">Showing first 60 results — refine your search to narrow down</p>
          )}
        </>
      )}
    </section>
  )
}

// ─── Utility: speak a word ────────────────────────────────────
function speakWord(text) {
  if (!window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ha'; u.rate = 0.8
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

// ─── 1. Word of the Day ──────────────────────────────────────
function WordOfTheDay() {
  const { ZAAR_DICT, dictReady } = useDictionary()
  const { user } = useAuthStore()
  const [faved, setFaved] = useState(false)

  // Deterministic daily word — changes every day, same for all users
  const word = useMemo(() => {
    if (!dictReady) return null
    const dayIndex = Math.floor(Date.now() / 86400000)
    const pool = ZAAR_DICT.filter(e => e.e && e.h && e.p === 'n.' && e.z.length > 2 && !e.e.startsWith('See') && !e.e.startsWith('sbj'))
    return pool[dayIndex % pool.length]
  }, [])

  // Check if already favourited
  useEffect(() => {
    if (!user || !word) return
    sb.from('zaar_favourites').select('id').eq('user_id', user.id).eq('zaar_word', word.z)
      .maybeSingle().then(({ data }) => { if (data) setFaved(true) })
  }, [user, word])

  const toggleFav = async () => {
    if (!user || !word) return
    if (faved) {
      await sb.from('zaar_favourites').delete().eq('user_id', user.id).eq('zaar_word', word.z)
      setFaved(false)
    } else {
      await sb.from('zaar_favourites').upsert({ user_id: user.id, zaar_word: word.z, english: word.e, hausa: word.h, pos: word.p }, { onConflict: 'user_id,zaar_word' })
      setFaved(true)
    }
  }

  if (!word) return null
  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="card overflow-hidden mb-6" style={{ background: 'linear-gradient(135deg, #c8102e 0%, #7c0d1e 100%)' }}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-yellow-300" />
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Word of the Day</span>
          </div>
          <span className="text-xs text-white/50">{today}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold text-white mb-1 zaar-text">{word.z}</h2>
            <p className="text-white/90 font-semibold text-lg">{word.e}</p>
            {word.h && <p className="text-white/60 text-sm mt-1">🇳🇬 {word.h}</p>}
            {word.p && <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-white/20 text-white/80">{word.p.replace('.','')}</span>}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button onClick={() => speakWord(word.z)}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <Volume2 size={16} className="text-white" />
            </button>
            <button onClick={toggleFav}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <Star size={16} className={faved ? 'text-yellow-300 fill-yellow-300' : 'text-white'} />
            </button>
          </div>
        </div>
        {word.n && <p className="text-white/50 text-xs mt-3 italic border-t border-white/10 pt-3">{word.n}</p>}
      </div>
    </div>
  )
}

// ─── 2. A-Z Browser ──────────────────────────────────────────
function AlphabetBrowser() {
  const { ZAAR_DICT } = useDictionary()
  const [activeLetter, setActiveLetter] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const letters = useMemo(() => {
    const set = new Set()
    ZAAR_DICT.forEach(e => { if (e.z && e.z[0]) set.add(e.z[0].toUpperCase()) })
    return [...set].sort()
  }, [])

  const letterEntries = useMemo(() => {
    if (!activeLetter) return []
    return ZAAR_DICT.filter(e => e.z && e.z[0]?.toUpperCase() === activeLetter && e.e && !e.e.startsWith('sbj'))
      .slice(0, 50)
  }, [activeLetter])

  return (
    <section className="mb-12">
      <SectionHeader icon={BookOpen} title="Browse A–Z" subtitle="Explore all Zaar words alphabetically — tap a letter to browse" />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {letters.map(l => (
          <button key={l} onClick={() => { setActiveLetter(activeLetter === l ? null : l); setExpanded(null) }}
            className={clsx('w-9 h-9 rounded-xl text-sm font-bold transition-all', activeLetter === l ? 'text-white shadow-sm' : 'bg-surface-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-white/20')}
            style={activeLetter === l ? { background: R } : {}}>
            {l}
          </button>
        ))}
      </div>
      {activeLetter && (
        <div className="space-y-1.5 animate-fade-in">
          <p className="text-xs text-gray-400 px-1 mb-2">{letterEntries.length} words starting with "{activeLetter}"{letterEntries.length >= 50 ? ' (showing first 50)' : ''}</p>
          {letterEntries.map((e, i) => {
            const key = `${e.z}-${i}`
            const isOpen = expanded === key
            return (
              <div key={key} onClick={() => setExpanded(isOpen ? null : key)}
                className="card p-3 cursor-pointer hover:shadow-card-lg transition-all">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-gray-900 dark:text-white zaar-text">{e.z}</span>
                    {e.p && <span className="text-xs text-gray-400 ml-2">{e.p.replace('.','')}</span>}
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{e.e}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={ev => { ev.stopPropagation(); speakWord(e.z) }}
                      className="w-7 h-7 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-400 hover:text-brand-500">
                      <Volume2 size={12} />
                    </button>
                    <ChevronRight size={14} className={clsx('text-gray-400 transition-transform mt-1.5', isOpen && 'rotate-90')} />
                  </div>
                </div>
                {isOpen && e.h && (
                  <div className="mt-2 pt-2 border-t border-surface-100 dark:border-white/10">
                    <span className="text-xs text-gray-400">🇳🇬 Hausa: </span>
                    <span className="text-xs text-gray-600 dark:text-gray-300">{e.h}</span>
                    {e.n && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{e.n}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── 3. Favourites ────────────────────────────────────────────
function FavouritesSection() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: favs = [], isLoading } = useQuery({
    queryKey: ['zaar-favs', user?.id],
    queryFn: async () => {
      const { data } = await sb.from('zaar_favourites').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!user,
  })

  const removeFav = async (word) => {
    await sb.from('zaar_favourites').delete().eq('user_id', user.id).eq('zaar_word', word)
    qc.invalidateQueries(['zaar-favs'])
  }

  return (
    <section className="mb-12">
      <SectionHeader icon={Star} title="My Favourites" subtitle="Words you have starred — tap the star on any entry to save it here" />
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-2xl bg-surface-100 dark:bg-white/5 animate-pulse" />)}</div>
      ) : favs.length === 0 ? (
        <div className="text-center py-12">
          <Star size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">No favourites yet</p>
          <p className="text-sm text-gray-400 mt-1">Tap ⭐ on any word in the Dictionary or Word of the Day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {favs.map(f => (
            <div key={f.zaar_word} className="card p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-white zaar-text">{f.zaar_word}</span>
                  {f.pos && <span className="text-xs text-gray-400">{f.pos.replace('.','')}</span>}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{f.english}</p>
                {f.hausa && <p className="text-xs text-gray-400">🇳🇬 {f.hausa}</p>}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => speakWord(f.zaar_word)}
                  className="w-8 h-8 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-400 hover:text-brand-500">
                  <Volume2 size={13} />
                </button>
                <button onClick={() => removeFav(f.zaar_word)}
                  className="w-8 h-8 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-yellow-400 hover:text-yellow-500">
                  <Star size={13} className="fill-yellow-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── 4. Quiz / Flashcard ─────────────────────────────────────
function getQuizPool() {
  return _ZAAR_DICT.filter(e =>
    e.e && e.h && e.p === 'n.' && e.z.length > 2 &&
    !e.e.startsWith('See') && !e.e.startsWith('sbj') &&
    !e.e.startsWith('1)') && e.e.length < 25
  )
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getQuizQuestion(pool, exclude = []) {
  const candidates = pool.filter(e => !exclude.includes(e.z))
  if (candidates.length < 4) return null
  const correct = candidates[Math.floor(Math.random() * candidates.length)]
  const wrongs = shuffle(pool.filter(e => e.z !== correct.z)).slice(0, 3)
  const options = shuffle([correct, ...wrongs])
  return { correct, options }
}

function QuizSection() {
  const { dictReady } = useDictionary()
  const [question, setQuestion] = useState(null)
  useEffect(() => {
    if (dictReady) setQuestion(getQuizQuestion(getQuizPool()))
  }, [dictReady])
  const [selected, setSelected] = useState(null)
  const [score, setScore]       = useState(0)
  const [streak, setStreak]     = useState(0)
  const [total, setTotal]       = useState(0)
  const [mode, setMode]         = useState('zaar-to-english') // or 'english-to-zaar'
  const [history, setHistory]   = useState([])

  const answer = (option) => {
    if (selected) return
    setSelected(option)
    const correct = option.z === question.correct.z
    setTotal(t => t + 1)
    if (correct) { setScore(s => s + 1); setStreak(s => s + 1) }
    else { setStreak(0) }
    setHistory(h => [{ word: question.correct.z, eng: question.correct.e, correct }, ...h.slice(0, 4)])
  }

  const next = () => {
    setQuestion(getQuizQuestion(getQuizPool()))
    setSelected(null)
  }

  const reset = () => {
    setScore(0); setStreak(0); setTotal(0)
    setSelected(null); setHistory([])
    setQuestion(getQuizQuestion(getQuizPool()))
  }

  if (!question) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Loading quiz…
    </div>
  )
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0

  return (
    <section className="mb-12">
      <SectionHeader icon={Trophy} title="Quiz Mode" subtitle="Test your Zaar vocabulary — guess the meaning of each word" />

      {/* Score bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Score', value: `${score}/${total}` },
          { label: 'Accuracy', value: `${accuracy}%` },
          { label: 'Streak 🔥', value: streak },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className="text-xl font-extrabold" style={{ color: R }}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Question card */}
      <div className="card p-5 mb-4 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">What does this mean?</p>
        <div className="flex items-center justify-center gap-3 mb-1">
          <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white zaar-text">
            {question.correct.z}
          </h2>
          <button onClick={() => speakWord(question.correct.z)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{ background: R }}>
            <Volume2 size={16} />
          </button>
        </div>
        {question.correct.p && <span className="text-xs text-gray-400">{question.correct.p.replace('.','')}</span>}
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 gap-2 mb-4">
        {question.options.map((opt, i) => {
          const isSelected = selected?.z === opt.z
          const isCorrect = opt.z === question.correct.z
          let bg = 'bg-surface-100 dark:bg-white/10 text-gray-800 dark:text-white hover:bg-surface-200 dark:hover:bg-white/15'
          if (selected) {
            if (isCorrect) bg = 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border-2 border-green-400'
            else if (isSelected) bg = 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border-2 border-red-400'
          }
          return (
            <button key={opt.z} onClick={() => answer(opt)}
              disabled={!!selected}
              className={clsx('w-full p-3.5 rounded-2xl text-sm font-semibold text-left flex items-center gap-3 transition-all', bg)}>
              <span className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs flex-shrink-0 font-bold">
                {['A','B','C','D'][i]}
              </span>
              <span className="flex-1">{opt.e}</span>
              {selected && isCorrect && <CheckCircle size={16} className="text-green-500 flex-shrink-0" />}
              {selected && isSelected && !isCorrect && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
            </button>
          )
        })}
      </div>

      {/* After answer */}
      {selected && (
        <div className="animate-fade-in space-y-3">
          {selected.z === question.correct.z ? (
            <div className="card p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
              <p className="font-bold text-green-700 dark:text-green-300">✅ Correct! {streak > 2 && `🔥 ${streak} streak!`}</p>
              {question.correct.h && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Hausa: {question.correct.h}</p>}
            </div>
          ) : (
            <div className="card p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
              <p className="font-bold text-red-700 dark:text-red-300">❌ Not quite!</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1"><strong>{question.correct.z}</strong> = {question.correct.e}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={next} className="flex-1 btn-primary gap-2">
              Next word <ChevronRight size={16} />
            </button>
            <button onClick={reset} className="btn-secondary px-4 gap-1.5">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* Recent history */}
      {history.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs text-gray-400 px-1 mb-2">Recent</p>
          {history.map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-1">
              {h.correct ? <CheckCircle size={12} className="text-green-500" /> : <XCircle size={12} className="text-red-500" />}
              <span className="font-semibold zaar-text">{h.word}</span>
              <span className="text-gray-400">= {h.eng}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}



// ─── 5. Sentences Section ─────────────────────────────────────
function SentencesSection() {
  const { ZAAR_SENTENCES } = useDictionary()
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ZAAR_SENTENCES
    return ZAAR_SENTENCES.filter(s =>
      s.zaar.toLowerCase().includes(q) ||
      s.english.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <section className="mb-12">
      <SectionHeader
        icon={MessageCircle}
        title="Sentences & Phrases"
        subtitle={`${ZAAR_SENTENCES.length} example sentences from the Zaar dictionary — tap to reveal meaning`}
      />

      {/* Search */}
      <div className="card p-3 mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setExpanded(null) }}
            placeholder="Search sentences…"
            className="input pl-10 text-sm"
            autoCorrect="off"
          />
          {search && (
            <button onClick={() => { setSearch(''); setExpanded(null) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-semibold">No sentences found for "{search}"</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((s, i) => {
          const isOpen = expanded === i
          return (
            <div
              key={i}
              className={clsx('card overflow-hidden cursor-pointer transition-all', isOpen && 'ring-1')}
              style={isOpen ? { ringColor: R } : {}}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <div className="p-4 flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold mt-0.5"
                  style={{ background: R }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white leading-snug zaar-text">
                    {s.zaar}
                  </p>
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-surface-100 dark:border-white/10 animate-fade-in">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">English meaning</div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{s.english}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={e => { e.stopPropagation(); speakWord(s.zaar) }}
                    className="w-7 h-7 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-400 hover:text-brand-500 transition-colors"
                    title="Hear pronunciation"
                  >
                    <Volume2 size={13} />
                  </button>
                  <ChevronRight size={14} className={clsx('text-gray-400 transition-transform', isOpen && 'rotate-90')} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {search && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          {filtered.length} of {ZAAR_SENTENCES.length} sentences
        </p>
      )}
    </section>
  )
}


// ─── SRS Flashcards ──────────────────────────────────────────
// Implements SM-2 spaced repetition algorithm
function sm2(easeFactor, interval, repetitions, quality) {
  // quality: 0-2 = fail, 3-5 = pass
  let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEF < 1.3) newEF = 1.3
  let newInterval, newRep
  if (quality < 3) {
    newRep = 0; newInterval = 1
  } else {
    newRep = repetitions + 1
    if (newRep === 1) newInterval = 1
    else if (newRep === 2) newInterval = 6
    else newInterval = Math.round(interval * newEF)
  }
  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)
  return { easeFactor: newEF, interval: newInterval, repetitions: newRep, nextReview: nextReview.toISOString().split('T')[0] }
}

function FlashcardsSection() {
  const { ZAAR_DICT, dictReady } = useDictionary()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [phase, setPhase] = useState('menu') // menu | study | done
  const [cardIdx, setCardIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [deckSize, setDeckSize] = useState(10)
  const [mode, setMode] = useState('zaar-to-english') // or english-to-zaar
  const [deck, setDeck] = useState([])
  const [sessionResults, setSessionResults] = useState([])

  // Load SRS progress
  const { data: srsData = [] } = useQuery({
    queryKey: ['zaar-srs', user?.id],
    queryFn: async () => {
      const { data } = await sb.from('zaar_srs').select('*').eq('user_id', user.id)
      return data || []
    },
    enabled: !!user,
  })

  const srsMap = useMemo(() => {
    const m = {}
    srsData.forEach(r => { m[r.zaar_word] = r })
    return m
  }, [srsData])

  const dueCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return srsData.filter(r => r.next_review <= today).length
  }, [srsData])

  const buildDeck = useCallback((type) => {
    if (!dictReady) return []
    const today = new Date().toISOString().split('T')[0]
    const pool = ZAAR_DICT.filter(w => w.e && w.z && w.p === 'n.' && !w.e.startsWith('See'))
    if (type === 'due') {
      const due = pool.filter(w => {
        const s = srsMap[w.z]
        return s && s.next_review <= today
      })
      return due.slice(0, deckSize)
    }
    // New cards: not yet in SRS
    const newCards = pool.filter(w => !srsMap[w.z])
    const shuffled = [...newCards].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, deckSize)
  }, [ZAAR_DICT, dictReady, srsMap, deckSize])

  const startSession = async (type) => {
    const d = buildDeck(type)
    if (!d.length) { return }
    setDeck(d); setCardIdx(0); setFlipped(false); setSessionResults([]); setPhase('study')
  }

  const rate = async (quality) => {
    const word = deck[cardIdx]
    const existing = srsMap[word.z]
    const ef = existing?.ease_factor ?? 2.5
    const iv = existing?.interval_days ?? 1
    const rp = existing?.repetitions ?? 0
    const result = sm2(ef, iv, rp, quality)
    const today = new Date().toISOString().split('T')[0]

    if (user) {
      await sb.from('zaar_srs').upsert({
        user_id: user.id, zaar_word: word.z,
        ease_factor: result.easeFactor,
        interval_days: result.interval,
        repetitions: result.repetitions,
        next_review: result.nextReview,
        last_review: today,
      }, { onConflict: 'user_id,zaar_word' })
      qc.invalidateQueries(['zaar-srs'])
    }

    setSessionResults(r => [...r, { word, quality }])
    if (cardIdx + 1 >= deck.length) {
      setPhase('done')
    } else {
      setCardIdx(i => i + 1); setFlipped(false)
    }
  }

  if (!dictReady) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Loading flashcards…
    </div>
  )

  const card = deck[cardIdx]
  const progress = deck.length ? ((cardIdx) / deck.length) * 100 : 0

  // ── MENU ──
  if (phase === 'menu') return (
    <section className="mb-12">
      <SectionHeader icon={Brain} title="Flashcards" subtitle="Spaced repetition — study smarter, remember longer" />
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Due today', value: dueCount, color: dueCount > 0 ? '#c8102e' : '#22c55e' },
            { label: 'Total learned', value: srsData.length, color: '#7c3aed' },
            { label: 'In progress', value: srsData.filter(r => r.repetitions > 0).length, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mode */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Study direction</p>
          <div className="flex gap-2">
            {[{ id: 'zaar-to-english', label: 'Zaar → English' }, { id: 'english-to-zaar', label: 'English → Zaar' }].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                style={mode === m.id ? { background: R, color: '#fff' } : { background: 'var(--color-surface-100,#f3f4f6)', color: '#6b7280' }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Deck size */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Cards per session: <span style={{ color: R }}>{deckSize}</span></p>
          <input type="range" min={5} max={50} step={5} value={deckSize}
            onChange={e => setDeckSize(Number(e.target.value))}
            className="w-full accent-red-600" />
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>5</span><span>50</span></div>
        </div>

        {/* Start buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => startSession('due')}
            disabled={dueCount === 0}
            className="card p-4 text-center disabled:opacity-40 hover:shadow-lg transition-all"
            style={{ borderLeft: '4px solid #c8102e' }}>
            <CalendarClock size={24} className="mx-auto mb-2 text-red-500" />
            <div className="font-bold text-sm text-gray-900 dark:text-white">Review Due</div>
            <div className="text-xs text-gray-400 mt-0.5">{dueCount} cards waiting</div>
          </button>
          <button onClick={() => startSession('new')}
            className="card p-4 text-center hover:shadow-lg transition-all"
            style={{ borderLeft: '4px solid #7c3aed' }}>
            <Brain size={24} className="mx-auto mb-2 text-purple-500" />
            <div className="font-bold text-sm text-gray-900 dark:text-white">Learn New</div>
            <div className="text-xs text-gray-400 mt-0.5">{deckSize} random words</div>
          </button>
        </div>
      </div>
    </section>
  )

  // ── DONE ──
  if (phase === 'done') {
    const passed = sessionResults.filter(r => r.quality >= 3).length
    return (
      <section className="mb-12">
        <SectionHeader icon={Brain} title="Session Complete!" subtitle={`${passed} / ${sessionResults.length} correct`} />
        <div className="card p-6 text-center">
          <div className="text-5xl mb-4">{passed === sessionResults.length ? '🎉' : passed > sessionResults.length / 2 ? '👍' : '💪'}</div>
          <div className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">{passed}/{sessionResults.length}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">Next reviews scheduled by spaced repetition</div>
          <div className="space-y-2 mb-6 text-left max-h-48 overflow-y-auto">
            {sessionResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-50 dark:bg-white/5">
                {r.quality >= 3 ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" /> : <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                <span className="font-bold text-sm text-gray-900 dark:text-white zaar-text">{r.word.z}</span>
                <span className="text-xs text-gray-400 ml-auto">{r.word.e}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setPhase('menu')} className="btn-primary px-8 py-3" style={{ background: R, borderColor: R }}>
            Back to Menu
          </button>
        </div>
      </section>
    )
  }

  // ── STUDY ──
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setPhase('menu')} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1">
          <ChevronLeft size={16} /> Back
        </button>
        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{cardIdx + 1} / {deck.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-100 dark:bg-white/10 rounded-full mb-6 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: R }} />
      </div>

      {/* Card */}
      <div className="relative" style={{ perspective: 1000 }}>
        <div className="card p-8 text-center cursor-pointer min-h-48 flex flex-col items-center justify-center gap-3"
          onClick={() => setFlipped(f => !f)}
          style={{ transition: 'transform 0.4s', transform: flipped ? 'rotateY(0deg)' : 'rotateY(0deg)' }}>
          <div className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">
            {flipped ? (mode === 'zaar-to-english' ? 'English' : 'Zaar') : (mode === 'zaar-to-english' ? 'Zaar' : 'English')}
          </div>
          {!flipped ? (
            <div>
              <div className="text-4xl font-extrabold text-gray-900 dark:text-white zaar-text mb-2">
                {mode === 'zaar-to-english' ? card?.z : card?.e}
              </div>
              {mode === 'zaar-to-english' && card?.p && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-100 dark:bg-white/10 text-gray-500">{card.p.replace('.','')}</span>
              )}
              <p className="text-sm text-gray-400 mt-4">Tap to reveal</p>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {mode === 'zaar-to-english' ? card?.e : card?.z}
              </div>
              {card?.h && <div className="text-sm text-gray-500 dark:text-gray-400">🇳🇬 {card.h}</div>}
              {card?.n && <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 italic max-w-xs">{card.n.slice(0,120)}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Rating buttons — only show after flip */}
      {flipped && (
        <div className="mt-5 space-y-3 animate-fade-in">
          <p className="text-center text-xs text-gray-400 font-semibold uppercase tracking-wider">How well did you know it?</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { q: 1, label: 'Again',   sub: 'Forgot',      color: '#ef4444', bg: '#fef2f2' },
              { q: 3, label: 'Hard',    sub: 'Struggled',   color: '#f59e0b', bg: '#fffbeb' },
              { q: 5, label: 'Easy',    sub: 'Got it!',     color: '#22c55e', bg: '#f0fdf4' },
            ].map(b => (
              <button key={b.q} onClick={() => rate(b.q)}
                className="rounded-2xl py-3 px-2 text-center font-bold text-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: b.bg, color: b.color, border: `2px solid ${b.color}20` }}>
                <div>{b.label}</div>
                <div className="text-xs font-normal opacity-70">{b.sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Voice Pronunciations ─────────────────────────────────────
function PronunciationsSection() {
  const { ZAAR_DICT, dictReady } = useDictionary()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedWord, setSelectedWord] = useState(null)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])

  // Search results
  const searchResults = useMemo(() => {
    if (!dictReady || !search.trim()) return []
    const q = search.trim().toLowerCase()
    return ZAAR_DICT.filter(e =>
      (e.z?.toLowerCase().includes(q) || e.e?.toLowerCase().includes(q)) && e.e && !e.e.startsWith('See')
    ).slice(0, 20)
  }, [search, ZAAR_DICT, dictReady])

  // Pronunciations for selected word
  const { data: recordings = [] } = useQuery({
    queryKey: ['pronunciations', selectedWord?.z],
    queryFn: async () => {
      const { data } = await sb.from('zaar_pronunciations')
        .select('*, profiles:user_id(username, full_name, avatar_url)')
        .eq('zaar_word', selectedWord.z)
        .order('upvotes', { ascending: false })
        .limit(10)
      return data || []
    },
    enabled: !!selectedWord,
  })

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      setRecording(true)
    } catch {
      alert('Microphone access required. Please allow microphone in your browser settings.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    setRecording(false)
  }

  const submitRecording = async () => {
    if (!audioBlob || !selectedWord || !user) return
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1]
        const path = `${user.id}/${Date.now()}.webm`
        const res = await fetch('/.netlify/functions/upload-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/webm', path,
            userToken: (await sb.auth.getSession()).data.session?.access_token }),
        })
        const { publicUrl } = await res.json()
        if (!publicUrl) throw new Error('Upload failed')
        await sb.from('zaar_pronunciations').insert({
          user_id: user.id, zaar_word: selectedWord.z, audio_url: publicUrl,
        })
        qc.invalidateQueries(['pronunciations', selectedWord.z])
        setAudioBlob(null); setAudioUrl(null)
        toast.success('Pronunciation submitted! 🎙️')
      }
    } catch (e) {
      toast.error('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  const upvote = async (recId, currentVotes) => {
    if (!user) return
    await sb.from('zaar_pronunciations').update({ upvotes: currentVotes + 1 }).eq('id', recId)
    qc.invalidateQueries(['pronunciations', selectedWord.z])
  }

  const playAudio = (url) => {
    const a = new Audio(url)
    a.play().catch(() => toast.error('Could not play audio'))
  }

  return (
    <section className="mb-12">
      <SectionHeader icon={Mic} title="Community Pronunciations"
        subtitle="Search a Zaar word, listen to native pronunciations, or record your own" />

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setSelectedWord(null) }}
          placeholder="Search Zaar word to pronounce..."
          className="input pl-10 w-full" />
      </div>

      {/* Search results */}
      {search && searchResults.length > 0 && !selectedWord && (
        <div className="card overflow-hidden mb-4 divide-y divide-surface-100 dark:divide-white/5">
          {searchResults.map(w => (
            <button key={w.z} onClick={() => { setSelectedWord(w); setSearch(w.z); setAudioBlob(null); setAudioUrl(null) }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-50 dark:hover:bg-white/5 text-left transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-900 dark:text-white zaar-text">{w.z}</div>
                <div className="text-xs text-gray-400 truncate">{w.e}</div>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Selected word panel */}
      {selectedWord && (
        <div className="space-y-4 animate-fade-in">
          {/* Word header */}
          <div className="card p-4 flex items-center gap-4" style={{ borderLeft: `4px solid ${R}` }}>
            <div className="flex-1">
              <div className="text-2xl font-extrabold text-gray-900 dark:text-white zaar-text">{selectedWord.z}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{selectedWord.e}</div>
              {selectedWord.h && <div className="text-xs text-gray-400">🇳🇬 {selectedWord.h}</div>}
            </div>
            <button onClick={() => speakWord(selectedWord.z)} className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: `${R}20` }}>
              <Volume2 size={18} style={{ color: R }} />
            </button>
          </div>

          {/* Record your own */}
          <div className="card p-4">
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Mic size={16} style={{ color: R }} /> Record your pronunciation
            </p>
            <div className="flex items-center gap-3">
              {!recording ? (
                <button onClick={startRecording}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: R }}>
                  <Mic size={15} /> Start Recording
                </button>
              ) : (
                <button onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white animate-pulse"
                  style={{ background: '#ef4444' }}>
                  <MicOff size={15} /> Stop Recording
                </button>
              )}
              {audioUrl && (
                <div className="flex items-center gap-2 flex-1">
                  <audio src={audioUrl} controls className="h-8 flex-1 min-w-0" />
                  <button onClick={submitRecording} disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: '#22c55e' }}>
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    Submit
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Community recordings */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Community recordings ({recordings.length})
            </p>
            {recordings.length === 0 ? (
              <div className="card p-6 text-center text-gray-400">
                <Mic size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No recordings yet — be the first!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map(rec => (
                  <div key={rec.id} className="card p-3 flex items-center gap-3">
                    <button onClick={() => playAudio(rec.audio_url)}
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${R}15` }}>
                      <Play size={16} style={{ color: R }} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {rec.profiles?.full_name || rec.profiles?.username || 'Community member'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(rec.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <button onClick={() => upvote(rec.id, rec.upvotes)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors text-gray-500 hover:text-red-500">
                      <ThumbsUp size={13} /> {rec.upvotes}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!search && !selectedWord && (
        <div className="card p-10 text-center text-gray-400">
          <Mic size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-gray-500 dark:text-gray-400">Search for a word to get started</p>
          <p className="text-sm mt-1">Listen to how community members pronounce Zaar words</p>
        </div>
      )}
    </section>
  )
}

export default function ZaarCulture() {
  const navigate = useNavigate()
  const [vis, setVis] = useState(false)
  const [tab, setTab] = useState('wordofday')
  useEffect(() => { setTimeout(() => setVis(true), 80) }, [])

  const tabGroups = [
    {
      label: 'Learn',
      tabs: [
        { id: 'wordofday',      emoji: '⚡', label: 'Today'       },
        { id: 'flashcards',     emoji: '🧠', label: 'Flashcards'  },
        { id: 'quiz',           emoji: '🏆', label: 'Quiz'        },
        { id: 'pronunciations', emoji: '🎙️', label: 'Pronounce'  },
        { id: 'tutor',          emoji: '🤖', label: 'AI Tutor', navigate: '/zaar-tutor' },
      ],
    },
    {
      label: 'Browse',
      tabs: [
        { id: 'dictionary',  emoji: '📚', label: 'Dictionary' },
        { id: 'az',          emoji: '🔤', label: 'A–Z'        },
        { id: 'favourites',  emoji: '⭐', label: 'Favourites' },
        { id: 'sentences',   emoji: '💬', label: 'Sentences'  },
      ],
    },
    {
      label: 'Culture',
      tabs: [
        { id: 'language',  emoji: '🗣️', label: 'Language' },
        { id: 'proverbs',  emoji: '📜', label: 'Proverbs' },
        { id: 'stories',   emoji: '📖', label: 'Stories'  },
        { id: 'gallery',   emoji: '🖼️', label: 'Gallery'  },
        { id: 'community', emoji: '🤝', label: 'Community'},
      ],
    },
  ]
  const tabs = tabGroups.flatMap(g => g.tabs)

  return (
    <div className="animate-fade-in">
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(200,16,46,0.4)}50%{box-shadow:0 0 0 14px rgba(200,16,46,0)}}`}</style>

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden mb-6 text-center" style={{ background: 'linear-gradient(135deg, #c8102e 0%, #1a1a1a 100%)', padding: '44px 24px 36px' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: 'rgba(255,255,255,0.04)', transform: 'rotate(30deg)', borderRadius: 20 }} />
        <div style={{ position: 'absolute', bottom: -30, left: -20, width: 110, height: 110, background: 'rgba(255,255,255,0.03)', transform: 'rotate(20deg)', borderRadius: 20 }} />
        <div className="w-20 h-20 mx-auto mb-5 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.5)', transform: 'rotate(45deg)', animation: 'pulse 2.5s ease-in-out infinite', opacity: vis ? 1 : 0, transition: 'opacity 0.6s' }}>
          <span style={{ transform: 'rotate(-45deg)', fontSize: 36 }}>🔥</span>
        </div>
        <div className="text-xs font-bold tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: '0.45em', opacity: vis ? 1 : 0, transition: 'opacity 0.6s 0.1s' }}>◆ &nbsp; SAYAWA HERITAGE &nbsp; ◆</div>
        <h1 className="font-extrabold text-white mb-3" style={{ fontSize: 'clamp(40px, 8vw, 72px)', fontFamily: 'Georgia, serif', lineHeight: 1, opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(-12px)', transition: 'all 0.7s cubic-bezier(0.34,1.2,0.64,1) 0.15s' }}>
          Zaar Culture
        </h1>
        <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.5)', margin: '0 auto 16px', borderRadius: 2, opacity: vis ? 1 : 0, transition: 'opacity 0.6s 0.25s' }} />
        <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'Georgia, serif', fontStyle: 'italic', opacity: vis ? 1 : 0, transition: 'opacity 0.6s 0.3s' }}>
          Preserving the soul of Sayawa people — our language, our land, our ceremonies, our ancestors' unbroken voice.
        </p>
        <button
          onClick={() => navigate('/zaar-tutor')}
          style={{ opacity: vis ? 1 : 0, transition: 'opacity 0.6s 0.45s', marginTop: 20, background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.45)', borderRadius: 999, padding: '10px 24px', color: '#fff', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
        >
          🤖 Chat with Malam Zaar — AI Tutor
        </button>
      </div>

      {/* Tabs — grouped wrap grid, no scroll */}
      <div className="mb-6 space-y-2">
        {tabGroups.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 px-0.5">
              {group.label}
            </p>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
              {group.tabs.map(t => {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => t.navigate ? navigate(t.navigate) : setTab(t.id)}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2.5 px-1 transition-all',
                      active
                        ? 'text-white shadow-md scale-105'
                        : 'bg-white dark:bg-surface-800 text-gray-500 dark:text-gray-400 border border-surface-200 dark:border-white/10 hover:border-red-300 hover:text-red-500 dark:hover:text-red-400'
                    )}
                    style={active ? { background: R } : {}}
                  >
                    <span className="text-base leading-none">{t.emoji}</span>
                    <span className="text-[10px] font-semibold leading-tight text-center whitespace-nowrap">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Content panels — fade+slide transition on tab change */}
      <style>{`
        @keyframes tabIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tab-panel { animation: tabIn 0.22s cubic-bezier(0.4,0,0.2,1) both; }
      `}</style>
      <div key={tab} className="tab-panel">
      {/* Content panels */}
      {tab === 'wordofday'  && <><WordOfTheDay /><DictionarySection /></>}
      {tab === 'dictionary' && <DictionarySection />}
      {tab === 'quiz'       && <QuizSection />}
      {tab === 'az'         && <AlphabetBrowser />}
      {tab === 'flashcards'     && <FlashcardsSection />}
      {tab === 'pronunciations' && <PronunciationsSection />}
      {tab === 'favourites' && <FavouritesSection />}
      {tab === 'sentences'  && <SentencesSection />}
      {tab === 'language'   && <LanguageSection />}
      {tab === 'proverbs'   && <ProverbsSection />}
      {tab === 'stories'    && <StoriesSection />}
      {tab === 'gallery'    && <HeritagePhotos />}
      {tab === 'community'  && <DiscussionBoard />}

      </div>
      {/* Footer */}
      <div className="mt-8">
        <TribalBorder />
        <div className="bg-gray-900 dark:bg-black text-center py-4 rounded-b-2xl">
          <p className="text-xs tracking-widest" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Georgia, serif' }}>
            ◆ &nbsp; VII-MBUNI · ZAAR CULTURE · SAYAWA HERITAGE &nbsp; ◆
          </p>
        </div>
      </div>
    </div>
  )
}
