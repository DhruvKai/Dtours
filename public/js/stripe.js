/* eslint-disable */
import axios from 'axios';
import { showAlert } from './alert';

export const bookTour = async tourId => {
  const stripe = Stripe(
    'pk_test_51Ksm3nSF96496zKOex9o4If9iDcdf8husDvX6a3wLaalgbQk4DBnQ2rDygDyPvUdSKbGlIzKAG9PQmhg5Ba6ONQs00LVOUlJIL'
  );
  try {
    // 1) Get checkout session from API
    const session = await axios(`/api/v1/bookings/checkout-session/${tourId}`);
    // console.log(session);

    // 2) Create checkout form + charge credit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id
    });
  } catch (err) {
    console.log(err);
    showAlert('error', err);
  }
};
