import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // Simulate 100k virtual users
  stages: [
    { duration: '1m', target: 1000 }, // ramp up
    { duration: '5m', target: 100000 }, // hold at 100k
    { duration: '1m', target: 0 },    // ramp down
  ],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Generate a random wallet address (Stellar format)
  const wallet = 'G' + Array.from({length: 55}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
  
  const payload = JSON.stringify({
    wallet: wallet,
    email: 'test@example.com',
    amount: 10,
    trees_per_month: 1,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/api/subscriptions`, payload, params);

  check(res, {
    'status was 201': (r) => r.status === 201,
  });

  sleep(1);
}
