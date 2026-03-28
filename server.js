const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Serve from public/ if it exists, otherwise fall back to root directory
const publicDir = require('fs').existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;
app.use(express.static(publicDir));
const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const SYSTEM_PROMPT = `You are an elite code reviewer and programming mentor at Veloflow. Your job is to deeply analyse code submitted by developers, identify weaknesses, and teach them how to improve.

When given code, produce a structured review with these exact sections using markdown:

## Overall Assessment
A 2-3 sentence summary of the code quality, what it does, and the skill level you observe.

## Score
Give a score out of 10 with a one-line justification. Format: **X/10** — reason

## Strengths
Bullet points of what the developer did well. Be specific and encouraging.

## Weak Points & Teaching Moments
For each weakness found:
- **Issue**: What is wrong and where (line/block if possible)
- **Why it matters**: The real-world consequence of this pattern
- **How to fix it**: Show corrected code with a brief explanation
- **Lesson**: The underlying concept they should learn

## Improved Code
Show a fully corrected version of their code with comments explaining key changes.

## What to Study Next
3-5 specific topics, patterns, or concepts this developer should learn next, tailored to the gaps you found. Include brief descriptions of each.

## Quick Wins
2-3 immediate changes they can make right now that will dramatically improve their code quality.

Be honest but encouraging. If the code is beginner level, teach fundamentals. If advanced, go deep. Always explain *why*, not just *what*.`;

// Streaming code review endpoint
app.post('/api/review', async (req, res) => {
  const { code, language } = req.body;

  if (!code || code.trim().length === 0) {
    return res.status(400).json({ error: 'No code provided' });
  }

  // Set up SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const langLabel = language && language !== 'auto' ? `Language: ${language}\n\n` : '';
  const userMessage = `${langLabel}Please review this code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\``;

   try {
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContentStream(SYSTEM_PROMPT + '\n\n' + userMessage);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Claude API error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Review failed' })}\n\n`);
    res.end();
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(publicDir, 'app.html'));
});

app.listen(PORT, () => {
  console.log(`Veloflow running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — set it before reviewing code');
  }
});
