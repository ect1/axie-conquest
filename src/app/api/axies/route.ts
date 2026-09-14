import { NextRequest, NextResponse } from 'next/server';

const AXIE_MARKETPLACE_GRAPHQL = 'https://api-gateway.skymavis.com/graphql/axie-marketplace';
const DEFAULT_OWNER = '0xe3bd25a65d180ebb002cbfd8b1c71241227dd183';
const MAX_PAGE_SIZE = 100;

const AXIES_QUERY = `
  query AxiesForOwner($owner: String!, $from: Int!, $size: Int!) {
    axies(owner: $owner, from: $from, size: $size) {
      total
      results {
        id
        name
        image
        class
        breedCount
        owner
        genes
        newGenes
        stage
        bodyShape
        parts {
          id
          name
          class
          type
          specialGenes
          stage
        }
      }
    }
  }
`;

function pageParameter(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.SKY_MAVIS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'SKY_MAVIS_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const owner = request.nextUrl.searchParams.get('owner') ?? DEFAULT_OWNER;
  const from = pageParameter(request.nextUrl.searchParams.get('from'), 0, 0, Number.MAX_SAFE_INTEGER);
  const size = pageParameter(request.nextUrl.searchParams.get('size'), 30, 1, MAX_PAGE_SIZE);
  if (from === null || size === null) {
    return NextResponse.json({ error: `from must be a non-negative integer and size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
  }

  try {
    const response = await fetch(AXIE_MARKETPLACE_GRAPHQL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ query: AXIES_QUERY, variables: { owner, from, size } }),
      cache: 'no-store',
    });
    const payload = await response.json() as unknown;

    // Visible in `npm run dev` output. It intentionally logs the GraphQL payload,
    // never the API key.
    console.info('[axie-graphql] owner lookup response', JSON.stringify(payload, null, 2));

    if (!response.ok) {
      return NextResponse.json({ error: 'Sky Mavis GraphQL request failed.', payload }, { status: response.status });
    }
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[axie-graphql] owner lookup failed', error);
    return NextResponse.json({ error: 'Could not reach Sky Mavis GraphQL.' }, { status: 502 });
  }
}
