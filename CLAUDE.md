# CLAUDE.md

ეს ფაილი Claude Code-ს (claude.ai/code) აძლევს კონტექსტს ამ repo-ში მუშაობისას.

## პროექტი

**Cycle Care** (მარკეტინგული სახელი "Qalis Sivrce") — ქართულენოვანი (ka-GE) მენსტრუალური ციკლის თრექინგის Expo/React Native აპი, პარალელური ორსულობის რეჟიმით და OpenAI-ზე დაფუძნებული AI ასისტენტით. Bundle ID `com.mishvela.kalebi`, EAS slug `kalebi`.

Backend: Supabase (Auth, DB, Edge Functions). AI: OpenAI-ს იძახებს მხოლოდ `supabase/functions/ai-assistant/index.ts` — OpenAI key ყოველთვის სერვერზეა, არასდროს frontend-ში (იხ. `AI_SETUP.md`).

---

## ბოლოს რა გავაკეთეთ (ბოლო სესიის snapshot)

> ეს სექცია ყოველთვის უნდა აჩვენებდეს ყველაზე ახალ მდგომარეობას — ახალი სესიის დაწყებისას აქედან დაიწყე, `git log`/`git status`-ის თავიდან აწარმოების ნაცვლად. საჭიროებისამებრ განაახლე.

**ბოლო commit** — `9bfd071` "Fix input row layout to row — collapsible WhatsApp-style in both assistants" (2026-07-09-მდე პერიოდი): admin/symptoms AI ასისტენტების input UX გასწორდა (row layout, ავტო-keyboard dismiss send-ზე, გაფართოებადი input).

**Uncommitted (working tree, ჯერ commit არ არის)**:
- `app/(tabs)/_layout.tsx`, `app/(tabs)/profile.js`, `app/(tabs)/symptoms.js`, `app/admin.jsx`, `context/PregnancyContext.js`, `services/purchases.js`, `supabase/functions/ai-assistant/index.ts` — მოდიფიცირებული, commit არ არის.
- `supabase/migrations/20260706_create_assistant_ai_usage.sql` (untracked, ახალი) — `assistant_ai_usage` table + `consume_assistant_ai_usage`/`refund_assistant_ai_usage` RPC-ები დღიური AI ლიმიტისთვის (Asia/Tbilisi timezone).
- `deno.lock` (untracked, ახალი).
- ეს ყველაფერი ერთად მიანიშნებს **AI usage limiting**-ის აქტიურ მუშაობაზე (ახალი migration + edge function ცვლილებები ერთმანეთს ემთხვევა) — გადაამოწმე migration აპლიცირებულია თუ არა remote Supabase-ზე, სანამ დაეყრდნობი.
- `supabase/.temp/*` — CLI cache ფაილები, გავიდა git-ში ტრექინგში (უჩვეულოა, სავარაუდოდ `.gitignore`-ში უნდა ჩავარდეს, თუმცა ეს ცალკე გადასაწყვეტია, არავითარ შემთხვევაში არ წაშალო ხელით user-თან შეთანხმების გარეშე).

---

## Commands

```powershell
cd cycle-app   # ან იმ დირექტორიის root, სადაც ეს package.json-ია

npx expo start              # dev server
npx expo start --dev-client # dev client-ით
npm run android
npm run ios
npm run web
npm run lint                # expo lint
```

ტესტი (`test` script) არ არსებობს ამ პროექტში.

### Supabase
```powershell
npx supabase functions deploy ai-assistant
npx supabase functions deploy send-push-notification
npx supabase db push --linked
```

---

## არქიტექტურა

### Routing (`app/`, expo-router)
- `_layout.tsx` — root Stack (`headerShown: false`, fade animation). Provider ჯაჭვი: `ThemeProvider` → `PregnancyProvider` → `OnboardingProvider` → `LayoutContent`. Mount-ზე: Meta app events init, profile email sync, push token register, `supabase.auth.onAuthStateChange` subscribe.
- `index.jsx` — `<Redirect href="/splash" />`.
- `splash.jsx` — სესიის მდგომარეობის მიხედვით რაუთინგი (auth/onboarding/tabs).
- `auth/` — `login.jsx`, `register.jsx`.
- `onboarding/` — 7 ნაბიჯიანი wizard (name, birth, protection, health, cycle-length, last-period, notifications) + `_layout.js`.
- `(tabs)/` — მთავარი tab navigator: `_layout.tsx` (tab bar + floating "AdminAssistant" chat widget), `index.js` (home), `calendar.js`, `statistics.js`, `symptoms.js` (AI chat assistant UI-იც აქ ცხოვრობს), `profile.js`.
- `admin.jsx` — admin dashboard (root-level, `(tabs)`-ის გარეთ).
- `premium.jsx` / `pregnancy-premium.jsx` — paywall-ები.

