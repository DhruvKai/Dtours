/* eslint-disable */
/*
 * Front-end-only version of Dtours.
 * Replaces the Express/MongoDB/Pug backend with static data (data.js) and
 * localStorage, so the site can be hosted on any static host for a demo.
 */
(function () {
  const { tours: rawTours, users, reviews } = window.DATA;
  const DEMO_PASSWORD = 'test1234';

  // ---------------------------------------------------------------- helpers
  const esc = (str) =>
    String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);

  const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const icon = (name, cls) => `<svg class="${cls}"><use xlink:href="img/icons.svg#icon-${name}"></use></svg>`;
  const userPhoto = (photo) => (photo && photo.startsWith('data:') ? photo : `img/users/${photo || 'default.jpg'}`);
  const qs = (key) => new URLSearchParams(location.search).get(key);

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
  // demo always shows upcoming dates.
  const nextDate = (dates) => {
    const now = new Date();
    return dates
      .map((d) => {
        const date = new Date(d);
        while (date < now) date.setFullYear(date.getFullYear() + 1);
        return date;
      })
      .sort((a, b) => a - b)[0];
  };
  const monthYear = (date) => date.toLocaleString('en-us', { month: 'long', year: 'numeric' });

  // ------------------------------------------------------------------- data
  const userById = Object.fromEntries(users.map((u) => [u._id, u]));
  const tours = rawTours.map((t) => ({
    ...t,
    id: t._id,
    slug: slugify(t.name),
    guides: t.guides.map((id) => userById[id]).filter(Boolean),
    reviews: reviews.filter((r) => r.tour === t._id).map((r) => ({ ...r, user: userById[r.user] }))
  }));

  // ------------------------------------------------------------------- auth
  const auth = {
    current: () => store.get('session', null),
    login(email, password) {
      email = email.trim().toLowerCase();
      const seeded = users.find((u) => u.email.toLowerCase() === email);
      const local = store.get('users', []).find((u) => u.email === email);
      if (seeded && password === DEMO_PASSWORD) return this.start(seeded);
      if (local && local.password === password) return this.start(local);
      throw new Error('Incorrect email or password');
    },
    signup(name, email, password, passwordConfirm) {
      email = email.trim().toLowerCase();
      if (password.length < 8) throw new Error('Password must be at least 8 characters');
      if (password !== passwordConfirm) throw new Error('Passwords are not the same!');
      const local = store.get('users', []);
      if (users.some((u) => u.email.toLowerCase() === email) || local.some((u) => u.email === email))
        throw new Error('An account with that email already exists');
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
    list: (user) => store.get(`bookings:${user._id}`, []),
    add(user, tourId) {
      const list = this.list(user);
      if (!list.includes(tourId)) store.set(`bookings:${user._id}`, [...list, tourId]);
    }
  };

  // ----------------------------------------------------------------- alerts
  const hideAlert = () => {
    const el = document.querySelector('.alert');
    if (el) el.remove();
  };
  const showAlert = (type, msg, time = 5) => {
    hideAlert();
    document.body.insertAdjacentHTML('afterbegin', `<div class="alert alert--${type}">${esc(msg)}</div>`);
    window.setTimeout(hideAlert, time * 1000);
  };
  // Alerts that should survive a redirect
  const flash = (type, msg) => store.set('flash', { type, msg });

  // ----------------------------------------------------------------- layout
  const header = (user) => `
    <header class="header">
      <nav class="nav nav--tours">
        <a class="nav__el" href="index.html">All tours</a>
      </nav>
      <a class="header__logo" href="index.html"><img src="img/logo-white.png" alt="Dtours logo"></a>
      <nav class="nav nav--user">
        ${
          user
            ? `<a class="nav__el" href="my-tours.html">My bookings</a>
               <a class="nav__el nav__el--logout" href="#">Log out</a>
               <a class="nav__el" href="account.html">
                 <img class="nav__user-img" src="${esc(userPhoto(user.photo))}" alt="Photo of ${esc(user.name)}">
                 <span>${esc(user.name.split(' ')[0])}</span>
               </a>`
            : `<a class="nav__el" href="login.html">Log in</a>
               <a class="nav__el nav__el--cta" href="signup.html">Sign up</a>`
        }
      </nav>
    </header>`;

  const footer = () => `
    <footer class="footer">
      <div class="footer__logo"><img src="img/logo-green.png" alt="Dtours logo"></div>
      <ul class="footer__nav">
        <li><a href="#">About Us</a></li>
        <li><a href="#">Download apps</a></li>
        <li><a href="#">Become a guide</a></li>
        <li><a href="#">Careers</a></li>
        <li><a href="#">Contact</a></li>
      </ul>
      <p class="footer__copyright">&copy; by Dhruv Kaith. All rights reserved</p>
    </footer>`;

  const errorPage = (msg) => `
    <main class="main">
      <div class="error">
        <div class="error__title">
          <h2 class="heading-secondary heading-secondary--error">Uh oh! Something went wrong!</h2>
          <h2 class="error__emoji">😢 🤯</h2>
        </div>
        <div class="error__msg">${esc(msg)}</div>
      </div>
    </main>`;

  // ------------------------------------------------------------------ pages
  const card = (tour) => `
    <div class="card">
      <div class="card__header">
        <div class="card__picture">
          <div class="card__picture-overlay">&nbsp;</div>
          <img class="card__picture-img" src="img/tours/${tour.imageCover}" alt="${esc(tour.name)}">
        </div>
        <h3 class="heading-tertirary"><span>${esc(tour.name)}</span></h3>
      </div>
      <div class="card__details">
        <h4 class="card__sub-heading">${tour.difficulty} ${tour.duration}-day tour</h4>
        <p class="card__text">${esc(tour.summary)}</p>
        <div class="card__data">${icon('map-pin', 'card__icon')}<span>${esc(tour.startLocation.description)}</span></div>
        <div class="card__data">${icon('calendar', 'card__icon')}<span>${monthYear(nextDate(tour.startDates))}</span></div>
        <div class="card__data">${icon('flag', 'card__icon')}<span>${tour.locations.length} stops</span></div>
        <div class="card__data">${icon('user', 'card__icon')}<span>${tour.maxGroupSize} people</span></div>
      </div>
      <div class="card__footer">
        <p><span class="card__footer-value">₹${tour.price}</span> <span class="card__footer-text">per person</span></p>
        <p class="card__ratings"><span class="card__footer-value">${tour.ratingsAverage}</span> <span class="card__footer-text">rating (${tour.ratingsQuantity})</span></p>
        <a class="btn btn--green btn--small" href="tour.html?slug=${tour.slug}">Details</a>
      </div>
    </div>`;

  const overviewPage = (list) => `<main class="main"><div class="card-container">${list.map(card).join('')}</div></main>`;

  const overviewBox = (label, text, iconName) => `
    <div class="overview-box__detail">
      ${icon(iconName, 'overview-box__icon')}
      <span class="overview-box__label">${label}</span>
      <span class="overview-box__text">${esc(text)}</span>
    </div>`;

  const reviewCard = (review) => `
    <div class="reviews__card">
      <div class="reviews__avatar">
        <img class="reviews__avatar-img" src="${userPhoto(review.user.photo)}" alt="${esc(review.user.name)}">
        <h6 class="reviews__user">${esc(review.user.name)}</h6>
      </div>
      <p class="reviews__text">${esc(review.review)}</p>
      <div class="reviews__rating">
        ${[1, 2, 3, 4, 5]
          .map((s) => icon('star', `reviews__star reviews__star--${review.rating >= s ? 'active' : 'inactive'}`))
          .join('')}
      </div>
    </div>`;

  const tourPage = (tour, user) => `
    <section class="section-header">
      <div class="header__hero">
        <div class="header__hero-overlay">&nbsp;</div>
        <img class="header__hero-img" src="img/tours/${tour.imageCover}" alt="${esc(tour.name)}">
      </div>
      <div class="heading-box">
        <h1 class="heading-primary"><span>${esc(tour.name)} tour</span></h1>
        <div class="heading-box__group">
          <div class="heading-box__detail">${icon('clock', 'heading-box__icon')}<span class="heading-box__text">${tour.duration} days</span></div>
          <div class="heading-box__detail">${icon('map-pin', 'heading-box__icon')}<span class="heading-box__text">${esc(tour.startLocation.description)}</span></div>
        </div>
      </div>
    </section>

    <section class="section-description">
      <div class="overview-box">
        <div>
          <div class="overview-box__group">
            <h2 class="heading-secondary ma-bt-lg">Quick facts</h2>
            ${overviewBox('Next date', monthYear(nextDate(tour.startDates)), 'calendar')}
            ${overviewBox('Difficulty', tour.difficulty, 'trending-up')}
            ${overviewBox('Participants', `${tour.maxGroupSize} people`, 'user')}
            ${overviewBox('Rating', `${tour.ratingsAverage} / 5`, 'star')}
          </div>
          <div class="overview-box__group">
            <h2 class="heading-secondary ma-bt-lg">Your tour guides</h2>
            ${tour.guides
              .map(
                (g) => `
              <div class="overview-box__detail">
                <img class="overview-box__img" src="${userPhoto(g.photo)}" alt="${esc(g.name)}">
                <span class="overview-box__label">${g.role === 'lead-guide' ? 'Lead guide' : 'Tour guide'}</span>
                <span class="overview-box__text">${esc(g.name)}</span>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="description-box">
        <h2 class="heading-secondary ma-bt-lg">About ${esc(tour.name)} tour</h2>
        ${tour.description.split('\n').map((p) => `<p class="description__text">${esc(p)}</p>`).join('')}
      </div>
    </section>

    <section class="section-pictures">
      ${tour.images
        .map(
          (img, i) => `
        <div class="picture-box">
          <img class="picture-box__img picture-box__img--${i + 1}" src="img/tours/${img}" alt="${esc(tour.name)} Tour ${i + 1}">
        </div>`
        )
        .join('')}
    </section>

    <section class="section-map"><div id="map"></div></section>

    <section class="section-reviews">
      <div class="reviews">${tour.reviews.map(reviewCard).join('')}</div>
    </section>

    <section class="section-cta">
      <div class="cta">
        <div class="cta__img cta__img--logo"><img src="img/logo-white.png" alt="Dtours logo"></div>
        <img class="cta__img cta__img--1" src="img/tours/${tour.images[1]}" alt="Tour picture">
        <img class="cta__img cta__img--2" src="img/tours/${tour.images[2]}" alt="Tour picture">
        <div class="cta__content">
          <h2 class="heading-secondary">What are you waiting for?</h2>
          <p class="cta__text">${tour.duration} days. 1 adventure. Infinite memories. Make it yours today!</p>
          ${
            user
              ? `<button class="btn btn--green span-all-rows" id="book-tour" data-tour-id="${tour.id}">Book tour now!</button>`
              : `<a class="btn btn--green span-all-rows" href="login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}">Log in to book tour</a>`
          }
        </div>
      </div>
    </section>`;

  const loginPage = () => `
    <main class="main">
      <div class="login-form">
        <h2 class="heading-secondary ma-bt-lg">Log into your account</h2>
        <form class="form form--login">
          <div class="form__group">
            <label class="form__label" for="email">Email address</label>
            <input class="form__input" id="email" type="email" placeholder="you@example.com" required>
          </div>
          <div class="form__group ma-bt-md">
            <label class="form__label" for="password">Password</label>
            <input class="form__input" id="password" type="password" placeholder="••••••••" required minlength="8">
          </div>
          <div class="form__group">
            <button class="btn btn--green btn--login">Login</button>
          </div>
          <div class="form__group demo-note">
            Demo account: <strong>admin@tours.io</strong> / <strong>${DEMO_PASSWORD}</strong>
            <a href="#" class="demo-fill">Fill in for me</a>
          </div>
          <div class="form__group"><a class="from--link" href="forgot-password.html">Forgot password?</a></div>
        </form>
      </div>
    </main>`;

  const signupPage = () => `
    <main class="main">
      <div class="login-form">
        <h2 class="heading-secondary ma-bt-lg">Create your account</h2>
        <form class="form form--signup">
          <div class="form__group">
            <label class="form__label" for="name">Name</label>
            <input class="form__input" id="name" type="text" placeholder="Your name" required>
          </div>
          <div class="form__group ma-bt-md">
            <label class="form__label" for="email">Email address</label>
            <input class="form__input" id="email" type="email" placeholder="you@example.com" required>
          </div>
          <div class="form__group">
            <label class="form__label" for="password">Password</label>
            <input class="form__input" id="password" type="password" placeholder="••••••••" required minlength="8">
          </div>
          <div class="form__group ma-bt-md">
            <label class="form__label" for="passwordconfirm">Confirm password</label>
            <input class="form__input" id="passwordconfirm" type="password" placeholder="••••••••" required minlength="8">
          </div>
          <div class="form__group">
            <button class="btn btn--green btn--signup">Sign up</button>
          </div>
          <div class="form__group demo-note">Demo mode: your account is saved only in this browser.</div>
        </form>
      </div>
    </main>`;

  const forgotPasswordPage = () => `
    <main class="main">
      <div class="login-form">
        <h2 class="heading-secondary ma-bt-lg">Enter your email address</h2>
        <form class="form form--forgotpassword">
          <div class="form__group">
            <label class="form__label" for="emailForgotPassword">Email address</label>
            <input class="form__input" id="emailForgotPassword" type="email" placeholder="you@example.com" required>
          </div>
          <div class="form__group">
            <button class="btn btn--green btn-forgot-password">Submit</button>
          </div>
        </form>
      </div>
    </main>`;

  const navItem = (link, text, iconName, active) => `
    <li class="${active ? 'side-nav--active' : ''}">
      <a href="${link}"><svg><use xlink:href="img/icons.svg#icon-${iconName}"></use></svg>${text}</a>
    </li>`;

  const accountPage = (user) => `
    <main class="main">
      <div class="user-view">
        <nav class="user-view__menu">
          <ul class="side-nav">
            ${navItem('account.html', 'Settings', 'settings', true)}
            ${navItem('my-tours.html', 'My bookings', 'briefcase', false)}
            ${navItem('#', 'My reviews', 'star', false)}
            ${navItem('#', 'Billing', 'credit-card', false)}
          </ul>
          ${
            user.role === 'admin'
              ? `<div class="admin-nav">
                  <h5 class="admin-nav__heading">Admin</h5>
                  <ul class="side-nav">
                    ${navItem('#', 'Manage tours', 'map', false)}
                    ${navItem('#', 'Manage users', 'users', false)}
                    ${navItem('#', 'Manage reviews', 'star', false)}
                    ${navItem('#', 'Manage bookings', 'briefcase', false)}
                  </ul>
                </div>`
              : ''
          }
        </nav>
        <div class="user-view__content">
          <div class="user-view__form-container">
            <h2 class="heading-secondary ma-bt-md">Your account settings</h2>
            <form class="form form-user-data">
              <div class="form__group">
                <label class="form__label" for="name">Name</label>
                <input class="form__input" id="name" type="text" value="${esc(user.name)}" required>
              </div>
              <div class="form__group ma-bt-md">
                <label class="form__label" for="email">Email address</label>
                <input class="form__input" id="email" type="email" value="${esc(user.email)}" required>
              </div>
              <div class="form__group form__photo-upload">
                <img class="form__user-photo" src="${esc(userPhoto(user.photo))}" alt="User photo">
                <input class="form__upload" type="file" accept="image/*" id="photo">
                <label for="photo">Choose new photo</label>
              </div>
              <div class="form__group right">
                <button class="btn btn--small btn--green">Save settings</button>
              </div>
            </form>
          </div>
          <div class="line">&nbsp;</div>
          <div class="user-view__form-container">
            <h2 class="heading-secondary ma-bt-md">Password change</h2>
            <form class="form form-user-password">
              <div class="form__group">
                <label class="form__label" for="password-current">Current password</label>
                <input class="form__input" id="password-current" type="password" placeholder="••••••••" required minlength="8">
              </div>
              <div class="form__group">
                <label class="form__label" for="password">New password</label>
                <input class="form__input" id="password" type="password" placeholder="••••••••" required minlength="8">
              </div>
              <div class="form__group ma-bt-lg">
                <label class="form__label" for="password-confirm">Confirm password</label>
                <input class="form__input" id="password-confirm" type="password" placeholder="••••••••" required minlength="8">
              </div>
              <div class="form__group right">
                <button class="btn btn--small btn--green btn--save--password">Save password</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>`;

  const emptyBookingsPage = () => `
    <main class="main">
      <div class="error">
        <div class="error__title">
          <h2 class="heading-secondary">No bookings yet</h2>
          <h2 class="error__emoji">🏔️</h2>
        </div>
        <div class="error__msg">Pick a tour and hit "Book tour now!" to see it here.
          <a class="from--link" href="index.html">Browse all tours</a>
        </div>
      </div>
    </main>`;

  // -------------------------------------------------------------------- map
  // Leaflet + OpenStreetMap tiles (no API key needed) in place of Mapbox.
  const displayMap = (locations) => {
    if (!window.L) return;
    const map = L.map('map', { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);

    const markerIcon = L.divIcon({ className: 'marker', iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -40] });
    // GeoJSON order is [lng, lat]; Leaflet wants [lat, lng]
    const points = locations.map((loc) => [loc.coordinates[1], loc.coordinates[0]]);
    const small = window.innerWidth < 600;
    map.fitBounds(points, {
      paddingTopLeft: small ? [40, 120] : [100, 200],
      paddingBottomRight: small ? [40, 80] : [100, 150],
      maxZoom: 11
    });

    locations.forEach((loc, i) => {
      L.marker(points[i], { icon: markerIcon })
        .addTo(map)
        .bindPopup(`<p>Day ${loc.day}: ${esc(loc.description)}</p>`, { autoClose: false, closeOnClick: false, autoPan: false })
        .openPopup();
    });
  };

  // ------------------------------------------------------------------ router
  const setTitle = (t) => (document.title = `Dtours | ${t}`);
  const page = document.body.dataset.page;
  let user = auth.current();

  const requireUser = () => {
    if (user) return true;
    flash('error', 'Please log in to view that page.');
    location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    return false;
  };

  const render = () => {
    let content;
    switch (page) {
      case 'overview':
        setTitle('All Tours');
        content = overviewPage(tours);
        break;
      case 'tour': {
        const tour = tours.find((t) => t.slug === qs('slug'));
        setTitle(tour ? `${tour.name} Tour` : 'Not found');
        content = tour ? tourPage(tour, user) : errorPage('There is no tour with that name.');
        break;
      }
      case 'login':
        if (user) return location.replace('index.html');
        setTitle('Log into your account');
        content = loginPage();
        break;
      case 'signup':
        if (user) return location.replace('index.html');
        setTitle('Create your account');
        content = signupPage();
        break;
      case 'forgot-password':
        setTitle('Forgot password');
        content = forgotPasswordPage();
        break;
      case 'account':
        if (!requireUser()) return;
        setTitle('Your account');
        content = accountPage(user);
        break;
      case 'my-tours': {
        if (!requireUser()) return;
        setTitle('My bookings');
        const booked = bookings.list(user);
        const list = tours.filter((t) => booked.includes(t.id));
        content = list.length ? overviewPage(list) : emptyBookingsPage();
        break;
      }
      default:
        setTitle('Page not found');
        content = errorPage('Page not found.');
    }
    document.getElementById('root').innerHTML = header(user) + content + footer();
  };

  render();

  // --------------------------------------------------------------- handlers
  const $ = (sel) => document.querySelector(sel);
  const redirectAfterLogin = () => {
    const next = qs('next');
    location.assign(next && /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(next) ? next : 'index.html');
  };

  const pending = store.get('flash', null);
  if (pending) {
    store.remove('flash');
    showAlert(pending.type, pending.msg);
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav__el--logout')) {
      e.preventDefault();
      auth.logout();
      flash('success', 'Logged out.');
      location.assign('index.html');
    }
  });

  const mapEl = document.getElementById('map');
  if (mapEl) displayMap(tours.find((t) => t.slug === qs('slug')).locations);

  const loginForm = $('.form--login');
  if (loginForm) {
    $('.demo-fill').addEventListener('click', (e) => {
      e.preventDefault();
      $('#email').value = 'admin@tours.io';
      $('#password').value = DEMO_PASSWORD;
    });
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        auth.login($('#email').value, $('#password').value);
        flash('success', 'Logged in successfully!');
        redirectAfterLogin();
      } catch (err) {
        showAlert('error', err.message);
      }
    });
  }

  const signupForm = $('.form--signup');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        auth.signup($('#name').value, $('#email').value, $('#password').value, $('#passwordconfirm').value);
        flash('success', 'Account created successfully!');
        location.assign('index.html');
      } catch (err) {
        showAlert('error', err.message);
      }
    });
  }

  const forgotForm = $('.form--forgotpassword');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showAlert('success', 'Demo mode: in the full app, a reset link would be emailed to you.');
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
        $('.form__user-photo').src = newPhoto;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
    userDataForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fields = { name: $('#name').value.trim(), email: $('#email').value.trim() };
      if (newPhoto) fields.photo = newPhoto;
      auth.update(fields);
      flash('success', 'DATA updated successfully!');
      location.reload();
    });
  }

  const passwordForm = $('.form-user-password');
  if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#password').value !== $('#password-confirm').value) return showAlert('error', 'Passwords are not the same!');
      showAlert('success', 'PASSWORD updated successfully! (demo mode, nothing is saved)');
      passwordForm.reset();
    });
  }

  const bookBtn = $('#book-tour');
  if (bookBtn) {
    bookBtn.addEventListener('click', () => {
      bookBtn.textContent = 'Processing...';
      bookBtn.disabled = true;
      // Stands in for the Stripe checkout redirect in the full app
      window.setTimeout(() => {
        bookings.add(user, bookBtn.dataset.tourId);
        flash('success', 'Your tour has been booked! (Demo mode: no payment taken.)');
        location.assign('my-tours.html');
      }, 900);
    });
  }
})();
