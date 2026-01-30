import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** Compact mode for tight spaces like the editor toolbar */
  compact?: boolean;
  /** Disable the home link (e.g. when already on home page nav) */
  disableLink?: boolean;
  className?: string;
}

/**
 * Unified brand logo: image + "拾光" text, always links to home.
 * Standard size: h-10 image. Compact: h-7 image (editor toolbar).
 */
export function Logo({ compact = false, disableLink = false, className }: LogoProps) {
  const content = (
    <span className={cn('flex items-center gap-2 group', className)}>
      <Image
        src="/assets/glimmer-logo.jpeg"
        alt="拾光 Glimmer"
        width={compact ? 56 : 100}
        height={compact ? 28 : 40}
        className={cn(
          'rounded-md object-contain transition-opacity group-hover:opacity-80',
          compact ? 'h-7 w-auto' : 'h-10 w-auto'
        )}
        priority
      />
      <span
        className={cn(
          'font-bold tracking-wide transition-colors text-foreground group-hover:text-primary',
          compact ? 'text-sm' : 'text-lg'
        )}
      >
        拾光
      </span>
    </span>
  );

  if (disableLink) return content;

  return (
    <Link href="/" aria-label="回到首頁 — 拾光 Glimmer">
      {content}
    </Link>
  );
}
