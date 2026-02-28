import { kv } from '@vercel/kv';
import { createToken } from '@/lib/id';
import type { CalendarEvent, SubscriptionToken } from '@/lib/types';

const EVENT_PREFIX = 'event:';
const TOKEN_PREFIX = 'token:';
const USER_EVENT_SET = 'user:events:';

function assertKvConfigured(): void {
	if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
		throw new Error(
			'Vercel KV is not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN.'
		);
	}
}

export async function saveEvent(event: CalendarEvent): Promise<void> {
	assertKvConfigured();
	await kv.set(`${EVENT_PREFIX}${event.id}`, event);
	await kv.sadd(`${USER_EVENT_SET}${event.userId}`, event.id);
}

export async function getEventsByUserId(
	userId: string
): Promise<CalendarEvent[]> {
	assertKvConfigured();
	const ids = ((await kv.smembers(`${USER_EVENT_SET}${userId}`)) ??
		[]) as string[];
	if (ids.length === 0) {
		return [];
	}

	const events = await kv.mget<CalendarEvent[]>(
		ids.map((id) => `${EVENT_PREFIX}${id}`)
	);
	return events.filter(Boolean) as CalendarEvent[];
}

export async function issueSubscriptionToken(userId: string): Promise<string> {
	assertKvConfigured();
	const existingToken = await kv.get<string>(`user:token:${userId}`);
	if (existingToken) {
		return existingToken;
	}

	const token = createToken();
	const tokenRecord: SubscriptionToken = {
		token,
		userId,
		createdAt: new Date().toISOString(),
	};

	await kv.set(`${TOKEN_PREFIX}${token}`, tokenRecord);
	await kv.set(`user:token:${userId}`, token);
	return token;
}

export async function resolveUserIdByToken(
	token: string
): Promise<string | null> {
	assertKvConfigured();
	const tokenRecord = await kv.get<SubscriptionToken>(
		`${TOKEN_PREFIX}${token}`
	);
	return tokenRecord?.userId ?? null;
}
