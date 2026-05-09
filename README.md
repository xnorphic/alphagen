# Alpha-Gen Intelligence Dashboard

AI-powered quantitative portfolio dashboard with Claude + OpenAI.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```
VITE_OPENAI_API_KEY=sk-proj-YOUR_KEY
VITE_ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
```

### 3. Run locally
```bash
npm run dev
```

Open `http://localhost:5173` and login with:
- Username: `xnorphic`
- Password: `!Welcome1234`

### 4. Build for production
```bash
npm run build
```

## Deployment

### GitHub Pages
1. GitHub Actions automatically deploys on push to main
2. Visit: `https://xnorphic.github.io/alphagen/`
3. **Note:** Users must provide API keys in the browser (no secrets stored)

**To enable:**
1. Go to Settings → Pages → Source → Deploy from a branch
2. Select `gh-pages` branch
3. Done!

### Vercel (recommended)
1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Select your GitHub repo
3. Set environment variables:
   - `VITE_OPENAI_API_KEY`
   - `VITE_ANTHROPIC_API_KEY`
4. Deploy

**Benefits:** Secure environment variables, automatic deployments, better performance

## Project Structure
```
alphagen/
├── src/
│   ├── main.jsx       # Entry point
│   └── App.jsx        # Main dashboard component
├── index.html
├── package.json
├── vite.config.js
└── .env.example
```

## License

MIT
