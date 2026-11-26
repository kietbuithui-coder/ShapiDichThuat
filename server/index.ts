import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  SourceLanguageCode,
  TranslationRequestPayload,
} from '../src/types/domain';
import { executeTranslation, getServerProviderStatus } from './providers/cloudProviders';
import { lookupCJKWord } from './engine/localCJKEngine';

const PORT = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Health & Provider Capability Endpoint (zero secret exposure)
  app.get('/api/capabilities', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      ...getServerProviderStatus(),
    });
  });

  // Single-utterance contextual translation
  app.post('/api/translate', async (req, res) => {
    try {
      const payload = req.body as TranslationRequestPayload;
      if (!payload || typeof payload.text !== 'string') {
        res.status(400).json({ error: 'Nội dung cần dịch không hợp lệ.' });
        return;
      }
      if (payload.text.length > 4000) {
        res.status(413).json({ error: 'Đoạn văn bản vượt quá giới hạn cho một câu phụ đề.' });
        return;
      }
      const result = await executeTranslation(payload);
      res.json(result);
    } catch {
      res.status(500).json({
        error: 'Dịch vụ dịch thuật gặp sự cố tạm thời. Vui lòng thử lại.',
      });
    }
  });

  // Batch subtitle translation (.SRT / .VTT / .ASS segments) preserving context across cues
  app.post('/api/translate-batch', async (req, res) => {
    try {
      const {
        items,
        sourceLanguage = 'auto',
        styleMode = 'natural',
        naturalnessLevel = 'balanced',
        properNounMode = 'keep-original',
        preferredProvider = 'auto',
        glossary = [],
      } = req.body as {
        items: Array<{ id: string; text: string }>;
        sourceLanguage?: SourceLanguageCode;
        styleMode?: TranslationRequestPayload['styleMode'];
        naturalnessLevel?: TranslationRequestPayload['naturalnessLevel'];
        properNounMode?: TranslationRequestPayload['properNounMode'];
        preferredProvider?: TranslationRequestPayload['preferredProvider'];
        glossary?: TranslationRequestPayload['glossary'];
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Danh sách câu phụ đề trống.' });
        return;
      }
      if (items.length > 500) {
        res.status(413).json({ error: 'Tối đa 500 câu mỗi lượt dịch hàng loạt.' });
        return;
      }

      const contextWindow: NonNullable<TranslationRequestPayload['contextTurns']> = [];
      let prevLang: TranslationRequestPayload['previousDetectedLanguage'] = undefined;
      const results = [];

      for (const item of items) {
        const translated = await executeTranslation({
          text: item.text,
          sourceLanguage,
          styleMode,
          naturalnessLevel,
          properNounMode,
          preferredProvider,
          glossary,
          contextTurns: contextWindow.slice(-6),
          previousDetectedLanguage: prevLang,
        });
        prevLang = translated.detectedLanguage;
        contextWindow.push({
          sourceText: item.text,
          translatedText: translated.translatedText,
        });
        if (contextWindow.length > 8) contextWindow.shift();

        results.push({
          id: item.id,
          ...translated,
        });
      }

      res.json({ results });
    } catch {
      res.status(500).json({
        error: 'Không thể hoàn tất dịch hàng loạt tệp phụ đề.',
      });
    }
  });

  // Word Lookup Endpoint (Section 23.1)
  app.post('/api/lookup-word', async (req, res) => {
    try {
      const { term, sourceLanguage = 'auto', contextSentence } = req.body as {
        term: string;
        sourceLanguage?: SourceLanguageCode;
        contextSentence?: string;
      };
      if (!term || typeof term !== 'string') {
        res.status(400).json({ error: 'Từ cần tra cứu không hợp lệ.' });
        return;
      }
      const lookup = await lookupCJKWord(term, sourceLanguage, contextSentence);
      res.json(lookup);
    } catch {
      res.status(500).json({ error: 'Không thể tra cứu từ vựng lúc này.' });
    }
  });

  const server = http.createServer(app);

  // Real-Time Streaming Translation WebSocket (/ws)
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket: WebSocket) => {
    const sessionContext: NonNullable<TranslationRequestPayload['contextTurns']> = [];
    let prevLang: TranslationRequestPayload['previousDetectedLanguage'] = undefined;

    socket.on('message', async (rawBuf) => {
      try {
        const msg = JSON.parse(rawBuf.toString()) as {
          type: 'translate-stream' | 'ping' | 'reset-context';
          requestId?: string;
          payload?: TranslationRequestPayload;
        };

        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          return;
        }

        if (msg.type === 'reset-context') {
          sessionContext.length = 0;
          prevLang = undefined;
          socket.send(JSON.stringify({ type: 'context-cleared' }));
          return;
        }

        if (msg.type === 'translate-stream' && msg.payload) {
          const result = await executeTranslation({
            ...msg.payload,
            contextTurns: msg.payload.contextTurns?.length
              ? msg.payload.contextTurns
              : sessionContext.slice(-6),
            previousDetectedLanguage:
              msg.payload.previousDetectedLanguage ?? prevLang,
          });

          if (!msg.payload.isInterim && msg.payload.text.trim()) {
            prevLang = result.detectedLanguage;
            sessionContext.push({
              sourceText: msg.payload.text,
              translatedText: result.translatedText,
            });
            if (sessionContext.length > 8) {
              sessionContext.shift();
            }
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'translation-result',
                requestId: msg.requestId,
                isInterim: Boolean(msg.payload.isInterim),
                result,
              })
            );
          }
        }
      } catch {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Không thể xử lý gói tin dịch thời gian thực.',
            })
          );
        }
      }
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server,
          path: '/__vite_hmr',
        },
      },
      appType: 'spa',
    });

    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url?.split('?')[0];
      if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
      // Other upgrades (e.g. /__vite_hmr) are handled by Vite's attached upgrade listener
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });

    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url?.split('?')[0];
      if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LINGUA FLOW] Unified Web + AI Gateway listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[LINGUA FLOW] Fatal startup error:', err);
  process.exit(1);
});
