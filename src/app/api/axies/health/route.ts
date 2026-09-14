import { NextResponse } from 'next/server';

const AXIE_MARKETPLACE_GRAPHQL = 'https://api-gateway.skymavis.com/graphql/axie-marketplace';

const HEALTH_QUERY = `
  query AxieMarketplaceHealthCheck {
    axies(from: 0, size: 1) {
      total
    }
  }
`;

type GraphqlHealthPayload = {
  readonly data?: { readonly axies?: { readonly total?: number } };
  readonly errors?: readonly { readonly message?: string }[];
};

export async function GET() {
  const apiKey = process.env.SKY_MAVIS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ connected: false, service: 'sky-mavis-graphql', error: 'SKY_MAVIS_API_KEY is not configured on the server.' }, { status: 500 });
  }

  try {
    const response = await fetch(AXIE_MARKETPLACE_GRAPHQL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ query: HEALTH_QUERY }),
      cache: 'no-store',
    });
    const payload = await response.json() as GraphqlHealthPayload;
    const upstreamError = payload.errors?.[0]?.message;
    const total = payload.data?.axies?.total;
    const connected = response.ok && !upstreamError && typeof total === 'number';

    console.info('[axie-graphql] health check', { connected, upstreamStatus: response.status, total, error: upstreamError });

    if (!connected) {
      return NextResponse.json({
        connected: false,
        service: 'sky-mavis-graphql',
        upstreamStatus: response.status,
        error: upstreamError ?? 'Sky Mavis returned an unexpected health-check response.',
      }, { status: 502 });
    }

    return NextResponse.json({
      connected: true,
      service: 'sky-mavis-graphql',
      upstreamStatus: response.status,
      checkedAt: new Date().toISOString(),
      availableAxies: total,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach Sky Mavis GraphQL.';
    console.error('[axie-graphql] health check failed', message);
    return NextResponse.json({ connected: false, service: 'sky-mavis-graphql', error: message }, { status: 502 });
  }
}
