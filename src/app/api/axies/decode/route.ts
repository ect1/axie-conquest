import { NextRequest, NextResponse } from 'next/server';
import { buildAxiePlan, buildStarterAxiePlan } from '@/server/axie-plan';

export async function GET(request: NextRequest) {
  const genes = request.nextUrl.searchParams.get('genes');
  const starterClass = request.nextUrl.searchParams.get('starterClass');
  if (!genes && !starterClass) return NextResponse.json({ error: 'Provide genes as the genes query parameter.' }, { status: 400 });
  try {
    const plan = genes ? await buildAxiePlan(genes) : await buildStarterAxiePlan(starterClass!);
    console.info('[axie-plan] decoded and resolved', JSON.stringify(plan, null, 2));
    return NextResponse.json(plan, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not decode Axie genes.';
    console.error('[axie-plan] decode failed', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
