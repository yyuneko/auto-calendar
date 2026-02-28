import { NextResponse } from 'next/server';
import { createId } from '@/lib/id';
import { parseNaturalLanguageToEvent } from '@/lib/gemini';
import { parseRequestSchema } from '@/lib/schema';
import {
	getEventsByUserId,
	issueSubscriptionToken,
	saveEvent,
} from '@/lib/storage';
import type { CalendarEvent } from '@/lib/types';

function normalizeText(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function normalizeRrule(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim();
	if (!normalized || /^null$/i.test(normalized) || /^none$/i.test(normalized)) {
		return undefined;
	}

	return normalized;
}

function isSameEvent(a: CalendarEvent, b: CalendarEvent): boolean {
	return (
		a.userId === b.userId &&
		normalizeText(a.summary) === normalizeText(b.summary) &&
		a.startTime === b.startTime &&
		a.endTime === b.endTime &&
		normalizeText(a.location) === normalizeText(b.location) &&
		normalizeText(a.description) === normalizeText(b.description) &&
		a.isAllDay === b.isAllDay &&
		normalizeRrule(a.rrule) === normalizeRrule(b.rrule)
	);
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const parsedRequest = parseRequestSchema.safeParse(body);

		if (!parsedRequest.success) {
			return NextResponse.json(
				{
					error: 'Invalid request payload.',
					details: parsedRequest.error.flatten(),
				},
				{ status: 400 }
			);
		}

		const { userId, text, timezone } = parsedRequest.data;
		const parsedEvent = await parseNaturalLanguageToEvent(text, timezone);
		const normalizedRrule = normalizeRrule(parsedEvent.rrule);

		const now = new Date().toISOString();
		const event: CalendarEvent = {
			id: createId(),
			userId,
			summary: parsedEvent.summary,
			startTime: parsedEvent.startTime,
			endTime: parsedEvent.endTime,
			description: parsedEvent.description,
			location: parsedEvent.location,
			isAllDay: Boolean(parsedEvent.isAllDay),
			rrule: normalizedRrule,
			createdAt: now,
			updatedAt: now,
		};

		const existingEvents = await getEventsByUserId(userId);
		const duplicated = existingEvents.find((item) => isSameEvent(item, event));
		const savedEvent = duplicated ?? event;

		if (!duplicated) {
			await saveEvent(event);
		}

		const token = await issueSubscriptionToken(userId);

		return NextResponse.json({
			event: savedEvent,
			deduplicated: Boolean(duplicated),
			token,
			subscriptionUrl: `/api/calendar/${token}.ics`,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: 'Failed to parse schedule text.',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}
