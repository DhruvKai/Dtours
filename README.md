# Dtours

A tour-booking web app for treks across Himachal Pradesh and Uttarakhand, built with
Node.js, Express, MongoDB/Mongoose and Pug. It includes JWT authentication, password
reset by email, image uploads with resizing, Stripe checkout, reviews and Mapbox maps.

## Live demo (front end only)

The [`docs/`](docs/) folder is a static, backend-free version of the site for portfolio
hosting. It uses the same styles, images and seed data (`dev-data/realData`):

- Tours, guides and reviews are loaded from `docs/js/data.js` instead of MongoDB.
- Login, signup, account settings and bookings are simulated in `localStorage`.
  Demo login: `admin@tours.io` / `test1234`.
- "Book tour" records a booking locally instead of redirecting to Stripe.
- Maps use Leaflet + OpenStreetMap, so no API key is needed.

Run it locally with any static server, e.g. `npx serve docs`.

**Deploy:** on GitHub, go to *Settings → Pages* and set the source to *Deploy from a
branch* with branch `master` and folder `/docs`. On Netlify or Vercel, use `docs` as the
publish directory, with no build command.

## Full app

```bash
npm install
# create config.env with DATABASE, DATABASE_PASSWORD, JWT_SECRET, STRIPE_SECRET_KEY, email settings, etc.
npm run dev
```
