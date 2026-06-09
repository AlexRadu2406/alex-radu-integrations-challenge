import {
  ClientIDSecretCredentials,
  ParsedAuthorizationResponse,
  ParsedCancelResponse,
  ParsedCaptureResponse,
  PayPalOrder,
  ProcessorConnection,
  RawAuthorizationRequest,
  RawCancelRequest,
  RawCaptureRequest,
} from '@primer-io/app-framework';

import HTTPClient from '../common/HTTPClient';

const PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';

interface PayPalAccessTokenResponse {
  access_token: string;
}

interface PayPalAuthorizationResponse {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      authorizations?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64',
  );

  const response = await HTTPClient.request(
    `${PAYPAL_API_BASE_URL}/v1/oauth2/token`,
    {
      method: 'post',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
  );

  const parsedResponse = JSON.parse(
    response.responseText,
  ) as PayPalAccessTokenResponse;

  if (response.statusCode >= 400 || !parsedResponse.access_token) {
    throw new Error(`Unable to retrieve PayPal access token: ${response.responseText}`);
  }

  return parsedResponse.access_token;
}

function getBearerHeaders(accessToken: string): { [key: string]: string } {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

const PayPalConnection: ProcessorConnection<
  ClientIDSecretCredentials,
  PayPalOrder
> = {
  name: 'PAYPAL',

  website: 'https://paypal.com',

  configuration: {
    accountId: 'paypal-sandbox',
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  },

  async authorize(
    request: RawAuthorizationRequest<ClientIDSecretCredentials, PayPalOrder>,
  ): Promise<ParsedAuthorizationResponse> {
    const { processorConfig, paymentMethod } = request;

    const accessToken = await getAccessToken(
      processorConfig.clientId,
      processorConfig.clientSecret,
    );

    const response = await HTTPClient.request(
      `${PAYPAL_API_BASE_URL}/v2/checkout/orders/${paymentMethod.orderId}/authorize`,
      {
        method: 'post',
        headers: getBearerHeaders(accessToken),
        body: '{}',
      },
    );

    const parsedResponse = JSON.parse(
      response.responseText,
    ) as PayPalAuthorizationResponse;

    if (response.statusCode >= 400) {
      return {
        transactionStatus: 'FAILED',
        errorMessage: response.responseText || 'PayPal authorization failed',
      };
    }

    const authorization =
      parsedResponse.purchase_units?.[0]?.payments?.authorizations?.[0];

    if (authorization?.id) {
      return {
        transactionStatus: 'AUTHORIZED',
        processorTransactionId: authorization.id,
      };
    }

    return {
      transactionStatus: 'FAILED',
      errorMessage: `Unable to find PayPal authorization ID in response: ${response.responseText}`,
    };
  },

  async cancel(
    request: RawCancelRequest<ClientIDSecretCredentials>,
  ): Promise<ParsedCancelResponse> {
    const { processorConfig, processorTransactionId } = request;

    const accessToken = await getAccessToken(
      processorConfig.clientId,
      processorConfig.clientSecret,
    );

    const response = await HTTPClient.request(
      `${PAYPAL_API_BASE_URL}/v2/payments/authorizations/${processorTransactionId}/void`,
      {
        method: 'post',
        headers: getBearerHeaders(accessToken),
        body: '{}',
      },
    );

    if (response.statusCode === 204 || response.statusCode === 200) {
      return {
        transactionStatus: 'CANCELLED',
      };
    }

    return {
      transactionStatus: 'FAILED',
      errorMessage: response.responseText || 'PayPal cancellation failed',
    };
  },

  async capture(
    request: RawCaptureRequest<ClientIDSecretCredentials>,
  ): Promise<ParsedCaptureResponse> {
    return {
      transactionStatus: 'FAILED',
      errorMessage: 'Capture is not implemented for this exercise',
    };
  },
};

export default PayPalConnection;