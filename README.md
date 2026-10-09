# Navbat-free

Tibbiy navigator: eng yaqin shifoxonalar, marshrut, navbatsiz yozilish, SMS eslatma va tahlil blankini sodda tilda tushuntirish. Next.js 15 (App Router), UZ / RU / EN, yorug' va qorong'i mavzu.

## Ishga tushirish

```bash
npm install
cp .env.example .env.local   # kalitlarni to'ldiring
npm run dev                  # http://localhost:3000
```

## Nima qayerdan keladi

| Funksiya | Manba | Kalit kerakmi |
|---|---|---|
| Joylashuv | Brauzer Geolocation API (HTTPS yoki localhost) | yo'q |
| Shifoxona, klinika, dorixonalar | OpenStreetMap: Overpass API, band bo'lsa Nominatim | yo'q (`OSM_CONTACT` tavsiya) |
| Marshrut (mashina / piyoda / velosiped) | OSRM: routing.openstreetmap.de | yo'q |
| Manzil qidirish va manzil matni | Nominatim | yo'q |
| Xarita plitalari | tile.openstreetmap.org | yo'q |
| SMS | Eskiz.uz | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` |
| Tahlil blankini o'qish | Claude API (`claude-opus-5-5`) | `ANTHROPIC_API_KEY` |

Kalitlarsiz sayt ishlaydi: SMS demo rejimda matnni ko'rsatadi, tahlil bo'limida namunalar ishlaydi.

## API

- `GET /api/places?lat&lon&r` — radius ichidagi tibbiy muassasalar
- `GET /api/route?fromLat&fromLon&toLat&toLon&mode=car|foot|bike` — marshrut va qadam-baqadam ko'rsatmalar
- `GET /api/geocode?q=` yoki `?lat&lon` — manzil ↔ koordinata
- `POST /api/sms {phone, text}` — Eskiz orqali SMS
- `POST /api/analyze {lang, images[]}` — blank rasmidan tuzilgan natija (JSON schema)

## Cheklovlar

- Yozuvlar brauzerdagi `localStorage` da saqlanadi; server bazasi yo'q.
- 1 soat oldingi eslatma hozir sahifa ochiq turganda yuboriladi (brauzer bildirishnomasi + SMS). Sahifa yopiq bo'lsa ham ishlashi uchun yozuvlarni bazaga yozish va cron (masalan, Vercel Cron har 5 daqiqada) kerak.
- Eskiz yangi akkauntlarda faqat tasdiqlangan SMS shablonlarini yuboradi — matnlarni oldindan tasdiqlating.
- Overpass, Nominatim va OSRM ochiq serverlari bepul, lekin yuklama cheklovi bor. Ishlab chiqarishda o'z serveringiz yoki pullik tarif kerak.
- Narxlar, slot bandligi va onlayn to'lov — demo. Tibbiy matnlarni shifokor tekshirishi kerak.