### State / Context (`context/`)
- **`ThemeContext.js`** — თემა + `isPremium`/`isAdmin`/`usePremiumTheme` (persist AsyncStorage-ში, key `cycle_app_use_premium_theme`). `checkPremiumStatus()` თანმიმდევრობა: admin email (`services/adminAccess.js`) → `profiles.premium_override` → `resolvePremiumAccessFromProfile` + RevenueCat sync (`services/purchases.js`). AppState foreground-ზეც re-check-ავს.
- **`PregnancyContext.js`** — `profiles.pregnancy_mode`/`pregnancy_start_date`/`has_pregnancy_subscription`/`pregnancy_until`-დან ითვლის `currentWeek`(≤40)/`currentTrimester`(week 12/27 threshold)/`daysRemaining`(280-day gestation). `enablePregnancyMode`/`updatePregnancyStartDate`/`disablePregnancyMode`.
- **`components/OnboardingContext.js`** — onboarding wizard ფორმის state (მიუხედავად სახელისა, `context/`-ში კი არა, `components/`-შია).

⚠️ **`წაიკითხე.txt`** root-ში დეველოპერის ძველი scratch note-ია, შეიცავს `ThemeContext.js`-ის მოძველებულ ასლს — **არ ეყრდნობი**, მიმდინარე `context/ThemeContext.js`-ს გადაამოწმებ ყოველთვის.

### Services (`services/`)
| ფაილი | პასუხისმგებლობა |
|---|---|
| `supabase.js` | Supabase client, AsyncStorage session persistence |
| `ai.js` | თხელი client wrapper → Edge Function `ai-assistant` (`EXPO_PUBLIC_AI_FUNCTION_NAME`) |
| `assistantOrchestrator.js` | AI system prompt-ების აწყობა (cycle-assistant + pregnancy-assistant, ორივე ქართულად, დინამიური context injection), 45s in-memory cache |
| `purchases.js` | RevenueCat (`prime` + `pregnancy` entitlements). Android-ზე web-checkout fallback (`openAndroidPrimeCheckout`/`...Pregnancy...`) — `profiles` table წყაროდ ითვლება, არა RevenueCat SDK |
| `adminAccess.js` | Hardcoded `ADMIN_EMAILS` — ამჟამად `mishvelidze.u@gmail.com` |
| `adminQuery.js` | Local keyword-based ქართული NLP admin chatbot-ისთვის (LLM-ის გარეშე) |
| `notifications.js` | Push notification schedule (cycle reminders, pregnancy weekly) |
| `metaAppEvents.js` | Facebook SDK event log (purchases, app events) |
| `profileSync.js` | auth email → `profiles.email` sync |
| `cycleDataMigration.js` | ძველი cycle data ფორმატის მიგრაცია |

### Hooks / Utils
- `hooks/useCycles.js` — cycle CRUD (`cycles` table), fallback `profiles.last_period`-ზე, calendar `markedDates` აწყობა (`utils/cycleEngine.js`-ით).
- `utils/cycleEngine.js` — სუფთა ციკლის მათემატიკა: `calculateCycleState`, `getCycleWindowDates`, `getCyclePhaseKey` (period/follicular/fertile/luteal), `getPregnancyChanceKey`. Ovulation = შემდეგი პერიოდის −14 დღე; fertile window = ovulation −5..+1.

### Supabase DB
ძირითადი tables: `profiles` (name, phone_number, email, cycle/period length, last_period, premium/pregnancy ველები), `cycles`, `assistant_chat_history`, `billing_entitlements`, `assistant_ai_usage` (ახალი, დღიური AI ლიმიტი).

