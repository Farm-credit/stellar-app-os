import Link from "next/link";
// import { FaTwitter, FaGithub, FaDiscord, FaLinkedinIn } from "react-icons/fa";
import { HiOutlineMail, HiOutlinePhone, HiOutlineLocationMarker } from "react-icons/hi";
import { FaXTwitter, FaGithub, FaDiscord, FaLinkedinIn } from "react-icons/fa6";

export function ContactSection() {
  return (
    <section className="py-20 px-4 bg-white dark:bg-gray-900">
      <div className="max-w-4xl mx-auto text-center">
        {/* Header */}
        <span className="text-stellar-blue font-semibold text-sm uppercase tracking-wider">
          Contact
        </span>
        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mt-2 mb-4">
          Get in Touch
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-12">
          Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
        </p>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="w-12 h-12 bg-stellar-blue/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <HiOutlineMail className="w-6 h-6 text-stellar-blue" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Email</h3>
            <Link href="mailto:hello@farmcredit.app" className="text-stellar-blue hover:underline">
              hello@farmcredit.app
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Response within 24h
            </p>
          </div>

          <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="w-12 h-12 bg-stellar-blue/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <HiOutlinePhone className="w-6 h-6 text-stellar-blue" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Phone</h3>
            <Link href="tel:+18005551234" className="text-stellar-blue hover:underline">
              +1 (800) 555-1234
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Mon-Fri, 9am-6pm EST
            </p>
          </div>

          <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="w-12 h-12 bg-stellar-blue/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <HiOutlineLocationMarker className="w-6 h-6 text-stellar-blue" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Office</h3>
            <address className="not-italic text-gray-600 dark:text-gray-300">
              123 Innovation Dr.<br />
              San Francisco, CA 94105
            </address>
          </div>
        </div>

        {/* Social Links */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Follow Us
          </h3>
          <div className="flex justify-center gap-4">
            <Link
              href="https://twitter.com/farmcredit"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full text-[#1DA1F2] hover:bg-[#1DA1F2] hover:text-white transition-colors"
              aria-label="Twitter"
            >
              <FaXTwitter className="w-5 h-5" />
            </Link>
            <Link
              href="https://github.com/farmcredit"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <FaGithub className="w-5 h-5" />
            </Link>
            <Link
              href="https://discord.gg/farmcredit"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full text-[#5865F2] hover:bg-[#5865F2] hover:text-white transition-colors"
              aria-label="Discord"
            >
              <FaDiscord className="w-5 h-5" />
            </Link>
            <Link
              href="https://linkedin.com/company/farmcredit"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full text-[#0077B5] hover:bg-[#0077B5] hover:text-white transition-colors"
              aria-label="LinkedIn"
            >
              <FaLinkedinIn className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Quick Contact Form */}
        <div className="max-w-md mx-auto">
          <form className="space-y-4">
            <input
              type="email"
              placeholder="Your email"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-stellar-blue dark:bg-gray-800"
            />
            <textarea
              placeholder="Your message"
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-stellar-blue dark:bg-gray-800"
            />
            <button
              type="submit"
              className="w-full cursor-pointer px-6 py-3 bg-stellar-blue text-white font-semibold rounded-lg hover:bg-blue-400 transition-colors"
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}