'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {API_URL} from '@/lib/api';
import {money} from '@/lib/money';
import type {BankTransferInstructions} from '@/lib/types';

type TransferUpdate = {transfer_notified_at: string; payment_expires_at: string};

export function BankTransferPayment({token, locale, totalKurus, instructions, notifiedAt,
  onUpdated}: {token: string; locale: string; totalKurus: number; instructions: BankTransferInstructions;
  notifiedAt?: string | null; onUpdated?: (value: TransferUpdate) => void}) {
  const t = useTranslations('bankTransfer');
  const [sentAt, setSentAt] = useState(notifiedAt ?? null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied(''); }
  }

  async function markSent() {
    setWorking(true); setError('');
    try {
      const response = await fetch(`${API_URL}/orders/track/${encodeURIComponent(token)}/transfer-sent`, {method: 'POST'});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? t('sentFailed'));
      setSentAt(body.transfer_notified_at); onUpdated?.(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('sentFailed')); }
    finally { setWorking(false); }
  }

  return <section className="bank-transfer-panel" aria-labelledby="bank-transfer-title">
    <header><span className="eyebrow">{t('eyebrow')}</span><h2 id="bank-transfer-title">{t('title')}</h2><p>{t('intro')}</p></header>
    <dl>
      <div><dt>{t('accountHolder')}</dt><dd>{instructions.account_holder}</dd></div>
      {instructions.bank_name && <div><dt>{t('bank')}</dt><dd>{instructions.bank_name}</dd></div>}
      <div><dt>{t('iban')}</dt><dd><code>{instructions.iban}</code><button type="button" onClick={() => void copy(instructions.iban, 'iban')}>{copied === 'iban' ? t('copied') : t('copy')}</button></dd></div>
      <div><dt>{t('amount')}</dt><dd>{money(totalKurus, locale)}</dd></div>
      <div><dt>{t('reference')}</dt><dd><code>{instructions.reference}</code><button type="button" onClick={() => void copy(instructions.reference, 'reference')}>{copied === 'reference' ? t('copied') : t('copy')}</button></dd></div>
      <div><dt>{t('deadline')}</dt><dd>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(instructions.expires_at))}</dd></div>
    </dl>
    <p className="bank-transfer-warning">{t('referenceWarning')}</p>
    {sentAt ? <div className="bank-transfer-sent" role="status"><strong>{t('sentTitle')}</strong><p>{t('sentHelp')}</p></div>
      : <button className="store-button primary" type="button" disabled={working} onClick={() => void markSent()}>{working ? t('working') : t('sentButton')}</button>}
    {error && <p className="store-error" role="alert">{error}</p>}
  </section>;
}
