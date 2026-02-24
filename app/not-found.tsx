"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";


export default function NotFound() {
  const router = useRouter();
  const [query, setQuery] = useState<string>("");

  const handleSearch = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (query.trim().length > 0) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <main
    className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center"
    aria-labelledby="page-title"
    >
      <motion.div
        initial={{ y: -10 }}
        animate={{ y: 10 }}
        transition={{
          repeat: Infinity,
          repeatType: "reverse",
          duration: 2,
          ease: "easeInOut",
        }}
        className="mb-8"
        aria-hidden="true"
      >
        <div className="text-8xl font-bold opacity-20 select-none md:text-9xl">
          404
        </div>
      </motion.div>

      <h1
        id="page-title"
        className="text-3xl md:text-4xl font-bold mb-4"
      >
        Page not found
      </h1>

      <p className="text-muted-foreground max-w-md mb-8">
        Oops — the page you're looking for doesn’t exist or may have been moved.
        Try searching or explore one of the links below.
      </p>

      <form
        onSubmit={handleSearch}
        className="w-full max-w-md mb-8"
        role="search"
        aria-label="Site search"
      >
        <label htmlFor="search" className="sr-only">
          Search site
        </label>
        <div className="flex rounded-xl border focus-within:ring-2 focus-within:ring-primary overflow-hidden">
          <input
            id="search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, marketplace..."
            className="flex-1 px-4 py-3 outline-none bg-transparent"
            required
          />
          <button
            type="submit"
            className="px-5 py-3 bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            Search
          </button>
        </div>
      </form>

      <nav
        aria-label="Popular pages"
        className="flex flex-wrap justify-center gap-2 mb-8 md:gap-4"
      >

        <Link
          href="/blog"
          className="px-5 py-3 rounded-xl border hover:bg-muted transition focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Blog
        </Link>
        <Link
          href="/projects"
          className="px-5 py-3 rounded-xl border hover:bg-muted transition focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Projects
        </Link>

        <Link
          href="/marketplace"
          className="px-5 py-3 rounded-xl border hover:bg-muted transition focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Marketplace
        </Link>
      </nav>

      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Go Home
      </Link>
    </main>
  );
}