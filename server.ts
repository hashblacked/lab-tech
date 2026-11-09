import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Shared Gemini client instance with telemetry header
  const getGenAI = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Dedicated endpoint for News Image Analysis
  app.post('/api/analyze-news', async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Image data is required' });
      }

      let rawBase64 = image;
      let detectedMime = mimeType || 'image/png';
      if (typeof image === 'string' && image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          detectedMime = matches[1];
          rawBase64 = matches[2];
        } else {
          rawBase64 = image.split(',')[1] || image;
        }
      }

      const ai = getGenAI();
      const imagePart = { inlineData: { mimeType: detectedMime, data: rawBase64 } };
      const prompt = `News Extraction. Return JSON ONLY:
1. newsCategory: Bengali category (e.g. আন্তর্জাতিক 🌍).
2. newsHeader: Catchy headline (<50 chars).
3. hashtags: 8 viral tags.`;

      const generateConfig = {
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              newsCategory: { type: Type.STRING },
              newsHeader: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['newsCategory', 'newsHeader', 'hashtags'],
          },
        },
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          ...generateConfig,
        });
      } catch (err: any) {
        const eMsg = (err.message || '').toLowerCase();
        if (eMsg.includes('429') || eMsg.includes('quota') || eMsg.includes('exhausted')) {
          return res.status(429).json({ error: 'QUOTA_EXHAUSTED', message: err.message });
        }
        console.warn('Primary model hiccup, attempting gemini-3.1-flash-lite...', err);
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            ...generateConfig,
          });
        } catch (err2: any) {
          const eMsg2 = (err2.message || '').toLowerCase();
          if (eMsg2.includes('429') || eMsg2.includes('quota') || eMsg2.includes('exhausted')) {
            return res.status(429).json({ error: 'QUOTA_EXHAUSTED', message: err2.message });
          }
          throw err2;
        }
      }

      const text = response.text || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }

      return res.json({
        newsCategory: parsed.newsCategory || '📌 আপডেট',
        newsHeader: parsed.newsHeader || 'আজকের বিশেষ খবর',
        hashtags: (parsed.hashtags || [])
          .map((t: string) => (t.startsWith('#') ? t : `#${t}`))
          .map((t: string) => t.replace(/\s+/g, '_')),
      });
    } catch (error: any) {
      console.error('Server news analysis error:', error);
      const eMsg = (error.message || '').toLowerCase();
      const status = eMsg.includes('429') || eMsg.includes('quota') ? 429 : 500;
      return res.status(status).json({
        error: error.name || 'SERVER_ERROR',
        message: error.message || 'Internal server error while analyzing news.',
      });
    }
  });

  // Generic endpoint for content generation
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { model = 'gemini-3.8-flash', prompt, contents, config } = req.body;
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model,
        contents: contents || prompt,
        config,
      });
      return res.json({ text: response.text });
    } catch (error: any) {
      const eMsg = (error.message || '').toLowerCase();
      const status = eMsg.includes('429') || eMsg.includes('quota') ? 429 : 500;
      return res.status(status).json({ error: error.message });
    }
  });

  // Streaming endpoint using Server-Sent Events (SSE)
  app.post('/api/gemini/stream', async (req, res) => {
    try {
      const { model = 'gemini-3.8-flash', prompt, contents, config } = req.body;
      const ai = getGenAI();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: contents || prompt,
        config,
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Streaming error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Vite middleware in dev, static serving in prod
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
