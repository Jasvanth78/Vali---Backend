# Dynamic AdMob management

The existing Express/Prisma/MongoDB backend, React admin dashboard and Flutter `google_mobile_ads` integration are extended. No AdMob account credentials are stored or exposed.

## Rollout

1. Deploy the backend source and run `npm run db:generate`.
2. Run `npm run db:ads`. This creates only `ad_placements` and `ad_settings` indexes and imports existing legacy ad settings. It never pushes the whole database schema or deletes existing data. An interrupted import can resume. Completed reruns preserve OFF settings, changed IDs and deleted placements.
3. Deploy the rebuilt existing admin dashboard.
4. Release the updated Flutter app once. Already-supported placements then use admin IDs and toggles without further releases.

The local migration has been applied. It imported four existing placement records and six page toggles. Three distinct existing ad formats/IDs were found, on two screens, rather than three screens:

| Page | Slot | Existing format and behavior |
| --- | --- | --- |
| Home | `inline_banner` | Existing medium rectangle below Home content |
| Articles | `between_cards` | Existing medium rectangle every third article-feed page |
| Articles | `article_swipe` | Existing interstitial opportunity every five swipes, now also time capped |
| Articles | `audio_unlock` | Existing explicit Watch Ad audio-unlock action |

The source defaults were banner `ca-app-pub-7492528543078775/9036834997`, interstitial `ca-app-pub-7492528543078775/9527789584`, and rewarded `ca-app-pub-7492528543078775/4636274187`. Any existing `AppContent` overrides take precedence during import. Legacy settings are retained for older builds and clearly labeled in Settings. Upgraded builds use Ad Management.

## Controls and APIs

- Global OFF overrides every page and placement. Global OFF asks for confirmation and saves immediately after confirmation. Global ON and page edits use Save Changes.
- Each placement has its own immediately saved ON/OFF switch and separate Android/iOS ID. Blank platform IDs suppress ads on that platform. Edit/create/delete use validation and delete confirmation.
- Home supports a second optional footer slot. Its supported slots render by `sortOrder`; the old medium rectangle remains unchanged. Fixed slots on other screens retain their locations.
- Additional banner/native slots are mounted below Calendar, below Panchangam, below Festivals, and between every fourth Poster Posts card. None is seeded or automatically enabled.
- Interstitial cap is a minimum interval in seconds (60–86400, default 120), persisted on the device and combined with the existing five-swipe opportunity. No interstitial is added to arbitrary navigation.
- Rewarded loads are opt-in only. Audio is unlocked on an earned reward. The previous free-audio behavior when ads are unavailable/disabled is retained.

Public `GET /api/ad-config` returns global/page state and effective enabled placement records. Missing records are disabled, including deleted placements. Responses use `Cache-Control: no-store`.

Admin endpoints require the existing admin JWT and a matching existing Admin record, with no local bypass:

- `GET /api/admin/ad-placements` includes configuration and supported registry.
- `POST /api/admin/ad-placements`
- `PUT /api/admin/ad-placements/:id`
- `DELETE /api/admin/ad-placements/:id`
- `PATCH /api/admin/ad-placements/:id/status`, body `{ "isEnabled": false }`
- `PUT /api/admin/ad-placements/settings`, body `{ "globalEnabled": true, "pages": { "home": true, "articles": true, "calendar": true, "panchangam": true, "festivals": true, "poster_posts": true } }`

A page/slot pair is unique. Unsupported page/slot/format combinations and AdMob App IDs in Ad Unit ID fields are rejected. Public configuration contains no account tokens or secrets.

## Refresh, consent, and failure handling

Flutter loads configuration at startup, on app resume, on the `ad_config_updated` socket event, on reconnect, and every 60 seconds. Successful snapshots persist locally, including OFF settings. Backend failures retain the latest fetched snapshot; legacy fallback is only allowed before any remote snapshot has ever been accepted. A corrupt saved snapshot fails closed.

Global/page/placement OFF immediately hides inline widgets and disposes their instances when the update arrives. Disabled Article ad pages are removed. No loading/error/disabled placeholder spacing is retained. A fullscreen ad already being displayed is allowed to finish; future requests/shows are blocked. Stale SDK callbacks dispose their ad rather than displaying it.

Google UMP requests consent information at launch, presents required forms, and gates every ad request with SDK `canRequestAds()`. The drawer exposes Ad privacy choices when the SDK requires it. Configure applicable privacy messages in your AdMob account. See [Google consent guidance](https://developers.google.com/admob/flutter/privacy).

Development/profile builds substitute Google's platform-specific test units. Release uses the configured platform units. A release can also be tested using `--dart-define=ADMOB_TEST_ADS=true`. Automated tests mock SDK callbacks and do not request real ads. See [Google test-ad guidance](https://developers.google.com/admob/flutter/test-ads).

## Native AdMob App IDs

The Android manifest and iOS Info.plist currently contain Google's test App IDs and were preserved at the user's request to enter production values later. Ad Unit IDs contain `/` and are managed through admin. App IDs contain `~` and must be configured in the native app build; changing them is not a runtime admin operation. Supply the real platform App IDs and issue a build before serving production ads. The migration faithfully preserves the previous shared Android/iOS unit values; configure genuine platform-specific units in admin for production.

## Adding a future page

Register the page and supported slots once in `mobile_app/assets/ad_registry.json`, and mount `DynamicAdSlot` or `DynamicAdGroup` at the intended locations. Run `npm run ads:registry` in backend to synchronize the deployment copy `config/adRegistry.json`. Deploy that backend registry with the app containing the new slots. Tests enforce that the copies match. Admin loads its page/slot options from this registry. Older apps reject slots not present in their bundled registry.

After that initial deployment, IDs, formats supported by the slot, ordering where supported, and all toggle levels are controlled exclusively through admin. Registry changes cannot create widgets on arbitrary screens.

## Verification limits

Database/API, React component, mocked SDK and Flutter page regression tests cover settings, authentication, IDs, cache fallback, consent gates, opt-in rewards, ad disposal and failure handling. Android debug APK compilation is verified. No mobile device or macOS/iOS toolchain is available here; actual ad rendering, live AdMob inventory, platform consent forms and iOS compilation require device verification. No production ads or account API calls were used in automated testing.
