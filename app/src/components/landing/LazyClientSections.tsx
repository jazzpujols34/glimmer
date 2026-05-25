'use client';

import dynamic from 'next/dynamic';

export const ContactForm = dynamic(
  () => import('@/components/ContactForm').then((m) => m.ContactForm),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-lg mx-auto h-80 rounded-2xl border border-border/50 bg-card/80 animate-pulse" />
    ),
  }
);

export const FaqSection = dynamic(
  () => import('@/components/landing/FaqSection').then((m) => m.FaqSection),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto px-4 py-20 animate-pulse space-y-8">
        <div className="h-8 bg-muted/40 rounded w-48 mx-auto" />
        <div className="h-4 bg-muted/30 rounded w-64 mx-auto" />
        <div className="h-40 bg-muted/20 rounded max-w-4xl mx-auto" />
      </div>
    ),
  }
);
