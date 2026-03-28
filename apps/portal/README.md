# @tash8eel/portal

Admin dashboard for the Tash8eel Operations Platform.

## Overview

A Next.js 14 application providing a real-time dashboard for:

- **Merchants**: View orders, conversations, analytics
- **Admins**: Manage merchants, monitor system health, view DLQ

## Features

- 🌐 **Arabic RTL Support** - Full right-to-left layout
- 📊 **Real-time Dashboard** - Live order and conversation updates
- 💬 **Conversation Takeover** - Human agent intervention
- 📈 **Analytics** - Token usage, order statistics, performance metrics
- 🔐 **Role-based Access** - Merchant vs Admin views

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State**: React Query for server state
- **Auth**: JWT-based authentication
- **Language**: TypeScript

## Directory Structure

```
src/
├── app/                # Next.js App Router pages
│   ├── admin/          # Admin dashboard pages
│   ├── merchant/       # Merchant dashboard pages
│   ├── layout.tsx      # Root layout with RTL support
│   └── page.tsx        # Home/login page
├── components/         # Reusable React components
└── lib/                # Utilities, API client, hooks
```

## Environment Variables

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000

# Realtime (Socket.IO)
NEXT_PUBLIC_WS_URL=http://localhost:3000
NEXT_PUBLIC_WS_ENABLED=true

# Authentication
NEXT_PUBLIC_AUTH_DOMAIN=tash8eel.com

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

## Development

```bash
# Install dependencies (from monorepo root)
npm install

# Run in development mode
npm run dev:portal

# Build for production
npm run build:portal
```

## Scripts

```bash
npm run dev       # Development server (port 3001)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

## Docker

```bash
# Build image
docker build -f apps/portal/Dockerfile -t tash8eel-portal .

# Run container
docker run -d --name portal \
  -p 3001:3001 \
  -e NEXT_PUBLIC_API_URL=http://api:3000 \
  tash8eel-portal
```

## Pages

### Merchant Dashboard (`/merchant`)

- Order management
- Conversation history
- Token usage tracking
- Catalog management

### Admin Dashboard (`/admin`)

- All merchants overview
- System health monitoring
- Dead Letter Queue management
- Global analytics

## RTL Support

The portal uses `dir="rtl"` on the root layout with Tailwind's RTL utilities:

```tsx
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        arabic: ["Cairo", "sans-serif"],
      },
    },
  },
};
```

## API Integration

The portal communicates with the API service using:

- REST endpoints for CRUD operations
- JWT tokens for authentication
- Correlation IDs for request tracing
