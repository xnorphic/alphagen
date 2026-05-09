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

### Vercel (recommended)
1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New Project
3. Select your GitHub repo
4. Add environment variables in Settings
5. Deploy

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
