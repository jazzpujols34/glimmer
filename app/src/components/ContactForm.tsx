'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || '發送失敗，請稍後再試');
        return;
      }

      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setStatus('error');
      setErrorMsg('網路錯誤，請檢查連線後再試');
    }
  }

  if (status === 'success') {
    return (
      <div className="max-w-lg mx-auto p-8 rounded-2xl border border-primary/30 bg-primary/5 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">訊息已送出</h3>
        <p className="text-sm text-muted-foreground">
          感謝您的來信，我們會盡快回覆。
        </p>
        <p className="text-xs text-muted-foreground">
          Thank you! We&apos;ll get back to you soon.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatus('idle')}
        >
          再發一則訊息
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto space-y-5 p-6 sm:p-8 rounded-2xl border border-border/50 bg-card/80"
    >
      <div className="space-y-2">
        <Label htmlFor="contact-name">
          姓名 <span className="text-xs text-muted-foreground font-normal">Name</span>
        </Label>
        <Input
          id="contact-name"
          type="text"
          required
          maxLength={100}
          placeholder="您的姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={status === 'submitting'}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email">
          Email
        </Label>
        <Input
          id="contact-email"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting'}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">
          訊息 <span className="text-xs text-muted-foreground font-normal">Message</span>
        </Label>
        <Textarea
          id="contact-message"
          required
          maxLength={2000}
          rows={4}
          placeholder="請輸入您的問題或合作提案..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={status === 'submitting'}
        />
      </div>

      {status === 'error' && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? (
          <>
            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            送出中...
          </>
        ) : (
          <>
            送出訊息
            <span className="ml-2 text-sm opacity-75">Send Message</span>
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        或直接寄信至{' '}
        <a href="mailto:glimmer.hello@gmail.com" className="text-primary hover:underline">
          glimmer.hello@gmail.com
        </a>
      </p>
    </form>
  );
}
