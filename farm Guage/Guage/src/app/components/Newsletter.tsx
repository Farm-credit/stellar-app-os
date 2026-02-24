import { useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Simulate newsletter signup
    setSuccess(true);
    setEmail('');
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-white">Subscribe to our newsletter</h3>
      <p className="text-sm text-gray-400">Stay updated with the latest news and updates.</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500"
          aria-label="Email address"
        />
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
          Subscribe
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Thank you for subscribing!</p>}
    </div>
  );
}
