import { NextResponse } from 'next/server';
import { getEventsByUserId, resolveUserIdByToken } from '@/lib/storage';
import { generateIcs } from '@/lib/ics';

type Params = {
	params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: Params) {
	try {
		const { token: tokenWithExt } = await context.params;
		const token = tokenWithExt.endsWith('.ics')
			? tokenWithExt.slice(0, -4)
			: tokenWithExt;

		const userId = await resolveUserIdByToken(token);
		if (!userId) {
			return new NextResponse('Not found', { status: 404 });
		}

		const events = await getEventsByUserId(userId);
		const ics = generateIcs(events, `${userId}-calendar`);

		return new NextResponse(ics, {
			status: 200,
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-PUBLISHED-TTL': 'PT15M',
				'Content-Disposition': `inline; filename="${userId}.ics"`,
			},
		});
	} catch (error) {
		console.error('Failed to render calendar subscription.', error);
		return new NextResponse('Service unavailable', { status: 503 });
	}
}
