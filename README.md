# Nearby Eats

A mobile-responsive Next.js app that detects your current location and lists restaurants within **1,000 feet**, sorted closest to furthest.

## Features

- Automatic geolocation on page load
- Displays restaurant **name**, **address**, **phone number**, and **website**
- Sorted by distance (closest first)
- Shows open/closed status and star ratings
- Mobile-first responsive design
- Refresh button to re-fetch results

## Setup

### 1. Get a Google Maps API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the following APIs:
   - **Places API** (for nearby restaurant search)
   - **Maps JavaScript API** (optional, for future map view)
4. Create an API key under **Credentials**

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and add your key:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 3. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** Geolocation requires HTTPS in production. In development, `localhost` works fine.

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Google Places API](https://developers.google.com/maps/documentation/places/web-service/nearby-search) — Nearby Search + Place Details
- TypeScript
