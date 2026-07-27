'use client';

import {FormEvent, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {API_URL} from '@/lib/api';
import {currencyMoney} from '@/lib/money';
import {useCart} from '@/lib/cart';
import type {BankTransferInstructions} from '@/lib/types';

type TransferUpdate = {transfer_notified_at: string; payment_expires_at: string};

export function BankTransferPayment({token, locale, instructions, notifiedAt,
  onUpdated}: {token: string; locale: string; instructions: BankTransferInstructions;
  notifiedAt?: string | null; onUpdated?: (value: TransferUpdate) => void}) {
  const t = useTranslations('bankTransfer');
  const clearCart = useCart((state) => state.clear);
  const tp = useTranslations('paymentFlow');
  const [sentAt, setSentAt] = useState(notifiedAt ?? null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!sentAt) return;
    clearCart();
    window.localStorage.removeItem('allensnothern-checkout-draft');
  }, [clearCart, sentAt]);

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied(''); }
  }

  async function markSent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    setWorking(true); setError('');
    try {
      const response = await fetch(`${API_URL}/orders/track/${encodeURIComponent(token)}/transfer-sent`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
          sender_name: values.get('sender_name'), transaction_reference: values.get('transaction_reference'),
          amount_confirmed: values.get('amount_confirmed') === 'on'
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? t('sentFailed'));
      setSentAt(body.transfer_notified_at);
      onUpdated?.(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('sentFailed')); }
    finally { setWorking(false); }
  }

  return <section className="bank-transfer-panel" aria-labelledby="bank-transfer-title">
    <header><span className="eyebrow">{t('eyebrow')}</span><h2 id="bank-transfer-title">{t('title')}</h2><p>{t('intro')}</p></header>
    <dl>
      <div><dt>{t('accountHolder')}</dt><dd>{instructions.account_holder}</dd></div>
      {instructions.bank_name && <div><dt>{t('bank')}</dt><dd>{instructions.bank_name}</dd></div>}
      <div><dt>{instructions.account_label}</dt><dd><code>{instructions.account_identifier}</code><button type="button" onClick={() => void copy(instructions.account_identifier, 'account')}>{copied === 'account' ? t('copied') : t('copy')}</button></dd></div>
      <div><dt>{t('amount')}</dt><dd><code>{currencyMoney(instructions.amount_minor, instructions.currency, locale)}</code><button type="button" onClick={() => void copy((instructions.amount_minor / 100).toFixed(2), 'amount')}>{copied === 'amount' ? t('copied') : t('copy')}</button></dd></div>
      <div><dt>{t('reference')}</dt><dd><code>{instructions.reference}</code><button type="button" onClick={() => void copy(instructions.reference, 'reference')}>{copied === 'reference' ? t('copied') : t('copy')}</button></dd></div>
      <div><dt>{t('deadline')}</dt><dd>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(instructions.expires_at))}</dd></div>
    </dl>
    <p className="bank-transfer-warning">{t('referenceWarning')}</p>
    {sentAt ? <div className="bank-transfer-sent" role="status"><strong>{t('sentTitle')}</strong><p>{t('sentHelp')}</p></div>
      : <form className="transfer-report" onSubmit={markSent}>
        <label className="store-field"><span>{tp('senderName')}</span><input name="sender_name" required minLength={2}/></label>
        <label className="store-field"><span>{tp('transactionReference')}</span><input name="transaction_reference" maxLength={120}/></label>
        <label className="store-checkbox"><input name="amount_confirmed" type="checkbox" required/> {tp('exactAmount')}</label>
        <button className="store-button primary" disabled={working}>{working ? t('working') : t('sentButton')}</button>
      </form>}
    {error && <p className="store-error" role="alert">{error}</p>}
  </section>;
}
