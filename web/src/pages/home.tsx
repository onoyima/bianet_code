import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="px-6 lg:px-12 py-4 flex items-center justify-between border-b border-border bg-card">
        <div className="font-display font-bold text-2xl text-primary tracking-tight">Bia'net</div>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">Log In</Link>
          <Link href="/register" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
            Get Started
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="px-6 lg:px-12 py-24 md:py-32 max-w-5xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-7xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            The Agricultural Engine <br className="hidden md:block"/> of West Africa
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Enterprise-grade commodity exchange and produce marketplace. 
            Connect with verified buyers, secure escrow payments, and scale your agribusiness.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/register" className="w-full sm:w-auto inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8">
              Open an Account
            </Link>
            <Link href="/bartar" className="w-full sm:w-auto inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-8">
              Explore Bartar Exchange
            </Link>
          </div>
        </section>

        <section className="bg-card border-y border-border py-24">
          <div className="max-w-6xl mx-auto px-6 lg:px-12 grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center text-secondary-foreground font-bold text-xl">S</div>
              <h2 className="text-3xl font-display font-bold">Seed Marketplace</h2>
              <p className="text-muted-foreground text-lg">
                Fresh produce sourced locally. Connect directly with farmers for bulk purchasing with guaranteed quality and fast fulfillment.
              </p>
            </div>
            <div className="space-y-6">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xl">B</div>
              <h2 className="text-3xl font-display font-bold">Bartar Exchange</h2>
              <p className="text-muted-foreground text-lg">
                Institutional trading for sesame, ginger, cocoa, and cashew. Backed by bank-grade escrow and strict KYC verification.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 px-6 lg:px-12 border-t border-border bg-card text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Bia'net Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}