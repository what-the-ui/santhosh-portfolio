require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(path.join(__dirname)));

app.post('/analyze', upload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files?.image1 || !req.files?.image2) {
      return res.status(400).json({ success: false, error: 'Both images are required.' });
    }

    const image1 = req.files['image1'][0];
    const image2 = req.files['image2'][0];

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(image1.mimetype) || !validTypes.includes(image2.mimetype)) {
      return res.status(400).json({ success: false, error: 'Images must be JPEG, PNG, GIF, or WebP.' });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a senior UI/UX design analyst with expertise in design systems and visual QA.

Compare the two UI screenshots carefully. Image 1 is the BEFORE/original. Image 2 is the AFTER/updated version.

Analyze every visual difference you can detect and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON:

{
  "summary": "2-3 sentence overview of the key changes between the two designs",
  "differences": {
    "colors": [
      {
        "element": "specific element or location (e.g. 'Primary button background', 'Header text', 'Card border')",
        "image1": "hex code or description (e.g. '#FF6101' or 'coral orange')",
        "image2": "hex code or description",
        "impact": "high|medium|low",
        "note": "optional context about why this matters"
      }
    ],
    "typography": [
      {
        "element": "specific element (e.g. 'Hero headline', 'Body text', 'Button label')",
        "property": "font-size|font-family|font-weight|line-height|letter-spacing|text-transform",
        "image1": "value (e.g. '16px', 'Inter', '400')",
        "image2": "value",
        "impact": "high|medium|low",
        "note": "optional context"
      }
    ],
    "spacing": [
      {
        "element": "specific element or region",
        "property": "padding|margin|gap|line-height|section-spacing",
        "image1": "estimated value or description (e.g. '8px', 'tight', '~16px')",
        "image2": "estimated value or description",
        "impact": "high|medium|low",
        "note": "optional context"
      }
    ],
    "layout": [
      {
        "element": "specific element or section",
        "description": "what changed about the layout",
        "image1": "layout description",
        "image2": "layout description",
        "impact": "high|medium|low",
        "note": "optional context"
      }
    ],
    "other": [
      {
        "element": "specific element",
        "description": "what changed (icons, images, borders, shadows, opacity, etc.)",
        "image1": "description",
        "image2": "description",
        "impact": "high|medium|low",
        "note": "optional context"
      }
    ]
  },
  "totalDifferences": <integer count of all items across all categories>,
  "impactSummary": { "high": <count>, "medium": <count>, "low": <count> },
  "criticalChanges": ["top 3-5 most important differences as plain strings"]
}`
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: image1.mimetype, data: image1.buffer.toString('base64') }
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: image2.mimetype, data: image2.buffer.toString('base64') }
          }
        ]
      }]
    });

    let analysis;
    try {
      const raw = response.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      analysis = JSON.parse(raw);
    } catch {
      return res.status(500).json({ success: false, error: 'Failed to parse AI response. Please try again.' });
    }

    res.json({ success: true, analysis });

  } catch (err) {
    console.error('Analysis error:', err);
    const message = err.status === 401
      ? 'Invalid API key. Check your ANTHROPIC_API_KEY in the .env file.'
      : err.message || 'Analysis failed. Please try again.';
    res.status(500).json({ success: false, error: message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  Design Review running at http://localhost:${PORT}\n`);
});
