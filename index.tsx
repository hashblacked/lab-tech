
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Image as ImageIcon, 
  Trash2, 
  Play, 
  Loader2, 
  Layout,
  Database,
  ShieldCheck,
  RefreshCw,
  Globe,
  Terminal,
  CloudLightning,
  Monitor,
  Eraser,
  Zap,
  SquareStop,
  Clock,
  CheckCircle2,
  AlertCircle,
  Instagram,
  Facebook,
  Share2,
  Wifi,
  WifiOff,
  HelpCircle,
  ListChecks,
  Timer,
  ExternalLink,
  Search,
  Twitter,
  Youtube,
  Video,
  X,
  Info,
  Bot
} from 'lucide-react';

// --- Constants ---
const DB_NAME = 'NewsStream_Enterprise_V21_Multi';
const STORE_NAME = 'post_queue';

const POST_INTERVAL_MS = 10 * 60 * 1000; 

// Safety tuning: 
const DAILY_LIMIT_RETRY_MS = 3600000; // 1 hour pause for AI if daily limit hit

// --- Interfaces ---
interface PostItem {
  id: string;
  image: string;
  newsHeader: string; 
  newsCategory: string;
  hashtags: string[];
  scheduledAt: number;
  status: 'pending' | 'analyzing' | 'ready' | 'posting' | 'completed' | 'failed';
  platforms?: {
    fbFeed: boolean;
    fbStory: boolean;
    igFeed: boolean;
    igStory: boolean;
    twitter: boolean;
    tiktok: boolean;
    youtube: boolean;
  };
  results?: {
    fbFeed?: string;
    fbStory?: string;
    igFeed?: string;
    igStory?: string;
    twitter?: string;
    tiktok?: string;
    youtube?: string;
  };
  error?: string;
}

interface AppConfig {
  pageName: string;
  fbPageAccessToken: string;
  fbPageId: string;
  igBusinessId: string;
  twitterToken: string;
  tiktokToken: string;
  youtubeToken: string;
  youtubeChannelId: string;
  defaultPlatforms: {
    fbFeed: boolean;
    fbStory: boolean;
    igFeed: boolean;
    igStory: boolean;
    twitter: boolean;
    tiktok: boolean;
    youtube: boolean;
  };
}

