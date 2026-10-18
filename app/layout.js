import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'pipp',
  description: 'Paid posts, straight from labels to the pages that post them.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <header className="bar">
          <div className="bar-inner">
            <Link href="/" className="logo">pipp</Link>
            <nav aria-label="Site">
              <Link href="/connect">Connect your page</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/data-deletion">Delete your data</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer>
          <span>pipp, private beta</span>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </footer>
      </body>
    </html>
  );
}
