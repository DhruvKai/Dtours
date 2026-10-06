/* eslint-disable */
/*
 * Front-end-only version of Dtours.
 * Replaces the Express/MongoDB/Pug backend with static data (data.js) and
 * localStorage, so the site can be hosted on any static host for a demo.
 */
(function () {
  const { tours: rawTours, users, reviews, credits } = window.DATA;
  const DEMO_EMAIL = 'admin@tours.io';
  const DEMO_PASSWORD = 'test1234';
  const REPO_URL = 'https://github.com/DhruvKai/Dtours';

  // ---------------------------------------------------------------- helpers
  const esc = (str) =>
    String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  const qs = (key) => new URLSearchParams(location.search).get(key);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const icon = (name, weight = 'ph') => `<i class="${weight} ph-${name}" aria-hidden="true"></i>`;
  const photo = (file) => `img/photos/${file}`;
  const userPhoto = (p) => (p && p.startsWith('data:') ? p : `img/users/${p || 'default.jpg'}`);
  const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  const firstName = (name) => String(name).trim().split(' ')[0];
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`dtours:${key}`);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(`dtours:${key}`, JSON.stringify(value));
      } catch (e) {}
    },
    remove(key) {
      try {
        localStorage.removeItem(`dtours:${key}`);
      } catch (e) {}
    }
  };

  // Seed dates are from 2022; roll each one forward by whole years so the
  // demo always shows upcoming departures.
  const upcomingDates = (dates) => {
    const now = new Date();
    const rolled = dates.map((d) => {
      const date = new Date(d);
      while (date < now) date.setFullYear(date.getFullYear() + 1);
      return date.getTime();
    });
    return [...new Set(rolled)].sort((a, b) => a - b).map((t) => new Date(t));
  };
  const fmtMonth = (d) => d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
  const fmtDate = (d) => d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ------------------------------------------------------------------- data
  const userById = Object.fromEntries(users.map((u) => [u._id, u]));
  const tours = rawTours.map((t, i) => ({
    ...t,
    id: t._id,
    order: i,
    dates: upcomingDates(t.startDates),
    guides: t.guides.map((id) => userById[id]).filter(Boolean),
    reviews: reviews.filter((r) => r.tour === t._id).map((r) => ({ ...r, user: userById[r.user] }))
  }));
  const tourById = Object.fromEntries(tours.map((t) => [t.id, t]));

  // ------------------------------------------------------------------- auth
  const auth = {
    current: () => store.get('session', null),
    login(email, password) {
      email = email.trim().toLowerCase();
      const seeded = users.find((u) => u.email.toLowerCase() === email);
      const local = store.get('users', []).find((u) => u.email === email);
      if (seeded && password === DEMO_PASSWORD) return this.start(seeded);
      if (local && local.password === password) return this.start(local);
      throw new Error('That email and password don’t match. Try the demo account above.');
    },
    signup(name, email, password, passwordConfirm) {
      email = email.trim().toLowerCase();
      if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
      if (password !== passwordConfirm) throw new Error('The two passwords don’t match.');
      const local = store.get('users', []);
      if (users.some((u) => u.email.toLowerCase() === email) || local.some((u) => u.email === email))
        throw new Error('An account with that email already exists. Log in instead.');
      // Demo only: stored in this browser's localStorage, never sent anywhere.
      const user = { _id: `local-${Date.now()}`, name: name.trim(), email, role: 'user', photo: 'default.jpg', password };
      store.set('users', [...local, user]);
      return this.start(user);
    },
    start(user) {
      const { password, ...session } = user;
      const overrides = store.get(`profile:${user._id}`, {});
      store.set('session', { ...session, ...overrides });
      return true;
    },
    update(fields) {
      const user = this.current();
      store.set(`profile:${user._id}`, { ...store.get(`profile:${user._id}`, {}), ...fields });
      store.set('session', { ...user, ...fields });
    },
    logout: () => store.remove('session')
  };

  const bookings = {
    list: (user) =>
      store
        .get(`bookings:${user._id}`, [])
        .map((b) => (typeof b === 'string' ? { tourId: b } : b))
        .filter((b) => tourById[b.tourId]),
    add(user, tourId, date) {
      const list = this.list(user).filter((b) => !(b.tourId === tourId && b.date === date));
      store.set(`bookings:${user._id}`, [...list, { tourId, date, bookedAt: Date.now() }]);
    }
  };

  // ----------------------------------------------------------------- toasts
  let toastTimer;
  const showToast = (type, msg, seconds = 4) => {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = `toast toast--${type}`;
    el.innerHTML = `${icon(type === 'success' ? 'check-circle' : 'warning-circle', 'ph-fill')}<span>${esc(msg)}</span>`;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), seconds * 1000);
  };
  // Messages that should survive a redirect
  const flash = (type, msg) => store.set('flash', { type, msg });

  // ----------------------------------------------------------------- layout
  const brandMark = `
    <svg class="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M2 26 12 9l5.5 9.2L21 13l9 13H2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="m9.2 13.6 2.8 2.2 2.6-2.4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;

  const header = (user, page, overHero) => `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header${overHero ? ' is-over-hero' : ''}">
      <div class="container site-header__inner">
        <a class="brand" href="index.html" aria-label="Dtours home">${brandMark}<span>Dtours</span></a>
        <nav class="site-nav" aria-label="Main">
          <a href="index.html#tours" ${page === 'overview' ? 'aria-current="page"' : ''}>Tours</a>
          ${
            user
              ? `<a href="my-tours.html" ${page === 'my-tours' ? 'aria-current="page"' : ''}>${icon('suitcase-rolling')}<span class="label-optional">My bookings</span></a>`
              : ''
          }
        </nav>
        <div class="user-nav">
          ${
            user
              ? `<a class="user-nav__link" href="account.html" ${page === 'account' ? 'aria-current="page"' : ''}>
                   <img class="user-nav__avatar" src="${esc(userPhoto(user.photo))}" alt="">
                   <span class="label-optional">${esc(firstName(user.name))}</span>
                 </a>
                 <button class="user-nav__link js-logout" type="button" style="border:0;background:none;cursor:pointer" aria-label="Log out">
                   ${icon('sign-out')}<span class="label-optional">Log out</span>
                 </button>`
              : `<a class="user-nav__link" href="login.html">Log in</a>
                 <a class="btn btn--dark btn--sm" href="signup.html">Sign up</a>`
          }
        </div>
      </div>
    </header>`;

  const footer = () => `
    <footer class="site-footer">
      <div class="container">
        <div class="site-footer__top">
          <div>
            <a class="brand" href="index.html">${brandMark}<span>Dtours</span></a>
            <p class="site-footer__tagline">Small-group treks across Himachal Pradesh and Uttarakhand, led by local guides.</p>
          </div>
          <div class="footer-links">
            <div>
              <h3>Explore</h3>
              <ul>
                <li><a href="index.html#tours">All tours</a></li>
                <li><a href="my-tours.html">My bookings</a></li>
                <li><a href="account.html">Account</a></li>
              </ul>
            </div>
            <div>
              <h3>Project</h3>
              <ul>
                <li><a href="${REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a></li>
                <li><a href="credits.html">Photo credits</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="site-footer__bottom">
          <span>&copy; ${new Date().getFullYear()} Dhruv Kaith</span>
          <span>Demo site. Accounts and bookings are stored only in your browser.</span>
        </div>
      </div>
    </footer>`;

  const lostPage = (code, title, msg) => `
    <main id="main" class="lost">
      <div>
        <div class="lost__code">${code}</div>
        <h1>${esc(title)}</h1>
        <p>${esc(msg)}</p>
        <a class="btn btn--dark" href="index.html">${icon('arrow-left')} Back to all tours</a>
      </div>
    </main>`;

  const stars = (rating) =>
    `<span class="stars" aria-label="${rating} out of 5 stars">${[1, 2, 3, 4, 5]
      .map((s) => `<i class="ph-fill ph-star${rating >= s ? '' : ' is-off'}" aria-hidden="true"></i>`)
      .join('')}</span>`;

  // --------------------------------------------------------------- overview
  const tourCard = (tour, i, feature) => `
    <a class="tour-card reveal${feature ? ' tour-card--feature' : ''}" style="--delay:${(i % 3) * 80}ms" href="tour.html?slug=${tour.slug}">
      <div class="tour-card__media">
        <img src="${photo(feature ? tour.imageCover : tour.imageCard)}" alt="${esc(tour.name)}" loading="${i < 3 ? 'eager' : 'lazy'}">
        <div class="tour-card__tags">
          <span class="tag">${cap(esc(tour.difficulty))}</span>
          <span class="tag">${icon('star', 'ph-fill')} ${tour.ratingsAverage}</span>
        </div>
      </div>
      <div class="tour-card__body">
        <div class="tour-card__meta">
          <span>${icon('map-pin')} ${esc(tour.startLocation.description)}</span>
          <span>${icon('clock')} ${plural(tour.duration, 'day')}</span>
        </div>
        <h3 class="tour-card__title">${esc(tour.name)}</h3>
        <p class="tour-card__summary">${esc(tour.summary)}</p>
        <div class="tour-card__foot">
          <span><span class="price tabular">${rupees(tour.price)}</span> / person</span>
          <span>Next: ${fmtMonth(tour.dates[0])}</span>
        </div>
      </div>
    </a>`;

  const sorters = {
    recommended: (a, b) => a.order - b.order,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    duration: (a, b) => a.duration - b.duration,
    rating: (a, b) => b.ratingsAverage - a.ratingsAverage
  };

  const tourGrid = (difficulty, sort) => {
    const list = tours.filter((t) => difficulty === 'all' || t.difficulty === difficulty).sort(sorters[sort]);
    if (!list.length)
      return `<div class="empty">${icon('mountains')}<h2>No tours match</h2><p>Try another difficulty level.</p></div>`;
    const feature = difficulty === 'all' && sort === 'recommended';
    return `<div class="tour-grid">${list.map((t, i) => tourCard(t, i, feature && i === 0)).join('')}</div>`;
  };

  const overviewPage = () => {
    const avg = tours.reduce((s, t) => s + t.ratingsAverage, 0) / tours.length;
    const guideCount = new Set(tours.flatMap((t) => t.guides.map((g) => g._id))).size;
    const leads = users.filter((u) => u.role === 'lead-guide').slice(0, 3);
    const hero = tours.find((t) => t.slug === 'chandar-tal') || tours[0];
    return `
    <main id="main">
      <section class="hero">
        <img class="hero__img" src="${photo(hero.imageCover)}" alt="${esc(hero.name)} under snow-streaked peaks">
        <div class="container hero__content">
          <span class="eyebrow">${icon('mountains')} Small-group treks · Himachal &amp; Uttarakhand</span>
          <h1 class="display hero__title">Walk where the <em>road runs out.</em></h1>
          <p class="hero__lede">Nine routes through the Indian Himalaya, from riverside ashrams in Rishikesh to the cliff-top monasteries of Spiti. Led by guides who grew up on these trails.</p>
          <div class="hero__actions">
            <a class="btn btn--primary" href="#tours">Browse tours ${icon('arrow-down')}</a>
            <a class="link" href="login.html">Try the demo account ${icon('arrow-right')}</a>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="stats">
          <div class="stat"><div class="stat__value tabular">${tours.length}</div><div class="stat__label">Routes across two states</div></div>
          <div class="stat"><div class="stat__value tabular">${avg.toFixed(1)}</div><div class="stat__label">Average trip rating</div></div>
          <div class="stat"><div class="stat__value tabular">${guideCount}</div><div class="stat__label">Local guides</div></div>
          <div class="stat"><div class="stat__value tabular">${rupees(Math.min(...tours.map((t) => t.price)))}</div><div class="stat__label">Lowest price per person</div></div>
        </div>
      </div>

      <section class="section" id="tours">
        <div class="container">
          <div class="section-head">
            <div>
              <h2 class="section-title">Upcoming departures</h2>
              <p class="section-sub">Every trip runs in a small group with at least two local guides.</p>
            </div>
            <div class="filters" role="group" aria-label="Filter and sort tours">
              ${['all', 'easy', 'medium', 'difficult']
                .map((d) => `<button class="chip" type="button" data-difficulty="${d}" aria-pressed="${d === 'all'}">${d === 'all' ? 'All' : d[0].toUpperCase() + d.slice(1)}</button>`)
                .join('')}
              <span class="filters__divider" aria-hidden="true"></span>
              <select class="select" id="sort" aria-label="Sort tours">
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="duration">Shortest first</option>
                <option value="rating">Top rated</option>
              </select>
            </div>
          </div>
          <div id="tour-results">${tourGrid('all', 'recommended')}</div>
        </div>
      </section>

      <section class="section guides-band">
        <div class="container guides-band__grid">
          <div class="reveal">
            <span class="eyebrow">Our guides</span>
            <h2 class="section-title" style="margin-top:12px">Led by people who grew up on these trails.</h2>
            <p class="section-sub">Our lead guides are from the valleys you’ll be walking through. They pick the campsites, set the pace and know which chai stall is worth the stop.</p>
          </div>
          <ul class="guide-list">
            ${leads
              .map(
                (g, i) => `
              <li class="guide reveal" style="--delay:${i * 100}ms">
                <img src="${userPhoto(g.photo)}" alt="${esc(g.name)}" loading="lazy">
                <div><div class="guide__name">${esc(g.name)}</div><div class="guide__role">Lead guide</div></div>
              </li>`
              )
              .join('')}
          </ul>
        </div>
      </section>
    </main>`;
  };

  // ------------------------------------------------------------- tour page
  const dateOptions = (tour) =>
    tour.dates.map((d) => `<option value="${d.toISOString()}">${fmtDate(d)}</option>`).join('');

  const bookButton = (tour, user, cls = '') =>
    user
      ? `<button class="btn btn--primary ${cls}" type="button" data-book="${tour.id}">Book this trip</button>`
      : `<a class="btn btn--primary ${cls}" href="login.html?next=${encodeURIComponent(`tour.html?slug=${tour.slug}`)}">Log in to book</a>`;

  const tourPage = (tour, user) => {
    const avg = tour.reviews.length
      ? (tour.reviews.reduce((s, r) => s + r.rating, 0) / tour.reviews.length).toFixed(1)
      : tour.ratingsAverage;
    return `
    <main id="main">
      <section class="hero tour-hero">
        <img class="hero__img" src="${photo(tour.imageCover)}" alt="${esc(tour.name)}">
        <div class="container hero__content">
          <a class="crumb" href="index.html#tours">${icon('arrow-left')} All tours</a>
          <h1 class="display hero__title">${esc(tour.name)}</h1>
          <p class="hero__lede">${esc(tour.summary)}</p>
          <div class="facts">
            <span class="fact">${icon('clock')} ${plural(tour.duration, 'day')}</span>
            <span class="fact">${icon('map-pin')} ${esc(tour.startLocation.description)}</span>
            <span class="fact">${icon('trend-up')} ${cap(esc(tour.difficulty))}</span>
            <span class="fact">${icon('users-three')} Up to ${tour.maxGroupSize}</span>
            <span class="fact">${icon('star', 'ph-fill')} ${tour.ratingsAverage} (${tour.ratingsQuantity})</span>
          </div>
        </div>
      </section>

      <div class="container tour-layout">
        <div class="tour-main">
          <section class="reveal">
            <h2 class="block-title">About the trip</h2>
            <div class="prose">${tour.description.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          </section>

          <section class="reveal">
            <h2 class="block-title">Day by day</h2>
            <ol class="itinerary">
              ${[...tour.locations]
                .sort((a, b) => a.day - b.day)
                .map((l) => `<li><span class="itinerary__day">Day ${l.day}</span><span class="itinerary__place">${esc(l.description)}</span></li>`)
                .join('')}
            </ol>
          </section>

          <section class="reveal">
            <h2 class="block-title">Gallery</h2>
            <div class="gallery">
              ${tour.images
                .map((img, i) => `<button type="button" data-full="${photo(img)}" aria-label="View photo ${i + 1} of ${esc(tour.name)}"><img src="${photo(img)}" alt="${esc(tour.name)}, photo ${i + 1}" loading="lazy"></button>`)
                .join('')}
            </div>
          </section>

          <section class="reveal">
            <h2 class="block-title">Where you’ll go</h2>
            <div class="map" id="map" role="region" aria-label="Route map"></div>
            <p class="map-note">Pins are numbered by day. Hover or tap one to see the stop.</p>
          </section>

          <section class="reveal">
            <h2 class="block-title">Your guides</h2>
            <div class="guides-inline">
              ${tour.guides
                .map(
                  (g) => `
                <div class="guide-row">
                  <img src="${userPhoto(g.photo)}" alt="${esc(g.name)}" loading="lazy">
                  <div><div class="guide__name">${esc(g.name)}</div><div class="guide__role">${g.role === 'lead-guide' ? 'Lead guide' : 'Tour guide'}</div></div>
                </div>`
                )
                .join('')}
            </div>
          </section>

          <section>
            <div class="reviews-head">
              <h2 class="block-title">Reviews</h2>
              <span class="score">${icon('star', 'ph-fill')} <strong>${avg}</strong> · ${plural(tour.reviews.length, 'review')}</span>
            </div>
            <div class="reviews">
              ${tour.reviews
                .map(
                  (r) => `
                <figure class="review reveal" style="margin:0 0 16px">
                  ${stars(r.rating)}
                  <blockquote class="review__text" style="margin:12px 0 0">${esc(r.review)}</blockquote>
                  <figcaption class="review__by">
                    <img src="${userPhoto(r.user.photo)}" alt="" loading="lazy">
                    <span class="review__name">${esc(r.user.name)}</span>
                  </figcaption>
                </figure>`
                )
                .join('')}
            </div>
          </section>
        </div>

        <aside class="tour-aside">
          <div class="book-card" data-book-scope>
            <div class="book-card__price"><strong class="tabular">${rupees(tour.price)}</strong><span class="muted">per person</span></div>
            <ul class="book-card__rows">
              <li><span>Duration</span><span>${plural(tour.duration, 'day')}</span></li>
              <li><span>Difficulty</span><span>${cap(esc(tour.difficulty))}</span></li>
              <li><span>Group size</span><span>Up to ${tour.maxGroupSize}</span></li>
              <li><span>Starts in</span><span>${esc(tour.startLocation.description)}</span></li>
            </ul>
            <label class="field-label" for="date-desktop">Departure</label>
            <select class="select" id="date-desktop" name="date">${dateOptions(tour)}</select>
            ${bookButton(tour, user, 'btn--block')}
            <p class="book-card__note">${icon('info')} Demo mode: booking is saved in your browser and no payment is taken.</p>
          </div>
        </aside>
      </div>

      <div class="mobile-bar" data-book-scope>
        <div>
          <strong class="tabular">${rupees(tour.price)}</strong> <span class="muted">/ person</span>
          <select class="select" name="date" aria-label="Departure date" style="display:block;margin-top:4px;height:30px;font-size:13px">${dateOptions(tour)}</select>
        </div>
        ${bookButton(tour, user)}
      </div>

      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">
        <button class="lightbox__close" type="button" aria-label="Close">${icon('x')}</button>
        <img alt="">
      </div>
    </main>`;
  };

  // ------------------------------------------------------------- auth pages
  const authShell = (visualTour, quote, inner) => {
    const t = tours.find((x) => x.slug === visualTour) || tours[0];
    return `
    <main id="main" class="auth">
      <div class="auth__visual">
        <img src="${photo(t.imageCover)}" alt="">
        <div class="auth__quote"><p>${quote}</p><span>${esc(t.name)}, ${esc(t.startLocation.description)}</span></div>
      </div>
      <div class="auth__panel"><div class="auth__form">${inner}</div></div>
    </main>`;
  };

  const errorBox = `<div class="form-error" role="alert">${icon('warning-circle')}<span></span></div>`;

  const loginPage = () =>
    authShell(
      'triund-trek',
      'Nine routes. One good pair of boots.',
      `
      <h1 class="auth__title">Welcome back</h1>
      <p class="auth__sub">Log in to book trips and see your bookings.</p>
      <div class="demo-hint">
        <span>Demo account: <code>${DEMO_EMAIL}</code> / <code>${DEMO_PASSWORD}</code></span>
        <button type="button" class="js-demo-fill">Fill in</button>
      </div>
      <form class="form form--login" novalidate>
        ${errorBox}
        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com" required>
        </div>
        <div class="field">
          <div class="field__row">
            <label class="field-label" for="password">Password</label>
            <a class="link" href="forgot-password.html" style="font-size:14px">Forgot password?</a>
          </div>
          <input class="input" id="password" type="password" autocomplete="current-password" placeholder="At least 8 characters" required minlength="8">
        </div>
        <button class="btn btn--primary btn--block" type="submit">Log in</button>
      </form>
      <p class="auth__alt">New here? <a class="link" href="signup.html">Create an account</a></p>`
    );

  const signupPage = () =>
    authShell(
      'hampta-pass',
      'Your first pass is the hardest. The view makes up for it.',
      `
      <h1 class="auth__title">Create an account</h1>
      <p class="auth__sub">Accounts in this demo are saved only in your browser.</p>
      <form class="form form--signup" novalidate>
        ${errorBox}
        <div class="field">
          <label class="field-label" for="name">Full name</label>
          <input class="input" id="name" type="text" autocomplete="name" placeholder="Aarav Sharma" required>
        </div>
        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com" required>
        </div>
        <div class="field">
          <label class="field-label" for="password">Password</label>
          <input class="input" id="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8">
        </div>
        <div class="field">
          <label class="field-label" for="passwordconfirm">Confirm password</label>
          <input class="input" id="passwordconfirm" type="password" autocomplete="new-password" placeholder="Type it again" required minlength="8">
        </div>
        <button class="btn btn--primary btn--block" type="submit">Create account</button>
      </form>
      <p class="auth__alt">Already have an account? <a class="link" href="login.html">Log in</a></p>`
    );

  const forgotPasswordPage = () =>
    authShell(
      'prashar-lake',
      'Happens to the best of us.',
      `
      <h1 class="auth__title">Reset your password</h1>
      <p class="auth__sub">Enter your email and we’ll send you a reset link.</p>
      <form class="form form--forgotpassword" novalidate>
        ${errorBox}
        <div class="field">
          <label class="field-label" for="emailForgotPassword">Email</label>
          <input class="input" id="emailForgotPassword" type="email" autocomplete="email" placeholder="you@example.com" required>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Send reset link</button>
      </form>
      <p class="auth__alt"><a class="link" href="login.html">${icon('arrow-left')} Back to log in</a></p>`
    );

  // ---------------------------------------------------------- account pages
  const sideItem = (href, label, name, current, disabled) =>
    `<li><a href="${href}" ${current ? 'aria-current="page"' : ''} ${disabled ? 'aria-disabled="true" tabindex="-1"' : ''}>${icon(name)} ${label}</a></li>`;

  const sideMenu = (user, page) => `
    <nav class="side-menu" aria-label="Account">
      <div class="side-menu__label">Account</div>
      <ul>
        ${sideItem('account.html', 'Settings', 'gear-six', page === 'account')}
        ${sideItem('my-tours.html', 'My bookings', 'suitcase-rolling', page === 'my-tours')}
        ${sideItem('#', 'My reviews', 'star', false, true)}
        ${sideItem('#', 'Billing', 'credit-card', false, true)}
      </ul>
      ${
        user.role === 'admin'
          ? `<div class="admin">
              <div class="side-menu__label">Admin</div>
              <ul>
                ${sideItem('#', 'Manage tours', 'map-trifold', false, true)}
                ${sideItem('#', 'Manage users', 'users', false, true)}
                ${sideItem('#', 'Manage reviews', 'chat-centered-text', false, true)}
              </ul>
            </div>`
          : ''
      }
    </nav>`;

  const accountPage = (user) => `
    <main id="main" class="page">
      <div class="container">
        <span class="eyebrow">Account</span>
        <h1 class="page-title" style="margin-top:10px">Hi, ${esc(firstName(user.name))}.</h1>
        <div class="account">
          ${sideMenu(user, 'account')}
          <div>
            <section class="panel">
              <h2 class="panel__title">Profile</h2>
              <form class="form form-user-data" novalidate>
                ${errorBox}
                <div class="photo-field">
                  <img class="js-user-photo" src="${esc(userPhoto(user.photo))}" alt="Your profile photo">
                  <input type="file" accept="image/*" id="photo">
                  <label class="btn btn--ghost btn--sm" for="photo" style="cursor:pointer">${icon('camera')} Change photo</label>
                </div>
                <div class="field">
                  <label class="field-label" for="name">Full name</label>
                  <input class="input" id="name" type="text" value="${esc(user.name)}" required>
                </div>
                <div class="field">
                  <label class="field-label" for="email">Email</label>
                  <input class="input" id="email" type="email" value="${esc(user.email)}" required>
                </div>
                <div class="form-actions"><button class="btn btn--dark" type="submit">Save changes</button></div>
              </form>
            </section>
            <section class="panel">
              <h2 class="panel__title">Password</h2>
              <form class="form form-user-password" novalidate>
                ${errorBox}
                <div class="field">
                  <label class="field-label" for="password-current">Current password</label>
                  <input class="input" id="password-current" type="password" autocomplete="current-password" required minlength="8">
                </div>
                <div class="field">
                  <label class="field-label" for="password">New password</label>
                  <input class="input" id="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required minlength="8">
                </div>
                <div class="field">
                  <label class="field-label" for="password-confirm">Confirm new password</label>
                  <input class="input" id="password-confirm" type="password" autocomplete="new-password" required minlength="8">
                </div>
                <div class="form-actions"><button class="btn btn--dark" type="submit">Update password</button></div>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>`;

  const myToursPage = (user) => {
    const list = bookings
      .list(user)
      .map((b) => ({ ...b, tour: tourById[b.tourId], when: b.date ? new Date(b.date) : tourById[b.tourId].dates[0] }))
      .sort((a, b) => a.when - b.when);
    return `
    <main id="main" class="page">
      <div class="container">
        <span class="eyebrow">Account</span>
        <h1 class="page-title" style="margin-top:10px">My bookings</h1>
        ${
          list.length
            ? `<p class="section-sub">${plural(list.length, 'upcoming trip')}. See you on the trail.</p>
               <div class="booking-list">
                 ${list
                   .map(
                     ({ tour, when }, i) => `
                   <a class="booking reveal" style="--delay:${i * 60}ms" href="tour.html?slug=${tour.slug}">
                     <img src="${photo(tour.imageCard)}" alt="${esc(tour.name)}">
                     <div class="booking__body">
                       <div class="booking__title">${esc(tour.name)}</div>
                       <div class="booking__meta">
                         <span>${icon('calendar-blank')} ${fmtDate(when)}</span>
                         <span>${icon('clock')} ${plural(tour.duration, 'day')}</span>
                         <span>${icon('map-pin')} ${esc(tour.startLocation.description)}</span>
                       </div>
                     </div>
                     <span class="status">${icon('check-circle', 'ph-fill')} Confirmed</span>
                   </a>`
                   )
                   .join('')}
               </div>`
            : `<div class="empty" style="margin-top:40px">
                 ${icon('backpack')}
                 <h2>No trips booked yet</h2>
                 <p>Pick a route, choose a departure date and it will show up here.</p>
                 <a class="btn btn--dark" href="index.html#tours">Browse tours</a>
               </div>`
        }
      </div>
    </main>`;
  };

  const creditsPage = () => `
    <main id="main" class="page">
      <div class="container">
        <span class="eyebrow">About the photos</span>
        <h1 class="page-title" style="margin-top:10px">Photo credits</h1>
        <p class="section-sub">These photos are from Wikimedia Commons and are used under their Creative Commons licences. They have been resized and cropped. The remaining two photos come from the original project.</p>
        <ul class="credits">
          ${credits
            .map(
              (c) => `
            <li class="credit reveal">
              <img src="${photo(c.file)}" alt="${esc(c.title)}" loading="lazy">
              <p><a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.title.replace(/\.(jpe?g)$/i, ''))}</a> by ${esc(c.artist)}, ${esc(c.license)}</p>
            </li>`
            )
            .join('')}
        </ul>
      </div>
    </main>`;

  // -------------------------------------------------------------------- map
  // Leaflet + OpenStreetMap tiles (no API key needed) in place of Mapbox.
  const displayMap = (locations) => {
    if (!window.L) return;
    const map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);

    // GeoJSON order is [lng, lat]; Leaflet wants [lat, lng]
    const points = locations.map((loc) => [loc.coordinates[1], loc.coordinates[0]]);
    map.fitBounds(points, { padding: [60, 60], maxZoom: 12 });

    locations.forEach((loc, i) => {
      L.marker(points[i], {
        icon: L.divIcon({ className: 'map-pin', html: String(loc.day), iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: `Day ${loc.day}: ${loc.description}`
      })
        .addTo(map)
        .bindTooltip(`Day ${loc.day} · ${esc(loc.description)}`, { direction: 'top', offset: [0, -18], className: 'map-label' });
    });
  };

  // ----------------------------------------------------------------- router
  const page = document.body.dataset.page;
  const user = auth.current();
  const setTitle = (t) => (document.title = t ? `${t} · Dtours` : 'Dtours · Small-group Himalayan treks');

  const requireUser = () => {
    if (user) return true;
    flash('error', 'Log in to see that page.');
    location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    return false;
  };

  const render = () => {
    let content;
    let overHero = false;
    switch (page) {
      case 'overview':
        setTitle();
        overHero = true;
        content = overviewPage();
        break;
      case 'tour': {
        const tour = tours.find((t) => t.slug === qs('slug'));
        setTitle(tour ? tour.name : 'Tour not found');
        overHero = !!tour;
        content = tour
          ? tourPage(tour, user)
          : lostPage('404', 'We couldn’t find that tour.', 'It may have been renamed. Take a look at the routes we run instead.');
        if (tour) document.body.classList.add('has-mobile-bar');
        break;
      }
      case 'login':
        if (user) return location.replace('index.html');
        setTitle('Log in');
        content = loginPage();
        break;
      case 'signup':
        if (user) return location.replace('index.html');
        setTitle('Create an account');
        content = signupPage();
        break;
      case 'forgot-password':
        setTitle('Reset password');
        content = forgotPasswordPage();
        break;
      case 'account':
        if (!requireUser()) return;
        setTitle('Account');
        content = accountPage(user);
        break;
      case 'my-tours':
        if (!requireUser()) return;
        setTitle('My bookings');
        content = myToursPage(user);
        break;
      case 'credits':
        setTitle('Photo credits');
        content = creditsPage();
        break;
      default:
        setTitle('Page not found');
        content = lostPage('404', 'Lost the trail.', 'That page doesn’t exist. Let’s get you back to the tours.');
    }
    const isAuth = ['login', 'signup', 'forgot-password'].includes(page);
    document.getElementById('root').innerHTML = header(user, page, overHero) + content + (isAuth ? '' : footer());
  };

  render();

  // ------------------------------------------------------------ behaviours
  const pending = store.get('flash', null);
  if (pending) {
    store.remove('flash');
    setTimeout(() => showToast(pending.type, pending.msg), 150);
  }

  // Header turns solid once you scroll past the top of a hero
  const headerEl = $('.site-header');
  if (headerEl) {
    const onScroll = () => headerEl.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Scroll reveals
  const revealAll = () => $$('.reveal').forEach((el) => el.classList.add('is-in'));
  const observeReveals = () => {
    if (!('IntersectionObserver' in window)) return revealAll();
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px' }
    );
    $$('.reveal:not(.is-in)').forEach((el) => io.observe(el));
  };
  observeReveals();

  document.addEventListener('click', (e) => {
    if (e.target.closest('.js-logout')) {
      auth.logout();
      flash('success', 'You’re logged out.');
      location.assign('index.html');
    }
  });

  const setError = (form, msg, field) => {
    const box = $('.form-error', form);
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    if (!msg) return box.classList.remove('is-visible');
    $('span', box).textContent = msg;
    box.classList.add('is-visible');
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  };
  // Native constraint check, reported inline instead of browser bubbles
  const validate = (form) => {
    const bad = $$('input[required], input[minlength]', form).find((el) => !el.checkValidity());
    if (!bad) return true;
    const label = $(`label[for="${bad.id}"]`, form);
    const name = label ? label.textContent.trim() : 'This field';
    const msg = bad.validity.valueMissing
      ? `${name} is required.`
      : bad.validity.typeMismatch
      ? 'Enter a valid email address.'
      : `${name} needs at least ${bad.minLength} characters.`;
    setError(form, msg, bad);
    return false;
  };

  // Overview filters
  const results = $('#tour-results');
  if (results) {
    let difficulty = 'all';
    const sortEl = $('#sort');
    const update = () => {
      results.innerHTML = tourGrid(difficulty, sortEl.value);
      observeReveals();
    };
    $$('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        difficulty = chip.dataset.difficulty;
        $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        update();
      })
    );
    sortEl.addEventListener('change', update);
  }

  // Tour page
  if (page === 'tour' && $('#map')) {
    const tour = tours.find((t) => t.slug === qs('slug'));
    displayMap(tour.locations);

    const lightbox = $('.lightbox');
    const closeLightbox = () => lightbox.classList.remove('is-open');
    $$('.gallery button').forEach((btn) =>
      btn.addEventListener('click', () => {
        $('img', lightbox).src = btn.dataset.full;
        $('img', lightbox).alt = $('img', btn).alt;
        lightbox.classList.add('is-open');
        $('.lightbox__close').focus();
      })
    );
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.closest('.lightbox__close')) closeLightbox();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeLightbox());

    // Keep both date pickers in sync
    $$('select[name="date"]').forEach((sel) =>
      sel.addEventListener('change', () => $$('select[name="date"]').forEach((s) => (s.value = sel.value)))
    );

    $$('[data-book]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const date = $('select[name="date"]', btn.closest('[data-book-scope]')).value;
        $$('[data-book]').forEach((b) => {
          b.disabled = true;
          b.textContent = 'Booking…';
        });
        // Stands in for the Stripe checkout redirect in the full app
        setTimeout(() => {
          bookings.add(user, tour.id, date);
          flash('success', `Booked: ${tour.name}, ${fmtDate(new Date(date))}. No payment was taken.`);
          location.assign('my-tours.html');
        }, 700);
      })
    );
  }

  const redirectAfterLogin = () => {
    const next = qs('next');
    location.assign(next && /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(next) ? next : 'index.html');
  };

  const loginForm = $('.form--login');
  if (loginForm) {
    $('.js-demo-fill').addEventListener('click', () => {
      $('#email').value = DEMO_EMAIL;
      $('#password').value = DEMO_PASSWORD;
      setError(loginForm, null);
    });
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(loginForm)) return;
      try {
        auth.login($('#email').value, $('#password').value);
        flash('success', 'You’re logged in.');
        redirectAfterLogin();
      } catch (err) {
        setError(loginForm, err.message, $('#password'));
      }
    });
  }

  const signupForm = $('.form--signup');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(signupForm)) return;
      try {
        auth.signup($('#name').value, $('#email').value, $('#password').value, $('#passwordconfirm').value);
        flash('success', 'Your account is ready.');
        location.assign('index.html');
      } catch (err) {
        setError(signupForm, err.message);
      }
    });
  }

  const forgotForm = $('.form--forgotpassword');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(forgotForm)) return;
      setError(forgotForm, null);
      showToast('success', 'Demo mode: in the full app, a reset link would be emailed to you.', 6);
      forgotForm.reset();
    });
  }

  const userDataForm = $('.form-user-data');
  if (userDataForm) {
    let newPhoto = null;
    $('#photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // Shrink to a small square so it fits comfortably in localStorage
      const img = new Image();
      img.onload = () => {
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const s = Math.min(img.width, img.height);
        canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        newPhoto = canvas.toDataURL('image/jpeg', 0.85);
        $('.js-user-photo').src = newPhoto;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
    userDataForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(userDataForm)) return;
      const fields = { name: $('#name').value.trim(), email: $('#email').value.trim() };
      if (newPhoto) fields.photo = newPhoto;
      auth.update(fields);
      flash('success', 'Profile saved.');
      location.reload();
    });
  }

  const passwordForm = $('.form-user-password');
  if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(passwordForm)) return;
      if ($('#password').value !== $('#password-confirm').value)
        return setError(passwordForm, 'The new passwords don’t match.', $('#password-confirm'));
      setError(passwordForm, null);
      showToast('success', 'Password updated. (Demo mode: nothing is stored.)');
      passwordForm.reset();
    });
  }
})();
