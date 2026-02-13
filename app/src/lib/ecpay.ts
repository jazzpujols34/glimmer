/**
 * ECPay (綠界) Payment Integration
 * Docs: https://developers.ecpay.com.tw/
 */

// ECPay API endpoints
const ECPAY_PAYMENT_URL = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
const ECPAY_TEST_PAYMENT_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

// Get credentials from environment
function getCredentials() {
  const isTest = process.env.ECPAY_TEST_MODE === 'true';

  if (isTest) {
    // ECPay test credentials
    return {
      merchantId: '3002607',
      hashKey: 'pwFHCqoQZGmho4w6',
      hashIV: 'EkRm7iFT261dpevs',
      paymentUrl: ECPAY_TEST_PAYMENT_URL,
    };
  }

  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || '',
    hashKey: process.env.ECPAY_HASH_KEY || '',
    hashIV: process.env.ECPAY_HASH_IV || '',
    paymentUrl: ECPAY_PAYMENT_URL,
  };
}

/**
 * Generate CheckMacValue for ECPay
 * Uses SHA256 with URL encoding as per ECPay spec
 */
export async function generateCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): Promise<string> {
  // 1. Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();

  // 2. Build query string
  const queryParts = sortedKeys.map(key => `${key}=${params[key]}`);
  const queryString = queryParts.join('&');

  // 3. Add HashKey and HashIV
  const rawString = `HashKey=${hashKey}&${queryString}&HashIV=${hashIV}`;

  // 4. URL encode (ECPay uses .NET style encoding)
  let encoded = encodeURIComponent(rawString).toLowerCase();

  // 5. Replace specific characters as per ECPay spec
  encoded = encoded
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+');

  // 6. SHA256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(encoded);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // 7. Convert to uppercase hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex.toUpperCase();
}

/**
 * Verify CheckMacValue from ECPay callback
 */
export async function verifyCheckMacValue(
  params: Record<string, string>,
  receivedMac: string
): Promise<boolean> {
  const { hashKey, hashIV } = getCredentials();

  // Remove CheckMacValue from params before calculating
  const paramsWithoutMac = { ...params };
  delete paramsWithoutMac.CheckMacValue;

  const calculatedMac = await generateCheckMacValue(paramsWithoutMac, hashKey, hashIV);
  return calculatedMac === receivedMac;
}

/**
 * Generate payment form data for ECPay
 */
export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  description: string;
  email: string;
  itemName: string;
  returnUrl: string;
  notifyUrl: string;
  clientBackUrl?: string;
}

export async function createPaymentFormData(params: CreatePaymentParams): Promise<{
  paymentUrl: string;
  formData: Record<string, string>;
}> {
  const { merchantId, hashKey, hashIV, paymentUrl } = getCredentials();

  if (!merchantId || !hashKey || !hashIV) {
    throw new Error('ECPay credentials not configured');
  }

  // Format date as ECPay requires: yyyy/MM/dd HH:mm:ss
  const now = new Date();
  const tradeDate = now.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  }).replace(/\//g, '/').replace(',', '');

  // Build base parameters
  const formParams: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: params.orderId,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(params.amount),
    TradeDesc: encodeURIComponent(params.description),
    ItemName: params.itemName,
    ReturnURL: params.notifyUrl,  // Server-to-server notification
    OrderResultURL: params.returnUrl,  // User redirect after payment
    ChoosePayment: 'ALL',  // Allow all payment methods
    EncryptType: '1',  // Use SHA256
    CustomField1: params.email,  // Store email for webhook
  };

  if (params.clientBackUrl) {
    formParams.ClientBackURL = params.clientBackUrl;
  }

  // Generate CheckMacValue
  const checkMacValue = await generateCheckMacValue(formParams, hashKey, hashIV);
  formParams.CheckMacValue = checkMacValue;

  return {
    paymentUrl,
    formData: formParams,
  };
}

/**
 * Parse ECPay webhook/callback data
 */
export interface ECPayCallbackData {
  merchantId: string;
  merchantTradeNo: string;
  rtnCode: string;  // '1' = success
  rtnMsg: string;
  tradeNo: string;  // ECPay transaction number
  tradeAmt: number;
  paymentDate: string;
  paymentType: string;
  checkMacValue: string;
  email: string;
  isValid: boolean;
}

export async function parseCallback(formData: FormData): Promise<ECPayCallbackData> {
  const params: Record<string, string> = {};

  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const isValid = await verifyCheckMacValue(params, params.CheckMacValue || '');

  return {
    merchantId: params.MerchantID || '',
    merchantTradeNo: params.MerchantTradeNo || '',
    rtnCode: params.RtnCode || '',
    rtnMsg: params.RtnMsg || '',
    tradeNo: params.TradeNo || '',
    tradeAmt: parseInt(params.TradeAmt || '0', 10),
    paymentDate: params.PaymentDate || '',
    paymentType: params.PaymentType || '',
    checkMacValue: params.CheckMacValue || '',
    email: params.CustomField1 || '',
    isValid,
  };
}
