# MusicWave V2 Final

Добавлено:
- VK Audio Search через VK API (если токен разрешает `audio.search`);
- выбор источника: Все / Apple Music / YouTube / VK;
- громкость + mute icon + сохранение уровня;
- liquid-glass эффекты;
- адаптация плеера и интерфейса под телефон;
- PWA;
- Supabase anonymous account;
- Spotify PKCE.

## VK

В `config.js` укажи:
`window.MUSICWAVE_CONFIG = { vkAccessToken: "...", vkApiVersion: "5.199", ... }`

Токен нельзя считать полностью безопасным, если он размещён в статическом фронтенде. Для публичного GitHub Pages лучше проксировать VK API через serverless backend (Cloudflare Worker / Vercel / Supabase Edge Function) и держать секреты на сервере.

Кроме того, VK API может не вернуть URL аудио. В таком случае трек отображается только если API вернул воспроизводимый URL. MusicWave не скачивает и не извлекает аудио из VK/YouTube.

## Автоматический аккаунт

Supabase Anonymous Auth создаёт аккаунт без формы регистрации. Для настоящего переноса на другое устройство добавь Google/Apple OAuth и кнопку "Сохранить аккаунт".

## GitHub Pages

1. Скопируй `config.example.js` → `config.js`.
2. Заполни ключи.
3. Залей файлы в репозиторий.
4. Settings → Pages → Deploy from branch → `main` → `/root`.

Для продакшена VK и любые секреты лучше вынести в serverless backend.
