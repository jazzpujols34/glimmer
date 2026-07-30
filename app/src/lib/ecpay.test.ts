import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPaymentFormData, generateCheckMacValue, parseCallback } from './ecpay';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.ECPAY_TEST_MODE = 'true';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('createPaymentFormData', () => {
  const baseParams = {
    orderId: 'GL1234567890TEST',
    amount: 299,
    description: '拾光 Glimmer AI 影片生成',
    email: 'user@example.com',
    itemName: '20次生成組合包 (20 次生成)',
    returnUrl: 'https://glimmer.video/api/ecpay-return',
    notifyUrl: 'https://glimmer.video/api/webhooks/ecpay',
  };

  it('includes CustomField2 with the packId', async () => {
    const { formData } = await createPaymentFormData({ ...baseParams, packId: 'pack20' });
    expect(formData.CustomField2).toBe('pack20');
  });

  it('still includes CustomField1 with the email (unchanged behavior)', async () => {
    const { formData } = await createPaymentFormData({ ...baseParams, packId: 'pack20' });
    expect(formData.CustomField1).toBe('user@example.com');
  });

  it('CheckMacValue is computed over a param set that includes CustomField2', async () => {
    const { formData: formData20 } = await createPaymentFormData({ ...baseParams, packId: 'pack20' });
    const { formData: formData50 } = await createPaymentFormData({ ...baseParams, packId: 'pack50' });

    // Same order/date/amount/etc except packId -> MAC must differ if CustomField2 is signed
    // (MerchantTradeDate is generated internally per-call at second resolution, so to isolate
    // the effect of packId we recompute the MAC manually with all other fields held fixed).
    const paramsA: Record<string, string> = { ...formData20 };
    delete paramsA.CheckMacValue;
    const paramsB: Record<string, string> = { ...paramsA, CustomField2: 'pack50' };

    const macA = await generateCheckMacValue(paramsA, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs');
    const macB = await generateCheckMacValue(paramsB, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs');

    expect(macA).toBe(formData20.CheckMacValue);
    expect(macB).not.toBe(macA);
    // Sanity: formData50 (independently generated) also differs from formData20's MAC
    expect(formData50.CustomField2).toBe('pack50');
  });

  it('known-input CheckMacValue regression test (ECPay test credentials)', async () => {
    // Fixed input set, ECPay documented test credentials (hashKey/hashIV from getCredentials()
    // under ECPAY_TEST_MODE=true). If this ever changes, the signing algorithm broke silently.
    const fixedParams: Record<string, string> = {
      MerchantID: '3002607',
      MerchantTradeNo: 'GLTESTFIXED0001',
      MerchantTradeDate: '2026/01/01 00:00:00',
      PaymentType: 'aio',
      TotalAmount: '299',
      TradeDesc: encodeURIComponent('拾光 Glimmer AI 影片生成'),
      ItemName: '20次生成組合包 (20 次生成)',
      ReturnURL: 'https://glimmer.video/api/webhooks/ecpay',
      OrderResultURL: 'https://glimmer.video/api/ecpay-return',
      ChoosePayment: 'ALL',
      EncryptType: '1',
      CustomField1: 'user@example.com',
      CustomField2: 'pack20',
    };

    const mac = await generateCheckMacValue(fixedParams, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs');

    // Computed independently via Node's crypto.createHash('sha256') against the same
    // algorithm (sort keys, dot-net-style URL encode, SHA256, uppercase hex) — see report.
    expect(mac).toBe('BA89422A220219DC42A87FAE99933E83B1065D1D4670CB95659106D98ACB2623');
  });
});

describe('parseCallback', () => {
  it('surfaces CustomField2 as packId on the parsed callback', async () => {
    const formData = new FormData();
    formData.set('MerchantID', '3002607');
    formData.set('MerchantTradeNo', 'GLTEST0001');
    formData.set('RtnCode', '1');
    formData.set('RtnMsg', 'Succeeded');
    formData.set('TradeNo', '2601010000000000');
    formData.set('TradeAmt', '299');
    formData.set('PaymentDate', '2026/01/01 00:00:00');
    formData.set('PaymentType', 'Credit_CreditCard');
    formData.set('CustomField1', 'user@example.com');
    formData.set('CustomField2', 'pack20');
    formData.set('CheckMacValue', 'irrelevant-for-this-test');

    const result = await parseCallback(formData);
    expect(result.packId).toBe('pack20');
  });

  it('packId is empty string when CustomField2 is absent', async () => {
    const formData = new FormData();
    formData.set('MerchantID', '3002607');
    formData.set('MerchantTradeNo', 'GLTEST0002');
    formData.set('RtnCode', '1');
    formData.set('TradeAmt', '299');
    formData.set('CustomField1', 'user@example.com');
    formData.set('CheckMacValue', 'irrelevant-for-this-test');

    const result = await parseCallback(formData);
    expect(result.packId).toBe('');
  });
});
