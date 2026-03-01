'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const navItems = [
  { href: '#showcase', label: '作品展示' },
  { href: '#features', label: '產品優勢' },
  { href: '#why-us', label: '方案比較' },
  { href: '#pricing', label: '方案價格' },
  { href: '#business', label: '企業方案' },
  { href: '#faq', label: '常見問題' },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sm:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={isOpen ? '關閉選單' : '開啟選單'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile menu dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-background border-b border-border shadow-lg z-50">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 mt-2 border-t border-border space-y-2">
              <Button className="w-full" asChild>
                <Link href="/quick" onClick={() => setIsOpen(false)}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  快速生成
                </Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/create" onClick={() => setIsOpen(false)}>
                  進階製作
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
