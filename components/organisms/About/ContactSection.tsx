import React from "react";

export function ContactSection() {
  return (
    <section aria-labelledby="contact-heading" className="py-12 px-4 md:px-8 max-w-2xl mx-auto text-center">
      <h2 id="contact-heading" className="text-2xl md:text-3xl font-bold mb-4 text-stellar-blue">Contact Us</h2>
      <p className="mb-2 text-base text-muted-foreground">
        Have questions or want to partner with us?
      </p>
      <a
        href="mailto:hello@farmcredit.app"
        className="inline-block text-stellar-blue font-semibold underline hover:text-stellar-cyan focus-visible:outline-2 focus-visible:outline-stellar-blue rounded"
      >
        hello@farmcredit.app
      </a>
      <div className="mt-4 flex justify-center gap-6">
        <a
          href="https://twitter.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Twitter/X"
          className="text-stellar-blue hover:text-stellar-cyan text-2xl focus-visible:outline-2 focus-visible:outline-stellar-blue rounded"
        >
          𝕏
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="text-stellar-blue hover:text-stellar-cyan text-2xl focus-visible:outline-2 focus-visible:outline-stellar-blue rounded"
        >
          ⚙️
        </a>
        <a
          href="https://discord.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Discord"
          className="text-stellar-blue hover:text-stellar-cyan text-2xl focus-visible:outline-2 focus-visible:outline-stellar-blue rounded"
        >
          💬
        </a>
      </div>
    </section>
  );
}
