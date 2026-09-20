import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export async function GET() {
  try {
    const ymlPath = path.resolve(process.cwd(), 'src/game/config/city-config.yml');
    if (fs.existsSync(ymlPath)) {
      const content = fs.readFileSync(ymlPath, 'utf8');
      const parsed = yaml.parse(content);
      return NextResponse.json(parsed, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
  } catch (error) {
    console.error('Error serving city-config.yml:', error);
  }

  return NextResponse.json({ error: 'Failed to read city-config.yml' }, { status: 500 });
}