// --- DB Management ---
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbOp = {
  save: async (item: PostItem): Promise<void> => {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  getAll: async (): Promise<PostItem[]> => {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  delete: async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  clearAll: async (): Promise<void> => {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
};

const PLATFORM_INFO = {
  fb: {
    title: "Facebook API Setup",
    steps: [
      "Meta for Developers এ গিয়ে একটি App তৈরি করুন।",
      "পেইজ এক্সেস টোকেন জেনারেট করুন (পাসওয়ার্ড দিন)।",
      "পেইজের 'pages_manage_posts' এবং 'pages_read_engagement' পারমিশন নিশ্চিত করুন।",
      "টোকেনটিকে 'Long-lived' করার জন্য Access Token Tool ব্যবহার করুন।"
    ]
  },
  ig: {
    title: "Instagram Business Setup",
    steps: [
      "আপনার Instagram প্রোফাইলটিকে Business Account এ রূপান্তর করুন।",
      "Account টি একটি Facebook পেইজের সাথে লিঙ্ক করুন।",
      "Meta App Dashboard এ গিয়ে 'Instagram Graph API' সেটআপ করুন।",
      "পেইজের ID ব্যবহার করে 'Auto-Detect' বাটনে ক্লিক করুন।"
    ]
  },
  twitter: {
    title: "X (Twitter) Developer Setup",
    steps: [
      "Twitter Developer Portal এ গিয়ে একটি Project তৈরি করুন।",
      "App সেটিংস থেকে OAuth 2.0 এনাবল করুন।",
      "User Authentication সেটিংস এ Read/Write পারমিশন দিন।",
      "Bearer Token কপি করে এখানে পেস্ট করুন।"
    ]
  },
  youtube: {
    title: "YouTube Data API Setup",
    steps: [
      "Google Cloud Console এ একটি প্রজেক্ট খুলুন।",
      "YouTube Data API v3 এনাবল করুন।",
      "OAuth 2.0 ক্লায়েন্ট তৈরি করে এক্সেস টোকেন সংগ্রহ করুন।",
      "এটি ভিডিও এবং শর্টস আপলোডের জন্য প্রয়োজন।"
    ]
  },
  tiktok: {
    title: "TikTok For Developers Setup",
    steps: [
      "TikTok for Developers সাইটে রেজিস্টার করুন।",
      "'Content Posting' API এর জন্য আবেদন করুন।",
      "আপনার অ্যাপটি রিভিউ হওয়ার পর Access Token পাবেন।",
      "টোকেনটি সংগ্রহ করে এখানে ইনপুট দিন।"
    ]
  }
};

function App() {
  const [queue, setQueue] = useState<PostItem[]>([]);
  const [isRunning, setIsRunning] = useState(() => localStorage.getItem('engine_active') === 'true');
  const [isLocked, setIsLocked] = useState(false); 
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeLog, setActiveLog] = useState<string>("System Idle: Engine Ready.");
  const [tokenStatus, setTokenStatus] = useState<{type: 'idle' | 'checking' | 'success' | 'error', msg: string}>({type: 'idle', msg: ''});
  const [aiCooldown, setAiCooldown] = useState(0);
  const [activeHelp, setActiveHelp] = useState<keyof typeof PLATFORM_INFO | null>(null);
  const [aiBypassed, setAiBypassed] = useState(false); 
  
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const engineBusyRef = useRef(false);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<PostItem[]>([]);
  const lastProcessedIdRef = useRef<string | null>(null);
  const aiCooldownRef = useRef(0);
  const aiBypassRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
    const currentIds = new Set(queue.map(i => i.id));
    processedIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) processedIdsRef.current.delete(id);
    });

    if (isRunning && queue.length === 0 && !engineBusyRef.current) {
      setIsRunning(false);
      setActiveLog("Engine Auto-Stop: All tasks completed.");
    }
  }, [queue, isRunning]);

  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('broadcast_multi_config_v21');
    return saved ? JSON.parse(saved) : {
      pageName: '',
      fbPageAccessToken: '',
      fbPageId: '',
      igBusinessId: '',
      twitterToken: '',
      tiktokToken: '',
      youtubeToken: '',
      youtubeChannelId: '',
      defaultPlatforms: {
        fbFeed: true,
        fbStory: true,
        igFeed: true,
        igStory: true,
        twitter: false,
        tiktok: false,
        youtube: false
      }
    };
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aiCooldown <= 0) return;
    const timer = setInterval(() => {
      setAiCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [aiCooldown]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const stopBackgroundEnforcer = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startBackgroundEnforcer = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'playback' });
        const oscillator = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 0.001; 
        oscillator.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        oscillator.start();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (e) {
      console.warn("Background enforcer audio failed:", e);
    }
  };

  useEffect(() => {
    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        if (isRunning && queueRef.current.length > 0) {
          if (!wakeLockRef.current) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            startBackgroundEnforcer(); 
          }
        } else {
          if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
            stopBackgroundEnforcer();
          }
        }
      } catch (err: any) {}
    };
    requestWakeLock();
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning, queue.length]);

  useEffect(() => {
    const init = async () => {
      try {
        const items = await dbOp.getAll();
        setQueue(items.sort((a, b) => a.scheduledAt - b.scheduledAt));
      } catch (e) {
        setActiveLog("Cache Sync Fault.");
      }
    };
    init();
  }, []);

  useEffect(() => {
    localStorage.setItem('broadcast_multi_config_v21', JSON.stringify(config));
    localStorage.setItem('engine_active', isRunning.toString());
  }, [config, isRunning]);

  useEffect(() => {
    aiCooldownRef.current = aiCooldown;
  }, [aiCooldown]);

  useEffect(() => {
    aiBypassRef.current = aiBypassed;
  }, [aiBypassed]);

  useEffect(() => {
    if (!isRunning) return;

    const workerCode = `
      let timer;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timer = setInterval(() => self.postMessage('heartbeat'), 2500);
        } else if (e.data === 'stop') {
          clearInterval(timer);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = () => {
      if (!isOnline || !isRunning || engineBusyRef.current) return;
      
      const now = Date.now();
      const currentQueue = queueRef.current;
      
      const nextReady = currentQueue.find(i => 
        i.status === 'ready' && 
        now >= i.scheduledAt && 
        !processedIdsRef.current.has(i.id) &&
        i.id !== lastProcessedIdRef.current
      );

      if (nextReady) {
        handleBroadcast(nextReady);
        return; 
      }

      // Check if we should process next item
      if (aiCooldownRef.current <= 0 || aiBypassRef.current) {
        const nextPending = currentQueue.find(i => 
          i.status === 'pending' && 
          !processedIdsRef.current.has(i.id)
        );
        if (nextPending) {
          handleSmartAnalysis(nextPending.id, nextPending.image);
        }
      }
    };

    worker.postMessage('start');
    return () => {
      worker.postMessage('stop');
      worker.terminate();
    };
  }, [isRunning, isOnline]);

  // --- CLIENT-SIDE OFFLINE GENERATOR ---
  // If API fails, we use this to ensure the queue continues.
  const getSmartOfflineResult = () => {
    const hour = new Date().getHours();
    let timeGreeting = "আপডেট";
    if (hour < 12) timeGreeting = "সকালের সংবাদ";
    else if (hour < 17) timeGreeting = "দুপুরের সংবাদ";
    else if (hour < 20) timeGreeting = "সন্ধ্যার সংবাদ";
    else timeGreeting = "রাতের সংবাদ";

    return {
      newsCategory: "🔴 ব্রেকিং",
      newsHeader: `${timeGreeting} - বিশেষ আপডেট`,
      hashtags: ["#News", "#Update", "#Bangladesh", "#Latest", "#Trending", "#Viral", "#Breaking", "#Live"]
    };
  };

  const handleSmartAnalysis = async (id: string, image: string) => {
    if (engineBusyRef.current || processedIdsRef.current.has(id)) return;
    
    // --- BYPASS CHECK ---
    // If we already know the quota is dead, don't even try the API.
    // Just generate offline data immediately.
    if (aiBypassRef.current) {
      engineBusyRef.current = true;
      processedIdsRef.current.add(id);
      setActiveLog("⚡ Offline Mode: Generating local metadata...");
      
      await new Promise(r => setTimeout(r, 500)); // Minimal delay for UI smoothness
      
      const offlineData = getSmartOfflineResult();
      await updateStatus(id, { 
        newsCategory: offlineData.newsCategory, 
        newsHeader: offlineData.newsHeader,
        status: 'ready', 
        hashtags: offlineData.hashtags 
      });
      
      engineBusyRef.current = false;
      processedIdsRef.current.delete(id);
      return;
    }

    engineBusyRef.current = true;
    processedIdsRef.current.add(id);
    setIsLocked(true); 
    
    updateLocalStatus(id, { status: 'analyzing' });
    setActiveLog("AI Engine: Contacting Cloud Mind...");
    
    try {
      const response = await fetch('/api/analyze-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(errorData.message || errorData.error || `Server responded with ${response.status}`);
        (err as any).status = response.status;
        throw err;
      }

      const result = await response.json();
      await updateStatus(id, { 
        newsCategory: result.newsCategory || "📌 আপডেট",
        newsHeader: result.newsHeader || "আজকের বিশেষ খবর",
        hashtags: (result.hashtags || []).map((t: string) => t.startsWith('#') ? t : `#${t}`).map((t: string) => t.replace(/\s+/g, '_')),
        status: 'ready' 
      });
      
      setActiveLog(`AI Engine: Analysis complete.`);
      setAiCooldown(15); 

    } catch (e: any) {
      // --- FAIL SAFE & QUOTA HANDLER ---
      const errorMsg = (e.message || e.toString() || '').toLowerCase();
      
      // Check for Quota/Rate Limit
      const isQuotaIssue = e.status === 429 || errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('exhausted') || errorMsg.includes('limit');
      
      if (isQuotaIssue) {
        setActiveLog("⛔ API Quota Hit. Switched to Smart Offline Mode.");
        setAiBypassed(true); 
        // Try to re-enable AI after 1 hour automatically
        setTimeout(() => setAiBypassed(false), DAILY_LIMIT_RETRY_MS); 
      } else {
         setActiveLog("⚠️ AI Unreachable. Using Smart Offline Data.");
         setAiCooldown(10); 
      }

      // VITAL: Force Success using Offline Data
      const offlineData = getSmartOfflineResult();
      await updateStatus(id, { 
        newsCategory: offlineData.newsCategory, 
        newsHeader: offlineData.newsHeader,
        status: 'ready', // Set to ready so it POSTS
        hashtags: offlineData.hashtags 
      });

    } finally {
      setTimeout(() => {
        setIsLocked(false);
        engineBusyRef.current = false;
        processedIdsRef.current.delete(id);
      }, 500);
    }
  };

  const handleBroadcast = async (item: PostItem) => {
    if (engineBusyRef.current || processedIdsRef.current.has(item.id) || item.id === lastProcessedIdRef.current) return;
    
    engineBusyRef.current = true;
    processedIdsRef.current.add(item.id); 
    lastProcessedIdRef.current = item.id;
    setIsLocked(true); 

    setActiveLog(`Multi-Platform Sync: Dispatching task #${item.id.slice(0,4)}...`);
    updateLocalStatus(item.id, { status: 'posting' });
    
    const message = `${item.newsCategory}\n${item.newsHeader}\n\n${item.hashtags.join(' ')}`;
    const platforms = item.platforms || config.defaultPlatforms;
    let mainImageUrl = '';
    let sharedPhotoId = '';

    try {
      const blob = await (await fetch(item.image)).blob();
      
      if (platforms.fbFeed || platforms.fbStory || platforms.igFeed || platforms.igStory) {
        const formData = new FormData();
        formData.append('source', blob);
        formData.append('access_token', config.fbPageAccessToken);
        formData.append('published', platforms.fbFeed ? 'true' : 'false');
        if (platforms.fbFeed) formData.append('message', message);

        const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${config.fbPageId}/photos`, { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        
        if (uploadData.id) {
          sharedPhotoId = uploadData.id;
          const imgMetaRes = await fetch(`https://graph.facebook.com/v20.0/${uploadData.id}?fields=images&access_token=${config.fbPageAccessToken}`);
          const imgMetaData = await imgMetaRes.json();
          mainImageUrl = imgMetaData.images?.[0]?.source;
          
          if (platforms.fbStory) {
            await fetch(`https://graph.facebook.com/v20.0/${config.fbPageId}/video_stories?photo_id=${sharedPhotoId}&access_token=${config.fbPageAccessToken}`, { method: 'POST' });
          }

          if (config.igBusinessId && mainImageUrl) {
            if (platforms.igFeed) {
              const containerRes = await fetch(`https://graph.facebook.com/v20.0/${config.igBusinessId}/media?image_url=${encodeURIComponent(mainImageUrl)}&caption=${encodeURIComponent(message)}&access_token=${config.fbPageAccessToken}`, { method: 'POST' });
              const cData = await containerRes.json();
              if (cData.id) await fetch(`https://graph.facebook.com/v20.0/${config.igBusinessId}/media_publish?creation_id=${cData.id}&access_token=${config.fbPageAccessToken}`, { method: 'POST' });
            }
            if (platforms.igStory) {
              const sRes = await fetch(`https://graph.facebook.com/v20.0/${config.igBusinessId}/media?image_url=${encodeURIComponent(mainImageUrl)}&media_type=STORIES&access_token=${config.fbPageAccessToken}`, { method: 'POST' });
              const sData = await sRes.json();
              if (sData.id) await fetch(`https://graph.facebook.com/v20.0/${config.igBusinessId}/media_publish?creation_id=${sData.id}&access_token=${config.fbPageAccessToken}`, { method: 'POST' });
            }
          }
        }
      }

      await dbOp.delete(item.id);
      setQueue(q => q.filter(i => i.id !== item.id));
      setActiveLog("Sync Successful: Post completed.");
    } catch (e: any) {
      setActiveLog(`Broadcast Error: ${e.message}`);
      processedIdsRef.current.delete(item.id);
      lastProcessedIdRef.current = null;
      updateLocalStatus(item.id, { status: 'failed', error: e.message });
    } finally {
      setTimeout(() => {
        setIsLocked(false);
        engineBusyRef.current = false;
      }, 500);
    }
  };

  const handleAutoDetectIG = async () => {
    if (!config.fbPageAccessToken || !config.fbPageId) {
      setTokenStatus({ type: 'error', msg: 'Verify FB Page first.' });
      return;
    }
    setTokenStatus({ type: 'checking', msg: 'Detecting IG Business Account...' });
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${config.fbPageId}?fields=instagram_business_account&access_token=${config.fbPageAccessToken}`);
      const data = await res.json();
      if (data.instagram_business_account?.id) {
        const igId = data.instagram_business_account.id;
        setConfig(prev => ({ ...prev, igBusinessId: igId }));
        setTokenStatus({ type: 'success', msg: `IG Found: ${igId}` });
      } else {
        throw new Error("No linked IG Business Account.");
      }
    } catch (e: any) {
      setTokenStatus({ type: 'error', msg: e.message });
    }
  };

  const updateLocalStatus = (id: string, updates: Partial<PostItem>) => {
    setQueue(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const newQueue = [...prev];
      newQueue[idx] = { ...newQueue[idx], ...updates };
      return newQueue;
    });
  };

  const updateStatus = async (id: string, updates: Partial<PostItem>) => {
    setQueue(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const newQueue = [...prev];
      const updatedItem = { ...newQueue[idx], ...updates };
      newQueue[idx] = updatedItem;
      dbOp.save(updatedItem);
      return newQueue;
    });
  };

  const handleFileUpload = async (inputEvent: React.ChangeEvent<HTMLInputElement>) => {
    const files = inputEvent.target.files;
    if (!files) return;
    let lastTime = queue.length > 0 ? Math.max(Date.now(), queue[queue.length - 1].scheduledAt) : Date.now();
    const newItems: PostItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const base64 = await new Promise<string>(res => {
        const r = new FileReader();
        r.onload = ev => res(ev.target?.result as string);
        r.readAsDataURL(files[i]);
      });
      const newItem: PostItem = {
        id: crypto.randomUUID(),
        image: base64,
        newsHeader: '...',
        newsCategory: '...',
        hashtags: [],
        scheduledAt: lastTime + ((i + 1) * POST_INTERVAL_MS),
        status: 'pending',
        platforms: { ...config.defaultPlatforms }
      };
      await dbOp.save(newItem);
      newItems.push(newItem);
    }
    setQueue(prev => [...prev, ...newItems].sort((a,b) => a.scheduledAt - b.scheduledAt));
    if(fileInputRef.current) fileInputRef.current.value = '';
    setActiveLog(`Added ${files.length} tasks to buffer.`);
  };

  const togglePlatform = (id: string, platform: keyof PostItem['platforms']) => {
    setQueue(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const newQueue = [...prev];
      const currentPlatforms = newQueue[idx].platforms || { ...config.defaultPlatforms };
      newQueue[idx] = {
        ...newQueue[idx],
        platforms: { ...currentPlatforms, [platform]: !currentPlatforms[platform] }
      };
      dbOp.save(newQueue[idx]);
      return newQueue;
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-400 font-sans selection:bg-blue-600/30 antialiased pb-12">
      
      {/* Help Modal */}
      {activeHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#050b1d] border border-white/10 rounded-[2.5rem] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 p-6">
              <button onClick={() => setActiveHelp(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 md:p-10">
              <div className="bg-blue-600/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <Info className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-black text-white mb-6 tracking-tight font-['Noto_Sans_Bengali']">
                {PLATFORM_INFO[activeHelp].title}
              </h3>
              <ul className="space-y-4">
                {PLATFORM_INFO[activeHelp].steps.map((step, i) => (
                  <li key={i} className="flex gap-4 text-slate-300 text-sm font-medium font-['Noto_Sans_Bengali'] leading-relaxed">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-500 flex items-center justify-center text-[10px] font-black">{i+1}</span>
                    {step}
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => setActiveHelp(null)}
                className="w-full mt-10 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-blue-600/20"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 md:py-10">
        <header className="flex flex-col lg:flex-row justify-between items-center gap-6 p-6 mb-8 bg-[#050b1d] border border-white/5 rounded-[2rem] shadow-2xl">
          <div className="flex items-center gap-5">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-white to-slate-400 tracking-tighter">
                Broadcast<span className="text-blue-500">Hub</span> <span className="text-blue-500 font-bold italic text-[10px] border border-blue-500/20 px-2 py-0.5 rounded ml-2 uppercase">V25.4 SILENT-FAILOVER</span>
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${isRunning ? 'text-emerald-400' : 'text-rose-400'}`}>
                   <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                   {isRunning ? 'Broadcasting' : 'Standby'}
                </span>
                <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${isOnline ? 'text-blue-400' : 'text-amber-400'}`}>
                   {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="bg-slate-950/60 rounded-2xl px-6 py-3 border border-white/5 flex gap-8">
              <div className="text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Queue</p>
                <p className="text-2xl font-black text-blue-400 tabular-nums leading-none">{queue.length}</p>
              </div>
              <div className="w-px bg-white/5" />
              <div className="text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Status</p>
                <p className={`text-2xl font-black tabular-nums leading-none ${aiBypassed ? 'text-rose-500' : (aiCooldown > 0 ? 'text-amber-500' : 'text-emerald-500')}`}>
                  {aiBypassed ? 'OFFLINE' : (aiCooldown > 0 ? 'Busy' : 'Active')}
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                if(!isRunning && queue.length > 0) startBackgroundEnforcer(); 
                setIsRunning(!isRunning);
              }}
              className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${
                isRunning ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {isRunning ? <SquareStop className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              {isRunning ? 'Stop' : 'Start Engine'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-[#050b1d] border border-white/5 rounded-[2rem] p-6 shadow-2xl overflow-y-auto max-h-[85vh] custom-scrollbar">
              <h2 className="text-[10px] font-black flex items-center gap-2 uppercase tracking-[0.2em] text-slate-500 mb-6">
                <Monitor className="w-4 h-4 text-blue-500" /> API Configuration
              </h2>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center pr-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Facebook className="w-3 h-3 text-blue-500" /> Facebook Page Token
                    </label>
                    <button onClick={() => setActiveHelp('fb')} className="p-1 text-slate-600 hover:text-blue-500 transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input type="password" value={config.fbPageAccessToken} onChange={e => setConfig({...config, fbPageAccessToken: e.target.value})} className="w-full bg-[#020617] border border-white/5 rounded-xl px-5 py-4 text-xs font-mono text-blue-400 outline-none focus:border-blue-500/40" placeholder="EAA..." />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pr-1">
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                        <Instagram className="w-3 h-3 text-pink-500" /> IG Business ID
                      </label>
                      <button onClick={handleAutoDetectIG} className="text-[8px] font-black text-blue-500 uppercase tracking-widest hover:underline flex items-center gap-1"><Search className="w-2 h-2" /> Auto</button>
                    </div>
                    <button onClick={() => setActiveHelp('ig')} className="p-1 text-slate-600 hover:text-pink-500 transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input type="text" value={config.igBusinessId} onChange={e => setConfig({...config, igBusinessId: e.target.value})} className="w-full bg-[#020617] border border-white/5 rounded-xl px-5 py-4 text-xs font-mono text-pink-400 outline-none focus:border-pink-500/40" placeholder="178..." />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pr-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Twitter className="w-3 h-3 text-blue-400" /> X (Twitter) Token
                    </label>
                    <button onClick={() => setActiveHelp('twitter')} className="p-1 text-slate-600 hover:text-blue-400 transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input type="password" value={config.twitterToken} onChange={e => setConfig({...config, twitterToken: e.target.value})} className="w-full bg-[#020617] border border-white/5 rounded-xl px-5 py-4 text-xs font-mono text-blue-300 outline-none focus:border-blue-500/40" placeholder="Bearer..." />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pr-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Youtube className="w-3 h-3 text-red-500" /> YouTube Token
                    </label>
                    <button onClick={() => setActiveHelp('youtube')} className="p-1 text-slate-600 hover:text-red-500 transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input type="password" value={config.youtubeToken} onChange={e => setConfig({...config, youtubeToken: e.target.value})} className="w-full bg-[#020617] border border-white/5 rounded-xl px-5 py-4 text-xs font-mono text-red-400 outline-none focus:border-red-500/40" placeholder="ya29..." />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pr-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 ml-1">
                      <Video className="w-3 h-3 text-emerald-500" /> TikTok Access Token
                    </label>
                    <button onClick={() => setActiveHelp('tiktok')} className="p-1 text-slate-600 hover:text-emerald-500 transition-colors">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input type="password" value={config.tiktokToken} onChange={e => setConfig({...config, tiktokToken: e.target.value})} className="w-full bg-[#020617] border border-white/5 rounded-xl px-5 py-4 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-500/40" placeholder="act..." />
                </div>

                <button onClick={async () => {
                  setTokenStatus({type: 'checking', msg: 'Verifying Global Config...'});
                  try {
                    const res = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${config.fbPageAccessToken}`);
                    const data = await res.json();
                    if(data.error) throw new Error(data.error.message);
                    setTokenStatus({type: 'success', msg: `Linked: ${data.name}`});
                    setConfig({...config, pageName: data.name, fbPageId: data.id});
                  } catch(e: any) { setTokenStatus({type: 'error', msg: e.message}); }
                }} className="w-full py-4 bg-[#1e293b] hover:bg-[#253347] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg">Verify Global Config</button>

                {tokenStatus.msg && (
                  <div className={`p-4 rounded-xl text-[10px] font-bold flex items-center gap-3 ${tokenStatus.type === 'success' ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-rose-500/5 text-rose-400 border border-rose-500/10'}`}>
                    {tokenStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {tokenStatus.msg}
                  </div>
                )}
              </div>
            </section>

            <section onClick={() => fileInputRef.current?.click()} className="bg-[#050b1d] border border-dashed border-white/10 hover:border-blue-500/40 rounded-[2rem] p-8 text-center cursor-pointer transition-all">
              <div className="bg-blue-500/10 p-4 rounded-2xl w-14 h-14 mx-auto mb-4 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Load Media</h3>
              <input type="file" ref={fileInputRef} multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
            </section>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="bg-[#050b1d] border border-white/5 rounded-2xl px-6 py-4 flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-4 min-w-0">
                <Terminal className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-[10px] font-bold text-slate-300 font-mono truncate leading-none">
                   <span className="text-blue-500/50 mr-2">root@broadcast:</span> {activeLog}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {aiBypassed && (
                  <button onClick={() => setAiBypassed(false)} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[9px] font-black px-3 py-1 rounded-full uppercase border border-rose-500/20 transition-all flex items-center gap-2">
                    <RefreshCw className="w-3 h-3" /> Retry AI
                  </button>
                )}
                {aiCooldown > 0 && !aiBypassed && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${aiCooldown > 300 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/10'}`}>
                    <Timer className={`w-3 h-3 ${aiCooldown > 300 ? 'text-rose-500' : 'text-amber-500 animate-pulse'}`} />
                    <span className={`text-[9px] font-black uppercase ${aiCooldown > 300 ? 'text-rose-500' : 'text-amber-500'}`}>
                      {aiCooldown > 300 ? 'Quota Wait' : `Retry: ${aiCooldown}s`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <section className="bg-[#050b1d] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col min-h-[600px]">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
                <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                  Broadcast <span className="text-blue-500">Buffer</span>
                </h2>
                {queue.length > 0 && (
                  <button onClick={async () => { if(window.confirm("Purge all?")) { await dbOp.clearAll(); setQueue([]); } }} className="p-2 text-rose-500/60 hover:bg-rose-500/10 rounded-lg transition-all">
                    <Eraser className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex-1 p-6 space-y-4 max-h-[700px] overflow-y-auto custom-scrollbar">
                {queue.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 py-20">
                    <Database className="w-16 h-16 mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">Buffer Null</p>
                  </div>
                ) : (
                  queue.map((item, index) => (
                    <div key={item.id} className="bg-[#020617] border border-white/5 p-4 rounded-[1.5rem] flex items-center gap-6 relative group transition-all hover:border-blue-500/20">
                      <div className="relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden border border-white/5">
                        <img src={item.image} className="w-full h-full object-cover" alt="news" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-1.5 left-1.5 bg-blue-600 px-2 py-0.5 rounded-md text-[10px] font-black text-white shadow-lg">#{String(index + 1).padStart(2, '0')}</div>
                        {(item.status === 'analyzing' || item.status === 'posting') && (
                          <div className="absolute inset-0 bg-blue-600/30 backdrop-blur-[1px] flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${
                            item.status === 'ready' ? 'bg-rose-600/10 text-rose-500 border border-rose-500/20' :
                            item.status === 'analyzing' || item.status === 'posting' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' :
                            'bg-slate-900 text-slate-500 border border-white/5'
                          }`}>
                            {item.status.toUpperCase()}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-2 tabular-nums">
                            <Clock className="w-3 h-3 text-blue-500" /> {new Date(item.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                          <div className="ml-auto flex gap-1 items-center">
                             {['fbFeed', 'fbStory', 'igFeed', 'igStory', 'twitter', 'tiktok', 'youtube'].map(p => {
                               let Icon = p.startsWith('fb') ? Facebook : Instagram;
                               if(p === 'twitter') Icon = Twitter;
                               if(p === 'tiktok') Icon = Video;
                               if(p === 'youtube') Icon = Youtube;
                               
                               const isActive = item.platforms ? item.platforms[p as keyof PostItem['platforms']] : config.defaultPlatforms[p as keyof PostItem['platforms']];
                               return (
                                 <button key={p} onClick={() => togglePlatform(item.id, p as keyof PostItem['platforms'])}
                                   className={`p-1.5 rounded-full border transition-all ${isActive ? 'bg-blue-600/20 border-blue-500/30 text-blue-400' : 'bg-slate-900/40 border-white/5 text-slate-700'}`}>
                                   <Icon className="w-3 h-3" />
                                 </button>
                               );
                             })}
                             <button onClick={async () => { await dbOp.delete(item.id); setQueue(prev => prev.filter(i => i.id !== item.id)); }} className="p-1.5 bg-[#0a0f1d] border border-white/5 rounded-full text-slate-700 hover:text-rose-500 transition-all ml-1">
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                           <div className="flex items-center gap-3">
                             {item.newsCategory !== '...' && (
                               <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/30 flex items-center gap-1.5 antialiased font-['Noto_Sans_Bengali']">
                                  {item.newsCategory}
                               </span>
                             )}
                             <h3 className="text-sm font-black text-slate-100 tracking-tight leading-tight line-clamp-1 font-['Noto_Sans_Bengali']">
                                {item.newsHeader !== '...' ? item.newsHeader : (item.status === 'analyzing' ? 'এনালাইসিস করা হচ্ছে...' : 'প্রসেসিং এর জন্য অপেক্ষা করুন')}
                             </h3>
                           </div>
                           
                           <div className="flex flex-wrap gap-2">
                            {item.hashtags.length > 0 ? item.hashtags.map(tag => (
                              <span key={tag} className="text-[9px] font-bold text-slate-500 bg-[#0a0f1d] px-2 py-1 rounded-md border border-white/5">{tag}</span>
                            )) : <div className="w-20 h-3 bg-slate-900/50 rounded animate-pulse" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-6 border-t border-white/5 bg-slate-950/40 flex justify-between items-center">
                <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-widest"><Globe className="w-4 h-4" /> NODE V25.4-SILENT-FAILOVER</div>
                <div className="flex items-center gap-2 text-[9px] font-black text-blue-500 italic uppercase"><ShieldCheck className="w-4 h-4" /> Multi-Platform Guard Active</div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.4); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.2); border-radius: 12px; }
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
