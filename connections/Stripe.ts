import {
  APIKeyCredentials,
  CardDetails,
  ParsedAuthorizationResponse,
  ParsedCancelResponse,
  ParsedCaptureResponse,
  ProcessorConnection,
  RawAuthorizationRequest,
  RawCancelRequest,
  RawCaptureRequest,
} from '@primer-io/app-framework';

import HttpClient from '../common/HTTPClient';

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';

function getAuthHeaders(apiKey: string): { [key: string]: string } {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

function parseStripeResponse<T>(responseText: string): T {
  return JSON.parse(responseText) as T;
}

function toFormBody(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
}

interface StripePaymentIntent {
  id: string;
  status: string;
  last_payment_error?: {
    message?: string;
    decline_code?: string;
    code?: string;
  };
}

const StripeConnection: ProcessorConnection<APIKeyCredentials, CardDetails> = {
  name: 'STRIPE',

  website: 'stripe.com',

  configuration: {
    accountId: 'acct_1Tf9lQLl98k6h8mU',
    apiKey: process.env.STRIPE_API_KEY || '',
  },

  async authorize(
    request: RawAuthorizationRequest<APIKeyCredentials, CardDetails>,
  ): Promise<ParsedAuthorizationResponse> {
    const { processorConfig, amount, currencyCode } = request;

    const body = toFormBody({
      amount,
      currency: currencyCode.toLowerCase(),
      payment_method: 'pm_card_visa',
      confirm: true,
      capture_method: 'manual',
      'payment_method_types[]': 'card',
    });

    const response = await HttpClient.request(
      `${STRIPE_API_BASE_URL}/payment_intents`,
      {
        method: 'post',
        headers: getAuthHeaders(processorConfig.apiKey),
        body,
      },
    );

    const parsedResponse = parseStripeResponse<StripePaymentIntent>(
      response.responseText,
    );

    if (response.statusCode >= 400) {
      return {
        transactionStatus: 'FAILED',
        errorMessage:
          parsedResponse.last_payment_error?.message ||
          response.responseText ||
          'Stripe authorization failed',
      };
    }

    if (parsedResponse.status === 'requires_capture') {
      return {
        transactionStatus: 'AUTHORIZED',
        processorTransactionId: parsedResponse.id,
      };
    }

    if (parsedResponse.status === 'succeeded') {
      return {
        transactionStatus: 'SETTLED',
        processorTransactionId: parsedResponse.id,
      };
    }

    if (parsedResponse.status === 'requires_payment_method') {
      return {
        transactionStatus: 'DECLINED',
        declineReason: 'UNKNOWN',
      };
    }

    return {
      transactionStatus: 'FAILED',
      errorMessage: `Unexpected Stripe PaymentIntent status: ${parsedResponse.status}`,
    };
  },

  async capture(
    request: RawCaptureRequest<APIKeyCredentials>,
  ): Promise<ParsedCaptureResponse> {
    const { processorConfig, processorTransactionId } = request;

    const response = await HttpClient.request(
      `${STRIPE_API_BASE_URL}/payment_intents/${processorTransactionId}/capture`,
      {
        method: 'post',
        headers: getAuthHeaders(processorConfig.apiKey),
        body: '',
      },
    );

    const parsedResponse = parseStripeResponse<StripePaymentIntent>(
      response.responseText,
    );

    if (response.statusCode >= 400) {
      return {
        transactionStatus: 'FAILED',
        errorMessage: response.responseText || 'Stripe capture failed',
      };
    }

    if (parsedResponse.status === 'succeeded') {
      return {
        transactionStatus: 'SETTLED',
      };
    }

    return {
      transactionStatus: 'FAILED',
      errorMessage: `Unexpected Stripe PaymentIntent status after capture: ${parsedResponse.status}`,
    };
  },

  async cancel(
    request: RawCancelRequest<APIKeyCredentials>,
  ): Promise<ParsedCancelResponse> {
    const { processorConfig, processorTransactionId } = request;

    const response = await HttpClient.request(
      `${STRIPE_API_BASE_URL}/payment_intents/${processorTransactionId}/cancel`,
      {
        method: 'post',
        headers: getAuthHeaders(processorConfig.apiKey),
        body: '',
      },
    );

    const parsedResponse = parseStripeResponse<StripePaymentIntent>(
      response.responseText,
    );

    if (response.statusCode >= 400) {
      return {
        transactionStatus: 'FAILED',
        errorMessage: response.responseText || 'Stripe cancellation failed',
      };
    }

    if (parsedResponse.status === 'canceled') {
      return {
        transactionStatus: 'CANCELLED',
      };
    }

    return {
      transactionStatus: 'FAILED',
      errorMessage: `Unexpected Stripe PaymentIntent status after cancellation: ${parsedResponse.status}`,
    };
  },
};

export default StripeConnection;