Migrations (`supabase/migrations/`, ქრონოლოგიურად): phone_number → premium reset → premium_override → assistant_chat_history → profile email/created_at + admin RLS → premium billing fields → `billing_entitlements` (გენერალიზებული entitlement ledger prime/pregnancy) → `assistant_ai_usage` + rate-limit RPC-ები.

Edge Functions (`supabase/functions/`):
- **`ai-assistant/index.ts`** — auth ვალიდაცია, premium/pregnancy სტატუსის სერვერ-საიდ resolve, დღიური ლიმიტები (chat: free 1/day, pregnancy 10/day, prime 20/day; feature-calls — daily-advice/diary-support/pregnancy-weekly — 30/day თითოეული; admin unlimited). OpenAI Responses API (`gpt-5.4-mini` default, `OPENAI_MODEL` secret). წარუმატებლობაზე `refund_assistant_ai_usage` RPC-ით აბრუნებს quota-ს.
- **`send-push-notification/index.ts`** — server-side push sender.
- **`_shared/cors.ts`** — CORS headers helper.

---

## Product rules (Free vs Prime vs Pregnancy)

- **ორი premium tier**: **Prime** (მუქი თემა + AI chat quota ზრდა) და **Pregnancy** (ცალკე subscription, ორსულობის რეჟიმი). RevenueCat iOS/Android-ზე, Android-ზე დამატებით web-checkout fallback (`EXPO_PUBLIC_ANDROID_PRIME_PAYMENT_URL`/`..._PREGNANCY_PAYMENT_URL`).
- Premium access resolution თანმიმდევრობა: `premium_override` (admin manual) > `is_premium && premium_until` ვადა > legacy fallback (თუ `premium_until` არ არის — აქტიურად ითვლება, pre-expiry-tracking row-ებისთვის).
- Admin (`mishvelidze.u@gmail.com`) ავტომატურად იღებს Prime-ს + unlimited AI + admin dashboard/chatbot წვდომას.
- AI chat დღიური ლიმიტები: Free 1, Pregnancy 10, Prime 20; feature-calls (daily-advice, diary-support, pregnancy-weekly) 30/day ყველასთვის, Tbilisi timezone-ის მიხედვით.
- ინტერფეისი/AI პრომფტები/admin ტექსტი — ყველგან ქართული (ka-GE).

---

## მნიშვნელოვანი დეტალები

- **AI Edge Function**: `supabase/functions/ai-assistant/index.ts` — `OPENAI_API_KEY` მხოლოდ Supabase secret-ში. მოდელი `gpt-5.4-mini` default.
- **Android premium**: RevenueCat/Play Billing-ის ნაცვლად web checkout-ზეა გადამისამართებული (`services/purchases.js`), `profiles` table-ია წყარო, არა RevenueCat SDK პასუხი.
- **admin email hardcoded** `services/adminAccess.js`-ში — ახალი admin-ის დამატება ამ ფაილში ხდება.
- **`supabase/.temp/`** git-ში ტრექინგშია (უჩვეულოა) — ნუ წაშლი, user-თან შეთანხმების გარეშე.
- **`constants/theme.ts`** — Expo scaffold-ის default ფერებია, სავარაუდოდ აღარ გამოიყენება (`ThemeContext.js`-მა ჩაანაცვლა).
- **Georgian encoding**: PowerShell-ი ზოგჯერ ქართულს mojibake-ად აჩვენებს, ფაილები UTF-8-ია — ტექსტი არ შეცვალო სანამ browser/app-ში გატეხილი არ ჩანს.

---

## შესრულებული სამუშაოების ისტორია (ბოლო commit-ები, დეტალებისთვის `git log`)

- `9bfd071` Fix input row layout — collapsible WhatsApp-style ორივე ასისტენტში
- `220b2f2` Auto-dismiss keyboard on send, expandable input
- `8484a52` Move admin assistant to floating button, hide symptoms tab for admin
- `13345e2` Fix avatar loading — fallback getPublicUrl
- `a474d3c` Full-screen avatar preview modal admin panel-ში
- `606594c` Revert version to 1.0.6 (OTA compatibility)
- `dfae5e5`/`2ba9a02` Metro parse error ფიქსები (curly quotes)
- `26e039b` Admin photo viewer, users-with-photos stat, admin assistant დამატება
- `d52f2b2` Android web premium checkout support
- `64e813e` Meta app events ინტეგრაცია
