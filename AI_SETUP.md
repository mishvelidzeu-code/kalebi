# AI setup

This project is now prepared for text-based AI without adding extra native modules.

## What was added

- `services/ai.js`
  - App-side helper for calling a Supabase Edge Function.
- `supabase/functions/ai-assistant/index.ts`
  - Server-side function that forwards requests to the OpenAI Responses API.
- `supabase/functions/_shared/cors.ts`
  - Shared CORS headers for the function.
- `.env.example`
  - Public app variables only.

## Why this structure

OpenAI's official API docs say API keys must not be exposed in client-side code such as mobile apps. Keep the OpenAI key on the server side only and call it through your backend layer.

For this app, the safest simple path is:

`Expo app -> Supabase Edge Function -> OpenAI`

## What you do not need

- No extra Expo native plugin for basic text AI
- No new native Android or iOS module
- No change to `app.json` just for text prompts

Your current Expo development build setup is already enough for this architecture.

## Required secrets

Do not put the OpenAI key in `.env` with `EXPO_PUBLIC_*`.

Instead, set these server-side in Supabase:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional, for example `gpt-5.4-mini`

## Suggested setup flow

1. Install and login to Supabase CLI if needed.
2. Link the project if it is not linked yet.
3. Set the server secret:

```bash
supabase secrets set OPENAI_API_KEY=your_key_here
supabase secrets set OPENAI_MODEL=gpt-5.4-mini
```

4. Deploy the function:

```bash
supabase functions deploy ai-assistant
```

5. From the app, call:

```js
import { generateAiResponse } from "../services/ai";

const result = await generateAiResponse({
  prompt: "მომეცი მოკლე რჩევა PMS-ის დროს თვითმოვლისთვის",
  context: {
    screen: "calendar",
    locale: "ka-GE",
  },
});
```

6. Use `result.text` in your UI.

## Local development notes

- Expo app reads only the public Supabase values.
- The Edge Function reads the OpenAI key on the server side.
- If you later want voice or realtime AI, then we should review native permissions and audio flow separately.

## Dev build

This repo already includes `expo-dev-client`, so for a development build you can continue using your current EAS profile.

Typical flow:

```bash
eas build --profile development --platform android
```

or

```bash
eas build --profile development --platform ios
```

Then run the Metro server as usual:

```bash
npx expo start --dev-client
```
