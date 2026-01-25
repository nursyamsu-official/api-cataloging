import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Code parameter is required' }, { status: 400 });
  }

  try {
    const results = await prisma.unspsc.findMany({
      where: {
        code: {
          startsWith: code,
        },
      },
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error querying UNSPSC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}